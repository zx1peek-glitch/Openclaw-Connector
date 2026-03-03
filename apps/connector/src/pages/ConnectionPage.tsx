import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { createDefaultConfig } from "../types/config";

export function ConnectionPage() {
  const [server, setServer] = useState(createDefaultConfig().server);

  const connect = async () => {
    await invoke("start_tunnel", { server });
  };

  const disconnect = async () => {
    await invoke("stop_tunnel");
  };

  return (
    <section>
      <h2>Connection</h2>
      <label>
        Host
        <input
          aria-label="Host"
          value={server.host}
          onChange={(e) => setServer((prev) => ({ ...prev, host: e.target.value }))}
        />
      </label>
      <label>
        User
        <input
          aria-label="User"
          value={server.user}
          onChange={(e) => setServer((prev) => ({ ...prev, user: e.target.value }))}
        />
      </label>
      <label>
        Key Path
        <input
          aria-label="Key Path"
          value={server.keyPath}
          onChange={(e) => setServer((prev) => ({ ...prev, keyPath: e.target.value }))}
        />
      </label>
      <div>
        <button type="button" onClick={connect}>
          Connect
        </button>
        <button type="button" onClick={disconnect}>
          Disconnect
        </button>
      </div>
    </section>
  );
}
