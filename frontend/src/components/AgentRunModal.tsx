"use client";
import { useState, useRef, useEffect } from "react";
import { Agent, runAgent } from "@/lib/api";

interface Turn {
    role: "user" | "agent";
    text: string;
    time: string;
}

export default function AgentRunModal({
    agent,
    onClose,
}: {
    agent: Agent;
    onClose: () => void;
}) {
    const [input, setInput] = useState("");
    const [turns, setTurns] = useState<Turn[]>([]);
    const [loading, setLoading] = useState(false);
    const sessionId = useRef(`ui_${agent.id}_${Date.now()}`);
    const bottomRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [turns]);

    async function send() {
        const msg = input.trim();
        if (!msg || loading) return;
        setInput("");
        const time = new Date().toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
        });
        setTurns((t) => [...t, { role: "user", text: msg, time }]);
        setLoading(true);
        try {
            const res = await runAgent(agent.id, msg, sessionId.current);
            setTurns((t) => [
                ...t,
                {
                    role: "agent",
                    text: res.response,
                    time: new Date().toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                    }),
                },
            ]);
        } catch (e: unknown) {
            setTurns((t) => [
                ...t,
                {
                    role: "agent",
                    text: `Error: ${e instanceof Error ? e.message : String(e)}`,
                    time,
                },
            ]);
        } finally {
            setLoading(false);
        }
    }

    function handleKey(e: React.KeyboardEvent) {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
        }
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal"
                style={{
                    width: 580,
                    height: 560,
                    display: "flex",
                    flexDirection: "column",
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-header">
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                        }}
                    >
                        <div
                            style={{
                                width: 32,
                                height: 32,
                                borderRadius: 8,
                                background: "rgba(108,99,255,0.2)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                            }}
                        >
                            🤖
                        </div>
                        <div>
                            <div style={{ fontWeight: 600 }}>{agent.name}</div>
                            <div
                                style={{
                                    fontSize: 11,
                                    color: "var(--text2)",
                                    fontFamily: "monospace",
                                }}
                            >
                                {agent.model}
                            </div>
                        </div>
                    </div>
                    <button className="modal-close" onClick={onClose}>
                        ×
                    </button>
                </div>

                {/* Messages */}
                <div
                    style={{
                        flex: 1,
                        overflowY: "auto",
                        padding: "12px 16px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 10,
                    }}
                >
                    {turns.length === 0 && (
                        <div
                            style={{
                                textAlign: "center",
                                color: "var(--text3)",
                                fontSize: 12,
                                marginTop: 40,
                            }}
                        >
                            Send a message to test {agent.name}
                        </div>
                    )}
                    {turns.map((t, i) => (
                        <div
                            key={i}
                            style={{
                                display: "flex",
                                gap: 8,
                                alignSelf:
                                    t.role === "user"
                                        ? "flex-end"
                                        : "flex-start",
                                flexDirection:
                                    t.role === "user" ? "row-reverse" : "row",
                                maxWidth: "85%",
                            }}
                        >
                            <div
                                style={{
                                    width: 26,
                                    height: 26,
                                    borderRadius: 6,
                                    background:
                                        t.role === "user"
                                            ? "var(--bg4)"
                                            : "rgba(108,99,255,0.2)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 12,
                                    flexShrink: 0,
                                }}
                            >
                                {t.role === "user" ? "👤" : "🤖"}
                            </div>
                            <div>
                                <div
                                    style={{
                                        padding: "8px 12px",
                                        borderRadius: 10,
                                        fontSize: 12,
                                        lineHeight: 1.5,
                                        whiteSpace: "pre-wrap",
                                        background:
                                            t.role === "user"
                                                ? "var(--accent)"
                                                : "var(--bg3)",
                                        border:
                                            t.role === "user"
                                                ? "none"
                                                : "1px solid var(--border)",
                                        color:
                                            t.role === "user"
                                                ? "white"
                                                : "var(--text)",
                                    }}
                                >
                                    {t.text}
                                </div>
                                <div
                                    style={{
                                        fontSize: 10,
                                        color: "var(--text3)",
                                        marginTop: 3,
                                        fontFamily: "monospace",
                                        textAlign:
                                            t.role === "user"
                                                ? "right"
                                                : "left",
                                    }}
                                >
                                    {t.time}
                                </div>
                            </div>
                        </div>
                    ))}
                    {loading && (
                        <div
                            style={{
                                display: "flex",
                                gap: 8,
                                alignSelf: "flex-start",
                            }}
                        >
                            <div
                                style={{
                                    width: 26,
                                    height: 26,
                                    borderRadius: 6,
                                    background: "rgba(108,99,255,0.2)",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 12,
                                }}
                            >
                                🤖
                            </div>
                            <div
                                style={{
                                    padding: "8px 14px",
                                    borderRadius: 10,
                                    background: "var(--bg3)",
                                    border: "1px solid var(--border)",
                                    fontSize: 12,
                                    color: "var(--text3)",
                                }}
                            >
                                Thinking...
                            </div>
                        </div>
                    )}
                    <div ref={bottomRef} />
                </div>

                {/* Input */}
                <div
                    style={{
                        padding: "10px 16px",
                        borderTop: "1px solid var(--border)",
                        display: "flex",
                        gap: 8,
                    }}
                >
                    <textarea
                        className="form-input"
                        rows={1}
                        style={{ flex: 1, resize: "none" }}
                        placeholder={`Message ${agent.name}...`}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKey}
                        disabled={loading}
                    />
                    <button
                        className="btn-primary"
                        onClick={send}
                        disabled={loading || !input.trim()}
                    >
                        Send
                    </button>
                </div>
            </div>
        </div>
    );
}
