import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useActivityStore } from "../store/useActivityStore";
import { useBindingsStore } from "../store/useBindingsStore";

const LOCAL_NODE_ID =
  typeof globalThis.navigator !== "undefined"
    ? globalThis.navigator.userAgent.replace(/.*?(\w+)\)$/, "$1") || "local"
    : "local";

function getLocalNodeId(): string {
  try {
    return window.location.hostname || "local";
  } catch {
    return "local";
  }
}

export function BindingsPage() {
  const [agentId, setAgentId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bindings = useBindingsStore((s) => s.bindings);
  const setBinding = useBindingsStore((s) => s.setBinding);
  const removeBinding = useBindingsStore((s) => s.removeBinding);
  const pushActivity = useActivityStore((s) => s.push);

  const nodeId = LOCAL_NODE_ID;

  const submit = async () => {
    if (!agentId.trim()) return;
    setError(null);
    try {
      await invoke("set_agent_binding", { agentId, nodeId });
      setBinding(agentId, nodeId);
      pushActivity("info", `绑定成功：${agentId} → 本机`);
      setAgentId("");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      pushActivity("error", `绑定失败：${message}`);
    }
  };

  const remove = async (target: string) => {
    setError(null);
    try {
      await invoke("remove_agent_binding", { agentId: target });
      removeBinding(target);
      pushActivity("info", `已删除绑定：${target}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      pushActivity("error", `删除绑定失败：${message}`);
    }
  };

  return (
    <section className="card">
      <div className="card-header">
        <h2>绑定</h2>
      </div>
      <p className="hint">将远程 Agent 绑定到本机，绑定后该 Agent 的任务将由本机执行。</p>

      <div className="form-grid">
        <label>
          Agent 标识
          <input
            aria-label="Agent 标识"
            value={agentId}
            onChange={(e) => setAgentId(e.target.value)}
            placeholder="例如：main"
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </label>
      </div>

      <div className="button-row">
        <button type="button" className="btn btn-primary" onClick={submit} disabled={!agentId.trim()}>
          绑定到本机
        </button>
      </div>

      {error && <p className="error-banner">{error}</p>}

      <ul className="list">
        {Object.keys(bindings).length === 0 && (
          <li className="list-empty">暂无绑定，请添加 Agent 标识。</li>
        )}
        {Object.entries(bindings).map(([agent]) => (
          <li key={agent} className="list-row">
            <code>{agent}</code>
            <span>→ 本机</span>
            <button type="button" className="btn btn-small" onClick={() => remove(agent)}>
              解绑
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
