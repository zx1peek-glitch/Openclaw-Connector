export type TunnelState = "disconnected" | "connecting" | "connected" | "reconnecting";

export type TunnelStatus = {
  state: TunnelState;
  reconnectAttempts: number;
  lastError: string | null;
};
