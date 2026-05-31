export interface WorkflowNode {
  id: string;
  type: "trigger" | "agent" | "condition" | "action";
  label: string;
  sub: string;
  x: number;
  y: number;
  config?: Record<string, unknown>;
}

export interface WorkflowDef {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: [string, string][];
}

export const WORKFLOWS: WorkflowDef[] = [
  {
    id: "research_summarize_publish",
    name: "Research Pipeline",
    nodes: [
      { id: "t1", type: "trigger", label: "Telegram Message", sub: "channel: telegram", x: 30, y: 155, config: { channel: "telegram" } },
      { id: "a1", type: "agent", label: "Support / Triage Agent", sub: "classify intent", x: 215, y: 155, config: { role: "support" } },
      { id: "c1", type: "condition", label: "Is research?", sub: "'research' in state.output.lower()", x: 395, y: 155, config: { expression: "'research' in state.output.lower()" } },
      { id: "a2", type: "agent", label: "Research Agent", sub: "web_search + summarize", x: 395, y: 290, config: { role: "research" } },
      { id: "a3", type: "agent", label: "Writer Agent", sub: "write response", x: 590, y: 290, config: { role: "writer" } },
      { id: "act1", type: "action", label: "Send to Telegram", sub: "deliver result", x: 590, y: 155, config: { action: "send_message", channel: "telegram" } },
    ],
    edges: [["t1","a1"],["a1","c1"],["c1","act1"],["c1","a2"],["a2","a3"],["a3","act1"]],
  },
  {
    id: "support_triage",
    name: "Support Triage",
    nodes: [
      { id: "t1", type: "trigger", label: "Inbound Message", sub: "any channel", x: 30, y: 175 },
      { id: "a1", type: "agent", label: "Support / Triage Agent", sub: "triage + classify", x: 215, y: 175, config: { role: "support" } },
      { id: "c1", type: "condition", label: "Urgent?", sub: "'urgent' in state.output.lower()", x: 415, y: 175, config: { expression: "'urgent' in state.output.lower() or 'emergency' in state.output.lower()" } },
      { id: "a2", type: "agent", label: "Escalation Agent", sub: "escalate to human", x: 415, y: 305, config: { role: "escalation" } },
      { id: "act1", type: "action", label: "Auto-Reply", sub: "send resolution", x: 590, y: 175, config: { action: "send_message" } },
    ],
    edges: [["t1","a1"],["a1","c1"],["c1","act1"],["c1","a2"],["a2","act1"]],
  },
];
