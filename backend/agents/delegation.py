from __future__ import annotations

import logging
import re

from sqlalchemy.ext.asyncio import AsyncSession

from backend.agents.agent_model import Agent, list_agents
from backend.agents.agent_runtime import AgentRuntime
from backend.runtime.message_bus import AgentMessage, MessageBus

logger = logging.getLogger(__name__)

_RESEARCH_TERMS = (
    "research",
    "look up",
    "lookup",
    "find out",
    "latest",
    "current",
    "compare",
    "comparison",
    "summarize",
    "summary",
    "limitations",
    "being used",
    "applications",
    "trends",
    "news",
    "2024",
    "2025",
    "2026",
    "2027",
)

_DELEGATE_RE = re.compile(
    r"\bDELEGATE_TO_([A-Z0-9_ -]+):\s*(.+)",
    flags=re.IGNORECASE | re.DOTALL,
)


def is_research_request(text: str) -> bool:
    """Simple deterministic intent check for the demo workflow."""
    normalized = re.sub(r"\s+", " ", text.strip().lower())
    if re.search(r"\b(how are you|hi|hello|hey|thanks|thank you)\b", normalized):
        return False
    return any(term in normalized for term in _RESEARCH_TERMS)


def _is_research_agent(agent: Agent) -> bool:
    tools = [tool.lower() for tool in (agent.tools or [])]
    haystack = " ".join(
        [
            agent.name or "",
            agent.role or "",
            agent.system_prompt or "",
            " ".join(tools),
        ]
    ).lower()
    return "research" in haystack or "web_search" in tools


def _parse_delegate_directive(text: str) -> tuple[str, str] | None:
    match = _DELEGATE_RE.search(text or "")
    if not match:
        return None
    target = re.sub(r"[^a-z0-9]+", " ", match.group(1).lower()).strip()
    task = match.group(2).strip()
    return target, task


def _normalized(value: str | None) -> str:
    return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()


def _delegate_reason(agent: Agent) -> str:
    return "research_intent" if _is_research_agent(agent) else "agent_directive"


async def find_delegate_agent(
    db: AsyncSession,
    target: str,
    task: str,
    exclude_agent_id: str | None = None,
) -> Agent | None:
    """Resolve an LLM-produced delegate directive to a real active agent."""
    agents = [
        agent
        for agent in await list_agents(db, active_only=True)
        if agent.id != exclude_agent_id
    ]
    if not agents:
        return None

    target_norm = _normalized(target)
    for agent in agents:
        if target_norm in {
            _normalized(agent.name),
            _normalized(agent.role),
            _normalized(agent.id),
        }:
            return agent

    if "research" in target_norm or is_research_request(task):
        return await find_research_agent(db, exclude_agent_id=exclude_agent_id)

    return None


async def _run_delegated_task(
    *,
    entry_agent: Agent,
    delegate_agent: Agent,
    task: str,
    session_id: str,
    context: dict,
    message_bus: MessageBus,
) -> str:
    await message_bus.publish(
        AgentMessage(
            from_agent=entry_agent.name,
            to_agent=delegate_agent.name,
            content=task,
            session_id=session_id,
            msg_type="delegate",
            metadata={
                **context,
                "delegated_from": entry_agent.id,
                "delegated_to": delegate_agent.id,
                "reason": _delegate_reason(delegate_agent),
            },
        )
    )
    logger.info(
        "Delegating request from %s to %s",
        entry_agent.name,
        delegate_agent.name,
    )

    runtime = AgentRuntime(agent=delegate_agent, message_bus=message_bus)
    result = await runtime.run(
        user_message=(
            "You are receiving this as a delegated task from "
            f"{entry_agent.name}. Answer the user's request directly and in detail:\n\n"
            f"{task}"
        ),
        session_id=session_id,
        context={
            **context,
            "delegated_from": entry_agent.id,
            "delegate_reason": _delegate_reason(delegate_agent),
        },
    )

    await message_bus.publish(
        AgentMessage(
            from_agent=delegate_agent.name,
            to_agent=entry_agent.name,
            content=result or "[delegated agent returned an empty response]",
            session_id=session_id,
            msg_type="delegate_result",
            metadata={
                **context,
                "delegated_from": entry_agent.id,
                "delegated_to": delegate_agent.id,
                "reason": _delegate_reason(delegate_agent),
            },
        )
    )

    return result or (
        "The delegated agent completed the task but returned an empty response. "
        "Check the live logs for model/tool errors."
    )


async def find_research_agent(
    db: AsyncSession, exclude_agent_id: str | None = None
) -> Agent | None:
    """Return the best active research-capable agent."""
    agents = await list_agents(db, active_only=True)
    candidates = [
        agent
        for agent in agents
        if agent.id != exclude_agent_id and _is_research_agent(agent)
    ]
    if not candidates:
        return None
    candidates.sort(
        key=lambda agent: (
            "research" not in (agent.role or "").lower(),
            "web_search" not in [tool.lower() for tool in (agent.tools or [])],
            agent.name.lower(),
        )
    )
    return candidates[0]


async def run_with_research_delegation(
    *,
    entry_agent: Agent,
    user_message: str,
    session_id: str,
    context: dict,
    db: AsyncSession,
    message_bus: MessageBus,
) -> str:
    """
    Run the entry agent, delegating research-like requests to a research agent.

    The handoff is intentionally deterministic so the platform demo is reliable:
    users can ask the Telegram/support agent a research question and see a real
    inter-agent delegate message plus the research agent's final response.
    """
    should_delegate = is_research_request(user_message)
    research_agent = (
        await find_research_agent(db, exclude_agent_id=entry_agent.id)
        if should_delegate
        else None
    )

    if not research_agent:
        runtime = AgentRuntime(agent=entry_agent, message_bus=message_bus)
        result = await runtime.run(
            user_message=user_message,
            session_id=session_id,
            context=context,
        )
        directive = _parse_delegate_directive(result)
        if not directive:
            return result

        target, task = directive
        delegate_agent = await find_delegate_agent(
            db,
            target=target,
            task=task,
            exclude_agent_id=entry_agent.id,
        )
        if delegate_agent:
            return await _run_delegated_task(
                entry_agent=entry_agent,
                delegate_agent=delegate_agent,
                task=task,
                session_id=session_id,
                context=context,
                message_bus=message_bus,
            )

        logger.warning(
            "Agent %s requested delegation to %r, but no active target was found",
            entry_agent.name,
            target,
        )
        return (
            "I need an active specialist agent for that request, but could not "
            "find one to delegate to. Please check that the research agent is active."
        )

    return await _run_delegated_task(
        entry_agent=entry_agent,
        delegate_agent=research_agent,
        task=user_message,
        session_id=session_id,
        context=context,
        message_bus=message_bus,
    )
