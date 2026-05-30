"use client";
import Shell from "@/components/Shell";
import { useState } from "react";

export default function ChannelsPage() {
  const [telegramToken, setTelegramToken] = useState("7412***:AAF4***");
  const [assignedAgent, setAssignedAgent] = useState("Aria — Support Agent");

  return (
    <Shell>
      <div className="page-header">
        <div>
          <h1 className="page-title">Channels</h1>
          <p className="page-sub">Connect agents to external messaging platforms</p>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
        {/* Telegram — connected */}
        <div className="card" style={{ borderColor: "rgba(6,182,212,0.4)" }}>
          <div style={{ fontSize: 22, marginBottom: 8 }}>✈️</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Telegram</div>
          <div style={{ fontSize: 11, color: "var(--accent2)", marginBottom: 10 }}>● Connected · @ariabot</div>
          <div style={{ fontSize: 11, color: "var(--text2)", lineHeight: 1.5, marginBottom: 12 }}>
            Aria is reachable via Telegram. Users can message the bot to interact with the agent.
          </div>
          <div className="form-group">
            <div className="form-label">Bot Token</div>
            <input className="form-input" type="password" value={telegramToken} onChange={(e) => setTelegramToken(e.target.value)} />
          </div>
          <div className="form-group" style={{ marginTop: 8 }}>
            <div className="form-label">Assigned Agent</div>
            <select className="form-select" value={assignedAgent} onChange={(e) => setAssignedAgent(e.target.value)}>
              <option>Aria — Support Agent</option>
              <option>Max — Research Agent</option>
              <option>Zoe — Content Writer</option>
            </select>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
            <button className="btn-secondary" style={{ flex: 1, fontSize: 11 }}>Disconnect</button>
            <button className="btn-primary" style={{ flex: 1, fontSize: 11 }}>Test</button>
          </div>
        </div>

        {/* Slack — not connected */}
        <div className="card">
          <div style={{ fontSize: 22, marginBottom: 8 }}>💬</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>Slack</div>
          <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 10 }}>○ Not connected</div>
          <div style={{ fontSize: 11, color: "var(--text2)", lineHeight: 1.5, marginBottom: 12 }}>
            Connect Slack to deploy an agent as a bot in your workspace. Uses socket mode for real-time messaging.
          </div>
          <div className="form-group">
            <div className="form-label">Bot Token</div>
            <input className="form-input" placeholder="xoxb-your-bot-token" />
          </div>
          <div className="form-group" style={{ marginTop: 8 }}>
            <div className="form-label">App Token (Socket Mode)</div>
            <input className="form-input" placeholder="xapp-your-app-token" />
          </div>
          <button className="btn-primary" style={{ width: "100%", fontSize: 12, marginTop: 12 }}>Connect via OAuth</button>
        </div>

        {/* WhatsApp — not connected */}
        <div className="card">
          <div style={{ fontSize: 22, marginBottom: 8 }}>💚</div>
          <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>WhatsApp</div>
          <div style={{ fontSize: 11, color: "var(--text3)", marginBottom: 10 }}>○ Not connected</div>
          <div style={{ fontSize: 11, color: "var(--text2)", lineHeight: 1.5, marginBottom: 12 }}>
            Connect via Twilio or Meta's Business API. Requires WhatsApp Business Account approval.
          </div>
          <div className="form-group">
            <div className="form-label">Provider</div>
            <select className="form-select">
              <option>Twilio</option>
              <option>Meta Cloud API</option>
            </select>
          </div>
          <div className="form-group" style={{ marginTop: 8 }}>
            <div className="form-label">Account SID / Token</div>
            <input className="form-input" placeholder="ACxxxxxxxxxxxx" />
          </div>
          <button className="btn-secondary" style={{ width: "100%", fontSize: 12, marginTop: 12 }}>Setup via Twilio</button>
        </div>
      </div>

      {/* Webhook table */}
      <div className="section-divider" style={{ margin: "20px 0 12px" }}>
        <div className="section-divider-line" />
        <div className="section-divider-text">Webhook Endpoints</div>
        <div className="section-divider-line" />
      </div>

      <div className="card">
        <div className="card-title" style={{ marginBottom: 10 }}>Inbound Webhook URLs</div>
        <table className="data-table">
          <thead>
            <tr><th>Channel</th><th>Endpoint</th><th>Secret</th><th>Events</th><th>Status</th></tr>
          </thead>
          <tbody>
            <tr>
              <td>Telegram</td>
              <td style={{ fontFamily: "monospace", fontSize: 11 }}>POST /webhooks/telegram</td>
              <td style={{ fontFamily: "monospace", fontSize: 11 }}>tg_***</td>
              <td>message, callback</td>
              <td style={{ color: "var(--accent2)" }}>Active</td>
            </tr>
            <tr>
              <td>Slack</td>
              <td style={{ fontFamily: "monospace", fontSize: 11 }}>POST /webhooks/slack</td>
              <td style={{ fontFamily: "monospace", fontSize: 11 }}>—</td>
              <td>—</td>
              <td style={{ color: "var(--text3)" }}>Inactive</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
