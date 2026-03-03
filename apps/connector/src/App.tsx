import { useState } from "react";
import { ActivityPage } from "./pages/ActivityPage";
import { BindingsPage } from "./pages/BindingsPage";
import { ConnectionPage } from "./pages/ConnectionPage";
import { DangerPage } from "./pages/DangerPage";
import { HealthPage } from "./pages/HealthPage";
import type { HealthSummary } from "./types/health";

const defaultHealth: HealthSummary = {
  latencyMs: 0,
  tunnelConnected: false,
  gatewayOk: false,
  consecutiveFailures: 0
};

const tabs = ["connection", "bindings", "health", "activity", "danger"] as const;
type Tab = (typeof tabs)[number];

export default function App() {
  const [tab, setTab] = useState<Tab>("connection");

  return (
    <main>
      <h1>OpenClaw Connector</h1>
      <nav>
        {tabs.map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>

      {tab === "connection" && <ConnectionPage />}
      {tab === "bindings" && <BindingsPage />}
      {tab === "health" && <HealthPage summary={defaultHealth} />}
      {tab === "activity" && <ActivityPage entries={[]} />}
      {tab === "danger" && <DangerPage />}
    </main>
  );
}
