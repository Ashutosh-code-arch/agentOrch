"""
Agent delegation helpers.

These helpers keep channel handlers and API routes thin while providing a real
agent-to-agent handoff path for common workflows like support -> research.
"""

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
    "what is",
    "how does",
    "how do",
    "explain",
)


def is_research_request(text: str) -> bool:
    """Simple deterministic intent check for the demo workflow."""
    normalized = re.sub(r"\s+", " ", text.strip().lower())
    return any(term in normalized for term in _RESEARCH_TERMS)


def _is_research_agent(agent: Agent) -> bool:
    haystack = " ".join(
        [
            agent.name or "",
            agent.role or "",
            agent.system_prompt or "",
            " ".join(agent.tools or []),
        ]
    ).lower()
    return "research" in haystack or "web_search" in (agent.tools or [])


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
            "web_search" not in (agent.tools or []),
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
        return await runtime.run(
            user_message=user_message,
            session_id=session_id,
            context=context,
        )

    await message_bus.publish(
        AgentMessage(
            from_agent=entry_agent.name,
            to_agent=research_agent.name,
            content=user_message,
            session_id=session_id,
            msg_type="delegate",
            metadata={
                **context,
                "delegated_from": entry_agent.id,
                "delegated_to": research_agent.id,
                "reason": "research_intent",
            },
        )
    )
    logger.info(
        "Delegating research request from %s to %s",
        entry_agent.name,
        research_agent.name,
    )

    runtime = AgentRuntime(agent=research_agent, message_bus=message_bus)
    result = await runtime.run(
        user_message=(
            "You are receiving this as a delegated research task from "
            f"{entry_agent.name}. Research and answer the user's request in detail:\n\n"
            f"{user_message}"
        ),
        session_id=session_id,
        context={
            **context,
            "delegated_from": entry_agent.id,
            "delegate_reason": "research_intent",
        },
    )

    await message_bus.publish(
        AgentMessage(
            from_agent=research_agent.name,
            to_agent=entry_agent.name,
            content=result or "[research agent returned an empty response]",
            session_id=session_id,
            msg_type="delegate_result",
            metadata={
                **context,
                "delegated_from": entry_agent.id,
                "delegated_to": research_agent.id,
                "reason": "research_intent",
            },
        )
    )

    return result or (
        "The research agent completed the delegated task but returned an empty "
        "response. Check the live logs for model/tool errors."
    )
