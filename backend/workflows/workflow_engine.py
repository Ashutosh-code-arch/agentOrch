"""
Workflow Engine — builds LangGraph StateGraphs from visual workflow configs.
Supports: sequential chains, conditional branching, feedback loops, parallel fans.
"""
import logging
from typing import Callable
from dataclasses import dataclass, field

from langgraph.graph import StateGraph, END

from backend.runtime.message_bus import MessageBus, AgentMessage

logger = logging.getLogger(__name__)


@dataclass
class WorkflowState:
    """Shared state passed through the entire workflow graph."""
    input: str = ""
    session_id: str = ""
    context: dict = field(default_factory=dict)
    intermediate_results: dict = field(default_factory=dict)
    output: str = ""
    current_node: str = ""
    error: str | None = None
    iteration: int = 0


@dataclass
class NodeConfig:
    id: str
    type: str              # "trigger" | "agent" | "condition" | "action"
    config: dict = field(default_factory=dict)
    label: str = ""


@dataclass
class WorkflowTemplate:
    name: str
    description: str
    nodes: list[NodeConfig]
    edges: list[tuple[str, str]]
    conditional_edges: dict = field(default_factory=dict)  # node_id → {condition_fn, routes}


class WorkflowEngine:
    """
    Builds and executes a LangGraph StateGraph from a workflow definition.
    """

    def __init__(self, workflow_config: dict, message_bus: MessageBus, agent_runtimes: dict):
        """
        workflow_config: dict with 'nodes' and 'edges' (from DB or template)
        agent_runtimes: dict[agent_id → AgentRuntime]
        """
        self.config = workflow_config
        self.message_bus = message_bus
        self.agent_runtimes = agent_runtimes
        self._graph = None

    def _resolve_runtime(self, node: dict):
        node_cfg = node.get("config", {})
        candidates = [
            node_cfg.get("agent_id", ""),
            node.get("label", ""),
            node_cfg.get("role", ""),
        ]
        for candidate in candidates:
            key = str(candidate).strip().lower()
            if key and key in self.agent_runtimes:
                return self.agent_runtimes[key]

        role_hint = str(node_cfg.get("role") or node.get("label") or "").lower()
        if role_hint:
            for key, runtime in self.agent_runtimes.items():
                agent = getattr(runtime, "agent", None)
                haystack = f"{getattr(agent, 'name', '')} {getattr(agent, 'role', '')}".lower()
                if role_hint in haystack or any(part and part in haystack for part in role_hint.split()):
                    return runtime
        return None

    async def build(self):
        """Compile the StateGraph from workflow config."""
        graph = StateGraph(WorkflowState)
        nodes = self.config.get("nodes", [])
        edges = self.config.get("edges", [])

        # Add nodes
        for node in nodes:
            node_fn = self._build_node_fn(node)
            graph.add_node(node["id"], node_fn)

        # Set entry point (first trigger node)
        triggers = [n for n in nodes if n["type"] == "trigger"]
        if triggers:
            graph.set_entry_point(triggers[0]["id"])

        # Add edges
        node_ids = {n["id"] for n in nodes}
        nodes_by_id = {n["id"]: n for n in nodes}
        edges_by_source: dict[str, list[str]] = {}
        for from_id, to_id in edges:
            edges_by_source.setdefault(from_id, []).append(to_id)

        for from_id, to_id in edges:
            from_node = nodes_by_id.get(from_id, {})
            if from_node.get("type") == "condition" and len(edges_by_source[from_id]) > 1:
                continue
            graph.add_edge(from_id, to_id)

        for from_id, targets in edges_by_source.items():
            from_node = nodes_by_id.get(from_id, {})
            if from_node.get("type") != "condition" or len(targets) <= 1:
                continue

            def route_condition(state: WorkflowState, node_id=from_id, route_targets=targets):
                passed = bool(state.context.get(f"cond_{node_id}"))
                true_target = next(
                    (
                        target
                        for target in route_targets
                        if nodes_by_id.get(target, {}).get("type") != "action"
                    ),
                    route_targets[0],
                )
                false_target = next(
                    (
                        target
                        for target in route_targets
                        if nodes_by_id.get(target, {}).get("type") == "action"
                    ),
                    route_targets[-1],
                )
                return true_target if passed else false_target

            graph.add_conditional_edges(
                from_id,
                route_condition,
                {target: target for target in targets},
            )

        # Find terminal nodes (no outgoing edges) → connect to END
        sources = set(edges_by_source)
        terminal = (node_ids - sources) | {n["id"] for n in nodes if n["type"] == "action"}
        for t_id in terminal:
            if t_id in sources:
                continue
            try:
                graph.add_edge(t_id, END)
            except Exception:
                pass

        self._graph = graph.compile()
        logger.info("Workflow graph compiled: %d nodes, %d edges", len(nodes), len(edges))

    def _build_node_fn(self, node: dict) -> Callable:
        """Return an async function for a given node type."""
        node_type = node["type"]
        node_cfg = node.get("config", {})

        if node_type == "trigger":
            async def trigger_node(state: WorkflowState) -> WorkflowState:
                state.current_node = node["id"]
                logger.info("Workflow triggered: %s", state.input[:80])
                return state
            return trigger_node

        elif node_type == "agent":
            agent_id = node_cfg.get("agent_id", "")

            async def agent_node(state: WorkflowState) -> WorkflowState:
                state.current_node = node["id"]
                runtime = self._resolve_runtime(node)
                if not runtime:
                    state.error = f"Agent {agent_id or node.get('label', node['id'])} not found"
                    return state
                try:
                    prev_result = state.output or state.input
                    result = await runtime.run(
                        user_message=prev_result,
                        session_id=state.session_id,
                        context=state.context,
                    )
                    state.intermediate_results[node["id"]] = result
                    state.output = result
                except Exception as e:
                    state.error = str(e)
                return state
            return agent_node

        elif node_type == "condition":
            condition_expr = node_cfg.get("expression", "True")

            async def condition_node(state: WorkflowState) -> WorkflowState:
                state.current_node = node["id"]
                try:
                    result = eval(condition_expr, {"state": state, "output": state.output})
                    state.context[f"cond_{node['id']}"] = bool(result)
                except Exception as e:
                    logger.warning("Condition eval error: %s", e)
                    state.context[f"cond_{node['id']}"] = False
                return state
            return condition_node

        elif node_type == "action":
            action_type = node_cfg.get("action", "send_message")

            async def action_node(state: WorkflowState) -> WorkflowState:
                state.current_node = node["id"]
                if action_type == "send_message":
                    channel = node_cfg.get("channel", "telegram")
                    chat_id = state.context.get("chat_id")
                    if channel == "telegram" and chat_id:
                        await self.message_bus.publish(AgentMessage(
                            from_agent="workflow",
                            to_agent="telegram_channel",
                            content=state.output,
                            session_id=state.session_id,
                            msg_type="channel_reply",
                            metadata={"channel": channel, "chat_id": chat_id},
                        ))
                    else:
                        await self.message_bus.publish(AgentMessage(
                            from_agent="workflow",
                            to_agent="monitor",
                            content=state.output,
                            session_id=state.session_id,
                            msg_type="response",
                            metadata={"channel": channel},
                        ))
                elif action_type == "log":
                    logger.info("Workflow action [log]: %s", state.output[:200])
                return state
            return action_node

        else:
            async def passthrough(state: WorkflowState) -> WorkflowState:
                return state
            return passthrough

    async def run(self, input_text: str, session_id: str, context: dict | None = None) -> WorkflowState:
        """Execute the workflow for a given input."""
        if not self._graph:
            await self.build()

        state = WorkflowState(
            input=input_text,
            session_id=session_id,
            context=context or {},
        )
        config = {"configurable": {"thread_id": session_id}}
        result = await self._graph.ainvoke(state, config)
        if isinstance(result, WorkflowState):
            return result
        return WorkflowState(**result)


# ─── Pre-built workflow templates ─────────────────────────────────────────────

WORKFLOW_TEMPLATES = {
    "research_summarize_publish": {
        "name": "Research → Summarize → Publish",
        "description": "ResearchAgent fetches data, SummaryAgent condenses it, PublishAgent delivers to Telegram.",
        "nodes": [
            {"id": "trigger", "type": "trigger", "label": "Telegram Message", "config": {"channel": "telegram"}},
            {"id": "aria", "type": "agent", "label": "Aria (Classify)", "config": {"agent_id": "aria", "role": "classify intent"}},
            {"id": "max", "type": "agent", "label": "Max (Research)", "config": {"agent_id": "max", "tools": ["web_search"]}},
            {"id": "zoe", "type": "agent", "label": "Zoe (Write)", "config": {"agent_id": "zoe"}},
            {"id": "publish", "type": "action", "label": "Send to Telegram", "config": {"action": "send_message", "channel": "telegram"}},
        ],
        "edges": [
            ["trigger", "aria"],
            ["aria", "max"],
            ["max", "zoe"],
            ["zoe", "publish"],
        ]
    },
    "support_triage": {
        "name": "Support Triage System",
        "description": "Aria receives messages, classifies and routes to specialist or escalation agent.",
        "nodes": [
            {"id": "trigger", "type": "trigger", "label": "Inbound Message", "config": {}},
            {"id": "aria", "type": "agent", "label": "Aria (Triage)", "config": {"agent_id": "aria"}},
            {"id": "check_urgency", "type": "condition", "label": "Urgent?", "config": {"expression": "'urgent' in state.output.lower() or 'emergency' in state.output.lower()"}},
            {"id": "kai", "type": "agent", "label": "Kai (Escalate)", "config": {"agent_id": "kai"}},
            {"id": "auto_reply", "type": "action", "label": "Auto-Reply", "config": {"action": "send_message"}},
        ],
        "edges": [
            ["trigger", "aria"],
            ["aria", "check_urgency"],
            ["check_urgency", "kai"],
            ["check_urgency", "auto_reply"],
            ["kai", "auto_reply"],
        ]
    },
}


def get_template(name: str) -> dict | None:
    return WORKFLOW_TEMPLATES.get(name)


def list_templates() -> list[dict]:
    return [
        {"id": k, "name": v["name"], "description": v["description"]}
        for k, v in WORKFLOW_TEMPLATES.items()
    ]
