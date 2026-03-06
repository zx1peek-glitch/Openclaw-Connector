import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useActivityStore } from "../store/useActivityStore";
import { useBindingsStore } from "../store/useBindingsStore";

export function BindingsPage() {
  const [agentId, setAgentId] = useState("");
  const [nodeId, setNodeId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const bindings = useBindingsStore((s) => s.bindings);
  const setBinding = useBindingsStore((s) => s.setBinding);
  const removeBinding = useBindingsStore((s) => s.removeBinding);
  const pushActivity = useActivityStore((s) => s.push);

  const submit = async () => {
    setError(null);
    try {
      await invoke("set_agent_binding", { agentId, nodeId });
      setBinding(agentId, nodeId);
      pushActivity("info", `绑定成功：${agentId} -> ${nodeId}`);
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

      <div className="form-grid two-col">
        <label>
          Agent 标识
          <input aria-label="Agent 标识" value={agentId} onChange={(e) => setAgentId(e.target.value)} />
        </label>
        <label>
          Node 标识
          <input aria-label="Node 标识" value={nodeId} onChange={(e) => setNodeId(e.target.value)} />
        </label>
      </div>

      <div className="button-row">
        <button type="button" className="btn btn-primary" onClick={submit}>
          保存绑定
        </button>
      </div>

      {error && <p className="error-banner">{error}</p>}

      <ul className="list">
        {Object.entries(bindings).map(([agent, node]) => (
          <li key={agent} className="list-row">
            <code>{agent}</code>
            <span>{node}</span>
            <button type="button" className="btn btn-small" onClick={() => remove(agent)}>
              删除
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
