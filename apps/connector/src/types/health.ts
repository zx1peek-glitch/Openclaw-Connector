export type UiHealthStatus = "online" | "degraded" | "offline";

export interface HealthSummary {
  latencyMs: number;
  tunnelConnected: boolean;
  gatewayOk: boolean;
  consecutiveFailures: number;
}

export function mapHealthSummary(summary: HealthSummary): UiHealthStatus {
  if (summary.consecutiveFailures >= 3) {
    return "offline";
  }
  if (summary.tunnelConnected && summary.gatewayOk) {
    return "online";
  }
  return "degraded";
}
