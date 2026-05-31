import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Column, String, JSON, Integer, DateTime, Boolean
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel, Field

from backend.database import Base


class Agent(Base):
    __tablename__ = "agents"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    role = Column(String, nullable=False)
    system_prompt = Column(String, nullable=False)
    model = Column(String)
    tools = Column(JSON, default=list)  # ["web_search", "send_message", ...]
    channel = Column(String, nullable=True)  # "telegram" | "slack" | None
    memory_type = Column(
        String, default="window"
    )  # "window" | "vector" | "summary" | "none"
    memory_window = Column(Integer, default=20)
    schedule = Column(String, nullable=True)  # cron string or "always"
    guardrails = Column(JSON, default=list)  # ["rate_limit", "content_filter", ...]
    max_tokens_per_call = Column(Integer, default=4096)
    max_tokens_per_day = Column(Integer, nullable=True)
    interaction_rules = Column(JSON, default=dict)  # who it can message, priority
    skills = Column(JSON, default=list)  # custom plugin names
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Runtime stats (updated in-place)
    total_tasks = Column(Integer, default=0)
    total_tokens = Column(Integer, default=0)
    total_cost_usd = Column(String, default="0.00")  # stored as string for precision


# ─── Pydantic schemas ────────────────────────────────────────────────────────


class AgentCreate(BaseModel):
    name: str
    role: str
    system_prompt: str
    model: str = "llama-3.3-70b-versatile"
    tools: list[str] = Field(default_factory=list)
    channel: Optional[str] = None
    memory_type: str = "window"
    memory_window: int = 20
    schedule: Optional[str] = "always"
    guardrails: list[str] = Field(
        default_factory=lambda: ["content_filter", "rate_limit"]
    )
    max_tokens_per_call: int = 4096
    max_tokens_per_day: Optional[int] = None
    interaction_rules: dict = Field(default_factory=dict)
    skills: list[str] = Field(default_factory=list)


class AgentUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    system_prompt: Optional[str] = None
    model: Optional[str] = None
    tools: Optional[list[str]] = None
    channel: Optional[str] = None
    memory_type: Optional[str] = None
    memory_window: Optional[int] = None
    schedule: Optional[str] = None
    guardrails: Optional[list[str]] = None
    max_tokens_per_call: Optional[int] = None
    max_tokens_per_day: Optional[int] = None
    interaction_rules: Optional[dict] = None
    skills: Optional[list[str]] = None
    is_active: Optional[bool] = None


class AgentOut(BaseModel):
    id: str
    name: str
    role: str
    system_prompt: str
    model: str
    tools: list[str]
    channel: Optional[str]
    memory_type: str
    memory_window: int
    schedule: Optional[str]
    guardrails: list[str]
    max_tokens_per_call: int
    max_tokens_per_day: Optional[int]
    interaction_rules: dict
    skills: list[str]
    is_active: bool
    total_tasks: int
    total_tokens: int
    total_cost_usd: str
    created_at: datetime

    class Config:
        from_attributes = True


# ─── CRUD ────────────────────────────────────────────────────────────────────


async def create_agent(db: AsyncSession, data: AgentCreate) -> Agent:
    agent = Agent(**data.model_dump())
    db.add(agent)
    await db.commit()
    await db.refresh(agent)
    return agent


async def get_agent(db: AsyncSession, agent_id: str) -> Agent | None:
    result = await db.execute(select(Agent).where(Agent.id == agent_id))
    return result.scalar_one_or_none()


async def list_agents(db: AsyncSession, active_only: bool = False) -> list[Agent]:
    query = select(Agent)
    if active_only:
        query = query.where(Agent.is_active == True)
    result = await db.execute(query)
    return list(result.scalars().all())


async def update_agent(
    db: AsyncSession, agent_id: str, data: AgentUpdate
) -> Agent | None:
    agent = await get_agent(db, agent_id)
    if not agent:
        return None
    for k, v in data.model_dump(exclude_none=True).items():
        setattr(agent, k, v)
    agent.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(agent)
    return agent


async def delete_agent(db: AsyncSession, agent_id: str) -> bool:
    agent = await get_agent(db, agent_id)
    if not agent:
        return False
    await db.delete(agent)
    await db.commit()
    return True


async def record_usage(db: AsyncSession, agent_id: str, tokens: int, cost: float):
    """Update running token and cost totals for an agent."""
    agent = await get_agent(db, agent_id)
    if agent:
        agent.total_tasks += 1
        agent.total_tokens += tokens
        agent.total_cost_usd = str(round(float(agent.total_cost_usd or 0) + cost, 4))
        await db.commit()
