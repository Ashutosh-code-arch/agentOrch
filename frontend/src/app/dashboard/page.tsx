"use client";
import Shell from "@/components/Shell";
import StatsRow from "@/components/StatsRow";
import LiveLog from "@/components/LiveLog";
import { useAgents } from "@/lib/api";
import { useOrchestratorStore } from "@/stores/orchestrator";
import Link from "next/link";

export default function DashboardPage() {
    const { agents, isLoading } = useAgents();
    const { liveMessages, wsConnected } = useOrchestratorStore();
    const running = agents.filter((a) => a.is_active).length;
    const totalTokens = agents.reduce((s, a) => s + (a.total_tokens || 0), 0);
    const totalTasks = agents.reduce((s, a) => s + (a.total_tasks || 0), 0);
    const totalCost = agents.reduce(
        (s, a) => s + Number(a.total_cost_usd || 0),
        0,
    );

    return (
        <Shell>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Overview</h1>
                    <p className="page-sub">
                        AI agent orchestration platform ·{" "}
                        {wsConnected ? "Live" : "Offline"}
                    </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <Link href="/agents">
                        <button className="btn-secondary">Manage Agents</button>
                    </Link>
                    <Link href="/workflows">
                        <button className="btn-primary">Run Workflow</button>
                    </Link>
                </div>
            </div>

            <StatsRow
                stats={[
                    {
                        label: "Active Agents",
                        value: isLoading
                            ? "..."
                            : `${running} / ${agents.length}`,
                        color: "accent",
                    },
                    {
                        label: "Tasks Completed",
                        value: isLoading ? "..." : totalTasks.toLocaleString(),
                        color: "green",
                    },
                    {
                        label: "Tokens Used",
                        value: isLoading
                            ? "..."
                            : totalTokens > 1000
                              ? `${Math.round(totalTokens / 1000)}K`
                              : String(totalTokens),
                        color: "orange",
                    },
                    {
                        label: "Cost",
                        value: isLoading ? "..." : `$${totalCost.toFixed(4)}`,
                        color: "cyan",
                    },
                ]}
            />

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                }}
            >
                <div className="card">
                    <div className="card-header">
                        <span className="card-title">Agents</span>
                        <Link href="/agents">
                            <button
                                className="btn-secondary"
                                style={{ fontSize: 11, padding: "3px 8px" }}
                            >
                                View all
                            </button>
                        </Link>
                    </div>
                    {agents.length === 0 ? (
                        <div
                            style={{
                                color: "var(--text3)",
                                fontSize: 12,
                                padding: "12px 0",
                                textAlign: "center",
                            }}
                        >
                            No agents yet.{" "}
                            <Link
                                href="/agents"
                                style={{ color: "var(--accent)" }}
                            >
                                Create one →
                            </Link>
                        </div>
                    ) : (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Name</th>
                                    <th>Role</th>
                                    <th>Model</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {agents.slice(0, 5).map((a) => (
                                    <tr key={a.id}>
                                        <td>{a.name}</td>
                                        <td style={{ color: "var(--text2)" }}>
                                            {a.role}
                                        </td>
                                        <td
                                            style={{
                                                fontFamily: "monospace",
                                                fontSize: 10,
                                                color: "var(--text3)",
                                            }}
                                        >
                                            {a.model
                                                .split("-")
                                                .slice(0, 2)
                                                .join("-")}
                                        </td>
                                        <td>
                                            <span
                                                style={{
                                                    color: a.is_active
                                                        ? "var(--accent2)"
                                                        : "var(--text3)",
                                                }}
                                            >
                                                {a.is_active
                                                    ? "● Running"
                                                    : "○ Idle"}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="card">
                    <div className="card-header">
                        <span className="card-title">
                            Agent Messages (live)
                        </span>
                        <span
                            style={{
                                fontSize: 10,
                                color: "var(--text3)",
                                fontFamily: "monospace",
                            }}
                        >
                            {wsConnected ? "● live" : "○ offline"}
                        </span>
                    </div>
                    <LiveLog height={200} />
                </div>
            </div>
        </Shell>
    );
}
