"use client";
import { useState } from "react";
import Shell from "@/components/Shell";
import AgentCard from "@/components/AgentCard";
import AgentModal from "@/components/AgentModal";
import AgentRunModal from "@/components/AgentRunModal";
import { useAgents } from "@/lib/api";
import type { Agent } from "@/lib/api";

type Filter = "all" | "running" | "idle";

export default function AgentsPage() {
    const { agents, mutate, isLoading } = useAgents();
    const [showCreate, setShowCreate] = useState(false);
    const [runAgent, setRunAgent] = useState<Agent | null>(null);
    const [filter, setFilter] = useState<Filter>("all");

    const filtered = agents.filter((a) => {
        if (filter === "running") return a.is_active;
        if (filter === "idle") return !a.is_active;
        return true;
    });

    const counts = {
        all: agents.length,
        running: agents.filter((a) => a.is_active).length,
        idle: agents.filter((a) => !a.is_active).length,
    };

    return (
        <Shell>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Agents</h1>
                    <p className="page-sub">
                        Create and configure AI agents with personality, tools
                        and memory
                    </p>
                </div>
                <button
                    className="btn-primary"
                    onClick={() => setShowCreate(true)}
                >
                    + New Agent
                </button>
            </div>

            <div className="tabs" style={{ marginBottom: 16 }}>
                {(["all", "running", "idle"] as Filter[]).map((f) => (
                    <button
                        key={f}
                        className={`tab ${filter === f ? "active" : ""}`}
                        onClick={() => setFilter(f)}
                    >
                        {f.charAt(0).toUpperCase() + f.slice(1)}
                        <span
                            style={{
                                marginLeft: 5,
                                fontSize: 10,
                                opacity: 0.7,
                            }}
                        >
                            ({counts[f]})
                        </span>
                    </button>
                ))}
            </div>

            {isLoading ? (
                <div className="empty-state">Loading agents...</div>
            ) : filtered.length === 0 ? (
                <div className="empty-state">
                    <div style={{ fontSize: 32, marginBottom: 10 }}>◉</div>
                    <p>
                        {filter === "all"
                            ? "No agents yet. Create your first agent to get started."
                            : `No ${filter} agents.`}
                    </p>
                    {filter === "all" && (
                        <button
                            className="btn-primary"
                            style={{ marginTop: 12 }}
                            onClick={() => setShowCreate(true)}
                        >
                            + Create First Agent
                        </button>
                    )}
                </div>
            ) : (
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns:
                            "repeat(auto-fill, minmax(260px, 1fr))",
                        gap: 12,
                    }}
                >
                    {filtered.map((agent) => (
                        <AgentCard
                            key={agent.id}
                            agent={agent}
                            onUpdated={mutate}
                            onDeleted={mutate}
                            onSelect={setRunAgent}
                        />
                    ))}
                </div>
            )}

            {showCreate && (
                <AgentModal
                    onClose={() => setShowCreate(false)}
                    onCreated={() => {
                        mutate();
                        setShowCreate(false);
                    }}
                />
            )}

            {runAgent && (
                <AgentRunModal
                    agent={runAgent}
                    onClose={() => setRunAgent(null)}
                />
            )}
        </Shell>
    );
}
