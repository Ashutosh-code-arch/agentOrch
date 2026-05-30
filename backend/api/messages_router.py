import uuid
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import Column, String, Integer, DateTime, JSON
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel

from backend.database import Base, get_db

router = APIRouter()


class Message(Base):
    __tablename__ = "messages"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    session_id = Column(String, index=True)
    from_agent = Column(String)
    to_agent = Column(String)
    content = Column(String)
    msg_type = Column(String, default="response")
    channel = Column(String, nullable=True)
    tokens = Column(Integer, default=0)
    metadata_ = Column("metadata", JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow)


class MessageOut(BaseModel):
    id: str
    session_id: str
    from_agent: str
    to_agent: str
    content: str
    msg_type: str
    tokens: int
    created_at: datetime

    class Config:
        from_attributes = True


@router.get("/", response_model=list[MessageOut])
async def list_messages(
    session_id: Optional[str] = Query(None),
    from_agent: Optional[str] = Query(None),
    limit: int = Query(100, le=500),
    db: AsyncSession = Depends(get_db),
):
    query = select(Message).order_by(Message.created_at.desc()).limit(limit)
    if session_id:
        query = query.where(Message.session_id == session_id)
    if from_agent:
        query = query.where(Message.from_agent == from_agent)
    result = await db.execute(query)
    return list(result.scalars().all())


@router.get("/sessions")
async def list_sessions(db: AsyncSession = Depends(get_db)):
    from sqlalchemy import distinct

    result = await db.execute(select(distinct(Message.session_id)))
    return [r[0] for r in result.all() if r[0]]


@router.delete("/session/{session_id}", status_code=204)
async def clear_session(session_id: str, db: AsyncSession = Depends(get_db)):
    from sqlalchemy import delete

    await db.execute(delete(Message).where(Message.session_id == session_id))
    await db.commit()
