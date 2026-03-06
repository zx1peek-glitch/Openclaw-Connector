# Milestone Acceptance Design: End-to-End Core Flow

**Date:** 2026-03-06
**Goal:** Bring the OpenClaw Connector from half-done MVP to a stage where the core flow can be verified end-to-end.

## Acceptance Scenario

User opens App → fills SSH config → connects → Health page shows real tunnel status → binds Agent → manually executes command via Activity page → sees result in activity log → emergency disconnect → everything resets.

## Changes

### 1. Health Data (Rust → React)

**Rust:**
- Add `get_health_summary` Tauri command to `lib.rs`
- Add `HeartbeatMonitor` to `AppState`
- Read `TunnelManager.is_connected()` as `tunnelConnected`
- `gatewayOk` = `tunnelConnected` (MVP simplification)
- `latencyMs` = 0 (no HTTP probe in MVP)
- `consecutiveFailures` from HeartbeatMonitor; cleared on connect, incremented on disconnect

**React:**
- HealthPage: remove props, use `useEffect` + `setInterval(5s)` to poll `get_health_summary`
- App.tsx: remove `defaultHealth` constant and HealthSummary prop passing

### 2. Task Execution UI (ActivityPage)

- Add "Quick Execute" panel at top of ActivityPage
- Dropdown: select Agent ID from bindings store
- Input: shell command
- Button: execute → calls `invoke("execute_task", { localNodeId, task })`
- Result (stdout/stderr/exitCode/durationMs) written to activity log

### 3. Config Sync

- App mount: call `load_app_config`, populate useConfigStore
- ConnectionPage connect success: call `save_app_config`

### 4. Cleanup

- Delete `src/flows/connectorFlow.ts`
- Commit all currently unstaged changes as baseline

### 5. Tests

- Rust: test for `get_health_summary` returning correct tunnel status
- Frontend: test ActivityPage execute_task invocation

## Out of Scope

- Automatic heartbeat HTTP probing (gateway /health endpoint)
- Automatic task polling loop
- Multi-server profiles
- Tauri packaging (.dmg)
