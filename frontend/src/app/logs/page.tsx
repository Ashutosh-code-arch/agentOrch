"use client";
import { useState } from "react";
import Shell from "@/components/Shell";
import LiveLog from "@/components/LiveLog";
import { useAgents } from "@/lib/api";
import { useOrchestratorStore } from "@/stores/orchestrator";

export default function LogsPage() {
    const [search, setSearch] = useState("");
    const [level, setLevel] = useState("all");
    const [agentFilter, setAgent] = useState("all");
    const { agents } = useAgents();
    const { liveMessages, clearMessages } = useOrchestratorStore();

    function exportLogs() {
        const lines = liveMessages.map(
            (m) =>
                `${m.timestamp}\t${m.from_agent}\t${m.to_agent}\t${m.msg_type}\t${m.content}`,
        );
        const blob = new Blob([lines.join("\n")], { type: "text/plain" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `orchid-logs-${Date.now()}.txt`;
        a.click();
    }

    return (
        <Shell>
            <div className="page-header">
                <div>
                    <h1 className="page-title">System Logs</h1>
                    <p className="page-sub">
                        Real-time agent message stream · {liveMessages.length}{" "}
                        messages this session
                    </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn-secondary" onClick={clearMessages}>
                        Clear
                    </button>
                    <button className="btn-secondary" onClick={exportLogs}>
                        Export
                    </button>
                </div>
            </div>

            <div className="card">
                <div
                    style={{
                        display: "flex",
                        gap: 8,
                        marginBottom: 12,
                        alignItems: "center",
                        flexWrap: "wrap",
                    }}
                >
                    <input
                        className="form-input"
                        style={{ flex: 1, minWidth: 160 }}
                        placeholder="Search logs..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                    />
                    <select
                        className="form-select"
                        style={{ width: 130 }}
                        value={level}
                        onChange={(e) => setLevel(e.target.value)}
                    >
                        <option value="all">All types</option>
                        <option value="response">Response</option>
                        <option value="user_message">User message</option>
                        <option value="delegate">Delegate</option>
                        <option value="error">Error</option>
                    </select>
                    <select
                        className="form-select"
                        style={{ width: 140 }}
                        value={agentFilter}
                        onChange={(e) => setAgent(e.target.value)}
                    >
                        <option value="all">All agents</option>
                        {agents.map((a) => (
                            <option key={a.id} value={a.name.toLowerCase()}>
                                {a.name}
                            </option>
                        ))}
                    </select>
                </div>

                <LiveLog
                    height={500}
                    filter={search}
                    levelFilter={level}
                    agentFilter={agentFilter}
                />
            </div>
        </Shell>
    );
}
