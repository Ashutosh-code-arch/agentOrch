"use client";
import { useEffect, useRef } from "react";
import { useOrchestratorStore } from "@/stores/orchestrator";

const LEVEL_COLORS: Record<string, string> = {
    info: "var(--accent)",
    success: "var(--accent2)",
    warn: "#eab308",
    error: "#ef4444",
    msg: "var(--accent4)",
    response: "var(--accent2)",
    user_message: "var(--text2)",
    delegate: "var(--accent3)",
};

function msgToLevel(msgType: string): string {
    return LEVEL_COLORS[msgType] ? msgType : "msg";
}

export default function LiveLog({
    height = 280,
    filter = "",
    levelFilter = "all",
    agentFilter = "all",
}: {
    height?: number;
    filter?: string;
    levelFilter?: string;
    agentFilter?: string;
}) {
    const { liveMessages } = useOrchestratorStore();
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [liveMessages]);

    const rows = liveMessages
        .map((m) => ({
            level: msgToLevel(m.msg_type),
            agent: m.from_agent === "*" ? m.to_agent : `${m.from_agent}`,
            target: m.to_agent,
            msg: m.content.slice(0, 150),
            t: new Date(m.timestamp).toTimeString().slice(0, 8),
            raw: m,
        }))
        // text search
        .filter(
            (r) =>
                !filter ||
                r.msg.toLowerCase().includes(filter.toLowerCase()) ||
                r.agent.toLowerCase().includes(filter.toLowerCase()),
        )
        // level filter
        .filter((r) => levelFilter === "all" || r.level === levelFilter)
        // agent filter
        .filter(
            (r) =>
                agentFilter === "all" ||
                r.agent.toLowerCase().includes(agentFilter.toLowerCase()),
        );

    return (
        <div
            style={{
                background: "var(--bg)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                height,
                overflowY: "auto",
                padding: 10,
                fontFamily: "monospace",
                fontSize: 11,
            }}
        >
            {rows.length === 0 ? (
                <div
                    style={{
                        color: "var(--text3)",
                        padding: "20px 0",
                        textAlign: "center",
                    }}
                >
                    {liveMessages.length === 0
                        ? "Waiting for agent activity... Run an agent to see live logs."
                        : "No messages match the current filter."}
                </div>
            ) : (
                rows.map((entry, i) => (
                    <div
                        key={i}
                        style={{
                            padding: "3px 0",
                            display: "flex",
                            gap: 10,
                            borderBottom: "1px solid rgba(255,255,255,0.03)",
                        }}
                    >
                        <span
                            style={{
                                color: "var(--text3)",
                                flexShrink: 0,
                                minWidth: 68,
                            }}
                        >
                            {entry.t}
                        </span>
                        <span
                            style={{
                                color:
                                    LEVEL_COLORS[entry.level] || "var(--text2)",
                                flexShrink: 0,
                                minWidth: 120,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {entry.agent}
                        </span>
                        <span
                            style={{
                                color: "var(--text2)",
                                wordBreak: "break-word",
                            }}
                        >
                            {entry.msg}
                        </span>
                    </div>
                ))
            )}
            <div ref={bottomRef} />
        </div>
    );
}
