"use client";
import { useState } from "react";
import Shell from "@/components/Shell";
import WorkflowCanvas from "@/components/WorkflowCanvas";
import NodeInspector from "@/components/NodeInspector";
import LiveLog from "@/components/LiveLog";
import { WORKFLOWS, WorkflowDef, WorkflowNode } from "@/lib/workflowData";
import { deployWorkflow, runWorkflow, useAgents } from "@/lib/api";

export default function WorkflowsPage() {
    const { agents } = useAgents();
    const [activeIdx, setActiveIdx] = useState(0);
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
    const [running, setRunning] = useState(false);
    const [runResult, setRunResult] = useState<{
        ok: boolean;
        text: string;
    } | null>(null);
    const [testInput, setTestInput] = useState("");
    const [showInput, setShowInput] = useState(false);
    const [showTemplates, setShowTemplates] = useState(false);
    const [deploying, setDeploying] = useState(false);
    const [deployStatus, setDeployStatus] = useState<{
        ok: boolean;
        text: string;
    } | null>(null);

    // Build a real workflow from actual agents
    const buildLiveWorkflow = (base: WorkflowDef): WorkflowDef => {
        const telegramAgent = agents.find(
            (a) => a.channel?.toLowerCase() === "telegram" && a.is_active,
        );
        const researchAgent = agents.find(
            (a) => a.role.toLowerCase().includes("research") && a.is_active,
        );
        const supportAgent = agents.find(
            (a) => a.role.toLowerCase().includes("support") && a.is_active,
        );

        return {
            ...base,
            nodes: base.nodes.map((n) => {
                if (n.type === "agent") {
                    if (
                        n.label.toLowerCase().includes("aria") ||
                        n.label.toLowerCase().includes("support")
                    ) {
                        const a = telegramAgent || supportAgent;
                        if (a) return { ...n, label: a.name, sub: a.role };
                    }
                    if (
                        n.label.toLowerCase().includes("max") ||
                        n.label.toLowerCase().includes("research")
                    ) {
                        const a = researchAgent;
                        if (a) return { ...n, label: a.name, sub: a.role };
                    }
                }
                return n;
            }),
        };
    };

    const baseWf = WORKFLOWS[activeIdx];
    const liveWf = agents.length > 0 ? buildLiveWorkflow(baseWf) : baseWf;
    const selNode = liveWf.nodes.find((n) => n.id === selectedNodeId) ?? null;

    async function handleRun() {
        const input =
            testInput.trim() ||
            "Research the latest AI news and summarize the key points";
        setRunning(true);
        setRunResult(null);
        try {
            const res = await runWorkflow(
                liveWf.id,
                input,
                `ui_wf_${Date.now()}`,
            );
            setRunResult({
                ok: !res.error,
                text: res.error
                    ? `Error: ${res.error}`
                    : (res.output ?? "Workflow completed."),
            });
        } catch (e: unknown) {
            setRunResult({
                ok: false,
                text: `Error: ${e instanceof Error ? e.message : String(e)}`,
            });
        } finally {
            setRunning(false);
        }
    }

    async function handleDeploy() {
        setDeploying(true);
        setDeployStatus(null);
        try {
            const res = await deployWorkflow(liveWf.id);
            setDeployStatus({
                ok: true,
                text: `${res.workflow_name ?? liveWf.name} is deployed with ${res.active_agents ?? 0} active agent(s). Use Run Now to test it.`,
            });
        } catch (e: unknown) {
            setDeployStatus({
                ok: false,
                text: `Deploy failed: ${e instanceof Error ? e.message : String(e)}`,
            });
        } finally {
            setDeploying(false);
        }
    }

    return (
        <Shell>
            <div className="page-header">
                <div>
                    <h1 className="page-title">Workflow Builder</h1>
                    <p className="page-sub">
                        Multi-agent pipelines — nodes show your real active
                        agents
                    </p>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                    <button
                        className="btn-secondary"
                        onClick={() => setShowTemplates(true)}
                    >
                        Templates
                    </button>
                    <button
                        className="btn-primary"
                        onClick={handleDeploy}
                        disabled={deploying}
                        title="Validate this workflow against active agents and mark it ready to run"
                    >
                        {deploying ? "Deploying..." : "Save & Deploy"}
                    </button>
                </div>
            </div>

            {/* Workflow tabs */}
            <div className="tabs" style={{ marginBottom: 12 }}>
                {WORKFLOWS.map((w, i) => (
                    <button
                        key={w.id}
                        className={`tab ${activeIdx === i ? "active" : ""}`}
                        onClick={() => {
                            setActiveIdx(i);
                            setSelectedNodeId(null);
                            setRunResult(null);
                        }}
                    >
                        {w.name}
                    </button>
                ))}
                <button className="tab" style={{ color: "var(--text3)" }}>
                    + New
                </button>
            </div>

            {/* Active agents notice */}
            {agents.length === 0 && (
                <div
                    style={{
                        padding: "10px 14px",
                        background: "rgba(249,115,22,0.1)",
                        border: "1px solid rgba(249,115,22,0.3)",
                        borderRadius: 8,
                        fontSize: 12,
                        color: "var(--accent3)",
                        marginBottom: 12,
                    }}
                >
                    ⚠ No agents found.{" "}
                    <a
                        href="/agents"
                        style={{
                            color: "var(--accent3)",
                            textDecoration: "underline",
                        }}
                    >
                        Create agents first
                    </a>{" "}
                    — workflow nodes will show your real agent names.
                </div>
            )}

            {deployStatus && (
                <div
                    style={{
                        padding: "10px 14px",
                        background: deployStatus.ok
                            ? "rgba(74,222,128,0.07)"
                            : "rgba(239,68,68,0.07)",
                        border: `1px solid ${deployStatus.ok ? "rgba(74,222,128,0.3)" : "rgba(239,68,68,0.3)"}`,
                        borderRadius: 8,
                        fontSize: 12,
                        color: "var(--text)",
                        marginBottom: 12,
                    }}
                >
                    {deployStatus.text}
                </div>
            )}

            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 260px",
                    gap: 12,
                }}
            >
                <div>
                    <WorkflowCanvas
                        workflow={liveWf}
                        selectedNode={selectedNodeId}
                        onSelectNode={setSelectedNodeId}
                    />

                    {showInput && (
                        <div style={{ marginTop: 8 }}>
                            <input
                                className="form-input"
                                placeholder="Test input for this workflow (leave blank for default)..."
                                value={testInput}
                                onChange={(e) => setTestInput(e.target.value)}
                                style={{ width: "100%" }}
                            />
                        </div>
                    )}

                    <div
                        style={{
                            display: "flex",
                            gap: 8,
                            marginTop: 8,
                            flexWrap: "wrap",
                        }}
                    >
                        <button
                            className="btn-secondary"
                            style={{ fontSize: 11 }}
                        >
                            + Trigger
                        </button>
                        <button
                            className="btn-secondary"
                            style={{ fontSize: 11 }}
                        >
                            + Agent Node
                        </button>
                        <button
                            className="btn-secondary"
                            style={{ fontSize: 11 }}
                        >
                            + Condition
                        </button>
                        <button
                            className="btn-secondary"
                            style={{ fontSize: 11 }}
                        >
                            + Action
                        </button>
                        <button
                            className="btn-secondary"
                            style={{ fontSize: 11 }}
                            onClick={() => setShowInput((v) => !v)}
                        >
                            {showInput ? "Hide Input" : "Set Test Input"}
                        </button>
                        <button
                            className="btn-primary"
                            style={{
                                marginLeft: "auto",
                                fontSize: 11,
                                minWidth: 96,
                                opacity: running ? 0.7 : 1,
                            }}
                            onClick={handleRun}
                            disabled={running}
                            title="Execute this workflow once with the test input"
                        >
                            {running ? "⏳ Running..." : "▶ Run Now"}
                        </button>
                    </div>

                    {runResult && (
                        <div
                            style={{
                                marginTop: 10,
                                padding: "10px 14px",
                                background: runResult.ok
                                    ? "rgba(74,222,128,0.07)"
                                    : "rgba(239,68,68,0.07)",
                                border: `1px solid ${runResult.ok ? "rgba(74,222,128,0.3)" : "rgba(239,68,68,0.3)"}`,
                                borderRadius: 8,
                                fontSize: 12,
                                lineHeight: 1.6,
                                whiteSpace: "pre-wrap",
                                color: "var(--text)",
                            }}
                        >
                            <div
                                style={{
                                    fontSize: 10,
                                    fontWeight: 600,
                                    color: runResult.ok
                                        ? "var(--accent2)"
                                        : "#ef4444",
                                    marginBottom: 4,
                                    textTransform: "uppercase",
                                }}
                            >
                                {runResult.ok ? "✓ Result" : "✗ Error"}
                            </div>
                            {runResult.text}
                        </div>
                    )}
                </div>

                <div>
                    <NodeInspector
                        nodeId={selectedNodeId}
                        workflow={liveWf}
                        agents={agents}
                    />
                    <div className="card" style={{ marginTop: 12 }}>
                        <div className="card-title" style={{ marginBottom: 8 }}>
                            Execution Log
                        </div>
                        <LiveLog height={150} />
                    </div>
                </div>
            </div>

            {showTemplates && (
                <TemplateModal
                    onClose={() => setShowTemplates(false)}
                    onSelect={(i) => {
                        setActiveIdx(i);
                        setShowTemplates(false);
                    }}
                />
            )}
        </Shell>
    );
}

function TemplateModal({
    onClose,
    onSelect,
}: {
    onClose: () => void;
    onSelect: (i: number) => void;
}) {
    const templates = [
        {
            icon: "🔬",
            name: "Research → Summarize → Publish",
            desc: "Fetch data, condense, deliver to Telegram.",
            tags: ["3 agents", "Telegram", "web_search"],
            idx: 0,
        },
        {
            icon: "🎯",
            name: "Support Triage System",
            desc: "Receive, classify, route to specialist.",
            tags: ["2 agents", "Telegram"],
            idx: 1,
        },
    ];
    return (
        <div className="modal-overlay" onClick={onClose}>
            <div
                className="modal"
                style={{ width: 520 }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="modal-header">
                    <span className="modal-title">Workflow Templates</span>
                    <button className="modal-close" onClick={onClose}>
                        ×
                    </button>
                </div>
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 12,
                    }}
                >
                    {templates.map((t) => (
                        <div
                            key={t.name}
                            className="template-card"
                            onClick={() => onSelect(t.idx)}
                        >
                            <div style={{ fontSize: 22 }}>{t.icon}</div>
                            <div style={{ fontSize: 13, fontWeight: 600 }}>
                                {t.name}
                            </div>
                            <div
                                style={{
                                    fontSize: 11,
                                    color: "var(--text2)",
                                    lineHeight: 1.4,
                                }}
                            >
                                {t.desc}
                            </div>
                            <div
                                style={{
                                    display: "flex",
                                    gap: 5,
                                    flexWrap: "wrap",
                                    marginTop: 4,
                                }}
                            >
                                {t.tags.map((tag) => (
                                    <span key={tag} className="tag">
                                        {tag}
                                    </span>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
                <div className="modal-footer">
                    <button className="btn-secondary" onClick={onClose}>
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
}
