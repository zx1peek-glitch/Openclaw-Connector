import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { mapHealthSummary, type HealthSummary } from "../types/health";

const defaultSummary: HealthSummary = {
  latencyMs: 0,
  tunnelConnected: false,
  gatewayOk: false,
  consecutiveFailures: 0
};

export function HealthPage() {
  const [summary, setSummary] = useState<HealthSummary>(defaultSummary);

  useEffect(() => {
    const poll = async () => {
      try {
        const data = await invoke<HealthSummary>("get_health_summary");
        setSummary(data);
      } catch {
        // keep last known state
      }
    };

    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, []);

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
