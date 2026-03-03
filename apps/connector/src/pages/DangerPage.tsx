import { invoke } from "@tauri-apps/api/core";

export function DangerPage() {
  const disconnect = async () => {
    await invoke("emergency_disconnect");
  };

  return (
    <section>
      <h2>Danger Zone</h2>
      <button type="button" onClick={disconnect}>
        Emergency Disconnect
      </button>
    </section>
  );
}
