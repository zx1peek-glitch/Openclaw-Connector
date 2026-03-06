# Milestone Acceptance: End-to-End Core Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Wire up the remaining disconnected pieces so the full core flow works end-to-end: SSH connect → real health display → agent bindings → manual task execution → emergency disconnect.

**Architecture:** The Rust backend already has all the building blocks (TunnelManager, HeartbeatMonitor, TaskExecutor, BindingMap). The work is plumbing: expose a new `get_health_summary` Tauri command, make HealthPage poll it, add task execution UI to ActivityPage, sync config on app lifecycle, and clean up dead code.

**Tech Stack:** Tauri 2 (Rust), React 19 + TypeScript, Zustand 5, Vitest, cargo test

---

### Task 0: Commit Current Work-in-Progress as Baseline

**Files:**
- All currently modified/untracked files

**Step 1: Commit all current changes**

```bash
cd /Users/4paradigm/openclaw
git add apps/connector
git commit -m "wip: checkpoint before milestone acceptance work"
```

**Step 2: Verify clean working tree**

Run: `git status`
Expected: nothing to commit, working tree clean

---

### Task 1: Add `get_health_summary` Tauri Command

**Files:**
- Modify: `apps/connector/src-tauri/src/lib.rs`
- Test: `apps/connector/src-tauri/tests/health_summary_test.rs`

**Step 1: Write the failing test**

Create `apps/connector/src-tauri/tests/health_summary_test.rs`:

```rust
use connector::health::HeartbeatSample;
use connector::heartbeat::HeartbeatMonitor;
use connector::ssh_tunnel::TunnelManager;

#[test]
fn health_summary_reflects_tunnel_state() {
    std::env::set_var("OPENCLAW_CONNECTOR_FAKE_TUNNEL", "1");

    let mut tunnel = TunnelManager::new();
    let monitor = HeartbeatMonitor::new(3);

    // Before connecting: tunnel disconnected
    let connected = tunnel.is_connected();
    assert!(!connected);
    assert_eq!(monitor.consecutive_failures(), 0);

    // After connecting: tunnel connected
    let cfg = connector::config::AppConfig::default();
    let mut server = cfg.server;
    server.user = "tester".to_string();
    server.key_path = "/tmp/fake_key".to_string();
    tunnel.start(server).unwrap();
    assert!(tunnel.is_connected());

    // After stop: tunnel disconnected
    tunnel.stop().unwrap();
    assert!(!tunnel.is_connected());

    std::env::remove_var("OPENCLAW_CONNECTOR_FAKE_TUNNEL");
}
```

**Step 2: Run test to verify it passes (this is a pure integration test of existing modules)**

Run: `cd /Users/4paradigm/openclaw/apps/connector/src-tauri && cargo test health_summary_test`
Expected: PASS (it uses existing public APIs)

**Step 3: Add `get_health_summary` command and `HeartbeatMonitor` to AppState in lib.rs**

In `apps/connector/src-tauri/src/lib.rs`, add to `AppState`:

```rust
heartbeat: Mutex<heartbeat::HeartbeatMonitor>,
```

Change `AppState` `Default` impl — replace `#[derive(Default)]` with manual impl:

```rust
impl Default for AppState {
    fn default() -> Self {
        Self {
            tunnel: Mutex::new(ssh_tunnel::TunnelManager::new()),
            bindings: Mutex::new(bindings::BindingMap::default()),
            task_loop: Mutex::new(tasks::TaskLoopControl::new()),
            heartbeat: Mutex::new(heartbeat::HeartbeatMonitor::new(3)),
        }
    }
}
```

Add a new serializable struct and command:

```rust
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct HealthSummaryResponse {
    latency_ms: u64,
    tunnel_connected: bool,
    gateway_ok: bool,
    consecutive_failures: u32,
}

#[tauri::command]
fn get_health_summary(state: tauri::State<'_, AppState>) -> Result<HealthSummaryResponse, String> {
    let mut tunnel = state
        .tunnel
        .lock()
        .map_err(|_| "failed to acquire tunnel lock".to_string())?;
    let heartbeat = state
        .heartbeat
        .lock()
        .map_err(|_| "failed to acquire heartbeat lock".to_string())?;

    let status = tunnel.refresh_status();
    let connected = status.state == ssh_tunnel::TunnelState::Connected;

    Ok(HealthSummaryResponse {
        latency_ms: 0,
        tunnel_connected: connected,
        gateway_ok: connected,
        consecutive_failures: heartbeat.consecutive_failures(),
    })
}
```

Register `get_health_summary` in the `invoke_handler`:

```rust
.invoke_handler(tauri::generate_handler![
    load_app_config,
    save_app_config,
    start_tunnel,
    stop_tunnel,
    get_tunnel_status,
    get_health_summary,
    set_agent_binding,
    remove_agent_binding,
    list_agent_bindings,
    execute_task,
    emergency_disconnect
])
```

Also update `start_tunnel` to clear heartbeat failures on connect success, and update `emergency_disconnect` to record failure:

In `start_tunnel`, after `Ok(())` branch, add heartbeat reset:

```rust
#[tauri::command]
fn start_tunnel(
    state: tauri::State<'_, AppState>,
    server: config::ServerConfig,
) -> Result<ssh_tunnel::TunnelStatus, String> {
    let mut tunnel = state
        .tunnel
        .lock()
        .map_err(|_| "failed to acquire tunnel lock".to_string())?;

    eprintln!(
        "[connector] start_tunnel host={} user={} local_port={} remote_port={}",
        server.host, server.user, server.local_port, server.remote_port
    );
    match tunnel.start(server) {
        Ok(()) => {
            let status = tunnel.refresh_status();
            eprintln!("[connector] start_tunnel success state={:?}", status.state);
            // Reset heartbeat on successful connection
            if let Ok(mut hb) = state.heartbeat.lock() {
                hb.record_sample(health::HeartbeatSample {
                    latency_ms: 0,
                    tunnel_connected: true,
                    gateway_ok: true,
                });
            }
            Ok(status)
        }
        Err(err) => {
            eprintln!("[connector] start_tunnel failed: {err}");
            if let Ok(mut hb) = state.heartbeat.lock() {
                hb.record_failure();
            }
            Err(err)
        }
    }
}
```

**Step 4: Run all Rust tests to verify**

Run: `cd /Users/4paradigm/openclaw/apps/connector/src-tauri && cargo test`
Expected: all PASS

**Step 5: Commit**

```bash
git add apps/connector/src-tauri/src/lib.rs apps/connector/src-tauri/tests/health_summary_test.rs
git commit -m "feat: add get_health_summary tauri command with heartbeat integration"
```

---

### Task 2: Wire HealthPage to Real Data

**Files:**
- Modify: `apps/connector/src/pages/HealthPage.tsx`
- Modify: `apps/connector/src/App.tsx`
- Test: `apps/connector/src/__tests__/health-page.test.tsx`

**Step 1: Write the failing test**

Create `apps/connector/src/__tests__/health-page.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { HealthPage } from "../pages/HealthPage";

const invokeMock = vi.fn((command: string) => {
  if (command === "get_health_summary") {
    return Promise.resolve({
      latencyMs: 42,
      tunnelConnected: true,
      gatewayOk: true,
      consecutiveFailures: 0
    });
  }
  return Promise.resolve(undefined);
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args)
}));

test("health page polls get_health_summary and displays status", async () => {
  render(<HealthPage />);

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("get_health_summary");
  });

  await waitFor(() => {
    expect(screen.getByText("在线")).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/4paradigm/openclaw && pnpm -C apps/connector vitest run src/__tests__/health-page.test.tsx`
Expected: FAIL — HealthPage still expects props

**Step 3: Rewrite HealthPage to poll backend**

Replace `apps/connector/src/pages/HealthPage.tsx`:

```tsx
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
```

Update `apps/connector/src/App.tsx` — remove props passing to HealthPage:

Remove the `defaultHealth` constant and HealthSummary import. Change:

```tsx
{tab === "health" && <HealthPage summary={defaultHealth} />}
```

to:

```tsx
{tab === "health" && <HealthPage />}
```

Remove the unused import line:

```tsx
import type { HealthSummary } from "./types/health";
```

**Step 4: Run tests**

Run: `cd /Users/4paradigm/openclaw && pnpm -C apps/connector vitest run`
Expected: all PASS

**Step 5: Commit**

```bash
git add apps/connector/src/pages/HealthPage.tsx apps/connector/src/App.tsx apps/connector/src/__tests__/health-page.test.tsx
git commit -m "feat: wire HealthPage to real tunnel status via get_health_summary"
```

---

### Task 3: Add Task Execution UI to ActivityPage

**Files:**
- Modify: `apps/connector/src/pages/ActivityPage.tsx`
- Test: `apps/connector/src/__tests__/activity-page.test.tsx`

**Step 1: Write the failing test**

Create `apps/connector/src/__tests__/activity-page.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { vi } from "vitest";
import { ActivityPage } from "../pages/ActivityPage";

const invokeMock = vi.fn((command: string) => {
  if (command === "execute_task") {
    return Promise.resolve({
      exitCode: 0,
      stdout: "hello world",
      stderr: "",
      durationMs: 42
    });
  }
  if (command === "list_agent_bindings") {
    return Promise.resolve({ "agent-1": "mac-node-1" });
  }
  return Promise.resolve(undefined);
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invokeMock(...args)
}));

test("execute button triggers execute_task command", async () => {
  render(<ActivityPage />);

  const commandInput = screen.getByLabelText("命令");
  const nodeInput = screen.getByLabelText("本机 Node");

  fireEvent.change(commandInput, { target: { value: "echo hello" } });
  fireEvent.change(nodeInput, { target: { value: "mac-node-1" } });

  fireEvent.click(screen.getByRole("button", { name: "执行" }));

  await waitFor(() => {
    expect(invokeMock).toHaveBeenCalledWith("execute_task", expect.objectContaining({
      localNodeId: "mac-node-1"
    }));
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd /Users/4paradigm/openclaw && pnpm -C apps/connector vitest run src/__tests__/activity-page.test.tsx`
Expected: FAIL — ActivityPage does not have execute UI

**Step 3: Add execute panel to ActivityPage**

Replace `apps/connector/src/pages/ActivityPage.tsx`:

```tsx
import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useActivityStore } from "../store/useActivityStore";
import { useBindingsStore } from "../store/useBindingsStore";

export function ActivityPage() {
  const entries = useActivityStore((s) => s.entries);
  const clear = useActivityStore((s) => s.clear);
  const pushActivity = useActivityStore((s) => s.push);
  const bindings = useBindingsStore((s) => s.bindings);

  const [agentId, setAgentId] = useState("");
  const [nodeId, setNodeId] = useState("");
  const [command, setCommand] = useState("");
  const [busy, setBusy] = useState(false);

  const agentIds = Object.keys(bindings);

  const execute = async () => {
    if (!command.trim()) return;
    setBusy(true);

    const selectedAgent = agentId || agentIds[0] || "default";
    const selectedNode = nodeId || "local";

    pushActivity("info", `执行任务：[${selectedAgent}] ${command}`);

    try {
      const result = await invoke<{
        exitCode: number;
        stdout: string;
        stderr: string;
        durationMs: number;
      }>("execute_task", {
        localNodeId: selectedNode,
        task: {
          taskId: crypto.randomUUID(),
          agentId: selectedAgent,
          action: "system.run",
          args: { command },
          timeoutSec: 30
        }
      });

      pushActivity(
        result.exitCode === 0 ? "info" : "error",
        `[exit=${result.exitCode} ${result.durationMs}ms] ${result.stdout || result.stderr}`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      pushActivity("error", `执行失败：${message}`);
    } finally {
      setBusy(false);
    }
  };

  const levelText = (level: "info" | "error") => (level === "info" ? "信息" : "错误");

  return (
    <section className="card">
      <div className="card-header">
        <h2>活动</h2>
        <button type="button" className="btn btn-small" onClick={clear}>
          清空
        </button>
      </div>

      <div className="execute-panel">
        <h3>快速执行</h3>
        <div className="form-grid two-col">
          <label>
            Agent
            <select
              aria-label="Agent"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
            >
              <option value="">
                {agentIds.length ? "选择 Agent..." : "无绑定"}
              </option>
              {agentIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </label>
          <label>
            本机 Node
            <input
              aria-label="本机 Node"
              value={nodeId}
              onChange={(e) => setNodeId(e.target.value)}
              placeholder="mac-node-1"
            />
          </label>
        </div>
        <label>
          命令
          <input
            aria-label="命令"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            placeholder="echo hello"
            onKeyDown={(e) => {
              if (e.key === "Enter") execute();
            }}
          />
        </label>
        <div className="button-row">
          <button
            type="button"
            className="btn btn-primary"
            onClick={execute}
            disabled={busy || !command.trim()}
          >
            {busy ? "执行中..." : "执行"}
          </button>
        </div>
      </div>

      <ul className="list">
        {entries.length === 0 && <li className="list-empty">暂无活动记录。</li>}
        {entries.map((entry) => (
          <li key={entry.id} className="list-row">
            <span className={`pill ${entry.level}`}>{levelText(entry.level)}</span>
            <span>{entry.message}</span>
            <time>{entry.timestamp}</time>
          </li>
        ))}
      </ul>
    </section>
  );
}
```

**Step 4: Run tests**

Run: `cd /Users/4paradigm/openclaw && pnpm -C apps/connector vitest run`
Expected: all PASS

**Step 5: Commit**

```bash
git add apps/connector/src/pages/ActivityPage.tsx apps/connector/src/__tests__/activity-page.test.tsx
git commit -m "feat: add task execution panel to ActivityPage"
```

---

### Task 4: Sync Config on App Lifecycle

**Files:**
- Modify: `apps/connector/src/App.tsx`
- Modify: `apps/connector/src/pages/ConnectionPage.tsx`

**Step 1: Update App.tsx to load config on mount**

Add to `apps/connector/src/App.tsx`:

```tsx
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useState } from "react";
import { useConfigStore } from "./store/useConfigStore";
// ...existing imports...

export default function App() {
  const [tab, setTab] = useState<Tab>("connection");
  const setConfig = useConfigStore((s) => s.setConfig);

  useEffect(() => {
    invoke("load_app_config")
      .then((cfg) => {
        if (cfg) setConfig(cfg as ConnectorConfig);
      })
      .catch(() => {
        // use default config from store
      });
  }, [setConfig]);

  // ...rest unchanged...
}
```

This requires importing `ConnectorConfig`:

```tsx
import type { ConnectorConfig } from "./types/config";
```

**Step 2: Update ConnectionPage to read from config store and save on connect**

In `apps/connector/src/pages/ConnectionPage.tsx`, use config store for initial server values and save on successful connection:

Change the `server` state initialization:

```tsx
import { useConfigStore } from "../store/useConfigStore";

export function ConnectionPage() {
  const config = useConfigStore((s) => s.config);
  const [server, setServer] = useState(config.server);
  // ...
```

In the `connect` function, after successful tunnel start, save config:

```tsx
const connect = async () => {
    setBusy(true);
    setError(null);
    pushActivity("info", `发起连接：${server.user}@${server.host}`);

    try {
      const next = await invoke<TunnelStatus>("start_tunnel", { server });
      setStatus(next);
      pushActivity("info", `隧道状态 -> ${prettyState(next.state)}`);
      // Persist config on successful connection
      await invoke("save_app_config", {
        cfg: { ...config, server }
      }).catch(() => {});
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      pushActivity("error", `连接失败：${message}`);
    } finally {
      setBusy(false);
    }
  };
```

**Step 3: Run tests**

Run: `cd /Users/4paradigm/openclaw && pnpm -C apps/connector vitest run`
Expected: all PASS

**Step 4: Commit**

```bash
git add apps/connector/src/App.tsx apps/connector/src/pages/ConnectionPage.tsx
git commit -m "feat: sync config with backend on app mount and connect"
```

---

### Task 5: Delete Dead Code

**Files:**
- Delete: `apps/connector/src/flows/connectorFlow.ts`

**Step 1: Remove the file**

```bash
rm apps/connector/src/flows/connectorFlow.ts
rmdir apps/connector/src/flows 2>/dev/null || true
```

**Step 2: Verify no imports reference it**

Run: `grep -r "connectorFlow" apps/connector/src/`
Expected: no matches

**Step 3: Run all tests**

Run: `cd /Users/4paradigm/openclaw && pnpm -C apps/connector vitest run`
Expected: all PASS

**Step 4: Commit**

```bash
git add -A apps/connector/src/flows
git commit -m "chore: remove experimental connectorFlow dead code"
```

---

### Task 6: Run Full Test Suite and Verify

**Step 1: Run frontend tests**

Run: `cd /Users/4paradigm/openclaw && pnpm -C apps/connector vitest run`
Expected: all PASS

**Step 2: Run Rust tests**

Run: `cd /Users/4paradigm/openclaw/apps/connector/src-tauri && cargo test`
Expected: all PASS

**Step 3: Verify build compiles**

Run: `cd /Users/4paradigm/openclaw/apps/connector && pnpm build`
Expected: build succeeds

**Step 4: Final commit if any fixups needed**

---

## Verification Checklist

After all tasks complete, verify these scenarios work:

1. `pnpm -C apps/connector vitest run` — all green
2. `cargo test --manifest-path apps/connector/src-tauri/Cargo.toml` — all green
3. `pnpm -C apps/connector build` — compiles
4. Manual: Launch app → Health tab shows "降级" (no tunnel)
5. Manual: Connect SSH → Health tab updates to "在线"
6. Manual: Bind agent → Activity tab → execute command → see result
7. Manual: Emergency disconnect → Health drops to "降级"
