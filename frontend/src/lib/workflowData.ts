export interface WorkflowNode {
  id: string;
  type: "trigger" | "agent" | "condition" | "action";
  label: string;
  sub: string;
  x: number;
  y: number;
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
      { id: "t1", type: "trigger", label: "Telegram Message", sub: "@ariabot", x: 30, y: 155 },
      { id: "a1", type: "agent", label: "Aria", sub: "classify intent", x: 215, y: 155 },
      { id: "c1", type: "condition", label: "Is research?", sub: "intent == research", x: 395, y: 155 },
      { id: "a2", type: "agent", label: "Max", sub: "web_search + summarize", x: 395, y: 290 },
      { id: "a3", type: "agent", label: "Zoe", sub: "write response", x: 590, y: 290 },
      { id: "act1", type: "action", label: "Send to Telegram", sub: "deliver result", x: 590, y: 155 },
    ],
    edges: [["t1","a1"],["a1","c1"],["c1","act1"],["c1","a2"],["a2","a3"],["a3","act1"]],
  },
  {
    id: "support_triage",
    name: "Support Triage",
    nodes: [
      { id: "t1", type: "trigger", label: "Inbound Message", sub: "any channel", x: 30, y: 175 },
      { id: "a1", type: "agent", label: "Aria", sub: "triage + classify", x: 215, y: 175 },
      { id: "c1", type: "condition", label: "Urgent?", sub: "priority check", x: 415, y: 175 },
      { id: "a2", type: "agent", label: "Kai", sub: "escalate to human", x: 415, y: 305 },
      { id: "act1", type: "action", label: "Auto-Reply", sub: "send resolution", x: 590, y: 175 },
    ],
    edges: [["t1","a1"],["a1","c1"],["c1","act1"],["c1","a2"],["a2","act1"]],
  },
];
