"use client";
import { useState, useEffect, useRef } from "react";
import Shell from "@/components/Shell";
import {
    deleteSession,
    runAgent,
    useAgents,
    useMessages,
    useSessions,
} from "@/lib/api";

const INTERNAL_DIRECTIVE_RE =
    /\b(?:DELEGATE_TO|ROUTE_TO)_[A-Z0-9_ -]+:\s*[^\n]*(?:\n|$)/gi;

function cleanMessageContent(content: string) {
    return content
        .replace(INTERNAL_DIRECTIVE_RE, "")
        .replace(/\[INTERNAL:[^\]]*\]\n?/gi, "")
        .replace(/\[LOG:[^\]]*\]\n?/gi, "")
        .trim();
}

function formatMessageTime(createdAt: string) {
    const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/.test(createdAt);
    const date = new Date(hasTimezone ? createdAt : `${createdAt}Z`);
    return date.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
    });
}

export default function ChatPage() {
    const { sessions, mutate: mutateSessions } = useSessions();
    const { agents } = useAgents();
    const [activeSession, setActiveSession] = useState<string | null>(null);
    const [input, setInput] = useState("");
    const [sending, setSending] = useState(false);
    const { messages, mutate: mutateMessages } = useMessages(activeSession);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (sessions.length > 0 && !activeSession)
            setActiveSession(sessions[0]);
    }, [sessions]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [messages]);

    // Pick the Telegram agent, fallback to first active agent
    const tgAgent =
        agents.find(
            (a) => a.channel?.toLowerCase() === "telegram" && a.is_active,
        ) ??
        agents.find((a) => a.is_active) ??
        null;

    async function send() {
        const msg = input.trim();
        if (!msg || !tgAgent || sending) return;
        const sid = activeSession ?? `ui_${Date.now()}`;
        setInput("");
        setSending(true);
        try {
            await runAgent(tgAgent.id, msg, sid);
            if (!activeSession) setActiveSession(sid);
            await Promise.all([mutateMessages(), mutateSessions()]);
        } catch (e) {
            console.error(e);
        } finally {
            setSending(false);
        }
    }

    function handleKey(e: React.KeyboardEvent) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    }

    async function removeSession(
        e: React.MouseEvent<HTMLButtonElement>,
        sid: string,
    ) {
        e.stopPropagation();
        if (!window.confirm(`Delete conversation "${sessionLabel(sid)}"?`))
            return;

        await deleteSession(sid);
        if (activeSession === sid) {
            const next = sessions.find((session) => session !== sid) ?? null;
            setActiveSession(next);
        }
        await Promise.all([mutateSessions(), mutateMessages()]);
    }

    const sessionLabel = (sid: string) => {
        if (sid.startsWith("tg_"))
            return `Telegram · ${sid.replace("tg_", "")}`;
        if (sid.startsWith("ui_")) return `Web UI · ${sid.slice(3, 15)}`;
        return sid.slice(0, 24);
    };

    return (
        <Shell>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Conversations</h1>
                    <p className="page-sub">
                        Live agent conversations across all channels
                    </p>
                </div>
            </div>

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "220px 1fr",
                    gap: 12,
                    height: "calc(100vh - 160px)",
                }}
            >
                {/* Session list */}
                <div className="card" style={{ padding: 0, overflow: "auto" }}>
                    {/* New chat button */}
                    <div
                        style={{
                            padding: "10px 12px",
                            borderBottom: "1px solid var(--border)",
                            cursor: "pointer",
                            color: "var(--accent)",
                            fontSize: 12,
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                        }}
                        onClick={() => setActiveSession(`ui_${Date.now()}`)}
                    >
                        + New conversation
                    </div>

                    {sessions.length === 0 ? (
                        <div
                            style={{
                                padding: 16,
                                color: "var(--text3)",
                                fontSize: 12,
                                lineHeight: 1.6,
                            }}
                        >
                            No conversations yet.
                            <br />
                            Click <em>+ New conversation</em> above or message
                            your Telegram bot.
                        </div>
                    ) : (
                        sessions.map((sid) => (
                            <div
                                key={sid}
                                className={`chat-list-item ${activeSession === sid ? "active" : ""}`}
                                onClick={() => setActiveSession(sid)}
                            >
                                <div className="chat-avatar">
                                    {sid.startsWith("tg_") ? "✈️" : "💬"}
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div
                                        style={{
                                            fontSize: 12,
                                            fontWeight: 600,
                                            overflow: "hidden",
                                            textOverflow: "ellipsis",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {sessionLabel(sid)}
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 11,
                                            color: "var(--text2)",
                                        }}
                                    >
                                        {sid.startsWith("tg_")
                                            ? "Telegram"
                                            : "Web UI"}
                                    </div>
                                </div>
                                <button
                                    aria-label={`Delete ${sessionLabel(sid)}`}
                                    title="Delete conversation"
                                    onClick={(e) => removeSession(e, sid)}
                                    style={{
                                        width: 24,
                                        height: 24,
                                        border: "1px solid transparent",
                                        borderRadius: 6,
                                        background: "transparent",
                                        color: "var(--text3)",
                                        cursor: "pointer",
                                        flexShrink: 0,
                                        lineHeight: 1,
                                    }}
                                >
                                    x
                                </button>
                            </div>
                        ))
                    )}
                </div>

                {/* Chat window */}
                <div
                    className="card"
                    style={{
                        padding: 0,
                        display: "flex",
                        flexDirection: "column",
                    }}
                >
                    {/* Header */}
                    <div
                        style={{
                            padding: "12px 16px",
                            borderBottom: "1px solid var(--border)",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                        }}
                    >
                        <div className="chat-avatar">🤖</div>
                        <div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>
                                {tgAgent
                                    ? `${tgAgent.name} — ${tgAgent.role}`
                                    : "No active agent"}
                            </div>
                            <div
                                style={{
                                    fontSize: 11,
                                    color: tgAgent
                                        ? "var(--accent2)"
                                        : "var(--red, #ef4444)",
                                }}
                            >
                                {tgAgent
                                    ? `● Active · ${tgAgent.model}`
                                    : "⚠ Create and start an agent first"}
                            </div>
                        </div>
                        {tgAgent?.channel && (
                            <span
                                style={{
                                    marginLeft: "auto",
                                    fontSize: 11,
                                    padding: "3px 10px",
                                    background: "rgba(74,222,128,0.1)",
                                    border: "1px solid rgba(74,222,128,0.2)",
                                    borderRadius: 6,
                                    color: "var(--accent2)",
                                    fontFamily: "monospace",
                                    textTransform: "capitalize",
                                }}
                            >
                                {tgAgent.channel}
                            </span>
                        )}
                    </div>

                    {/* Messages */}
                    <div
                        style={{
                            flex: 1,
                            overflowY: "auto",
                            padding: 16,
                            display: "flex",
                            flexDirection: "column",
                            gap: 12,
                        }}
                    >
                        {!activeSession ? (
                            <div className="empty-state">
                                <div style={{ fontSize: 24, marginBottom: 8 }}>
                                    💬
                                </div>
                                <p>
                                    Select a session or start a new
                                    conversation.
                                </p>
                            </div>
                        ) : messages.length === 0 ? (
                            <div className="empty-state">
                                <p>No messages yet. Send one below.</p>
                            </div>
                        ) : (
                            [...messages].reverse().map((m) => {
                                const displayContent = cleanMessageContent(
                                    m.content,
                                );
                                if (!displayContent) return null;
                                const isUser =
                                    m.from_agent.startsWith("telegram:") ||
                                    m.from_agent.startsWith("ui:") ||
                                    m.to_agent !== "broadcast";
                                const isAgentReply = m.msg_type === "response";
                                const showAsUser =
                                    m.msg_type === "user_message";

                                return (
                                    <div
                                        key={m.id}
                                        style={{
                                            display: "flex",
                                            gap: 8,
                                            maxWidth: "82%",
                                            alignSelf: showAsUser
                                                ? "flex-end"
                                                : "flex-start",
                                            flexDirection: showAsUser
                                                ? "row-reverse"
                                                : "row",
                                        }}
                                    >
                                        <div
                                            className="chat-avatar"
                                            style={{
                                                width: 28,
                                                height: 28,
                                                fontSize: 12,
                                            }}
                                        >
                                            {showAsUser ? "👤" : "🤖"}
                                        </div>
                                        <div>
                                            <div
                                                style={{
                                                    padding: "8px 12px",
                                                    borderRadius: 10,
                                                    fontSize: 12,
                                                    lineHeight: 1.6,
                                                    whiteSpace: "pre-wrap",
                                                    wordBreak: "break-word",
                                                    background: showAsUser
                                                        ? "var(--accent)"
                                                        : "var(--bg3)",
                                                    border: showAsUser
                                                        ? "none"
                                                        : "1px solid var(--border)",
                                                    color: showAsUser
                                                        ? "white"
                                                        : "var(--text)",
                                                }}
                                            >
                                                {displayContent}
                                            </div>
                                            <div
                                                style={{
                                                    fontSize: 10,
                                                    color: "var(--text3)",
                                                    marginTop: 3,
                                                    fontFamily: "monospace",
                                                    textAlign: showAsUser
                                                        ? "right"
                                                        : "left",
                                                }}
                                            >
                                                {m.from_agent.replace(
                                                    "telegram:",
                                                    "@",
                                                )}{" "}
                                                · {formatMessageTime(m.created_at)}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                        <div ref={bottomRef} />
                    </div>

                    {/* Input row — always visible */}
                    <div
                        style={{
                            padding: "12px 16px",
                            borderTop: "1px solid var(--border)",
                            display: "flex",
                            gap: 8,
                            flexShrink: 0,
                        }}
                    >
                        <textarea
                            className="form-input"
                            style={{ flex: 1, resize: "none", minHeight: 38 }}
                            rows={1}
                            placeholder={
                                !tgAgent
                                    ? "No active agent — create one first"
                                    : `Message ${tgAgent.name}... (Enter to send)`
                            }
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKey}
                            disabled={!tgAgent || sending}
                        />
                        <button
                            className="btn-primary"
                            style={{ minWidth: 64, flexShrink: 0 }}
                            onClick={send}
                            disabled={!tgAgent || sending || !input.trim()}
                        >
                            {sending ? "..." : "Send"}
                        </button>
                    </div>
                </div>
            </div>
        </Shell>
    );
}
