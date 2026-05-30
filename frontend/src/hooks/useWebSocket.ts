/**
 * useWebSocket — connects to the backend WS log stream.
 * Dispatches incoming agent messages to the Zustand store.
 */
import { useEffect, useRef, useCallback } from "react";
import { useOrchestratorStore, AgentMessage } from "../stores/orchestrator";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws/logs";
const RECONNECT_DELAY_MS = 3000;

export function useWebSocket() {
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectTimer = useRef<ReturnType<typeof setTimeout>>();
    const { addLiveMessage, setWsConnected } = useOrchestratorStore();

    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) return;

        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
            setWsConnected(true);
            console.log("[WS] Connected to Agent Orch log stream");
        };

        ws.onmessage = (event) => {
            try {
                const payload = JSON.parse(event.data);
                if (
                    payload.type === "agent_message" ||
                    payload.type === "history"
                ) {
                    addLiveMessage(payload.data as AgentMessage);
                }
                // keepalive — ignore
            } catch {
                // ignore malformed messages
            }
        };

        ws.onclose = () => {
            setWsConnected(false);
            console.log(
                "[WS] Disconnected; reconnecting in",
                RECONNECT_DELAY_MS,
                "ms",
            );
            reconnectTimer.current = setTimeout(connect, RECONNECT_DELAY_MS);
        };

        ws.onerror = (e) => {
            console.warn("[WS] Error:", e);
            ws.close();
        };
    }, [addLiveMessage, setWsConnected]);

    // Heartbeat — send ping every 25s to keep connection alive
    useEffect(() => {
        const ping = setInterval(() => {
            if (wsRef.current?.readyState === WebSocket.OPEN) {
                wsRef.current.send(JSON.stringify({ type: "ping" }));
            }
        }, 25_000);

        connect();

        return () => {
            clearInterval(ping);
            clearTimeout(reconnectTimer.current);
            wsRef.current?.close();
        };
    }, [connect]);

    const send = useCallback((data: unknown) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(data));
        }
    }, []);

    return { send };
}
