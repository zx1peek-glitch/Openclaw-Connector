# P1 Improvements Design: Theme Switching & Health Check

## Overview

Two P1 features for OpenClaw Connector:
1. **Theme Switching** — Light/Dark mode with CSS variables + class toggle
2. **Health Check & Auto-Reconnect** — WS Ping/Pong latency + tunnel auto-reconnect

---

## Feature 1: Theme Switching (Light / Dark Mode)

### Problem
The app only has a dark theme. Users may prefer light mode, and a theme toggle is a basic UX expectation for desktop apps.

### Approach
**shadcn standard pattern**: CSS custom properties scoped to `:root` (light) and `.dark` (dark), toggled via class on `<html>`.

### Design

**CSS (`styles.css`)**:
- Move current dark color values under `.dark` selector
- Add light color values under `:root`
- Token names stay the same (`--color-background`, `--color-foreground`, etc.)

**Store (`useThemeStore.ts`)**:
- Zustand store with `theme: "light" | "dark" | "system"`
- Persist to localStorage (key: `openclaw-theme`)
- `"system"` follows `prefers-color-scheme` media query

**App integration (`App.tsx`)**:
- On mount: read theme from store, apply `.dark` class to `<html>` accordingly
- Listen to `prefers-color-scheme` changes when theme is `"system"`
- Default: `"dark"` (matches current behavior, zero regression)

**Toggle button**:
- Sun/Moon icon button in the app header/nav area
- Cycles: dark → light → system → dark

### Non-goals (deferred)
- Replacing all hardcoded Tailwind color classes with tokens (gradual migration)
- Custom color themes beyond light/dark

---

## Feature 2: Health Check & Auto-Reconnect

### Problem
When the SSH tunnel or WebSocket drops, the user must manually reconnect. The app has no latency visibility and `get_health_summary` returns hardcoded zeros.

### Approach
**WS Ping/Pong for latency** (zero new dependencies) + **background tunnel monitor for auto-reconnect**.

### Design

#### Backend — Latency Measurement (`ws_client.rs`)

In `run_ws_loop` (node WS):
- Every 15 seconds, send a WebSocket `Ping` frame with a timestamp
- On `Pong` response, calculate round-trip time
- Store latest latency in a shared `Arc<AtomicU64>`
- `get_health_summary` reads this value instead of hardcoded 0

#### Backend — Tunnel Health Monitor (`lib.rs`)

On `connect()` success, spawn a background task:
- Every 10 seconds, call `tunnel.refresh_status()`
- If tunnel state changed from Connected → Disconnected:
  - Emit `node-event` with kind "error" message "SSH 隧道断开，正在自动重连..."
  - Attempt reconnect with exponential backoff: 3s → 6s → 12s (max 3 attempts)
  - On success: emit "info" event, continue monitoring
  - On failure after 3 attempts: emit "error" event, stop retrying
- On `disconnect()`: set shutdown flag to stop the monitor

#### Frontend — Status Display (`ConnectionPage.tsx`)

- Status indicator shows latency when connected: "已连接 · 42ms"
- During auto-reconnect: "重连中 (1/3)..."
- After failed reconnect: show error with manual retry button
- Poll `get_health_summary` alongside existing `get_connection_status`

### Data Flow

```
[15s timer] → Ping frame → Gateway → Pong → measure latency → Arc<AtomicU64>
                                                                    ↓
[10s timer] → refresh_status() → tunnel dead? → auto-reconnect → node-event → UI
                                                                    ↓
[2s poll] → get_health_summary → { latency_ms, tunnel_connected, gateway_ok } → UI
```

### Error Handling
- Ping timeout (no Pong within 5s): latency reported as 0, not treated as disconnect
- Auto-reconnect uses saved `ServerConfig` from `TunnelManager::active_server()`
- If no active server config (user never connected): skip auto-reconnect
- Auto-reconnect counter resets on successful manual connect

---

## Implementation Priority

1. Theme switching (simpler, self-contained)
2. Health check & auto-reconnect (touches more backend code)

## Files to Modify

### Theme Switching
- `src/styles.css` — CSS variable dual sets
- `src/store/useThemeStore.ts` — NEW: theme store
- `src/App.tsx` — apply theme class, add toggle
- `src/components/ui/` — minor: ensure key components use tokens

### Health Check
- `src-tauri/src/ws_client.rs` — Ping/Pong latency measurement
- `src-tauri/src/lib.rs` — health monitor task, latency shared state
- `src/pages/ConnectionPage.tsx` — latency display, reconnect status
