"""
telegram_setup.py
-----------------
Run this once to register your webhook URL with Telegram.

Usage:
    # Polling mode (local dev) — no setup needed, just start the backend.

    # Webhook mode (production / ngrok):
    #   1. Start ngrok:  ngrok http 8000
    #   2. Copy the https URL into .env as WEBHOOK_URL=https://abc.ngrok-free.app
    #   3. Run:  python -m channels.telegram_setup

The script will:
  - Print current webhook info
  - Set the new webhook URL  (if WEBHOOK_URL is set)
  - Delete the webhook       (if --delete flag is passed)
"""

import asyncio
import os
import sys
import argparse

import httpx
from dotenv import load_dotenv

load_dotenv()

TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
WEBHOOK_URL = os.getenv("WEBHOOK_URL", "")
BASE = f"https://api.telegram.org/bot{TOKEN}"


async def get_webhook_info():
    async with httpx.AsyncClient() as client:
        resp = await client.get(f"{BASE}/getWebhookInfo")
        data = resp.json()
    if data.get("ok"):
        info = data["result"]
        print("Current webhook info:")
        print(f"  URL     : {info.get('url') or '(none)'}")
        print(f"  Pending : {info.get('pending_update_count', 0)}")
        print(f"  Error   : {info.get('last_error_message') or '(none)'}")
    else:
        print("Failed to get webhook info:", data)


async def set_webhook():
    if not WEBHOOK_URL:
        print("ERROR: WEBHOOK_URL is not set in .env")
        print("Set it to your public HTTPS URL, e.g.:")
        print("  WEBHOOK_URL=https://abc123.ngrok-free.app")
        sys.exit(1)

    full_url = f"{WEBHOOK_URL.rstrip('/')}/webhooks/telegram"
    print(f"Setting webhook to: {full_url}")

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{BASE}/setWebhook",
            json={
                "url": full_url,
                "allowed_updates": ["message", "callback_query", "inline_query"],
                "drop_pending_updates": True,
            },
        )
        data = resp.json()

    if data.get("ok"):
        print("✓ Webhook set successfully!")
    else:
        print("✗ Failed to set webhook:", data.get("description"))
        sys.exit(1)


async def delete_webhook():
    print("Deleting webhook (switching to polling mode)...")
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{BASE}/deleteWebhook", json={"drop_pending_updates": True}
        )
        data = resp.json()
    if data.get("ok"):
        print("✓ Webhook deleted. Bot will now use polling mode.")
    else:
        print("✗ Failed:", data.get("description"))


async def main():
    if not TOKEN:
        print("ERROR: TELEGRAM_BOT_TOKEN is not set in .env")
        sys.exit(1)

    parser = argparse.ArgumentParser(description="Telegram webhook setup for AgentOrch")
    parser.add_argument(
        "--delete", action="store_true", help="Remove webhook (switch to polling)"
    )
    parser.add_argument(
        "--info", action="store_true", help="Just print current webhook info"
    )
    args = parser.parse_args()

    await get_webhook_info()

    if args.delete:
        await delete_webhook()
    elif args.info:
        pass  # already printed above
    else:
        await set_webhook()
        print()
        await get_webhook_info()


if __name__ == "__main__":
    asyncio.run(main())
