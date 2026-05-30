"""
WebSocket router — streams live agent logs and inter-agent messages to the UI.
"""

import asyncio
import json
import logging
from dataclasses import asdict

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from backend.runtime.message_bus import MessageBus, AgentMessage

router = APIRouter()
logger = logging.getLogger(__name__)

# Global set of active WebSocket connections
_active_connections: set[WebSocket] = set()
_message_bus: MessageBus | None = None


def set_message_bus(bus: MessageBus):
    global _message_bus
    _message_bus = bus
    bus.subscribe_broadcast(_broadcast_to_ws)


async def _broadcast_to_ws(msg: AgentMessage):
    """Called by the message bus; fans out to all connected WebSocket clients."""
    payload = json.dumps(
        {
            "type": "agent_message",
            "data": asdict(msg),
        }
    )
    dead = set()
    for ws in list(_active_connections):
        try:
            await ws.send_text(payload)
        except Exception:
            dead.add(ws)
    _active_connections.difference_update(dead)


@router.websocket("/logs")
async def logs_websocket(ws: WebSocket):
    """
    WebSocket endpoint: connect to receive a live stream of:
    - Agent messages (inter-agent communication)
    - Log events (INFO, WARN, ERROR)
    - Workflow execution steps
    """
    await ws.accept()
    _active_connections.add(ws)
    logger.info("WebSocket client connected (%d total)", len(_active_connections))

    try:
        # Send recent history on connect
        if _message_bus:
            for msg in _message_bus.get_history(limit=50):
                await ws.send_text(
                    json.dumps(
                        {
                            "type": "history",
                            "data": asdict(msg),
                        }
                    )
                )

        # Keep alive and handle client messages
        while True:
            try:
                data = await asyncio.wait_for(ws.receive_text(), timeout=30.0)
                # Handle ping/control messages from client
                parsed = json.loads(data)
                if parsed.get("type") == "ping":
                    await ws.send_text(json.dumps({"type": "pong"}))
            except asyncio.TimeoutError:
                # Send keepalive
                await ws.send_text(json.dumps({"type": "keepalive"}))

    except WebSocketDisconnect:
        pass
    finally:
        _active_connections.discard(ws)
        logger.info(
            "WebSocket client disconnected (%d remaining)", len(_active_connections)
        )
