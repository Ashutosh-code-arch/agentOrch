"""
Messaging channel handlers.
Each handler connects an agent to an external messaging platform.
"""
from backend.channels.telegram_handler import TelegramHandler
from backend.channels.slack_handler import SlackHandler

__all__ = ["TelegramHandler", "SlackHandler"]
