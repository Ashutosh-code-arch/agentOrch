import json
import logging
import os
import re
import time
from typing import AsyncIterator

from dotenv import load_dotenv

load_dotenv()

from langchain_core.messages import HumanMessage, SystemMessage, AIMessage, ToolMessage

from backend.agents.agent_model import Agent
from backend.agents.tool_registry import ToolRegistry
from backend.memory.vector_memory import VectorMemory
from backend.runtime.message_bus import MessageBus, AgentMessage

logger = logging.getLogger(__name__)
MAX_TOOL_ROUNDS = 5


def extract_xml_tool_calls(text: str) -> list[dict]:
    calls = []
    for match in re.finditer(
        r"<([a-zA-Z_][\w]*)>\s*(\{.*?\})\s*</\1>",
        text or "",
        flags=re.DOTALL,
    ):
        tool_name = match.group(1)
        raw_args = match.group(2)
        try:
            args = json.loads(raw_args)
        except json.JSONDecodeError:
            args = {"input": raw_args}
        calls.append({"name": tool_name, "args": args, "id": f"xml_{tool_name}"})
    return calls


class AgentRuntime:
    def __init__(self, agent: Agent, message_bus: MessageBus):
        self.agent = agent
        self.message_bus = message_bus
        self.tool_registry = ToolRegistry()
        self.vector_memory = (
            VectorMemory(agent_id=agent.id) if agent.memory_type == "vector" else None
        )
        self._rate_limit_window: list[float] = []
        # Full per-session conversation history for multi-turn memory
        self._conversations: dict[str, list[dict]] = {}

    def _get_llm(self):
        model = self.agent.model
        if model.startswith("claude"):
            from langchain_anthropic import ChatAnthropic

            return ChatAnthropic(
                model=model,
                anthropic_api_key=os.getenv("ANTHROPIC_API_KEY"),
                max_tokens=self.agent.max_tokens_per_call or 4096,
            )
        elif model.startswith("gpt"):
            from langchain_openai import ChatOpenAI

            return ChatOpenAI(model=model, openai_api_key=os.getenv("OPENAI_API_KEY"))
        elif model.startswith(("llama", "mixtral", "gemma", "deepseek", "qwen")):
            from langchain_groq import ChatGroq

            key = os.getenv("GROQ_API_KEY")
            if not key:
                raise ValueError("GROQ_API_KEY not set in .env")
            return ChatGroq(model=model, groq_api_key=key, temperature=0.7)
        elif model.startswith("gemini"):
            from langchain_google_genai import ChatGoogleGenerativeAI

            return ChatGoogleGenerativeAI(
                model=model, google_api_key=os.getenv("GOOGLE_API_KEY")
            )
        else:
            from langchain_ollama import ChatOllama

            return ChatOllama(
                model=model,
                base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
            )

    def _check_rate_limit(self) -> bool:
        if "rate_limit" not in (self.agent.guardrails or []):
            return True
        now = time.time()
        self._rate_limit_window = [t for t in self._rate_limit_window if now - t < 60]
        if len(self._rate_limit_window) >= 60:
            return False
        self._rate_limit_window.append(now)
        return True

    async def run(
        self, user_message: str, session_id: str, context: dict | None = None
    ) -> str:
        if not self._check_rate_limit():
            raise RuntimeError("Rate limit exceeded")

        llm = self._get_llm()
        tools = [
            self.tool_registry.get(n)
            for n in (self.agent.tools or [])
            if self.tool_registry.has(n)
        ]
        llm_bound = llm.bind_tools(tools) if tools else llm

        history = self._conversations.setdefault(session_id, [])

        # Build message list
        msgs: list = [SystemMessage(content=self.agent.system_prompt)]

        # Vector memory context
        if self.vector_memory:
            mems = await self.vector_memory.retrieve(user_message, k=3)
            if mems:
                msgs.append(
                    SystemMessage(
                        content="Relevant context:\n"
                        + "\n".join(f"- {m}" for m in mems)
                    )
                )

        # Conversation history (sliding window)
        window = self.agent.memory_window or 20
        for turn in history[-window:]:
            msgs.append(
                HumanMessage(content=turn["content"])
                if turn["role"] == "user"
                else AIMessage(content=turn["content"])
            )

        msgs.append(HumanMessage(content=user_message))

        # ── Tool-call loop ────────────────────────────────────────────────────
        final_text = ""
        tokens_used = 0
        round_num = 0

        for round_num in range(MAX_TOOL_ROUNDS):
            response = await llm_bound.ainvoke(msgs)
            usage = getattr(response, "usage_metadata", None) or {}
            tokens_used += usage.get("total_tokens", 0)

            tool_calls = getattr(response, "tool_calls", None) or []
            xml_tool_calls = []
            if not tool_calls:
                xml_tool_calls = [
                    tc
                    for tc in extract_xml_tool_calls(response.content or "")
                    if self.tool_registry.has(tc["name"])
                ]
                tool_calls = xml_tool_calls

            if not tool_calls:
                final_text = response.content or ""
                break

            # LLM wants to call tools
            logger.info(
                "Agent %s round %d: tools=%s",
                self.agent.name,
                round_num + 1,
                [t["name"] for t in tool_calls],
            )

            if xml_tool_calls:
                msgs.append(AIMessage(content=response.content or ""))
            else:
                msgs.append(response)  # append AI message with native tool_calls

            xml_results = []
            for tc in tool_calls:
                tool_name = tc.get("name", "")
                tool_args = tc.get("args", {})
                call_id = tc.get("id", tool_name)

                # Publish tool call to monitor
                await self.message_bus.publish(
                    AgentMessage(
                        from_agent=self.agent.name,
                        to_agent="monitor",
                        content=f"[tool:{tool_name}] {json.dumps(tool_args)[:100]}",
                        session_id=session_id,
                        msg_type="tool_call",
                    )
                )

                tool_obj = self.tool_registry.get(tool_name)
                if not tool_obj:
                    result = f"Tool '{tool_name}' not found."
                else:
                    try:
                        # tool_args is a dict — pass as kwargs
                        if isinstance(tool_args, dict):
                            result = await tool_obj.arun(tool_args)
                        else:
                            result = await tool_obj.arun(str(tool_args))
                        logger.info(
                            "Tool %s result: %s...", tool_name, str(result)[:100]
                        )
                    except Exception as e:
                        result = f"Tool error: {e}"
                        logger.exception("Tool %s failed: %s", tool_name, e)

                if xml_tool_calls:
                    xml_results.append(f"{tool_name} result:\n{result}")
                else:
                    msgs.append(ToolMessage(content=str(result), tool_call_id=call_id))

            if xml_tool_calls:
                msgs.append(
                    HumanMessage(
                        content=(
                            "Tool results are below. Use them to answer the user's "
                            "original request directly. Do not emit another XML tool call "
                            "unless more information is required.\n\n"
                            + "\n\n---\n\n".join(xml_results)
                        )
                    )
                )
        else:
            final_text = getattr(response, "content", "") or "[Max tool rounds reached]"

        # Save turn to history
        history.append({"role": "user", "content": user_message})
        history.append({"role": "assistant", "content": final_text})

        # Vector memory
        if self.vector_memory:
            await self.vector_memory.store(
                text=f"User: {user_message}\nAgent: {final_text}",
                metadata={"session": session_id},
            )

        # Update DB stats
        try:
            from backend.database import AsyncSessionLocal
            from backend.agents.agent_model import record_usage

            async with AsyncSessionLocal() as db:
                await record_usage(
                    db, self.agent.id, tokens_used, round(tokens_used * 0.000001, 6)
                )
        except Exception as e:
            logger.debug("Stats update failed: %s", e)

        # Publish final response to bus (for WS monitor only — NOT back to Telegram)
        await self.message_bus.publish(
            AgentMessage(
                from_agent=self.agent.name,
                to_agent="monitor",  # ← "monitor" not "*" — prevents Telegram feedback loop
                content=final_text,
                session_id=session_id,
                msg_type="response",
                tokens=tokens_used,
            )
        )

        logger.info("Agent %s: done (%d tokens)", self.agent.name, tokens_used)
        return final_text

    async def stream(self, user_message: str, session_id: str) -> AsyncIterator[str]:
        llm = self._get_llm()
        history = self._conversations.get(session_id, [])
        window = self.agent.memory_window or 20
        msgs: list = [SystemMessage(content=self.agent.system_prompt)]
        for turn in history[-window:]:
            msgs.append(
                HumanMessage(content=turn["content"])
                if turn["role"] == "user"
                else AIMessage(content=turn["content"])
            )
        msgs.append(HumanMessage(content=user_message))
        async for chunk in llm.astream(msgs):
            if chunk.content:
                yield chunk.content
