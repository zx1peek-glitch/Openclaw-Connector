import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useActivityStore } from "../store/useActivityStore";

export function DangerPage() {
  const [error, setError] = useState<string | null>(null);
  const pushActivity = useActivityStore((s) => s.push);

  const disconnect = async () => {
    setError(null);
    try {
      await invoke("emergency_disconnect");
      pushActivity("info", "已执行紧急断开");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      pushActivity("error", `紧急断开失败：${message}`);
    }
  };

  return (
    <section className="card danger-card">
      <div className="card-header">
        <h2>危险操作</h2>
      </div>
      <p className="hint">立即断开隧道并停止本地任务循环。</p>
      <button type="button" className="btn btn-danger" onClick={disconnect}>
        紧急断开
      </button>
      {error && <p className="error-banner">{error}</p>}
    </section>
  );
}
