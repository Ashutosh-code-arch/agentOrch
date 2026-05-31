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

const INTERNAL_DIRECTIVE_RE =
    /\b(?:DELEGATE_TO|ROUTE_TO)_[A-Z0-9_ -]+:\s*[^\n]*(?:\n|$)/gi;

function msgToLevel(msgType: string): string {
    return LEVEL_COLORS[msgType] ? msgType : "msg";
}

function cleanLogMessage(content: string) {
    return content
        .replace(INTERNAL_DIRECTIVE_RE, "")
        .replace(/\[INTERNAL:[^\]]*\]\n?/gi, "")
        .replace(/\[LOG:[^\]]*\]\n?/gi, "")
        .replace(/\*\*Delegation to [^:*]+:\s*/gi, "**")
        .replace(/^Delegation to [^:]+:\s*/gi, "")
        .trim();
}

function formatLogTime(timestamp: string) {
    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(timestamp);
    const date = new Date(hasTimezone ? timestamp : `${timestamp}Z`);
    return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hour12: false,
    });
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
            msg: cleanLogMessage(m.content).slice(0, 150),
            t: formatLogTime(m.timestamp),
            raw: m,
        }))
        .filter((r) => r.msg)
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
