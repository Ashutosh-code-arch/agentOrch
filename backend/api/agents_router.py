from dotenv import load_dotenv

load_dotenv()

"""
Agents API — full CRUD for agent management.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database import get_db
from backend.agents.agent_model import (
    AgentCreate,
    AgentUpdate,
    AgentOut,
    create_agent,
    get_agent,
    list_agents,
    update_agent,
    delete_agent,
)

router = APIRouter()


@router.post("/", response_model=AgentOut, status_code=201)
async def create(data: AgentCreate, db: AsyncSession = Depends(get_db)):
    agent = await create_agent(db, data)
    return agent


@router.get("/", response_model=list[AgentOut])
async def list_all(active_only: bool = False, db: AsyncSession = Depends(get_db)):
    return await list_agents(db, active_only=active_only)


@router.get("/{agent_id}", response_model=AgentOut)
async def get_one(agent_id: str, db: AsyncSession = Depends(get_db)):
    agent = await get_agent(db, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    return agent


@router.patch("/{agent_id}", response_model=AgentOut)
async def update(agent_id: str, data: AgentUpdate, db: AsyncSession = Depends(get_db)):
    agent = await update_agent(db, agent_id, data)
    if not agent:
        raise HTTPException(404, "Agent not found")
    return agent


@router.delete("/{agent_id}", status_code=204)
async def delete(agent_id: str, db: AsyncSession = Depends(get_db)):
    success = await delete_agent(db, agent_id)
    if not success:
        raise HTTPException(404, "Agent not found")


@router.post("/{agent_id}/run")
async def run_agent(agent_id: str, body: dict, db: AsyncSession = Depends(get_db)):
    """
    Invoke an agent directly with a user message.
    Uses the app-level message bus (already started) instead of creating a new one.
    """
    from backend.agents.delegation import run_with_research_delegation
    from backend.main import message_bus  # reuse the already-started bus
    from backend.runtime.message_bus import AgentMessage

    agent = await get_agent(db, agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")

    user_message = body.get("message", "")
    session_id = body.get("session_id", f"api_{agent_id}")
    try:
        await message_bus.publish(
            AgentMessage(
                from_agent="ui:user",
                to_agent=agent.id,
                content=user_message,
                session_id=session_id,
                msg_type="user_message",
                metadata={"channel": "web"},
            )
        )
        result = await run_with_research_delegation(
            entry_agent=agent,
            user_message=user_message,
            session_id=session_id,
            context={"channel": "web"},
            db=db,
            message_bus=message_bus,
        )
        return {"response": result, "agent_id": agent_id}
    except Exception as e:
        raise HTTPException(500, str(e))
