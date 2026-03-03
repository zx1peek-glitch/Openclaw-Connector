import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useBindingsStore } from "../store/useBindingsStore";

export function BindingsPage() {
  const [agentId, setAgentId] = useState("");
  const [nodeId, setNodeId] = useState("");
  const bindings = useBindingsStore((s) => s.bindings);
  const setBinding = useBindingsStore((s) => s.setBinding);

  const submit = async () => {
    await invoke("set_agent_binding", { agentId, nodeId });
    setBinding(agentId, nodeId);
  };

  return (
    <section>
      <h2>Bindings</h2>
      <label>
        Agent ID
        <input aria-label="Agent ID" value={agentId} onChange={(e) => setAgentId(e.target.value)} />
      </label>
      <label>
        Node ID
        <input aria-label="Node ID" value={nodeId} onChange={(e) => setNodeId(e.target.value)} />
      </label>
      <button type="button" onClick={submit}>
        Set Binding
      </button>
      <ul>
        {Object.entries(bindings).map(([agent, node]) => (
          <li key={agent}>
            {agent}: {node}
          </li>
        ))}
      </ul>
    </section>
  );
}
