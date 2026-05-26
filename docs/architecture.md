# AgentOrch Architecture

## Component Diagram

```
User (Telegram)
      │
      ▼ webhook/poll
┌─────────────────┐
│ TelegramHandler │  channels/telegram_handler.py
│  (python-tg-bot)│
└────────┬────────┘
         │ AgentMessage → message bus
         ▼
┌─────────────────────────────────────────────────────┐
│                   MessageBus                        │
│         runtime/message_bus.py                      │
│                                                     │
│  In-memory asyncio.Queue  OR  Redis Streams         │
│  Fan-out to subscribers by agent_id or "*"          │
│  Broadcasts all messages to WebSocket clients       │
└──────┬──────────────────────────────────┬───────────┘
       │                                  │
       ▼                                  ▼
┌──────────────┐                 ┌─────────────────┐
│ AgentRuntime │  (per agent)    │  WS Router      │
│              │                 │  api/ws_router  │
│  LangGraph   │                 │                 │
│  StateGraph  │                 │  → Browser UI   │
│              │                 └─────────────────┘
│  ┌─────────┐ │
│  │  LLM    │ │   Claude / GPT / Ollama
│  │  Node   │ │
│  └────┬────┘ │
│       │      │
│  ┌────▼────┐ │
│  │  Tools  │ │   web_search / code_executor / file_reader
│  └────┬────┘ │
│       │      │
│  ┌────▼────┐ │
│  │ Memory  │ │   ChromaDB (vector RAG) or sliding window
│  └─────────┘ │
└──────────────┘
       │
       ▼
┌──────────────┐
│  SQLite /    │  Database (agents, messages, workflow state)
│  PostgreSQL  │  + SQLite checkpointer for LangGraph state
└──────────────┘
```

## Data Flow: End-to-End Message

```
1.  Telegram user sends "Research latest AI news"
                │
2.  TelegramHandler.on_message() fires
                │
3.  AgentMessage published to MessageBus
    { from: "telegram:@user", to: "aria", content: "...", session: "tg_12345" }
                │
4.  MessageBus routes to Aria's AgentRuntime
                │
5.  LangGraph StateGraph enters agent_node:
      a. Build messages: [SystemMessage(aria_prompt), HumanMessage("Research...")]
      b. Call Groq API (streaming)
      c. Claude decides to delegate → publishes to bus:
         { from: "aria", to: "max", content: "research: AI news", type: "delegate" }
                │
6.  Max's AgentRuntime receives delegation:
      a. Runs web_search tool → fetches results
      b. Calls Groq to summarize
      c. Publishes result back: { from: "max", to: "aria", content: "summary...", type: "result" }
                │
7.  Aria receives Max's result → formats reply
                │
8.  Aria publishes: { to: "telegram_channel", type: "channel_reply", chat_id: 12345 }
                │
9.  TelegramHandler._on_bus_message() → bot.send_message(chat_id, reply)
                │
10. All messages in steps 3-9 also broadcast to WebSocket → visible in UI live log
                │
11. All messages persisted to SQLite messages table
```

## Agent State (LangGraph Checkpointing)

Each agent conversation is checkpointed per `thread_id` (= session_id).
This enables:
- Pause and resume mid-workflow
- Replay for debugging
- Multiple concurrent sessions per agent

Checkpoints stored in `orchid_checkpoints.db` (SQLite) by default.

## Async Agent-to-Agent Messaging

Agents never call each other directly — all communication goes through the MessageBus.
This provides:
- **Decoupling**: agents don't need to know about each other's runtime instances
- **Observability**: every message is logged and broadcast to WebSocket
- **Reliability**: Redis Streams (if configured) provide durable delivery + at-least-once semantics
- **Scalability**: agents can run in separate processes/containers and still communicate

## Adding a New Channel

Every channel implements `BaseChannelHandler`:
```python
class BaseChannelHandler:
    async def start(self): ...
    async def stop(self): ...
    async def send_message(self, to: str, text: str): ...
    async def on_message(self, msg: AgentMessage): ...  # receive from bus
```

The channel handler subscribes to the MessageBus for outbound messages and publishes inbound user messages.

## Workflow Graph Topology

Workflows are LangGraph `StateGraph` instances built dynamically from JSON configs.
Node types:
- **trigger**: entry point, no LLM call
- **agent**: invokes an AgentRuntime, passes output as next input
- **condition**: evaluates a Python expression on state, branches edges
- **action**: sends a message to a channel or external system

Feedback loops are supported by adding backward edges (LangGraph handles cycles via iteration counter).
