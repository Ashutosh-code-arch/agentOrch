"use client";
import { useState } from "react";
import { createAgent } from "@/lib/api";

const ALL_TOOLS = [
    "web_search",
    "code_executor",
    "file_reader",
    "send_message",
    "calendar",
    "database_query",
];
const ALL_GUARDRAILS = [
    "content_filter",
    "rate_limit",
    "max_token_budget",
    "human_in_the_loop",
];
const MODELS = [
    {
        value: "llama-3.3-70b-versatile",
        label: "llama-3.3-70b-versatile (Groq — best)",
    },
    {
        value: "llama-3.1-8b-instant",
        label: "llama-3.1-8b-instant (Groq — fast/cheap)",
    },
    {
        value: "mixtral-8x7b-32768",
        label: "mixtral-8x7b (Groq — large context)",
    },
    { value: "claude-sonnet-4-20250514", label: "claude-sonnet-4 (Anthropic)" },
    {
        value: "claude-haiku-4-5-20251001",
        label: "claude-haiku (Anthropic — fast)",
    },
    { value: "gpt-4o-mini", label: "gpt-4o-mini (OpenAI)" },
    { value: "gpt-4o", label: "gpt-4o (OpenAI)" },
    {
        value: "gemini-1.5-flash",
        label: "gemini-1.5-flash (Google — free tier)",
    },
    { value: "llama3.2", label: "llama3.2 (Ollama local)" },
];

const DEFAULT_FORM = {
    name: "",
    role: "",
    system_prompt: "",
    model: "llama-3.3-70b-versatile",
    channel: "",
    memory_type: "window",
    memory_window: 20,
    schedule: "always",
    tools: [] as string[],
    guardrails: ["content_filter", "rate_limit"],
};

export default function AgentModal({
    onClose,
    onCreated,
}: {
    onClose: () => void;
    onCreated: () => void;
}) {
    const [form, setForm] = useState(DEFAULT_FORM);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    function set(key: string, val: unknown) {
        setForm((f) => ({ ...f, [key]: val }));
    }

    function toggleList(key: "tools" | "guardrails", val: string) {
        set(
            key,
            (form[key] as string[]).includes(val)
                ? (form[key] as string[]).filter((x) => x !== val)
                : [...(form[key] as string[]), val],
        );
    }

    async function submit() {
        if (!form.name.trim()) {
            setError("Agent name is required.");
            return;
        }
        if (!form.role.trim()) {
            setError("Role is required.");
            return;
        }
        if (!form.system_prompt.trim()) {
            setError("System prompt is required.");
            return;
        }

        setLoading(true);
        setError("");
        try {
            await createAgent({
                ...form,
                channel: form.channel || null,
            });
            onCreated();
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Failed to create agent");
        } finally {
            setLoading(false);
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal"
                style={{ width: 540 }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-header">
                    <span className="modal-title">New Agent</span>
                    <button className="modal-close" onClick={onClose}>
                        ×
                    </button>
                </div>

                {error && (
                    <div
                        style={{
                            background: "rgba(239,68,68,0.1)",
                            border: "1px solid rgba(239,68,68,0.3)",
                            borderRadius: 7,
                            padding: "8px 12px",
                            fontSize: 12,
                            color: "#ef4444",
                            marginBottom: 12,
                        }}
                    >
                        {error}
                    </div>
                )}

                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 12,
                    }}
                >
                    <div className="form-group">
                        <div className="form-label">Name *</div>
                        <input
                            className="form-input"
                            placeholder="e.g. Aria"
                            value={form.name}
                            onChange={(e) => set("name", e.target.value)}
                        />
                    </div>
                    <div className="form-group">
                        <div className="form-label">Role *</div>
                        <input
                            className="form-input"
                            placeholder="e.g. Support Agent"
                            value={form.role}
                            onChange={(e) => set("role", e.target.value)}
                        />
                    </div>
                    <div className="form-group">
                        <div className="form-label">Model</div>
                        <select
                            className="form-select"
                            value={form.model}
                            onChange={(e) => set("model", e.target.value)}
                        >
                            {MODELS.map((m) => (
                                <option key={m.value} value={m.value}>
                                    {m.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <div className="form-group">
                        <div className="form-label">Channel</div>
                        <select
                            className="form-select"
                            value={form.channel}
                            onChange={(e) => set("channel", e.target.value)}
                        >
                            <option value="">None (API only)</option>
                            <option value="telegram">Telegram</option>
                            <option value="slack">Slack</option>
                            <option value="whatsapp">WhatsApp</option>
                        </select>
                    </div>
                    <div
                        className="form-group"
                        style={{ gridColumn: "1 / -1" }}
                    >
                        <div className="form-label">System Prompt *</div>
                        <textarea
                            className="form-textarea"
                            rows={4}
                            placeholder="You are a helpful assistant. Your goal is to..."
                            value={form.system_prompt}
                            onChange={(e) =>
                                set("system_prompt", e.target.value)
                            }
                        />
                    </div>
                    <div
                        className="form-group"
                        style={{ gridColumn: "1 / -1" }}
                    >
                        <div className="form-label">Tools</div>
                        <div
                            style={{
                                display: "flex",
                                gap: 10,
                                flexWrap: "wrap",
                                marginTop: 4,
                            }}
                        >
                            {ALL_TOOLS.map((t) => (
                                <label
                                    key={t}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 5,
                                        fontSize: 12,
                                        cursor: "pointer",
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={form.tools.includes(t)}
                                        onChange={() => toggleList("tools", t)}
                                    />
                                    {t}
                                </label>
                            ))}
                        </div>
                    </div>
                    <div className="form-group">
                        <div className="form-label">Memory</div>
                        <select
                            className="form-select"
                            value={form.memory_type}
                            onChange={(e) => set("memory_type", e.target.value)}
                        >
                            <option value="window">Conversation window</option>
                            <option value="vector">Vector memory (RAG)</option>
                            <option value="summary">Sliding + summary</option>
                            <option value="none">No memory</option>
                        </select>
                    </div>
                    <div className="form-group">
                        <div className="form-label">Schedule</div>
                        <select
                            className="form-select"
                            value={form.schedule}
                            onChange={(e) => set("schedule", e.target.value)}
                        >
                            <option value="always">Always on</option>
                            <option value="*/5 * * * *">Every 5 min</option>
                            <option value="0 * * * *">Hourly</option>
                            <option value="0 9 * * *">Daily 9am</option>
                        </select>
                    </div>
                    <div
                        className="form-group"
                        style={{ gridColumn: "1 / -1" }}
                    >
                        <div className="form-label">Guardrails</div>
                        <div
                            style={{
                                display: "flex",
                                gap: 10,
                                flexWrap: "wrap",
                                marginTop: 4,
                            }}
                        >
                            {ALL_GUARDRAILS.map((g) => (
                                <label
                                    key={g}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 5,
                                        fontSize: 12,
                                        cursor: "pointer",
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={form.guardrails.includes(g)}
                                        onChange={() =>
                                            toggleList("guardrails", g)
                                        }
                                    />
                                    {g.replace(/_/g, " ")}
                                </label>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="modal-footer">
                    <button className="btn-secondary" onClick={onClose}>
                        Cancel
                    </button>
                    <button
                        className="btn-primary"
                        onClick={submit}
                        disabled={loading}
                    >
                        {loading ? "Creating..." : "Create Agent"}
                    </button>
                </div>
            </div>
        </div>
    );
}
