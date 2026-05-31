# AGENTORCH — AI Agent Orchestration Platform

> Build, configure, and orchestrate multi-agent AI workflows with a live web UI, async messaging, and real external channel integration.

## Demo Video

https://drive.google.com/file/d/1ZwJHIZwjUb94rIz8VyuZBnA9b9Jv7naY/view?usp=drive_link
[Architecture](docs/architecture.md)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        AgentOrch Platform                       │
│                                                                 │
│  ┌──────────┐    ┌──────────────┐    ┌──────────────────────┐   │
│  │  Next.js │    │  FastAPI     │    │   Agent Runtime      │   │
│  │  Web UI  │◄──►│  REST + WS   │◄──►│   (LangGraph)        │   │
│  └──────────┘    └──────┬───────┘    └──────────┬───────────┘   │
│                         │                       │               │
│                  ┌──────▼──────┐       ┌────────▼──────────┐    │
│                  │  SQLite /   │       │  Tool Executors   │    │
│                  │  Postgres   │       │  web_search       │    │
│                  └─────────────┘       │  code_executor    │    │
│                                        │  file_reader      │    │
│  ┌─────────────────────────────┐       └───────────────────┘    │
│  │  Messaging Channels         │                                │
│  │  ┌──────────┐ ┌──────────┐  │    ┌───────────────────────┐   │
│  │  │ Telegram │ │  Slack   │  │    │  Vector Memory        │   │
│  │  │  (Bot)   │ │  (OAuth) │  │    │  ChromaDB (local)     │   │
│  │  └──────────┘ └──────────┘  │    └───────────────────────┘   │
│  └─────────────────────────────┘                                │
│                                                                 │
│  ┌────────────────────────────────────────────────────────┐     │
│  │  Redis Queue (async agent-to-agent messaging)          │     │
│  └────────────────────────────────────────────────────────┘     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technology Decisions

### AI Runtime: LangGraph
**Why LangGraph?**
- **Graph-based orchestration** — workflows are naturally modeled as directed graphs with nodes (agents) and edges (message flows + conditions). LangGraph provides this natively with StateGraph.
- **Async-first** — full async/await support means agent nodes don't block each other; critical for real-time Telegram interactions.
- **Built-in persistence** — `SqliteSaver` and `PostgresSaver` checkpointers give us conversation memory and workflow state replay out of the box.
- **Streaming** — `astream_events` lets us push real-time token updates to the frontend WebSocket.
- **Conditional edges** — `add_conditional_edges` maps directly to the "conditions and feedback loops" requirement without custom routing logic.

### Backend: Python + FastAPI
- **FastAPI** — async by default, WebSocket support, OpenAPI docs auto-generated, Pydantic validation.
- **SQLAlchemy + SQLite** (default) / **PostgreSQL** (production) — clean ORM, migrations via Alembic.
- **Redis** (optional, defaults to in-memory queue) — durable async message queue for agent-to-agent communication.

### Frontend: Next.js 14 + TypeScript
- **Next.js App Router** — server components for initial data, client components for live updates.
- **Zustand** — lightweight state management for agent/workflow state.
- **WebSocket** — real-time log streaming and inter-agent message display.
- **ReactFlow** — visual workflow builder with drag-and-drop nodes.

### Messaging: python-telegram-bot
- Webhook mode for production, polling for local dev.
- Async handlers map directly to LangGraph agent invocations.

---

## Quick Start (single command)

```bash
git clone https://github.com/Ashutosh-code-arch/agentOrch
cd agentOrch
cp .env.example .env            # fill in GROQ_API_KEY and TELEGRAM_BOT_TOKEN
make setup   # installs all deps, seeds DB, starts all services
make dev # start app
```

Or manually:

```bash
# 1. Backend
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env          # fill in GROQ_API_KEY and TELEGRAM_BOT_TOKEN
alembic upgrade head           # init DB
uvicorn main:app --reload --port 8000

# 2. Frontend (new terminal)
cd frontend
npm install
npm run dev                    # http://localhost:3000
```

---

## Project Structure

```
agentOrch/
├── backend/
│   ├── main.py                    # FastAPI app entry
│   ├── agents/
│   │   ├── agent_model.py         # Agent DB model + CRUD
│   │   ├── agent_runtime.py       # LangGraph agent execution
│   │   ├── delegation.py          # Agent delegation helpers
│   │   └── tool_registry.py       # Available tools registry
│   ├── workflows/
│   │   ├── workflow_engine.py     # LangGraph StateGraph builder
│   │   └── __init__.py
│   ├── channels/
│   │   ├── telegram_handler.py    # Telegram bot + webhook
│   │   ├── telegram_setup.py      # webhook URL with Telegram
│   │   └── slack_handler.py       # Slack events API
│   ├── memory/
│   │   └── vector_memory.py       # ChromaDB agent memory
│   ├── api/
│   │   ├── agents_router.py       # CRUD endpoints
│   │   ├── workflows_router.py    # Workflow endpoints
│   │   ├── messages_router.py     # Message history
│   │   └── ws_router.py           # WebSocket log stream
│   ├── runtime/
│   │   └── message_bus.py         # Async agent message queue
│   └── tests/
│   │   └── test_suite.py
│   ├── database.py  
├── frontend/
│   ├── src/
│   │   ├── app/                   # Next.js app router pages
│   │   ├── components/
│   │   │   ├── AgentCard.tsx
│   │   │   ├── AgentModal.tsx
│   │   │   ├── AgentRunModal.tsx
│   │   │   ├── NodeInspector.tsx
│   │   │   ├── Shell.tsx
│   │   │   ├── StatsRow.tsx
│   │   │   ├── WorkflowCanvas.tsx
│   │   │   └── LiveLogs.tsx
│   │   ├── stores/
│   │   │   └── orchestrator.ts    # Zustand store
│   │   └── hooks/
│   │   │   └── useWebSocket.ts
│   │   ├── lib/
│   │   │   ├── WorkflowData.ts
│   │   │   └── api.ts
│   └── package.json
├── docs/
│   └── architecture.md
├── Makefile
├── docker-compose.yml
└── README.md
```

---

## Agent Configuration Dimensions

Each agent is configurable across **11 dimensions**:

| Dimension | Options |
|-----------|---------|
| Name & Role | Free text |
| System Prompt | Full prompt engineering |
| Model | llama, gpt-4o, local Ollama, claude-sonnet-4 |
| Tools | web_search, code_executor, file_reader, send_message, calendar, database_query |
| Channel | Telegram, Slack, WhatsApp, API-only |
| Memory | Conversation window, Vector RAG, Sliding+summary, None |
| Schedule | Always-on, cron expression, event-triggered |
| Max tokens / budget | Per-call and daily limits |
| Guardrails | Content filter, rate limit, human-in-the-loop |
| Interaction rules | Who this agent can message, routing priority |
| Skills | Custom tool plugins (importable Python modules) |

---

## Adding a New Workflow Template

1. Open `backend/workflows/workflow_engine.py`.
2. Add a new entry to the `WORKFLOW_TEMPLATES` dict. Use role-based labels/config instead of hard-coded demo agent names, so the UI can bind the template to real active agents:

```python
"my_template": {
    "name": "My Template",
    "description": "What it does",
    "nodes": [
        {"id": "trigger", "type": "trigger", "label": "Telegram Message", "config": {"channel": "telegram"}},
        {"id": "agent1", "type": "agent", "label": "Research Agent", "config": {"role": "research", "tools": ["web_search"]}},
        {"id": "action", "type": "action", "label": "Send to Telegram", "config": {"action": "send_message", "channel": "telegram"}},
    ],
    "edges": [["trigger", "agent1"], ["agent1", "action"]],
}
```

3. Add the matching front-end visual template in `frontend/src/lib/workflowData.ts` with the same `id`, node ids, and edges.
4. Restart the backend/frontend. The template appears in the Workflow Builder tabs and can be run through `POST /api/workflows/{template_id}/run`.

---

## Adding a New Messaging Channel

1. Create `backend/channels/your_channel.py` with the same shape as `telegram_handler.py` or `slack_handler.py`:

```python
class YourChannelHandler:
    async def start(self): ...           # setup webhook, polling, or socket mode
    async def send_message(self, to, text): ...
    async def _on_message(self, event): ...  # publish inbound AgentMessage
    async def _on_bus_message(self, msg): ...  # deliver outbound channel_reply
```

2. Register in `backend/channels/__init__.py`
3. Start it from `backend/main.py` when the required environment variables are present.
4. Add the channel option to `frontend/src/components/AgentModal.tsx`.
5. Add setup/status UI in `frontend/src/app/channels/page.tsx`.
6. Publish inbound messages with `metadata={"channel": "<name>"}` and subscribe to `<name>_channel` for outbound replies.

---

## End-to-End Demo Flow

1. User opens Telegram, messages `@ariabot`: *"Research the latest LLM benchmarks"*
2. Telegram webhook fires → `TelegramHandler.on_message()` → placed on message bus
3. **Aria** (Support Agent) receives message → runs LangGraph node → classifies as `research_intent`
4. Aria publishes to message bus: `{type: "delegate", to: "max", task: "LLM benchmarks"}`
5. **Max** (Research Agent) receives → `web_search` tool executes → results returned
6. Max publishes: `{type: "result", to: "aria", content: "..."}`
7. Aria formats and calls `send_message` tool → delivered to Telegram user
8. All messages stored in SQLite, visible in UI live log and conversation history

---

## Tests

```bash
cd backend
pytest tests/ -v
```

---

## Environment Variables

```env
# Required
GROQ_API_KEY=sk-ant-...
TELEGRAM_BOT_TOKEN=7412...:AAF4...

# Optional
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
SLACK_BOT_TOKEN=xoxb-...
SLACK_APP_TOKEN=xapp-...
WEBHOOK_URL=https://your-domain.com   # for Telegram webhook mode
DATABASE_URL=sqlite:///agentOrch.db      # or postgresql://...
REDIS_URL=redis://localhost:6379      # leave unset for in-memory queue
CHROMA_HOST=localhost                 # for vector memory
```
