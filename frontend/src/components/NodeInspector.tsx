"use client";
import { useState } from "react";
import { WorkflowDef } from "@/lib/workflowData";
import { Agent } from "@/lib/api";

const TYPE_COLORS: Record<string, string> = {
    trigger: "var(--accent4)",
    agent: "var(--accent)",
    condition: "#eab308",
    action: "var(--accent2)",
};

export default function NodeInspector({
    nodeId,
    workflow,
    agents = [],
}: {
    nodeId: string | null;
    workflow: WorkflowDef;
    agents?: Agent[];
}) {
    const node = workflow.nodes.find((n) => n.id === nodeId);
    const [label, setLabel] = useState(node?.label ?? "");
    const [sub, setSub] = useState(node?.sub ?? "");

    if (!node) {
        return (
            <div className="card">
                <div className="card-title" style={{ marginBottom: 8 }}>
                    Node Inspector
                </div>
                <div style={{ color: "var(--text3)", fontSize: 12 }}>
                    Click a node in the canvas to inspect and edit it.
                </div>
            </div>
        );
    }

    const color = TYPE_COLORS[node.type] || "var(--text)";

    return (
        <div className="card">
            <div className="card-title" style={{ marginBottom: 10, color }}>
                {node.type.charAt(0).toUpperCase() + node.type.slice(1)}:{" "}
                {node.label}
            </div>

            <div
                style={{
                    fontSize: 10,
                    color: "var(--text3)",
                    fontFamily: "monospace",
                    marginBottom: 10,
                }}
            >
                id: {node.id}
            </div>

            <div className="form-group">
                <div className="form-label">Label</div>
                <input
                    className="form-input"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                />
            </div>

            <div className="form-group" style={{ marginTop: 8 }}>
                <div className="form-label">Description</div>
                <input
                    className="form-input"
                    value={sub}
                    onChange={(e) => setSub(e.target.value)}
                />
            </div>

            {node.type === "agent" && agents.length > 0 && (
                <div className="form-group" style={{ marginTop: 8 }}>
                    <div className="form-label">Assign Agent</div>
                    <select className="form-select" defaultValue={node.label}>
                        {agents
                            .filter((a) => a.is_active)
                            .map((a) => (
                                <option key={a.id} value={a.name}>
                                    {a.name} — {a.role}
                                </option>
                            ))}
                    </select>
                </div>
            )}

            {node.type === "condition" && (
                <div className="form-group" style={{ marginTop: 8 }}>
                    <div className="form-label">Condition Expression</div>
                    <input
                        className="form-input"
                        style={{ fontFamily: "monospace", fontSize: 11 }}
                        defaultValue={node.sub}
                    />
                    <div
                        style={{
                            fontSize: 10,
                            color: "var(--text3)",
                            marginTop: 4,
                        }}
                    >
                        e.g.{" "}
                        <code style={{ fontFamily: "monospace" }}>
                            "urgent" in state.output.lower()
                        </code>
                    </div>
                </div>
            )}

            {node.type === "action" && (
                <div className="form-group" style={{ marginTop: 8 }}>
                    <div className="form-label">Action Type</div>
                    <select className="form-select" defaultValue="send_message">
                        <option value="send_message">
                            Send Message (Telegram)
                        </option>
                        <option value="send_message_slack">
                            Send Message (Slack)
                        </option>
                        <option value="log">Log to console</option>
                        <option value="webhook">Call Webhook</option>
                    </select>
                </div>
            )}

            <button
                className="btn-primary"
                style={{ width: "100%", marginTop: 12, fontSize: 11 }}
            >
                Apply Changes
            </button>
        </div>
    );
}
