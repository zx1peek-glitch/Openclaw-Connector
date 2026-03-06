import { mapHealthSummary, type HealthSummary } from "../types/health";

type HealthPageProps = {
  summary: HealthSummary;
};

export function HealthPage({ summary }: HealthPageProps) {
  const status = mapHealthSummary(summary);
  const statusText = {
    online: "在线",
    degraded: "降级",
    offline: "离线"
  }[status];

  return (
    <section className="card">
      <div className="card-header">
        <h2>健康</h2>
        <span className={`pill ${status === "online" ? "info" : "error"}`}>{statusText}</span>
      </div>
      <div className="metrics">
        <div>
          <strong>延迟</strong>
          <p>{summary.latencyMs} ms</p>
        </div>
        <div>
          <strong>隧道</strong>
          <p>{summary.tunnelConnected ? "正常" : "断开"}</p>
        </div>
        <div>
          <strong>网关</strong>
          <p>{summary.gatewayOk ? "健康" : "未知"}</p>
        </div>
        <div>
          <strong>失败次数</strong>
          <p>{summary.consecutiveFailures}</p>
        </div>
      </div>
    </section>
  );
}
