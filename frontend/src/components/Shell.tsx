"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useWebSocket } from "@/hooks/useWebSocket";
import { useOrchestratorStore } from "@/stores/orchestrator";
import { useAgents } from "@/lib/api";
import "./shell.css";

export default function Shell({ children }: { children: React.ReactNode }) {
    useWebSocket();
    const pathname = usePathname();
    const { wsConnected, liveMessages } = useOrchestratorStore();
    const { agents } = useAgents();

    const runningCount = agents.filter((a) => a.is_active).length;
    const totalCount = agents.length;
    const sessionCount = new Set(liveMessages.map((m) => m.session_id)).size;

    const NAV = [
        {
            href: "/dashboard",
            icon: "◈",
            label: "Dashboard",
            section: "Platform",
        },
        {
            href: "/agents",
            icon: "◉",
            label: "Agents",
            badge: totalCount > 0 ? String(totalCount) : null,
            badgeColor: "",
            section: null,
        },
        {
            href: "/workflows",
            icon: "⬡",
            label: "Workflows",
            badge: "2",
            badgeColor: "green",
            section: null,
        },
        {
            href: "/chat",
            icon: "◎",
            label: "Conversations",
            badge: sessionCount > 0 ? String(sessionCount) : null,
            badgeColor: "orange",
            section: "Communication",
        },
        { href: "/channels", icon: "⊕", label: "Channels", section: null },
        { href: "/monitor", icon: "◌", label: "Monitor", section: "Observe" },
        {
            href: "/logs",
            icon: "≡",
            label: "Logs",
            badge: liveMessages.length > 0 ? String(liveMessages.length) : null,
            badgeColor: "",
            section: null,
        },
        { href: "/settings", icon: "⊙", label: "Settings", section: null },
    ];

    return (
        <div className="app-shell">
            <header className="topbar">
                <div className="logo">
                    <div className="logo-icon">⬡</div>
                    Agent Orch
                </div>
                <div style={{ flex: 1 }} />
                <div
                    className={`status-pill ${wsConnected ? "connected" : "disconnected"}`}
                >
                    <div className="dot" />
                    {wsConnected
                        ? `${runningCount} agent${runningCount !== 1 ? "s" : ""} running`
                        : "Connecting..."}
                </div>
                <Link href="/agents">
                    <button className="btn-secondary" style={{ fontSize: 12 }}>
                        + New Agent
                    </button>
                </Link>
                <Link href="/workflows">
                    <button className="btn-primary" style={{ fontSize: 12 }}>
                        Run Workflow
                    </button>
                </Link>
            </header>

            <div className="main-layout">
                <nav className="sidebar">
                    {NAV.map((item) => (
                        <div key={item.href}>
                            {item.section && (
                                <div className="sidebar-section">
                                    {item.section}
                                </div>
                            )}
                            <Link
                                href={item.href}
                                className={`nav-item ${pathname.startsWith(item.href) ? "active" : ""}`}
                            >
                                <span className="nav-icon">{item.icon}</span>
                                <span>{item.label}</span>
                                {item.badge && (
                                    <span
                                        className={`nav-badge ${item.badgeColor || ""}`}
                                    >
                                        {item.badge}
                                    </span>
                                )}
                            </Link>
                        </div>
                    ))}
                </nav>
                <main className="content">{children}</main>
            </div>
        </div>
    );
}
