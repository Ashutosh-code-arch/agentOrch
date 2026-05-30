"use client";
import { useEffect, useState } from "react";
import Shell from "@/components/Shell";
import LiveLog from "@/components/LiveLog";
import StatsRow from "@/components/StatsRow";
import { useOrchestratorStore } from "@/stores/orchestrator";
import { useAgents } from "@/lib/api";

export default function MonitorPage() {
    const { wsConnected, liveMessages } = useOrchestratorStore();
    const { agents } = useAgents();
    const [msgRate, setMsgRate] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            const cutoff = Date.now() - 60_000;
            const recent = liveMessages.filter(
                (m) => new Date(m.timestamp).getTime() > cutoff,
            );
            setMsgRate(recent.length);
        }, 2000);
        return () => clearInterval(interval);
    }, [liveMessages]);

    // Token usage per agent name
    const tokenByAgent: Record<string, number> = {};
    liveMessages.forEach((m) => {
        if (m.tokens && m.from_agent) {
            tokenByAgent[m.from_agent] =
                (tokenByAgent[m.from_agent] || 0) + m.tokens;
        }
    });

    const running = agents.filter((a) => a.is_active).length;

    return (
        <Shell>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Live Monitor</h1>
                    <p className="page-sub">
                        Real-time agent messages, token tracking, and WebSocket
                        stream
                    </p>
                </div>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "4px 12px",
                        background: wsConnected
                            ? "rgba(74,222,128,0.12)"
                            : "rgba(239,68,68,0.12)",
                        border: `1px solid ${wsConnected ? "rgba(74,222,128,0.25)" : "rgba(239,68,68,0.25)"}`,
                        borderRadius: 20,
                        fontSize: 11,
                        color: wsConnected ? "var(--accent2)" : "#ef4444",
                        fontFamily: "monospace",
                    }}
                >
                    <div
                        style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: "currentColor",
                            animation: wsConnected
                                ? "pulse 2s infinite"
                                : "none",
                        }}
                    />
                    {wsConnected
                        ? "WebSocket connected"
                        : "WebSocket disconnected"}
                </div>
            </div>

            {!wsConnected && (
                <div
                    style={{
                        padding: "10px 14px",
                        background: "rgba(239,68,68,0.08)",
                        border: "1px solid rgba(239,68,68,0.3)",
                        borderRadius: 8,
                        fontSize: 12,
                        color: "#ef4444",
                        marginBottom: 12,
                    }}
                >
                    ⚠ WebSocket is not connected. Make sure the backend is
                    running at localhost:8000 and restart the frontend.
                </div>
            )}

            <StatsRow
                stats={[
                    {
                        label: "Messages / min",
                        value: String(msgRate),
                        color: "cyan",
                    },
                    {
                        label: "Active Agents",
                        value: `${running} / ${agents.length}`,
                        color: "green",
                    },
                    {
                        label: "Total Messages",
                        value: String(liveMessages.length),
                        color: "accent",
                    },
                    {
                        label: "Unique Sessions",
                        value: String(
                            new Set(liveMessages.map((m) => m.session_id)).size,
                        ),
                        color: "orange",
                    },
                ]}
            />

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 12,
                    marginBottom: 12,
                }}
            >
                <div className="card">
                    <div className="card-title" style={{ marginBottom: 10 }}>
                        Agent Message Flow
                    </div>
                    <MessageFlowViz
                        active={wsConnected && liveMessages.length > 0}
                    />
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "space-between",
                            marginTop: 6,
                            fontSize: 10,
                            color: "var(--text3)",
                        }}
                    >
                        {agents.slice(0, 3).map((a) => (
                            <span key={a.id}>{a.name}</span>
                        ))}
                    </div>
                </div>
                <div className="card">
                    <div className="card-title" style={{ marginBottom: 10 }}>
                        Token Usage (live session)
                    </div>
                    {Object.keys(tokenByAgent).length === 0 ? (
                        <div
                            style={{
                                color: "var(--text3)",
                                fontSize: 12,
                                padding: "20px 0",
                                textAlign: "center",
                            }}
                        >
                            {wsConnected
                                ? "Run an agent to see token usage here."
                                : "Connect WebSocket to see token data."}
                        </div>
                    ) : (
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Agent</th>
                                    <th>Tokens</th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(tokenByAgent)
                                    .sort((a, b) => b[1] - a[1])
                                    .map(([agent, tokens]) => (
                                        <tr key={agent}>
                                            <td>{agent}</td>
                                            <td
                                                style={{
                                                    fontFamily: "monospace",
                                                }}
                                            >
                                                {tokens.toLocaleString()}
                                            </td>
                                        </tr>
                                    ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            <div className="card">
                <div className="card-header">
                    <span className="card-title">
                        Inter-agent Message Stream
                    </span>
                    <span
                        style={{
                            fontSize: 10,
                            color: "var(--text3)",
                            fontFamily: "monospace",
                        }}
                    >
                        {liveMessages.length} total · {msgRate}/min
                    </span>
                </div>
                <LiveLog height={320} />
            </div>
        </Shell>
    );
}

function MessageFlowViz({ active }: { active: boolean }) {
    return (
        <div
            style={{
                height: 70,
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                position: "relative",
                overflow: "hidden",
            }}
        >
            <style>{`
        @keyframes flow { 0%{left:5%} 100%{left:92%} }
        .pkt { position:absolute; top:calc(50% - 4px); width:8px; height:8px; border-radius:50%; }
        .pkt.on { animation:flow 2s linear infinite; }
      `}</style>
            <div
                style={{
                    position: "absolute",
                    top: "50%",
                    width: "88%",
                    left: "6%",
                    height: 1,
                    background: "rgba(108,99,255,0.25)",
                }}
            />
            {active ? (
                <>
                    <div
                        className="pkt on"
                        style={{
                            background: "var(--accent)",
                            animationDelay: "0s",
                        }}
                    />
                    <div
                        className="pkt on"
                        style={{
                            background: "var(--accent4)",
                            animationDelay: "0.7s",
                        }}
                    />
                    <div
                        className="pkt on"
                        style={{
                            background: "var(--accent2)",
                            animationDelay: "1.4s",
                        }}
                    />
                </>
            ) : (
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 11,
                        color: "var(--text3)",
                    }}
                >
                    No activity
                </div>
            )}
        </div>
    );
}
