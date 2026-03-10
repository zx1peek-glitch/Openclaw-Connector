# P1 Theme Switching & Health Check Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add light/dark theme toggle and WS Ping/Pong health monitoring with SSH tunnel auto-reconnect.

**Architecture:** Theme uses CSS custom properties scoped to `:root` (light) and `.dark` (dark), toggled via Zustand store persisted in localStorage. Health check adds proactive Ping frames in the node WS loop with latency measurement stored in `Arc<AtomicU64>`, plus a background tunnel monitor that auto-reconnects on disconnect.

**Tech Stack:** React 19, Zustand 5, Tailwind CSS 4, Tauri 2, Rust (Tokio)

---

## Task 1: Theme CSS Variables — Dual Light/Dark Sets

**Files:**
- Modify: `src/styles.css`

**Step 1: Replace `@theme` with dual CSS variable sets**

Current `@theme` block has dark-only values. Replace it with `:root` (light) + `.dark` (dark) variable definitions, and a `@theme` block that references them.

```css
@import "tailwindcss";

/* ── Light theme (default) ── */
:root {
  --color-background: #F8FAFC;
  --color-foreground: #0F172A;
  --color-card: #FFFFFF;
  --color-card-foreground: #0F172A;
  --color-primary: #16A34A;
  --color-primary-foreground: #FFFFFF;
  --color-secondary: #F1F5F9;
  --color-secondary-foreground: #0F172A;
  --color-muted: #F1F5F9;
  --color-muted-foreground: #64748B;
  --color-accent: #F1F5F9;
  --color-accent-foreground: #0F172A;
  --color-destructive: #EF4444;
  --color-destructive-foreground: #FFFFFF;
  --color-border: #E2E8F0;
  --color-input: #E2E8F0;
  --color-ring: #16A34A;
}

/* ── Dark theme ── */
.dark {
  --color-background: #0F172A;
  --color-foreground: #F8FAFC;
  --color-card: #1E293B;
  --color-card-foreground: #F8FAFC;
  --color-primary: #22C55E;
  --color-primary-foreground: #022C22;
  --color-secondary: #334155;
  --color-secondary-foreground: #F8FAFC;
  --color-muted: #1E293B;
  --color-muted-foreground: #94A3B8;
  --color-accent: #0F172A;
  --color-accent-foreground: #F8FAFC;
  --color-destructive: #EF4444;
  --color-destructive-foreground: #F8FAFC;
  --color-border: #334155;
  --color-input: #334155;
  --color-ring: #22C55E;
}

@theme {
  --color-background: var(--color-background);
  --color-foreground: var(--color-foreground);
  --color-card: var(--color-card);
  --color-card-foreground: var(--color-card-foreground);
  --color-primary: var(--color-primary);
  --color-primary-foreground: var(--color-primary-foreground);
  --color-secondary: var(--color-secondary);
  --color-secondary-foreground: var(--color-secondary-foreground);
  --color-muted: var(--color-muted);
  --color-muted-foreground: var(--color-muted-foreground);
  --color-accent: var(--color-accent);
  --color-accent-foreground: var(--color-accent-foreground);
  --color-destructive: var(--color-destructive);
  --color-destructive-foreground: var(--color-destructive-foreground);
  --color-border: var(--color-border);
  --color-input: var(--color-input);
  --color-ring: var(--color-ring);

  --font-sans: 'Fira Sans', 'Space Grotesk', system-ui, sans-serif;
  --font-mono: 'Fira Code', 'IBM Plex Mono', monospace;

  --radius-lg: 0.5rem;
  --radius-md: calc(0.5rem - 2px);
  --radius-sm: calc(0.5rem - 4px);
}
```

Keep the `@layer base` and `@layer utilities` unchanged. The hardcoded Tailwind color classes in utilities (like `bg-slate-800/80`) stay as-is — they work fine under `.dark` since the app defaults to dark mode.

**Step 2: Verify build succeeds**

Run: `npx vite build`
Expected: Build succeeds, no CSS errors.

**Step 3: Commit**

```bash
git add src/styles.css
git commit -m "feat: add dual light/dark CSS variable sets"
```

---

## Task 2: Theme Store + App Integration + Toggle Button

**Files:**
- Create: `src/store/useThemeStore.ts`
- Modify: `src/App.tsx`

**Step 1: Create theme store**

```typescript
// src/store/useThemeStore.ts
import { create } from "zustand";

type Theme = "light" | "dark" | "system";

type ThemeState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  cycleTheme: () => void;
};

function getEffectiveTheme(theme: Theme): "light" | "dark" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}

function applyTheme(theme: Theme) {
  const effective = getEffectiveTheme(theme);
  document.documentElement.classList.toggle("dark", effective === "dark");
}

const stored = localStorage.getItem("openclaw-theme") as Theme | null;
const initial: Theme = stored && ["light", "dark", "system"].includes(stored) ? stored : "dark";
// Apply immediately to avoid flash
applyTheme(initial);

export const useThemeStore = create<ThemeState>()((set, get) => ({
  theme: initial,
  setTheme: (theme) => {
    localStorage.setItem("openclaw-theme", theme);
    applyTheme(theme);
    set({ theme });
  },
  cycleTheme: () => {
    const order: Theme[] = ["dark", "light", "system"];
    const current = get().theme;
    const next = order[(order.indexOf(current) + 1) % order.length];
    get().setTheme(next);
  },
}));

// Listen for OS theme changes when in "system" mode
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
  const { theme } = useThemeStore.getState();
  if (theme === "system") applyTheme(theme);
});
```

**Step 2: Add toggle button to App.tsx header**

In `src/App.tsx`, import the store and lucide icons, add a toggle button next to the "端到端加密" badge:

```tsx
import { useThemeStore } from "./store/useThemeStore";
import { Sun, Moon, Monitor } from "lucide-react";

// Inside the header, replace the ShieldCheck badge div with a flex container
// that contains both the badge and the theme toggle:
<div className="flex items-center gap-3">
  <button
    onClick={() => useThemeStore.getState().cycleTheme()}
    className="flex items-center gap-2 bg-[color:var(--color-card)] border border-[color:var(--color-border)] rounded-lg px-3 py-2 shadow-inner hover:opacity-80 transition-opacity cursor-pointer"
    title={`当前主题：${theme === "dark" ? "深色" : theme === "light" ? "浅色" : "跟随系统"}`}
  >
    {theme === "dark" ? <Moon className="w-4 h-4 text-primary" /> :
     theme === "light" ? <Sun className="w-4 h-4 text-amber-500" /> :
     <Monitor className="w-4 h-4 text-blue-400" />}
    <span className="text-xs font-medium text-[color:var(--color-muted-foreground)]">
      {theme === "dark" ? "深色" : theme === "light" ? "浅色" : "系统"}
    </span>
  </button>

  <div className="flex items-center gap-2 bg-[color:var(--color-card)] border border-[color:var(--color-border)] rounded-lg px-4 py-2 shadow-inner">
    <ShieldCheck className="w-5 h-5 text-primary" />
    <span className="text-sm font-medium text-[color:var(--color-muted-foreground)]">端到端加密</span>
  </div>
</div>
```

Also update the header gradient to use theme variables so it looks correct in light mode:
- Replace `from-[#1E293B] to-[#0F172A]` with `from-[color:var(--color-card)] to-[color:var(--color-background)]`
- Replace `text-white` with `text-foreground`
- Replace `text-slate-400` with `text-muted-foreground`
- Replace `bg-[#0F172A]` badge backgrounds with `bg-[color:var(--color-background)]`

**Step 3: Verify**

Run: `npx tsc --noEmit && npx vite build`
Expected: No errors. With `.dark` on `<html>` (default), app looks identical to before.

**Step 4: Commit**

```bash
git add src/store/useThemeStore.ts src/App.tsx
git commit -m "feat: add theme toggle with light/dark/system modes"
```

---

## Task 3: Backend — WS Ping/Pong Latency Measurement

**Files:**
- Modify: `src-tauri/src/lib.rs` (AppState, get_health_summary)
- Modify: `src-tauri/src/ws_client.rs` (run_ws_loop)

**Step 1: Add shared latency to AppState**

In `src-tauri/src/lib.rs`, add a latency field:

```rust
use std::sync::atomic::AtomicU64;

struct AppState {
    // ... existing fields ...
    ws_latency_ms: Arc<AtomicU64>,  // NEW
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            // ... existing fields ...
            ws_latency_ms: Arc::new(AtomicU64::new(0)),  // NEW
        }
    }
}
```

**Step 2: Pass latency arc to run_ws_loop**

In `connect()` in lib.rs, pass `Arc::clone(&state.ws_latency_ms)` as a new parameter to `run_ws_loop`:

```rust
let ws_latency = Arc::clone(&app.state::<AppState>().ws_latency_ms);
// ... in the spawn block:
let ws_result = ws_client::run_ws_loop(
    &ws_url, &gateway_token, &node_id, &node_name, &identity,
    event_tx_clone, &mut node_rpc_rx, ws_connected_clone,
    Arc::clone(&node_shutdown),
    Arc::clone(&ws_latency),  // NEW param
).await;
```

**Step 3: Add Ping timer and Pong latency to ws_client.rs**

Add `latency: Arc<AtomicU64>` parameter to `run_ws_loop`. Inside the main loop, add a Ping timer branch to the `tokio::select!`:

```rust
pub async fn run_ws_loop(
    // ... existing params ...
    shutdown: Arc<std::sync::atomic::AtomicBool>,
    latency: Arc<std::sync::atomic::AtomicU64>,  // NEW
) -> Result<(), String> {
    // ... existing setup ...

    let mut ping_interval = tokio::time::interval(std::time::Duration::from_secs(15));
    ping_interval.tick().await; // skip immediate first tick
    let mut ping_sent_at: Option<tokio::time::Instant> = None;

    loop {
        tokio::select! {
            // ... existing shutdown branch ...

            // NEW: periodic Ping
            _ = ping_interval.tick(), if authenticated => {
                let now = tokio::time::Instant::now();
                ping_sent_at = Some(now);
                let _ = write.send(Message::Ping(vec![0x01])).await;
            }

            msg_opt = read.next() => {
                // ... existing message handling ...

                // In the Pong arm, calculate latency:
                Message::Ping(data) => {
                    let _ = write.send(Message::Pong(data)).await;
                }
                Message::Pong(_) => {
                    if let Some(sent) = ping_sent_at.take() {
                        let rtt = sent.elapsed().as_millis() as u64;
                        latency.store(rtt, std::sync::atomic::Ordering::Relaxed);
                    }
                }
                // ...
            }
            // ... rpc branch ...
        }
    }
    // ...
}
```

**Step 4: Update get_health_summary to read real latency**

In lib.rs, replace the hardcoded `latency_ms: 0`:

```rust
fn get_health_summary(state: tauri::State<'_, AppState>) -> Result<HealthSummaryResponse, String> {
    // ... existing tunnel/heartbeat code ...

    let latency_ms = state.ws_latency_ms.load(std::sync::atomic::Ordering::Relaxed);

    heartbeat.record_sample(health::HeartbeatSample {
        latency_ms,  // was: 0
        tunnel_connected,
        gateway_ok: ws_connected,
    });

    Ok(HealthSummaryResponse {
        latency_ms,  // was: 0
        tunnel_connected,
        gateway_ok: ws_connected,
        consecutive_failures: heartbeat.consecutive_failures(),
    })
}
```

**Step 5: Verify**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: Compiles without errors.

**Step 6: Commit**

```bash
git add src-tauri/src/lib.rs src-tauri/src/ws_client.rs
git commit -m "feat: measure WS latency via Ping/Pong, surface in health summary"
```

---

## Task 4: Backend — Tunnel Health Monitor with Auto-Reconnect

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Step 1: Spawn health monitor in connect()**

After the tunnel starts and WS loops are spawned, add a health monitor task. This goes at the end of `connect()` before `Ok(status)`:

```rust
// Spawn tunnel health monitor for auto-reconnect
let health_shutdown = Arc::clone(&state.ws_shutdown);
let health_tunnel = Arc::clone(&state_tunnel_arc); // need to wrap tunnel in Arc
let health_app = app_handle.clone();
let health_server = server.clone();
tauri::async_runtime::spawn(async move {
    let mut was_connected = true;
    let backoffs = [3u64, 6, 12];

    loop {
        tokio::time::sleep(std::time::Duration::from_secs(10)).await;
        if health_shutdown.load(std::sync::atomic::Ordering::Relaxed) {
            break;
        }

        let is_connected = {
            if let Ok(mut t) = health_tunnel.lock() {
                let s = t.refresh_status();
                s.state == ssh_tunnel::TunnelState::Connected
            } else {
                false
            }
        };

        if was_connected && !is_connected {
            let _ = health_app.emit("node-event", &ws_client::NodeEvent::Error {
                message: "SSH 隧道断开，正在自动重连...".to_string(),
            });

            let mut reconnected = false;
            for (attempt, delay) in backoffs.iter().enumerate() {
                if health_shutdown.load(std::sync::atomic::Ordering::Relaxed) {
                    break;
                }
                tokio::time::sleep(std::time::Duration::from_secs(*delay)).await;

                let result = {
                    if let Ok(mut t) = health_tunnel.lock() {
                        t.start(health_server.clone())
                    } else {
                        Err("lock error".to_string())
                    }
                };

                match result {
                    Ok(()) => {
                        let _ = health_app.emit("node-event", &ws_client::NodeEvent::Authenticated);
                        eprintln!("[health] tunnel auto-reconnected on attempt {}", attempt + 1);
                        reconnected = true;
                        break;
                    }
                    Err(e) => {
                        eprintln!("[health] reconnect attempt {} failed: {e}", attempt + 1);
                    }
                }
            }

            if !reconnected {
                let _ = health_app.emit("node-event", &ws_client::NodeEvent::Error {
                    message: "SSH 隧道自动重连失败，请手动重新连接".to_string(),
                });
            }
        }

        was_connected = is_connected;
    }
});
```

**Note:** The `state.tunnel` is `Mutex<TunnelManager>`, which is already shared. Since the health monitor runs on a tokio task, it accesses the tunnel via `state.tunnel` (need to clone the `Arc` reference from the Tauri managed state). The simplest way: extract `Arc::clone` from `app_handle.state::<AppState>()` before spawning.

**Step 2: Verify**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: Compiles without errors.

**Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: add tunnel health monitor with auto-reconnect"
```

---

## Task 5: Frontend — Latency Display & Reconnect Status

**Files:**
- Modify: `src/pages/ConnectionPage.tsx`

**Step 1: Poll health summary for latency**

Add a `latencyMs` state and poll `get_health_summary` alongside the existing connection status poll:

```typescript
const [latencyMs, setLatencyMs] = useState<number>(0);

// Add to the existing connection status polling effect (or a new one):
useEffect(() => {
  if (!fullyConnected) {
    setLatencyMs(0);
    return;
  }
  const poll = async () => {
    try {
      const h = await invoke<{ latencyMs: number }>("get_health_summary");
      setLatencyMs(h.latencyMs);
    } catch { /* ignore */ }
  };
  poll();
  const id = setInterval(poll, 5000);
  return () => clearInterval(id);
}, [fullyConnected]);
```

**Step 2: Update statusText to show latency**

Modify the `statusText` useMemo:

```typescript
const statusText = useMemo(() => {
  if (fullyConnected) {
    return latencyMs > 0 ? `已连接 · ${latencyMs}ms` : "已连接";
  }
  if (isConnected) return "SSH 已连接，WS 连接中";
  if (status.tunnelState === "connecting") return "连接中";
  if (status.tunnelState === "reconnecting") return "重连中";
  return "未连接";
}, [fullyConnected, isConnected, status.tunnelState, latencyMs]);
```

**Step 3: Verify**

Run: `npx tsc --noEmit`
Expected: No type errors.

**Step 4: Commit**

```bash
git add src/pages/ConnectionPage.tsx
git commit -m "feat: show WS latency in connection status indicator"
```

---

## Task 6: Final Verification

**Step 1: Full frontend check**

Run: `npx eslint src/ && npx tsc --noEmit && npx vite build`
Expected: 0 errors, build succeeds.

**Step 2: Full backend check**

Run: `cargo clippy --manifest-path src-tauri/Cargo.toml -- -D warnings && cargo test --manifest-path src-tauri/Cargo.toml`
Expected: No warnings, all tests pass.

**Step 3: Frontend tests**

Run: `npx vitest run`
Expected: All existing tests pass.

**Step 4: Update README roadmap**

In both `README.md` and `README.zh-CN.md`, mark completed items:
```markdown
- [x] Theme switching (Light / Dark mode)
- [x] OpenClaw health check & auto-repair
```

**Step 5: Commit and push**

```bash
git add README.md README.zh-CN.md
git commit -m "docs: mark theme switching and health check as completed"
git push origin main
```
