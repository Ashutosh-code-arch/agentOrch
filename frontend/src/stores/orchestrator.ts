/**
 * Zustand store — global state for the Agent Orch platform UI.
 * Handles agents, workflows, live messages, and WebSocket connection.
 */
import { create } from "zustand";

export interface Agent {
    id: string;
    name: string;
    role: string;
    system_prompt: string;
    model: string;
    tools: string[];
    channel: string | null;
    memory_type: string;
    memory_window: number;
    schedule: string | null;
    guardrails: string[];
    max_tokens_per_call: number;
    max_tokens_per_day: number | null;
    interaction_rules: Record<string, unknown>;
    skills: string[];
    is_active: boolean;
    total_tasks: number;
    total_tokens: number;
    total_cost_usd: string;
    created_at: string;
}

export interface AgentMessage {
    id: string;
    from_agent: string;
    to_agent: string;
    content: string;
    session_id: string;
    msg_type: string;
    tokens: number;
    timestamp: string;
}

export interface WorkflowNode {
    id: string;
    type: "trigger" | "agent" | "condition" | "action";
    label: string;
    sub: string;
    x: number;
    y: number;
    config?: Record<string, unknown>;
}

export interface Workflow {
    id: string;
    name: string;
    nodes: WorkflowNode[];
    edges: [string, string][];
    is_active: boolean;
}

interface OrchestratorState {
    // Agents
    agents: Agent[];
    setAgents: (agents: Agent[]) => void;
    addAgent: (agent: Agent) => void;
    updateAgent: (id: string, patch: Partial<Agent>) => void;
    removeAgent: (id: string) => void;

    // Workflows
    workflows: Workflow[];
    activeWorkflowId: string | null;
    setWorkflows: (workflows: Workflow[]) => void;
    setActiveWorkflow: (id: string) => void;

    // Live messages
    liveMessages: AgentMessage[];
    addLiveMessage: (msg: AgentMessage) => void;
    clearMessages: () => void;

    // WebSocket
    wsConnected: boolean;
    setWsConnected: (v: boolean) => void;

    // UI
    selectedNodeId: string | null;
    setSelectedNode: (id: string | null) => void;
    activeView: string;
    setActiveView: (view: string) => void;
}

export const useOrchestratorStore = create<OrchestratorState>((set) => ({
    agents: [],
    setAgents: (agents) => set({ agents }),
    addAgent: (agent) => set((s) => ({ agents: [...s.agents, agent] })),
    updateAgent: (id, patch) =>
        set((s) => ({
            agents: s.agents.map((a) => (a.id === id ? { ...a, ...patch } : a)),
        })),
    removeAgent: (id) =>
        set((s) => ({ agents: s.agents.filter((a) => a.id !== id) })),

    workflows: [],
    activeWorkflowId: null,
    setWorkflows: (workflows) => set({ workflows }),
    setActiveWorkflow: (id) => set({ activeWorkflowId: id }),

    liveMessages: [],
    addLiveMessage: (msg) =>
        set((s) => ({
            liveMessages: s.liveMessages.some((m) => m.id === msg.id)
                ? s.liveMessages
                : [...s.liveMessages.slice(-499), msg],
        })),
    clearMessages: () => set({ liveMessages: [] }),

    wsConnected: false,
    setWsConnected: (wsConnected) => set({ wsConnected }),

    selectedNodeId: null,
    setSelectedNode: (selectedNodeId) => set({ selectedNodeId }),

    activeView: "dashboard",
    setActiveView: (activeView) => set({ activeView }),
}));
