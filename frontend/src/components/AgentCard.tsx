"use client";
import { useState } from "react";
import { Agent, updateAgent, deleteAgent } from "@/lib/api";

const STYLE_MAP: Record<string, { color: string; bg: string; emoji: string }> =
    {
        support: { color: "#06b6d4", bg: "rgba(6,182,212,0.15)", emoji: "🤖" },
        research: {
            color: "#6c63ff",
            bg: "rgba(108,99,255,0.15)",
            emoji: "🔬",
        },
        writer: { color: "#4ade80", bg: "rgba(74,222,128,0.15)", emoji: "✍️" },
        analyst: { color: "#f97316", bg: "rgba(249,115,22,0.15)", emoji: "📊" },
        scheduler: {
            color: "#eab308",
            bg: "rgba(234,179,8,0.15)",
            emoji: "⏰",
        },
        escalation: {
            color: "#ef4444",
            bg: "rgba(239,68,68,0.15)",
            emoji: "🚨",
        },
        default: { color: "#6c63ff", bg: "rgba(108,99,255,0.15)", emoji: "◉" },
    };

function getStyle(role: string) {
    const key = Object.keys(STYLE_MAP).find((k) =>
        role.toLowerCase().includes(k),
    );
    return STYLE_MAP[key ?? "default"];
}

export default function AgentCard({
    agent,
    onUpdated,
    onDeleted,
    onSelect,
}: {
    agent: Agent;
    onUpdated?: () => void;
    onDeleted?: () => void;
    onSelect?: (a: Agent) => void;
}) {
    const style = getStyle(agent.role);
    const [loading, setLoading] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);

    async function toggle(e: React.MouseEvent) {
        e.stopPropagation();
        setLoading(true);
        try {
            await updateAgent(agent.id, { is_active: !agent.is_active });
            onUpdated?.();
        } finally {
            setLoading(false);
        }
    }

    async function handleDelete(e: React.MouseEvent) {
        e.stopPropagation();
        if (!confirmDelete) {
            setConfirmDelete(true);
            setTimeout(() => setConfirmDelete(false), 3000);
            return;
        }
        setLoading(true);
        try {
            await deleteAgent(agent.id);
            onDeleted?.();
        } finally {
            setLoading(false);
            setConfirmDelete(false);
        }
    }

    return (
        <div
            onClick={() => onSelect?.(agent)}
            style={{
                background: "var(--bg2)",
                border: `1px solid var(--border)`,
                borderTop: `2px solid ${style.color}`,
                borderRadius: 10,
                padding: 14,
                cursor: onSelect ? "pointer" : "default",
                transition: "all 0.15s",
                opacity: loading ? 0.7 : 1,
            }}
        >
            {/* Head */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 10,
                }}
            >
                <div
                    style={{
                        width: 36,
                        height: 36,
                        borderRadius: 9,
                        background: style.bg,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 16,
                        flexShrink: 0,
                    }}
                >
                    {style.emoji}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>
                        {agent.name}
                    </div>
                    <div
                        style={{
                            fontSize: 11,
                            color: "var(--text2)",
                            marginTop: 1,
                        }}
                    >
                        {agent.role}
                    </div>
                </div>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 5,
                        fontSize: 10,
                    }}
                >
                    <div
                        style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: agent.is_active
                                ? "var(--accent2)"
                                : "var(--text3)",
                            animation: agent.is_active
                                ? "pulse 2s infinite"
                                : "none",
                        }}
                    />
                    <span style={{ color: "var(--text3)" }}>
                        {agent.is_active ? "running" : "idle"}
                    </span>
                </div>
            </div>

            {/* Tags */}
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {agent.channel && (
                    <span className="tag tag-channel">✈ {agent.channel}</span>
                )}
                {(agent.tools ?? []).slice(0, 2).map((t) => (
                    <span key={t} className="tag tag-tool">
                        {t}
                    </span>
                ))}
                {(agent.tools ?? []).length > 2 && (
                    <span className="tag">+{agent.tools.length - 2}</span>
                )}
            </div>

            {/* Model */}
            <div
                style={{
                    fontSize: 10,
                    color: "var(--text3)",
                    marginTop: 6,
                    fontFamily: "monospace",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                }}
            >
                {agent.model}
            </div>

            {/* Stats + actions */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: "1px solid var(--border)",
                }}
            >
                <div style={{ fontSize: 10, color: "var(--text2)" }}>
                    <span
                        style={{
                            display: "block",
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--text)",
                            fontFamily: "monospace",
                        }}
                    >
                        {agent.total_tasks}
                    </span>
                    tasks
                </div>
                <div style={{ fontSize: 10, color: "var(--text2)" }}>
                    <span
                        style={{
                            display: "block",
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--text)",
                            fontFamily: "monospace",
                        }}
                    >
                        {agent.total_tokens > 1000
                            ? `${Math.round(agent.total_tokens / 1000)}K`
                            : agent.total_tokens}
                    </span>
                    tokens
                </div>
                <div style={{ fontSize: 10, color: "var(--text2)" }}>
                    <span
                        style={{
                            display: "block",
                            fontSize: 13,
                            fontWeight: 600,
                            color: "var(--text)",
                            fontFamily: "monospace",
                        }}
                    >
                        ${Number(agent.total_cost_usd || 0).toFixed(4)}
                    </span>
                    cost
                </div>
                <div style={{ marginLeft: "auto", display: "flex", gap: 5 }}>
                    <button
                        onClick={toggle}
                        disabled={loading}
                        style={{
                            fontSize: 10,
                            padding: "3px 8px",
                            background: "transparent",
                            border: "1px solid var(--border2)",
                            borderRadius: 5,
                            color: agent.is_active
                                ? "var(--accent2)"
                                : "var(--text2)",
                            cursor: "pointer",
                        }}
                    >
                        {agent.is_active ? "Stop" : "Start"}
                    </button>
                    <button
                        onClick={handleDelete}
                        disabled={loading}
                        style={{
                            fontSize: 10,
                            padding: "3px 8px",
                            background: confirmDelete
                                ? "rgba(239,68,68,0.15)"
                                : "transparent",
                            border: `1px solid ${confirmDelete ? "rgba(239,68,68,0.4)" : "var(--border2)"}`,
                            borderRadius: 5,
                            color: confirmDelete ? "#ef4444" : "var(--text3)",
                            cursor: "pointer",
                        }}
                    >
                        {confirmDelete ? "Sure?" : "Delete"}
                    </button>
                </div>
            </div>
        </div>
    );
}
