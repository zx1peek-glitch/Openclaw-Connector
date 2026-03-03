# OpenClaw Mac Connector MVP Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a macOS Tauri 2 + React desktop connector that securely connects to one Linux OpenClaw gateway via SSH tunnel, monitors health/heartbeat, and executes remote tasks on the local Mac with per-agent bindings.

**Architecture:** The app has a React UI shell and a Rust core in Tauri. Rust owns SSH tunnel lifecycle, heartbeat checks, task polling/execution, and local state; React owns configuration, status visualization, bindings management, and emergency controls. The connector accepts only one server profile and uses global execution allow mode (`global_allow=true`) in MVP.

**Tech Stack:** Tauri 2 (Rust), React + TypeScript + Vite, Zustand, Vitest, Rust test harness (`cargo test`), optional Playwright for smoke E2E.

## Scope Constraints (Locked)

- Single remote server profile only (no multi-server switch).
- Per-agent binding (`agent_id -> local_node_id`) supported.
- Execution policy in MVP is `global_allow=true` with no deny list.
- Gateway should stay private (loopback on server side, SSH local forward on client side).
- Platform target for this phase is macOS only.

### Task 1: Bootstrap Tauri + React Workspace

**Files:**
- Create: `apps/connector/package.json`
- Create: `apps/connector/vite.config.ts`
- Create: `apps/connector/src/main.tsx`
- Create: `apps/connector/src/App.tsx`
- Create: `apps/connector/src-tauri/Cargo.toml`
- Create: `apps/connector/src-tauri/src/main.rs`
- Create: `apps/connector/src-tauri/tauri.conf.json`
- Test: `apps/connector/src/__tests__/app-shell.test.tsx`

**Step 1: Write the failing UI smoke test**

```ts
import { render, screen } from "@testing-library/react";
import App from "../App";

test("renders connector shell", () => {
  render(<App />);
  expect(screen.getByText("OpenClaw Connector")).toBeInTheDocument();
});
```

**Step 2: Run test to verify it fails**

Run: `cd apps/connector && pnpm vitest run src/__tests__/app-shell.test.tsx`
Expected: FAIL because app/test setup does not exist.

**Step 3: Scaffold minimal app and test config**

```tsx
export default function App() {
  return <h1>OpenClaw Connector</h1>;
}
```

**Step 4: Run test to verify it passes**

Run: `cd apps/connector && pnpm vitest run src/__tests__/app-shell.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/connector
git commit -m "chore: scaffold tauri react connector shell"
```

### Task 2: Add Single-Server Config Model + Persistence

**Files:**
- Create: `apps/connector/src/types/config.ts`
- Create: `apps/connector/src/store/useConfigStore.ts`
- Create: `apps/connector/src-tauri/src/config.rs`
- Modify: `apps/connector/src-tauri/src/main.rs`
- Test: `apps/connector/src/__tests__/config-store.test.ts`
- Test: `apps/connector/src-tauri/tests/config_test.rs`

**Step 1: Write failing tests for config schema and persistence**

```ts
test("accepts exactly one server profile", () => {
  const cfg = createDefaultConfig();
  expect(cfg.server.host).toBeDefined();
});
```

```rust
#[test]
fn loads_and_saves_single_server_config() {
    let cfg = AppConfig::default();
    assert!(!cfg.server.host.is_empty());
}
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/connector && pnpm vitest run src/__tests__/config-store.test.ts && cd src-tauri && cargo test config_test`
Expected: FAIL due to missing config implementation.

**Step 3: Implement minimal config model and Tauri command bridge**

```rust
#[derive(Serialize, Deserialize, Clone)]
pub struct ServerConfig {
    pub host: String,
    pub user: String,
    pub key_path: String,
    pub local_port: u16,
    pub remote_port: u16,
}
```

**Step 4: Run tests to verify pass**

Run: `cd apps/connector && pnpm vitest run src/__tests__/config-store.test.ts && cd src-tauri && cargo test config_test`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/connector/src apps/connector/src-tauri
git commit -m "feat: add single-server config persistence"
```

### Task 3: Implement SSH Tunnel Manager with Reconnect

**Files:**
- Create: `apps/connector/src-tauri/src/ssh_tunnel.rs`
- Modify: `apps/connector/src-tauri/src/main.rs`
- Test: `apps/connector/src-tauri/tests/ssh_tunnel_test.rs`

**Step 1: Write failing tunnel lifecycle tests**

```rust
#[test]
fn starts_and_stops_tunnel() {
    let mut mgr = TunnelManager::new();
    assert!(mgr.start(sample_cfg()).is_ok());
    assert!(mgr.stop().is_ok());
}
```

**Step 2: Run test to verify it fails**

Run: `cd apps/connector/src-tauri && cargo test ssh_tunnel_test`
Expected: FAIL because manager is missing.

**Step 3: Implement minimal tunnel manager (`ssh -N -L ...`) with state machine**

```rust
pub enum TunnelState { Disconnected, Connecting, Connected, Reconnecting }
```

**Step 4: Run tests to verify pass**

Run: `cd apps/connector/src-tauri && cargo test ssh_tunnel_test`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/connector/src-tauri/src apps/connector/src-tauri/tests
git commit -m "feat: add ssh tunnel manager with reconnect"
```

### Task 4: Add Gateway Health Probe + Heartbeat Loop

**Files:**
- Create: `apps/connector/src-tauri/src/health.rs`
- Create: `apps/connector/src-tauri/src/heartbeat.rs`
- Create: `apps/connector/src/types/health.ts`
- Modify: `apps/connector/src/store/useConfigStore.ts`
- Test: `apps/connector/src-tauri/tests/heartbeat_test.rs`
- Test: `apps/connector/src/__tests__/health-mapping.test.ts`

**Step 1: Write failing heartbeat tests**

```rust
#[test]
fn marks_offline_after_consecutive_failures() {
    let mut hb = HeartbeatMonitor::new(3);
    hb.record_failure(); hb.record_failure(); hb.record_failure();
    assert_eq!(hb.status(), HealthStatus::Offline);
}
```

**Step 2: Run tests to verify they fail**

Run: `cd apps/connector/src-tauri && cargo test heartbeat_test`
Expected: FAIL.

**Step 3: Implement health probes (`/health`) and heartbeat every 15s**

```rust
pub struct HeartbeatSample {
    pub latency_ms: u64,
    pub tunnel_connected: bool,
    pub gateway_ok: bool,
}
```

**Step 4: Run tests to verify pass**

Run: `cd apps/connector/src-tauri && cargo test heartbeat_test && cd .. && pnpm vitest run src/__tests__/health-mapping.test.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/connector/src apps/connector/src-tauri
git commit -m "feat: add gateway health and heartbeat monitoring"
```

### Task 5: Build Agent Binding Store (`agent_id -> local_node_id`)

**Files:**
- Create: `apps/connector/src/types/bindings.ts`
- Create: `apps/connector/src/store/useBindingsStore.ts`
- Create: `apps/connector/src-tauri/src/bindings.rs`
- Test: `apps/connector/src/__tests__/bindings-store.test.ts`
- Test: `apps/connector/src-tauri/tests/bindings_test.rs`

**Step 1: Write failing tests for add/update/remove binding**

```ts
test("updates one agent binding without touching others", () => {
  // arrange + assert map behavior
});
```

```rust
#[test]
fn stores_binding_by_agent_id() {
    let mut b = BindingMap::default();
    b.set("main", "mac-node-1");
    assert_eq!(b.get("main"), Some("mac-node-1".into()));
}
```

**Step 2: Run tests to verify fail**

Run: `cd apps/connector && pnpm vitest run src/__tests__/bindings-store.test.ts && cd src-tauri && cargo test bindings_test`
Expected: FAIL.

**Step 3: Implement persisted binding map and command API**

```rust
pub type AgentId = String;
pub type NodeId = String;
```

**Step 4: Run tests to verify pass**

Run: `cd apps/connector && pnpm vitest run src/__tests__/bindings-store.test.ts && cd src-tauri && cargo test bindings_test`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/connector/src apps/connector/src-tauri
git commit -m "feat: add per-agent node bindings"
```

### Task 6: Implement Task Ingestion + Local Execution Engine

**Files:**
- Create: `apps/connector/src-tauri/src/tasks.rs`
- Create: `apps/connector/src-tauri/src/executor.rs`
- Create: `apps/connector/src/types/tasks.ts`
- Test: `apps/connector/src-tauri/tests/task_router_test.rs`
- Test: `apps/connector/src-tauri/tests/executor_test.rs`

**Step 1: Write failing tests for routing by agent binding**

```rust
#[test]
fn executes_task_only_when_agent_is_bound_to_local_node() {
    // arrange task(agent="main") + bindings(main->mac-node-1)
    // assert accepted
}
```

**Step 2: Run tests to verify fail**

Run: `cd apps/connector/src-tauri && cargo test task_router_test executor_test`
Expected: FAIL.

**Step 3: Implement poll -> route -> execute -> callback flow**

```rust
pub struct IncomingTask {
    pub task_id: String,
    pub agent_id: String,
    pub action: String,
    pub args: serde_json::Value,
    pub timeout_sec: u64,
}
```

**Step 4: Run tests to verify pass**

Run: `cd apps/connector/src-tauri && cargo test task_router_test executor_test`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/connector/src-tauri/src apps/connector/src-tauri/tests apps/connector/src/types
git commit -m "feat: add remote task execution pipeline"
```

### Task 7: Build UI Screens (Connection, Bindings, Health, Activity, Danger)

**Files:**
- Create: `apps/connector/src/pages/ConnectionPage.tsx`
- Create: `apps/connector/src/pages/BindingsPage.tsx`
- Create: `apps/connector/src/pages/HealthPage.tsx`
- Create: `apps/connector/src/pages/ActivityPage.tsx`
- Create: `apps/connector/src/pages/DangerPage.tsx`
- Modify: `apps/connector/src/App.tsx`
- Test: `apps/connector/src/__tests__/connection-page.test.tsx`
- Test: `apps/connector/src/__tests__/bindings-page.test.tsx`

**Step 1: Write failing render and interaction tests**

```ts
test("connect button triggers start_tunnel command", async () => {
  // mock invoke and assert command call
});
```

**Step 2: Run tests to verify fail**

Run: `cd apps/connector && pnpm vitest run src/__tests__/connection-page.test.tsx src/__tests__/bindings-page.test.tsx`
Expected: FAIL.

**Step 3: Implement minimal pages and command wiring**

```ts
await invoke("start_tunnel");
await invoke("set_agent_binding", { agentId, nodeId });
```

**Step 4: Run tests to verify pass**

Run: `cd apps/connector && pnpm vitest run src/__tests__/connection-page.test.tsx src/__tests__/bindings-page.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/connector/src
git commit -m "feat: add mvp connector ui pages"
```

### Task 8: Add Emergency Disconnect + Session Kill Switch

**Files:**
- Modify: `apps/connector/src-tauri/src/ssh_tunnel.rs`
- Modify: `apps/connector/src-tauri/src/tasks.rs`
- Modify: `apps/connector/src/pages/DangerPage.tsx`
- Test: `apps/connector/src-tauri/tests/emergency_disconnect_test.rs`
- Test: `apps/connector/src/__tests__/danger-page.test.tsx`

**Step 1: Write failing tests for one-click disconnect**

```rust
#[test]
fn emergency_disconnect_stops_tunnel_and_task_loop() {
    // assert tunnel stopped + polling halted
}
```

**Step 2: Run tests to verify fail**

Run: `cd apps/connector/src-tauri && cargo test emergency_disconnect_test`
Expected: FAIL.

**Step 3: Implement `emergency_disconnect` command and UI action**

```rust
#[tauri::command]
async fn emergency_disconnect(state: State<'_, AppState>) -> Result<(), String> { /* ... */ }
```

**Step 4: Run tests to verify pass**

Run: `cd apps/connector/src-tauri && cargo test emergency_disconnect_test && cd .. && pnpm vitest run src/__tests__/danger-page.test.tsx`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/connector/src apps/connector/src-tauri
git commit -m "feat: add emergency disconnect kill switch"
```

### Task 9: Integration Test with Mock Gateway

**Files:**
- Create: `apps/connector/tests/mock-gateway/server.ts`
- Create: `apps/connector/tests/e2e/connector-flow.spec.ts`
- Create: `apps/connector/tests/README.md`

**Step 1: Write failing integration test for end-to-end flow**

```ts
test("connect -> heartbeat -> task execute -> callback", async () => {
  // use mock gateway endpoints and assert callback payload
});
```

**Step 2: Run test to verify fail**

Run: `cd apps/connector && pnpm vitest run tests/e2e/connector-flow.spec.ts`
Expected: FAIL.

**Step 3: Implement mock gateway harness and env wiring**

```ts
app.post("/tasks/next", ...)
app.post("/tasks/:id/callback", ...)
```

**Step 4: Run test to verify pass**

Run: `cd apps/connector && pnpm vitest run tests/e2e/connector-flow.spec.ts`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/connector/tests
git commit -m "test: add connector integration flow with mock gateway"
```

### Task 10: Packaging + Runbook + Operator Docs

**Files:**
- Create: `apps/connector/README.md`
- Create: `apps/connector/docs/ops-runbook.md`
- Create: `apps/connector/docs/troubleshooting.md`
- Modify: `apps/connector/src-tauri/tauri.conf.json`

**Step 1: Write failing doc checklist test (or lint gate)**

```bash
# Example gate
rg -n "TODO" apps/connector/docs && exit 1
```

**Step 2: Run gate to verify fail before docs complete**

Run: `cd /Users/4paradigm/openclaw && rg -n "TODO" apps/connector/docs`
Expected: FAIL while placeholders exist.

**Step 3: Add operator docs (install, connect, heartbeat meanings, emergency process)**

```md
- Connection states: ONLINE / DEGRADED / OFFLINE
- Emergency disconnect procedure
- SSH tunnel diagnostics
```

**Step 4: Run docs/test gates to verify pass**

Run: `cd apps/connector && pnpm test && cd src-tauri && cargo test`
Expected: PASS.

**Step 5: Commit**

```bash
git add apps/connector
git commit -m "docs: add mvp runbook and packaging notes"
```

## Verification Checklist Before Completion

- `pnpm -C apps/connector test` passes.
- `cargo test --manifest-path apps/connector/src-tauri/Cargo.toml` passes.
- Manual check: connect to Linux gateway via SSH tunnel and see heartbeat update in UI.
- Manual check: create one agent binding and confirm only that agent's task executes locally.
- Manual check: emergency disconnect immediately drops tunnel and stops task polling.

## Execution Notes

- Follow `@superpowers:test-driven-development` inside each task.
- Use `@superpowers:verification-before-completion` before claiming MVP done.
- If task failures appear, switch to `@superpowers:systematic-debugging` before patching.
