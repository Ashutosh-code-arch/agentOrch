"""
AGENTORCH AI Agent Orchestration Platform
FastAPI application entry point
"""

import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.api.agents_router import router as agents_router
from backend.api.workflows_router import router as workflows_router
from backend.api.messages_router import router as messages_router
from backend.api.ws_router import router as ws_router
from backend.channels.telegram_handler import TelegramHandler
from backend.runtime.message_bus import MessageBus
from backend.database import init_db

logger = logging.getLogger(__name__)

message_bus = MessageBus()
telegram_handler: TelegramHandler | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Start/stop background services on app lifecycle."""
    await init_db()
    await message_bus.start()

    # Start Telegram bot if token configured
    import os

    if token := os.getenv("TELEGRAM_BOT_TOKEN"):
        global telegram_handler
        telegram_handler = TelegramHandler(token=token, message_bus=message_bus)
        asyncio.create_task(telegram_handler.start())
        logger.info("Telegram bot started (polling mode)")

    logger.info("AGENT ORCH platform ready")
    yield

    # Cleanup
    await message_bus.stop()
    if telegram_handler:
        await telegram_handler.stop()


app = FastAPI(
    title="Agent Orchestration API",
    description="Multi-agent AI orchestration platform",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(agents_router, prefix="/api/agents", tags=["agents"])
app.include_router(workflows_router, prefix="/api/workflows", tags=["workflows"])
app.include_router(messages_router, prefix="/api/messages", tags=["messages"])
app.include_router(ws_router, prefix="/ws", tags=["websocket"])


@app.get("/health")
async def health():
    return {"status": "ok", "bus_running": message_bus.running}


@app.post("/webhooks/telegram")
async def telegram_webhook(update: dict):
    """Telegram webhook endpoint."""
    if telegram_handler:
        await telegram_handler.process_webhook(update)
    return {"ok": True}
