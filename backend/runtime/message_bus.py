import asyncio
import json
import logging
import os
from dataclasses import dataclass, field, asdict
from datetime import datetime
from typing import Callable, Awaitable
import uuid

logger = logging.getLogger(__name__)

MessageHandler = Callable[["AgentMessage"], Awaitable[None]]


@dataclass
class AgentMessage:
    from_agent: str
    to_agent: str
    content: str
    session_id: str
    msg_type: str = "response"
    metadata: dict = field(default_factory=dict)
    tokens: int = 0
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    id: str = field(default_factory=lambda: str(uuid.uuid4()))


class InMemoryQueue:
    def __init__(self):
        self._queue: asyncio.Queue[AgentMessage] = asyncio.Queue()

    async def put(self, msg: AgentMessage):
        await self._queue.put(msg)

    async def get(self) -> AgentMessage:
        return await self._queue.get()

    def task_done(self):
        self._queue.task_done()


class RedisQueue:
    def __init__(self, redis_url: str, stream_name: str = "agentOrch:messages"):
        import redis.asyncio as aioredis

        self._redis = aioredis.from_url(redis_url)
        self._stream = stream_name
        self._consumer_group = "agentOrch-workers"
        self._consumer_id = f"worker-{uuid.uuid4().hex[:8]}"

    async def put(self, msg: AgentMessage):
        await self._redis.xadd(self._stream, {"data": json.dumps(asdict(msg))})

    async def get(self) -> AgentMessage:
        results = await self._redis.xreadgroup(
            self._consumer_group,
            self._consumer_id,
            {self._stream: ">"},
            count=1,
            block=1000,
        )
        if results:
            _, messages = results[0]
            msg_id, data = messages[0]
            return AgentMessage(**json.loads(data[b"data"]))
        raise asyncio.TimeoutError

    def task_done(self):
        pass


class MessageBus:
    def __init__(self):
        self._handlers: dict[str, list[MessageHandler]] = {}  # agent_id → [handlers]
        self._ws_broadcast: list[MessageHandler] = []  # WebSocket broadcast hooks
        self._queue: InMemoryQueue | RedisQueue | None = None
        self._task: asyncio.Task | None = None
        self.running = False
        self._history: list[AgentMessage] = []  # in-memory recent messages

    async def start(self):
        redis_url = os.getenv("REDIS_URL")
        if redis_url:
            try:
                self._queue = RedisQueue(redis_url)
                logger.info("Message bus using Redis: %s", redis_url)
            except Exception as e:
                logger.warning(
                    "Redis unavailable (%s), falling back to in-memory queue", e
                )
                self._queue = InMemoryQueue()
        else:
            self._queue = InMemoryQueue()
            logger.info("Message bus using in-memory queue (no Redis configured)")

        self.running = True
        self._task = asyncio.create_task(self._dispatch_loop())

    async def stop(self):
        self.running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass

    async def publish(self, msg: AgentMessage):
        await self._queue.put(msg)
        # Keep recent history
        self._history.append(msg)
        if len(self._history) > 500:
            self._history.pop(0)
        await self._persist_message(msg)

    def subscribe(self, agent_id: str, handler: MessageHandler):
        handlers = self._handlers.setdefault(agent_id, [])
        if handler not in handlers:
            handlers.append(handler)

    def subscribe_broadcast(self, handler: MessageHandler):
        if handler not in self._ws_broadcast:
            self._ws_broadcast.append(handler)

    def get_history(self, limit: int = 100) -> list[AgentMessage]:
        return self._history[-limit:]

    async def _persist_message(self, msg: AgentMessage):
        try:
            from backend.database import AsyncSessionLocal
            from backend.api.messages_router import Message

            async with AsyncSessionLocal() as db:
                db.add(
                    Message(
                        id=msg.id,
                        session_id=msg.session_id,
                        from_agent=msg.from_agent,
                        to_agent=msg.to_agent,
                        content=msg.content,
                        msg_type=msg.msg_type,
                        channel=msg.metadata.get("channel"),
                        tokens=msg.tokens,
                        metadata_=msg.metadata,
                    )
                )
                await db.commit()
        except Exception as e:
            logger.debug("Message persistence failed: %s", e)

    async def _dispatch_loop(self):
        while self.running:
            try:
                msg = await asyncio.wait_for(self._queue.get(), timeout=1.0)
                self._queue.task_done()

                # Broadcast to WebSocket listeners first
                for ws_handler in self._ws_broadcast:
                    asyncio.create_task(ws_handler(msg))

                # Route to specific agent or broadcast
                if msg.to_agent == "*":
                    for handlers in self._handlers.values():
                        for h in handlers:
                            asyncio.create_task(h(msg))
                else:
                    for h in self._handlers.get(msg.to_agent, []):
                        asyncio.create_task(h(msg))

            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.exception("Error in message bus dispatch loop: %s", e)
