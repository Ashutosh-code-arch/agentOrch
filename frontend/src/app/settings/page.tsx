"use client";
import { useState } from "react";
import Shell from "@/components/Shell";

function Toggle({
    checked,
    onChange,
}: {
    checked: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <div
            onClick={() => onChange(!checked)}
            style={{
                position: "relative",
                width: 36,
                height: 20,
                cursor: "pointer",
                flexShrink: 0,
            }}
        >
            <div
                style={{
                    position: "absolute",
                    inset: 0,
                    background: checked ? "rgba(108,99,255,0.4)" : "var(--bg4)",
                    border: `1px solid ${checked ? "var(--accent)" : "var(--border2)"}`,
                    borderRadius: 10,
                    transition: "all 0.2s",
                }}
            />
            <div
                style={{
                    position: "absolute",
                    top: 2,
                    left: checked ? 18 : 2,
                    width: 14,
                    height: 14,
                    borderRadius: "50%",
                    background: checked ? "var(--accent)" : "var(--text2)",
                    transition: "left 0.2s",
                }}
            />
        </div>
    );
}

function ToggleRow({
    label,
    sub,
    checked,
    onChange,
}: {
    label: string;
    sub: string;
    checked: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 0",
                borderBottom: "1px solid var(--border)",
            }}
        >
            <div>
                <div style={{ fontSize: 12, fontWeight: 500 }}>{label}</div>
                <div
                    style={{
                        fontSize: 11,
                        color: "var(--text2)",
                        marginTop: 2,
                    }}
                >
                    {sub}
                </div>
            </div>
            <Toggle checked={checked} onChange={onChange} />
        </div>
    );
}

export default function SettingsPage() {
    const [asyncQueue, setAsyncQueue] = useState(true);
    const [persistHistory, setPersistHistory] = useState(true);
    const [vectorMemory, setVectorMemory] = useState(true);
    const [costTracking, setCostTracking] = useState(true);
    const [contentFilter, setContentFilter] = useState(true);
    const [rateLimit, setRateLimit] = useState(true);
    const [tokenBudget, setTokenBudget] = useState(false);

    return (
        <Shell>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Settings</h1>
                    <p className="page-sub">
                        Platform configuration and API keys
                    </p>
                </div>
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                }}
            >
                {/* LLM Provider */}
                <div className="card">
                    <div className="card-title" style={{ marginBottom: 12 }}>
                        LLM Provider
                    </div>
                    <div className="form-group">
                        <div className="form-label">Provider</div>
                        <select className="form-select">
                            <option>Groq</option>
                            <option>Anthropic Claude</option>
                            <option>OpenAI</option>
                            <option>Google Gemini</option>
                            <option>Ollama (local)</option>
                        </select>
                    </div>
                    <div className="form-group" style={{ marginTop: 8 }}>
                        <div className="form-label">API Key</div>
                        <input
                            className="form-input"
                            type="password"
                            defaultValue="gsk-shk-api-***"
                        />
                    </div>
                    <div className="form-group" style={{ marginTop: 8 }}>
                        <div className="form-label">Default Model</div>
                        <select className="form-select">
                            <option>llama-3.1-8b-instant</option>
                            <option>claude-sonnet-4-20250514</option>
                            <option>claude-haiku-4-5-20251001</option>
                            <option>gpt-4o-mini</option>
                            <option>gemini-1.5-flash</option>
                        </select>
                    </div>
                    <button className="btn-primary" style={{ marginTop: 12 }}>
                        Save
                    </button>
                </div>

                {/* Runtime Settings */}
                <div className="card">
                    <div className="card-title" style={{ marginBottom: 4 }}>
                        Runtime Settings
                    </div>
                    <ToggleRow
                        label="Async message queuing"
                        sub="Use Redis for durable async messaging"
                        checked={asyncQueue}
                        onChange={setAsyncQueue}
                    />
                    <ToggleRow
                        label="Persist message history"
                        sub="Store all messages in SQLite/Postgres"
                        checked={persistHistory}
                        onChange={setPersistHistory}
                    />
                    <ToggleRow
                        label="Agent memory (RAG)"
                        sub="Enable per-agent vector memory store"
                        checked={vectorMemory}
                        onChange={setVectorMemory}
                    />
                    <ToggleRow
                        label="Token cost tracking"
                        sub="Count and log tokens per agent"
                        checked={costTracking}
                        onChange={setCostTracking}
                    />
                </div>

                {/* Storage */}
                <div className="card">
                    <div className="card-title" style={{ marginBottom: 12 }}>
                        Storage
                    </div>
                    <div className="form-group">
                        <div className="form-label">Database</div>
                        <select className="form-select">
                            <option>SQLite (default)</option>
                            <option>PostgreSQL</option>
                            <option>MySQL</option>
                        </select>
                    </div>
                    <div className="form-group" style={{ marginTop: 8 }}>
                        <div className="form-label">Database URL</div>
                        <input
                            className="form-input"
                            placeholder="sqlite:///agentOrch.db"
                        />
                    </div>
                    <div className="form-group" style={{ marginTop: 8 }}>
                        <div className="form-label">Vector Store</div>
                        <select className="form-select">
                            <option>ChromaDB (local)</option>
                            <option>Pinecone</option>
                            <option>Weaviate</option>
                        </select>
                    </div>
                    <div className="form-group" style={{ marginTop: 8 }}>
                        <div className="form-label">Redis URL (optional)</div>
                        <input
                            className="form-input"
                            placeholder="redis://localhost:6379"
                        />
                    </div>
                    <button className="btn-primary" style={{ marginTop: 12 }}>
                        Save
                    </button>
                </div>

                {/* Guardrails */}
                <div className="card">
                    <div className="card-title" style={{ marginBottom: 4 }}>
                        Global Guardrails
                    </div>
                    <ToggleRow
                        label="Content filtering"
                        sub="Block harmful content globally across all agents"
                        checked={contentFilter}
                        onChange={setContentFilter}
                    />
                    <ToggleRow
                        label="Rate limiting"
                        sub="Max 60 req/min per agent"
                        checked={rateLimit}
                        onChange={setRateLimit}
                    />
                    <ToggleRow
                        label="Max token budget"
                        sub="Alert when agent exceeds daily limit"
                        checked={tokenBudget}
                        onChange={setTokenBudget}
                    />
                </div>
            </div>
        </Shell>
    );
}
