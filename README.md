# AGENTORCH — AI Agent Orchestration Platform

> Build, configure, and orchestrate multi-agent AI workflows with a live web UI, async messaging, and real external channel integration.

![Demo](docs/demo.gif)

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
git clone https://github.com/Ashutosh-core-arch/agentOrch
cd agentOrch
make setup   # installs all deps, seeds DB, starts all services
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

# 3. Telegram webhook (new terminal, requires ngrok)
ngrok http 8000
# then set: WEBHOOK_URL=https://your-ngrok.ngrok-free.app in .env
python -m backend.channels.telegram_setup
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
│   │   └── tool_registry.py       # Available tools registry
│   ├── workflows/
│   │   ├── workflow_model.py      # Workflow DB model
│   │   ├── workflow_engine.py     # LangGraph StateGraph builder
│   │   └── templates.py           # Pre-built workflow templates
│   ├── channels/
│   │   ├── telegram_handler.py    # Telegram bot + webhook
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
│       ├── test_agent_crud.py
│       ├── test_workflow_execution.py
│       └── test_message_delivery.py
├── frontend/
│   ├── src/
│   │   ├── app/                   # Next.js app router pages
│   │   ├── components/
│   │   │   ├── AgentCard.tsx
│   │   │   ├── WorkflowBuilder.tsx
│   │   │   └── LiveLogStream.tsx
│   │   ├── stores/
│   │   │   └── orchestrator.ts    # Zustand store
│   │   └── hooks/
│   │       └── useWebSocket.ts
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

1. Open `backend/workflows/templates.py`
2. Add to `WORKFLOW_TEMPLATES` dict:

```python
"my_template": WorkflowTemplate(
    name="My Template",
    description="What it does",
    nodes=[
        NodeConfig(id="trigger", type="trigger", config={"channel": "telegram"}),
        NodeConfig(id="agent1", type="agent", config={"agent_id": "...", "tools": ["web_search"]}),
        NodeConfig(id="action", type="action", config={"action": "send_message"}),
    ],
    edges=[("trigger","agent1"), ("agent1","action")],
)
```

3. The template appears in the UI automatically on next restart.

---

## Adding a New Messaging Channel

1. Create `backend/channels/your_channel.py` implementing `BaseChannelHandler`:

```python
class YourChannelHandler(BaseChannelHandler):
    async def start(self): ...           # setup webhook/polling
    async def send_message(self, to, text): ...
    async def on_message(self, msg): ...  # called by the runtime
```

2. Register in `backend/channels/__init__.py`
3. Add the channel option to the Agent model's `channel` enum
4. Add the UI card in `frontend/src/pages/channels.tsx`

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

# Key test paths:
# tests/test_agent_crud.py         - agent CRUD operations
# tests/test_workflow_execution.py - full workflow graph run
# tests/test_message_delivery.py  - agent-to-agent routing
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
