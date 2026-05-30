"""
Tests for critical platform paths:
  - Agent CRUD
  - Workflow execution
  - Message delivery
"""
import asyncio
import pytest
import pytest_asyncio
from unittest.mock import AsyncMock, MagicMock, patch
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker

from backend.database import Base
from backend.agents.agent_model import (
    AgentCreate, AgentUpdate,
    create_agent, get_agent, list_agents, update_agent, delete_agent,
)
from backend.runtime.message_bus import MessageBus, AgentMessage
from backend.workflows.workflow_engine import WorkflowEngine, WORKFLOW_TEMPLATES
from backend.agents.delegation import find_research_agent, is_research_request
from backend.agents.agent_runtime import extract_xml_tool_calls


# ─── Fixtures ──────────────────────────────────────────────────────────────────

@pytest_asyncio.fixture
async def db():
    """In-memory SQLite DB for tests."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session
    await engine.dispose()


@pytest_asyncio.fixture
async def bus():
    b = MessageBus()
    await b.start()
    yield b
    await b.stop()


@pytest_asyncio.fixture
async def sample_agent(db):
    data = AgentCreate(
        name="TestAgent",
        role="Test Role",
        system_prompt="You are a test agent.",
        model="claude-haiku-4-5-20251001",
        tools=["web_search"],
        guardrails=["rate_limit"],
    )
    return await create_agent(db, data)


# ─── Agent CRUD tests ──────────────────────────────────────────────────────────

class TestAgentCRUD:

    @pytest.mark.asyncio
    async def test_create_agent(self, db):
        data = AgentCreate(
            name="Aria",
            role="Support",
            system_prompt="You help users.",
            model="claude-sonnet-4-20250514",
            tools=["send_message"],
        )
        agent = await create_agent(db, data)
        assert agent.id is not None
        assert agent.name == "Aria"
        assert agent.role == "Support"
        assert "send_message" in agent.tools
        assert agent.is_active is True

    @pytest.mark.asyncio
    async def test_get_agent(self, db, sample_agent):
        fetched = await get_agent(db, sample_agent.id)
        assert fetched is not None
        assert fetched.id == sample_agent.id
        assert fetched.name == "TestAgent"

    @pytest.mark.asyncio
    async def test_get_nonexistent_agent_returns_none(self, db):
        result = await get_agent(db, "nonexistent-id")
        assert result is None

    @pytest.mark.asyncio
    async def test_list_agents(self, db, sample_agent):
        agents = await list_agents(db)
        assert len(agents) >= 1
        assert any(a.id == sample_agent.id for a in agents)

    @pytest.mark.asyncio
    async def test_list_active_agents_only(self, db, sample_agent):
        # Deactivate the agent
        await update_agent(db, sample_agent.id, AgentUpdate(is_active=False))
        active_agents = await list_agents(db, active_only=True)
        assert all(a.is_active for a in active_agents)
        assert not any(a.id == sample_agent.id for a in active_agents)

    @pytest.mark.asyncio
    async def test_update_agent(self, db, sample_agent):
        updated = await update_agent(db, sample_agent.id, AgentUpdate(name="UpdatedName"))
        assert updated.name == "UpdatedName"
        assert updated.role == sample_agent.role  # unchanged

    @pytest.mark.asyncio
    async def test_update_nonexistent_returns_none(self, db):
        result = await update_agent(db, "bad-id", AgentUpdate(name="X"))
        assert result is None

    @pytest.mark.asyncio
    async def test_delete_agent(self, db, sample_agent):
        success = await delete_agent(db, sample_agent.id)
        assert success is True
        fetched = await get_agent(db, sample_agent.id)
        assert fetched is None

    @pytest.mark.asyncio
    async def test_delete_nonexistent_returns_false(self, db):
        result = await delete_agent(db, "bad-id")
        assert result is False

    @pytest.mark.asyncio
    async def test_agent_tools_persisted(self, db):
        data = AgentCreate(
            name="ToolAgent",
            role="Multi-tool",
            system_prompt="Use tools.",
            tools=["web_search", "code_executor", "file_reader"],
        )
        agent = await create_agent(db, data)
        fetched = await get_agent(db, agent.id)
        assert set(fetched.tools) == {"web_search", "code_executor", "file_reader"}

    @pytest.mark.asyncio
    async def test_agent_guardrails_defaults(self, db, sample_agent):
        assert "rate_limit" in sample_agent.guardrails

    @pytest.mark.asyncio
    async def test_agent_memory_defaults(self, db, sample_agent):
        assert sample_agent.memory_type == "window"
        assert sample_agent.memory_window == 20


# ─── Message bus / delivery tests ─────────────────────────────────────────────

class TestMessageDelivery:

    @pytest.mark.asyncio
    async def test_publish_and_receive(self, bus):
        received = []

        async def handler(msg: AgentMessage):
            received.append(msg)

        bus.subscribe("agent_b", handler)

        await bus.publish(AgentMessage(
            from_agent="agent_a",
            to_agent="agent_b",
            content="Hello from A",
            session_id="sess1",
        ))

        await asyncio.sleep(0.1)
        assert len(received) == 1
        assert received[0].content == "Hello from A"
        assert received[0].from_agent == "agent_a"

    @pytest.mark.asyncio
    async def test_broadcast_message(self, bus):
        received_b = []
        received_c = []

        async def handler_b(msg):
            received_b.append(msg)

        async def handler_c(msg):
            received_c.append(msg)

        bus.subscribe("agent_b", handler_b)
        bus.subscribe("agent_c", handler_c)

        await bus.publish(AgentMessage(
            from_agent="agent_a",
            to_agent="*",
            content="Broadcast!",
            session_id="sess2",
        ))

        await asyncio.sleep(0.1)
        assert len(received_b) == 1
        assert len(received_c) == 1

    @pytest.mark.asyncio
    async def test_message_not_delivered_to_wrong_agent(self, bus):
        received = []

        async def handler(msg):
            received.append(msg)

        bus.subscribe("agent_x", handler)

        await bus.publish(AgentMessage(
            from_agent="agent_a",
            to_agent="agent_y",   # different target
            content="For Y only",
            session_id="sess3",
        ))

        await asyncio.sleep(0.1)
        assert len(received) == 0

    @pytest.mark.asyncio
    async def test_ws_broadcast_handler(self, bus):
        ws_received = []

        async def ws_handler(msg):
            ws_received.append(msg)

        bus.subscribe_broadcast(ws_handler)

        await bus.publish(AgentMessage(
            from_agent="any",
            to_agent="any",
            content="WS test",
            session_id="sess4",
        ))

        await asyncio.sleep(0.1)
        assert len(ws_received) == 1

    @pytest.mark.asyncio
    async def test_message_history(self, bus):
        for i in range(5):
            await bus.publish(AgentMessage(
                from_agent="a", to_agent="b",
                content=f"msg {i}", session_id="hist",
            ))
        await asyncio.sleep(0.05)
        history = bus.get_history(limit=10)
        assert len(history) == 5

    @pytest.mark.asyncio
    async def test_multiple_handlers_per_agent(self, bus):
        calls = []

        async def h1(msg): calls.append("h1")
        async def h2(msg): calls.append("h2")

        bus.subscribe("multi_agent", h1)
        bus.subscribe("multi_agent", h2)

        await bus.publish(AgentMessage(
            from_agent="src", to_agent="multi_agent",
            content="test", session_id="m",
        ))
        await asyncio.sleep(0.1)
        assert "h1" in calls
        assert "h2" in calls


# ─── Agent delegation tests ───────────────────────────────────────────────────

class TestAgentDelegation:

    def test_research_intent_detection(self):
        assert is_research_request(
            "Can you research what Groq's LPU chip is and compare it to GPU inference?"
        )
        assert not is_research_request("Please update my billing address")

    @pytest.mark.asyncio
    async def test_find_research_agent_prefers_active_research_agent(self, db):
        support = await create_agent(
            db,
            AgentCreate(
                name="Aria",
                role="Support Agent",
                system_prompt="Help users and route specialist work.",
                tools=[],
                channel="telegram",
            ),
        )
        research = await create_agent(
            db,
            AgentCreate(
                name="Max",
                role="Research Agent",
                system_prompt="Research topics in detail.",
                tools=["web_search"],
            ),
        )

        found = await find_research_agent(db, exclude_agent_id=support.id)
        assert found is not None
        assert found.id == research.id

    def test_extract_xml_tool_call(self):
        calls = extract_xml_tool_calls(
            '<web_search>{"query": "Groq LPU chip vs GPU inference", "max_results": 10}</web_search>'
        )
        assert calls == [
            {
                "name": "web_search",
                "args": {
                    "query": "Groq LPU chip vs GPU inference",
                    "max_results": 10,
                },
                "id": "xml_web_search",
            }
        ]


# ─── Workflow execution tests ──────────────────────────────────────────────────

class TestWorkflowExecution:

    @pytest.mark.asyncio
    async def test_workflow_templates_available(self):
        assert "research_summarize_publish" in WORKFLOW_TEMPLATES
        assert "support_triage" in WORKFLOW_TEMPLATES

    @pytest.mark.asyncio
    async def test_workflow_template_has_required_keys(self):
        for name, template in WORKFLOW_TEMPLATES.items():
            assert "nodes" in template, f"{name} missing nodes"
            assert "edges" in template, f"{name} missing edges"
            assert "name" in template, f"{name} missing name"
            assert len(template["nodes"]) >= 2, f"{name} needs at least 2 nodes"

    @pytest.mark.asyncio
    async def test_workflow_builds_without_error(self, bus):
        """Workflow graph should compile even with no real agent runtimes."""
        engine = WorkflowEngine(
            workflow_config=WORKFLOW_TEMPLATES["support_triage"],
            message_bus=bus,
            agent_runtimes={},  # no real agents; nodes will pass through
        )
        await engine.build()
        assert engine._graph is not None

    @pytest.mark.asyncio
    async def test_workflow_run_returns_state(self, bus):
        engine = WorkflowEngine(
            workflow_config=WORKFLOW_TEMPLATES["support_triage"],
            message_bus=bus,
            agent_runtimes={},
        )
        await engine.build()
        result = await engine.run(
            input_text="Test input message",
            session_id="test_session",
        )
        assert result is not None
        assert result.session_id == "test_session"

    @pytest.mark.asyncio
    async def test_workflow_passes_context(self, bus):
        engine = WorkflowEngine(
            workflow_config=WORKFLOW_TEMPLATES["research_summarize_publish"],
            message_bus=bus,
            agent_runtimes={},
        )
        await engine.build()
        result = await engine.run(
            input_text="research topic",
            session_id="ctx_test",
            context={"chat_id": 12345, "channel": "telegram"},
        )
        assert result.context.get("chat_id") == 12345

    @pytest.mark.asyncio
    async def test_agent_node_handles_missing_runtime(self, bus):
        """Agent node with no matching runtime should set error, not crash."""
        config = {
            "nodes": [
                {"id": "trigger", "type": "trigger", "label": "T", "config": {}},
                {"id": "agent1", "type": "agent", "label": "A", "config": {"agent_id": "missing_id"}},
            ],
            "edges": [["trigger", "agent1"]],
        }
        engine = WorkflowEngine(config, bus, {})
        await engine.build()
        result = await engine.run("hello", "err_sess")
        assert result.error == "Agent missing_id not found"
