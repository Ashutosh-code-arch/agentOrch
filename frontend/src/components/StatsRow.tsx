"use client";

const COLOR_MAP: Record<string, string> = {
  accent: "var(--accent)",
  green: "var(--accent2)",
  orange: "var(--accent3)",
  cyan: "var(--accent4)",
  red: "#ef4444",
};

interface Stat { label: string; value: string; color?: string; }

export default function StatsRow({ stats }: { stats: Stat[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${stats.length}, 1fr)`, gap: 12, marginBottom: 20 }}>
      {stats.map((s) => (
        <div key={s.label} style={{ background: "var(--bg2)", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 11, color: "var(--text2)", marginBottom: 6, fontWeight: 500, textTransform: "uppercase", letterSpacing: "0.5px" }}>
            {s.label}
          </div>
          <div style={{ fontSize: 22, fontWeight: 700, fontFamily: "monospace", color: COLOR_MAP[s.color || "accent"] }}>
            {s.value}
          </div>
        </div>
      ))}
    </div>
  );
}
