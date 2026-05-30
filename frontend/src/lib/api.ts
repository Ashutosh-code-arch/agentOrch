import useSWR from "swr";

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
    is_active: boolean;
    total_tasks: number;
    total_tokens: number;
    created_at: string;
}

export interface Message {
    id: string;
    session_id: string;
    from_agent: string;
    to_agent: string;
    content: string;
    msg_type: string;
    tokens: number;
    created_at: string;
}

const BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

// ── Core fetch wrapper ────────────────────────────────────────────────────────
async function request(method: string, path: string, body?: unknown) {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers: body ? { "Content-Type": "application/json" } : {},
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status}: ${text}`);
    }
    return res.status === 204 ? null : res.json();
}

export const api = {
    get: (path: string) => request("GET", path),
    post: (path: string, body: unknown) => request("POST", path, body),
    patch: (path: string, body: unknown) => request("PATCH", path, body),
    delete: (path: string) => request("DELETE", path),
};

// ── SWR fetcher ───────────────────────────────────────────────────────────────
const fetcher = (url: string) =>
    fetch(url).then((r) => {
        if (!r.ok) throw new Error(r.statusText);
        return r.json();
    });

// ── Hooks ─────────────────────────────────────────────────────────────────────
export function useAgents() {
    const { data, error, mutate, isLoading } = useSWR<Agent[]>(
        `${BASE}/api/agents/`,
        fetcher,
        { refreshInterval: 5000 },
    );
    return { agents: data ?? [], error, mutate, isLoading };
}

export function useAgent(id: string | null) {
    const { data, error, mutate } = useSWR<Agent>(
        id ? `${BASE}/api/agents/${id}` : null,
        fetcher,
    );
    return { agent: data, error, mutate };
}

export function useMessages(sessionId: string | null) {
    const { data, error, mutate } = useSWR<Message[]>(
        sessionId
            ? `${BASE}/api/messages/?session_id=${sessionId}&limit=100`
            : null,
        fetcher,
        { refreshInterval: 2000 },
    );
    return { messages: data ?? [], error, mutate };
}

export function useSessions() {
    const { data, error, mutate } = useSWR<string[]>(
        `${BASE}/api/messages/sessions`,
        fetcher,
        { refreshInterval: 5000 },
    );
    return { sessions: data ?? [], error, mutate };
}

export function useWorkflowTemplates() {
    const { data, error } = useSWR(`${BASE}/api/workflows/templates`, fetcher);
    return { templates: data ?? [], error };
}

// ── Agent actions ─────────────────────────────────────────────────────────────
export async function runAgent(
    agentId: string,
    message: string,
    sessionId: string,
) {
    return api.post(`/api/agents/${agentId}/run`, {
        message,
        session_id: sessionId,
    });
}

export async function createAgent(data: Partial<Agent>) {
    return api.post("/api/agents/", data);
}

export async function updateAgent(id: string, data: Partial<Agent>) {
    return api.patch(`/api/agents/${id}`, data);
}

export async function deleteAgent(id: string) {
    return api.delete(`/api/agents/${id}`);
}

export async function runWorkflow(
    workflowId: string,
    input: string,
    sessionId: string,
) {
    return api.post(`/api/workflows/${workflowId}/run`, {
        input,
        session_id: sessionId,
    });
}

export async function deployWorkflow(workflowId: string) {
    return api.post(`/api/workflows/${workflowId}/deploy`, {});
}
