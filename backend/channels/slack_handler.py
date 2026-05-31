import asyncio
import logging
import os
from typing import TYPE_CHECKING

from backend.runtime.message_bus import MessageBus, AgentMessage

if TYPE_CHECKING:
    from backend.agents.agent_runtime import AgentRuntime

logger = logging.getLogger(__name__)


class SlackHandler:

    def __init__(
        self,
        bot_token: str,
        app_token: str,
        message_bus: MessageBus,
        agent_runtime: "AgentRuntime | None" = None,
    ):
        self.bot_token = bot_token
        self.app_token = app_token
        self.message_bus = message_bus
        self.agent_runtime = agent_runtime
        self._handler = None
        self._client = None

    async def start(self):
        """Start the Slack Socket Mode handler."""
        try:
            from slack_sdk.web.async_client import AsyncWebClient
            from slack_sdk.socket_mode.aiohttp import SocketModeClient
            from slack_sdk.socket_mode.request import SocketModeRequest
            from slack_sdk.socket_mode.response import SocketModeResponse
        except ImportError:
            logger.error("slack-sdk not installed. Run: pip install slack-sdk aiohttp")
            return

        self._client = AsyncWebClient(token=self.bot_token)
        sm_client = SocketModeClient(app_token=self.app_token, web_client=self._client)

        async def handle(client: SocketModeClient, req: SocketModeRequest):
            # Acknowledge immediately
            await client.send_socket_mode_response(
                SocketModeResponse(envelope_id=req.envelope_id)
            )

            if req.type == "events_api":
                event = req.payload.get("event", {})
                if event.get("type") == "message" and not event.get("bot_id"):
                    await self._on_message(event)

        sm_client.socket_mode_request_listeners.append(handle)
        self.message_bus.subscribe("slack_channel", self._on_bus_message)

        await sm_client.connect()
        logger.info("Slack Socket Mode connected")

        # Keep alive
        while True:
            await asyncio.sleep(60)

    async def send_message(self, channel: str, text: str):
        """Post a message to a Slack channel or DM."""
        if self._client:
            try:
                await self._client.chat_postMessage(channel=channel, text=text)
            except Exception as e:
                logger.error("Slack send_message error: %s", e)

    async def _on_message(self, event: dict):
        """Route inbound Slack message to the agent."""
        text = event.get("text", "")
        channel = event.get("channel", "")
        user = event.get("user", "unknown")
        session_id = f"slack_{channel}_{user}"

        logger.info("Slack message from %s in %s: %s", user, channel, text[:80])

        await self.message_bus.publish(
            AgentMessage(
                from_agent=f"slack:{user}",
                to_agent=(
                    self.agent_runtime.agent.id if self.agent_runtime else "default"
                ),
                content=text,
                session_id=session_id,
                msg_type="user_message",
                metadata={"channel": channel, "platform": "slack"},
            )
        )

        if self.agent_runtime:
            try:
                response = await self.agent_runtime.run(
                    user_message=text,
                    session_id=session_id,
                    context={"channel": channel, "platform": "slack"},
                )
                await self.send_message(channel, response)
            except Exception as e:
                logger.exception("Agent runtime error (Slack): %s", e)
                await self.send_message(
                    channel, "Sorry, I encountered an error. Please try again."
                )

    async def _on_bus_message(self, msg: AgentMessage):
        """Deliver outbound messages addressed to Slack."""
        if msg.msg_type == "channel_reply" and msg.metadata.get("platform") == "slack":
            channel = msg.metadata.get("channel")
            if channel:
                await self.send_message(channel, msg.content)
