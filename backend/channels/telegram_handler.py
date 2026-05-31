"""
Telegram Channel Handler
Connects a single agent to Telegram via python-telegram-bot.
Supports both polling (local dev) and webhook (production).
"""

from dotenv import load_dotenv

load_dotenv()
import asyncio
import logging
import os
import re
from typing import TYPE_CHECKING

from telegram import Update, Bot
from telegram.ext import (
    Application,
    ApplicationBuilder,
    MessageHandler,
    CommandHandler,
    ContextTypes,
    filters,
)

from backend.runtime.message_bus import MessageBus, AgentMessage

if TYPE_CHECKING:
    from backend.agents.agent_runtime import AgentRuntime

logger = logging.getLogger(__name__)

# Patterns to strip from agent responses before sending to Telegram user
_INTERNAL_PATTERNS = [
    r"DELEGATE_TO_\w+:\s*[^\n]*\n?",
    r"ROUTE_TO_\w+:\s*[^\n]*\n?",
    r"\[INTERNAL:[^\]]*\]\n?",
    r"\[LOG:[^\]]*\]\n?",
]


def clean_response(text: str) -> str:
    """Remove internal agent directives before sending to a human."""
    for pattern in _INTERNAL_PATTERNS:
        text = re.sub(pattern, "", text, flags=re.IGNORECASE)
    return text.strip()


class TelegramHandler:
    """
    Wraps a Telegram bot. Routes inbound messages to the assigned agent,
    and lets the agent send replies back.
    """

    def __init__(
        self,
        token: str,
        message_bus: MessageBus,
        # agent_runtime: "AgentRuntime | None" = None,
        agent_runtime=None,
    ):
        self.token = token
        self.message_bus = message_bus
        self.agent_runtime = agent_runtime
        self._app: Application | None = None
        self._bot: Bot | None = None
        self._processed_update_ids: set[int] = set()

    async def _load_agent_runtime(self):
        """Load the first active Telegram-channel agent from the database."""
        try:
            from backend.database import AsyncSessionLocal
            from backend.agents.agent_model import list_agents
            from backend.agents.agent_runtime import AgentRuntime

            async with AsyncSessionLocal() as db:
                active_agents = await list_agents(db, active_only=True)
                # Find agent assigned to telegram channel
                tg_agent = next(
                    (
                        a
                        for a in active_agents
                        if a.channel and a.channel.lower() == "telegram"
                    ),
                    None,
                )
                #         # Fallback: use any active agent
                #         if not tg_agent and agents:
                #             tg_agent = agents[0]

                #         if tg_agent:
                #             self.agent_runtime = AgentRuntime(
                #                 agent=tg_agent, message_bus=self.message_bus
                #             )
                #             logger.info(
                #                 "Telegram bot linked to agent: %s (%s)",
                #                 tg_agent.name,
                #                 tg_agent.model,
                #             )
                #         else:
                #             logger.warning(
                #                 "No active agents found in DB — bot will not respond to messages"
                #             )
                # except Exception as e:
                #     logger.exception("Failed to load agent runtime for Telegram: %s", e)
                if not tg_agent:
                    if self.agent_runtime:
                        logger.warning(
                            "Previously linked agent is no longer active/telegram. "
                            "Clearing runtime."
                        )
                        self.agent_runtime = None
                    else:
                        logger.warning(
                            "No active agent with channel=telegram found. "
                            "Set one at http://localhost:3000/agents"
                        )
                    return

            # Only reload if agent changed (avoid recreating runtime on every message)
            current_id = self.agent_runtime.agent.id if self.agent_runtime else None
            if current_id != tg_agent.id:
                self.agent_runtime = AgentRuntime(
                    agent=tg_agent, message_bus=self.message_bus
                )
                # logger.info(
                #     "Telegram bot linked to agent: %s (%s) [active=%s]",
                #     tg_agent.name,
                #     tg_agent.model,
                #     tg_agent.is_active,
                # )
                logger.info(
                    "Telegram linked to agent: %s | model: %s",
                    tg_agent.name,
                    tg_agent.model,
                )
        except Exception as e:
            logger.exception("Failed to load agent runtime for Telegram: %s", e)

    async def start(self):
        """Start the bot in polling mode (for local development)."""
        await self._load_agent_runtime()

        self._app = ApplicationBuilder().token(self.token).build()
        self._bot = self._app.bot

        # Register handlers
        self._app.add_handler(CommandHandler("start", self._cmd_start))
        self._app.add_handler(CommandHandler("help", self._cmd_help))
        self._app.add_handler(CommandHandler("status", self._cmd_status))
        self._app.add_handler(CommandHandler("agents", self._cmd_agents))
        self._app.add_handler(
            MessageHandler(filters.TEXT & ~filters.COMMAND, self._on_message)
        )

        # Subscribe to message bus to receive outbound messages
        self.message_bus.subscribe("telegram_channel", self._on_bus_message)

        logger.info("Telegram bot starting in polling mode...")
        await self._app.initialize()
        await self._app.start()
        await self._app.updater.start_polling(drop_pending_updates=True)

    async def stop(self):
        if self._app:
            await self._app.updater.stop()
            await self._app.stop()
            await self._app.shutdown()

    async def process_webhook(self, update_data: dict):
        """Handle a Telegram update delivered via webhook (production mode)."""
        if not self._app:
            return
        update = Update.de_json(update_data, self._bot)
        await self._app.process_update(update)

    async def send_message(self, chat_id: int | str, text: str):
        """Send a message back to a Telegram chat."""
        if not self._bot or not text.strip():
            return
        for chunk in self._split_message(text, 4000):
            try:
                await self._bot.send_message(
                    chat_id=chat_id, text=chunk, parse_mode="Markdown"
                )
            except Exception:
                try:
                    await self._bot.send_message(chat_id=chat_id, text=chunk)
                except Exception as e:
                    logger.error("Failed to send Telegram message: %s", e)

    # ─── Telegram event handlers ─────────────────────────────────────────────

    async def _cmd_start(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        # Reload agent in case it changed since bot start
        await self._load_agent_runtime()
        if self.agent_runtime:
            a = self.agent_runtime.agent
            msg = (
                f"👋 Hi! I'm *{a.name}*, your {a.role}.\n\n"
                f"Send me a message and I'll help you out.\n"
                f"Type /help for available commands."
            )
        else:
            msg = (
                "👋 Hi! I'm an AgentOrch AI agent.\n\n"
                "⚠️ No agent is configured yet.\n"
                "Create one at http://localhost:3000/agents and set its channel to *Telegram*."
            )
        await update.message.reply_text(msg, parse_mode="Markdown")

    async def _cmd_help(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        agent_name = self.agent_runtime.agent.name if self.agent_runtime else "Agent"
        await update.message.reply_text(
            f"*{agent_name} — Help*\n\n"
            "Just send any message and I'll respond.\n\n"
            "*Commands:*\n"
            "/start — Introduction\n"
            "/status — Current agent info\n"
            "/agents — List all available agents\n"
            "/help — This message",
            parse_mode="Markdown",
        )

    async def _cmd_status(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        await self._load_agent_runtime()
        if self.agent_runtime:
            a = self.agent_runtime.agent
            tools = ", ".join(a.tools or []) or "none"
            await update.message.reply_text(
                f"*Agent Status*\n\n"
                f"*Name:* {a.name}\n"
                f"*Role:* {a.role}\n"
                f"*Model:* `{a.model}`\n"
                f"*Tools:* {tools}\n"
                f"*Memory:* {a.memory_type}\n"
                f"*Status:* ✅ Active",
                parse_mode="Markdown",
            )
        else:
            await update.message.reply_text(
                "⚠️ No agent is currently linked to this bot."
            )

    async def _cmd_agents(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        """List all active agents from the database."""
        try:
            from backend.database import AsyncSessionLocal
            from backend.agents.agent_model import list_agents

            async with AsyncSessionLocal() as db:
                agents = await list_agents(db, active_only=True)

            if not agents:
                await update.message.reply_text("No active agents found.")
                return

            lines = ["*Active Agents:*\n"]
            for a in agents:
                channel = f" · {a.channel}" if a.channel else ""
                lines.append(f"• *{a.name}* — {a.role}{channel}\n  Model: `{a.model}`")
            await update.message.reply_text("\n".join(lines), parse_mode="Markdown")
        except Exception as e:
            await update.message.reply_text(f"Error listing agents: {e}")

    # ── Message handler ───────────────────────────────────────────────────────

    async def _on_message(self, update: Update, context: ContextTypes.DEFAULT_TYPE):
        if update.update_id in self._processed_update_ids:
            logger.info("Skipping duplicate Telegram update: %s", update.update_id)
            return
        self._processed_update_ids.add(update.update_id)
        if len(self._processed_update_ids) > 500:
            self._processed_update_ids = set(list(self._processed_update_ids)[-250:])

        user_msg = update.message.text
        chat_id = update.effective_chat.id
        session_id = f"tg_{chat_id}"
        user_display = update.effective_user.username or str(update.effective_user.id)

        logger.info("Telegram message from @%s: %s", user_display, user_msg[:80])

        # Always reload agent to pick up changes (start/stop/reassign)
        await self._load_agent_runtime()

        # If no runtime loaded yet, try loading again (agent may have been created after bot start)
        # if not self.agent_runtime:
        #     await self._load_agent_runtime()

        if not self.agent_runtime:
            await update.message.reply_text(
                "⚠️ No agent is configured yet.\n"
                "Create one at http://localhost:3000/agents and assign it to the Telegram channel."
            )
            return

        # Publish to message bus for live monitoring in UI
        await self.message_bus.publish(
            AgentMessage(
                from_agent=f"telegram:{user_display}",
                to_agent=self.agent_runtime.agent.id,
                content=user_msg,
                session_id=session_id,
                msg_type="user_message",
                metadata={"chat_id": chat_id, "channel": "telegram"},
            )
        )

        # Show typing indicator immediately
        await update.message.chat.send_action("typing")

        try:
            from backend.agents.delegation import is_research_request
            from backend.database import AsyncSessionLocal

            async with AsyncSessionLocal() as db:
                if is_research_request(user_msg):
                    response = await self._run_research_workflow(
                        user_msg=user_msg,
                        session_id=session_id,
                        chat_id=chat_id,
                        db=db,
                    )
                    if response is not None:
                        await self.send_message(chat_id, response)
                        return

                response = await self.agent_runtime.run(
                    user_message=user_msg,
                    session_id=session_id,
                    context={"channel": "telegram", "chat_id": chat_id},
                )
                clean = clean_response(response)
                if not clean:
                    clean = "I couldn't find information related to your request."
            await self.send_message(chat_id, clean)

        except Exception as e:
            logger.exception("Agent runtime error: %s", e)
            await update.message.reply_text(
                "I ran into a temporary issue while preparing that answer. "
                "Please try again in a moment."
            )

    async def _run_research_workflow(
        self,
        *,
        user_msg: str,
        session_id: str,
        chat_id: int,
        db,
    ) -> str | None:
        """Run Telegram research messages through the Research Pipeline."""
        try:
            from backend.agents.agent_model import list_agents
            from backend.agents.agent_runtime import AgentRuntime
            from backend.workflows.workflow_engine import (
                WORKFLOW_TEMPLATES,
                WorkflowEngine,
            )

            workflow = WORKFLOW_TEMPLATES.get("research_summarize_publish")
            if not workflow:
                return None

            agents = await list_agents(db, active_only=True)
            runtimes = {}
            for agent in agents:
                runtime = AgentRuntime(agent=agent, message_bus=self.message_bus)
                runtimes[agent.id] = runtime
                runtimes[agent.name.lower()] = runtime
                runtimes[agent.role.lower()] = runtime

            engine = WorkflowEngine(
                workflow_config=workflow,
                message_bus=self.message_bus,
                agent_runtimes=runtimes,
            )
            result = await engine.run(
                input_text=user_msg,
                session_id=session_id,
                context={
                    "channel": "telegram",
                    "chat_id": chat_id,
                    "force_research": True,
                    "suppress_channel_reply": True,
                },
            )
            if result.error:
                logger.warning("Research workflow failed: %s", result.error)
                return (
                    "I could not complete the research workflow right now. "
                    "Please try again in a moment."
                )
            clean = clean_response(result.output)
            return clean or (
                "I could not prepare a clear answer from the research workflow. "
                "Please try again in a moment."
            )
        except Exception as e:
            logger.exception("Research workflow error: %s", e)
            return (
                "I ran into a temporary issue while researching that. "
                "Please try again in a moment."
            )

    async def _on_bus_message(self, msg: AgentMessage):
        if (
            msg.msg_type == "channel_reply"
            and msg.metadata.get("channel") == "telegram"
        ):
            chat_id = msg.metadata.get("chat_id")
            if chat_id:
                await self.send_message(chat_id, msg.content)

    @staticmethod
    def _split_message(text: str, max_len: int) -> list[str]:
        if len(text) <= max_len:
            return [text]
        chunks = []
        while text:
            chunks.append(text[:max_len])
            text = text[max_len:]
        return chunks
