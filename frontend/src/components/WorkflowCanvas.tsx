"use client";
import { WorkflowDef } from "@/lib/workflowData";

const TYPE_COLORS: Record<string, string> = {
  trigger: "var(--accent4)",
  agent: "var(--accent)",
  condition: "#eab308",
  action: "var(--accent2)",
};

export default function WorkflowCanvas({
  workflow,
  selectedNode,
  onSelectNode,
}: {
  workflow: WorkflowDef;
  selectedNode: string | null;
  onSelectNode: (id: string) => void;
}) {
  const nodeMap = Object.fromEntries(workflow.nodes.map((n) => [n.id, n]));

  return (
    <div
      style={{
        background: "var(--bg)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        position: "relative",
        overflow: "hidden",
        height: 380,
      }}
    >
      {/* Grid background */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "24px 24px",
          pointerEvents: "none",
        }}
      />

      {/* SVG edges */}
      <svg style={{ position: "absolute", inset: 0, overflow: "visible", pointerEvents: "none" }}>
        <defs>
          <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
            <path d="M0,0 L0,6 L6,3 Z" fill="rgba(255,255,255,0.25)" />
          </marker>
        </defs>
        {workflow.edges.map(([fromId, toId], i) => {
          const from = nodeMap[fromId];
          const to = nodeMap[toId];
          if (!from || !to) return null;
          const x1 = from.x + 140;
          const y1 = from.y + 22;
          const x2 = to.x;
          const y2 = to.y + 22;
          const mx = (x1 + x2) / 2;
          return (
            <path
              key={i}
              d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
              fill="none"
              stroke={TYPE_COLORS[from.type] || "rgba(255,255,255,0.2)"}
              strokeWidth={1.5}
              strokeOpacity={0.5}
              markerEnd="url(#arrow)"
            />
          );
        })}
      </svg>

      {/* Nodes */}
      {workflow.nodes.map((node) => (
        <div
          key={node.id}
          onClick={() => onSelectNode(node.id)}
          style={{
            position: "absolute",
            left: node.x,
            top: node.y,
            background: "var(--bg2)",
            border: `1px solid ${selectedNode === node.id ? TYPE_COLORS[node.type] : "var(--border2)"}`,
            boxShadow: selectedNode === node.id ? `0 0 0 2px ${TYPE_COLORS[node.type]}33` : "0 4px 16px rgba(0,0,0,0.4)",
            borderRadius: 10,
            padding: "10px 14px",
            cursor: "pointer",
            minWidth: 140,
            transition: "all 0.15s",
          }}
        >
          {/* Type badge */}
          <div
            style={{
              position: "absolute",
              top: -9,
              left: 12,
              fontSize: 9,
              padding: "2px 7px",
              borderRadius: 10,
              fontFamily: "monospace",
              fontWeight: 500,
              background: `${TYPE_COLORS[node.type]}22`,
              color: TYPE_COLORS[node.type],
              border: `1px solid ${TYPE_COLORS[node.type]}44`,
            }}
          >
            {node.type}
          </div>
          <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 3 }}>{node.label}</div>
          <div style={{ fontSize: 10, color: "var(--text2)", fontFamily: "monospace" }}>{node.sub}</div>
        </div>
      ))}
    </div>
  );
}
