# Exec Policy Toggle Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 在连接卡片中增加一键 toggle，让用户可以切换 OpenClaw 平台的 exec policy（sandbox ↔ node），连接成功后自动读取当前状态。

**Architecture:** 通过 SSH 执行 `openclaw config get/set` 命令来读取和修改远程 OpenClaw gateway 的 exec policy。前端在连接成功后自动查询当前策略，用户可通过 toggle 一键切换。

**Tech Stack:** Rust (tauri command) + React (toggle UI) + SSH (远程执行 openclaw CLI)

---

### Task 1: Add i18n keys

**Files:**
- Modify: `src/i18n/zh.json`
- Modify: `src/i18n/en.json`

**Step 1: Add exec policy i18n keys**

In `src/i18n/zh.json`, add to the `"connection"` section:

```json
"exec_policy_label": "允许 AI 操作本机",
"exec_policy_enabled": "已开启远程执行",
"exec_policy_disabled": "仅沙盒模式",
"exec_policy_loading": "读取策略中..."
```

In `src/i18n/en.json`, add to the `"connection"` section:

```json
"exec_policy_label": "Allow AI to control this machine",
"exec_policy_enabled": "Remote execution enabled",
"exec_policy_disabled": "Sandbox only",
"exec_policy_loading": "Loading policy..."
```

In `src/i18n/zh.json`, add to the `"events"` section:

```json
"exec_policy_set_node": "已开启远程执行策略",
"exec_policy_set_sandbox": "已切换为沙盒模式",
"exec_policy_set_failed": "切换执行策略失败：{{msg}}"
```

In `src/i18n/en.json`, add to the `"events"` section:

```json
"exec_policy_set_node": "Remote execution policy enabled",
"exec_policy_set_sandbox": "Switched to sandbox mode",
"exec_policy_set_failed": "Failed to switch exec policy: {{msg}}"
```

**Step 2: Commit**

```bash
git add src/i18n/zh.json src/i18n/en.json
git commit -m "feat: add i18n keys for exec policy toggle"
```

---

### Task 2: Add Rust backend commands

**Files:**
- Modify: `src-tauri/src/lib.rs` (add `get_exec_policy` and `set_exec_policy` commands + register in handler)

**Step 1: Add helper function to run SSH command**

Add before `read_remote_gateway_config` (around line 659). This reuses the same SSH pattern:

```rust
/// Run a command on the remote server via SSH, return stdout.
fn ssh_exec(host: &str, user: &str, key_path: Option<&str>, remote_cmd: &str) -> Result<String, String> {
    let default_key = "~/.ssh/id_ed25519".to_string();
    let key = key_path.unwrap_or(&default_key);

    let resolved_key = if let Some(rest) = key.strip_prefix("~/") {
        match std::env::var("HOME") {
            Ok(home) => format!("{home}/{rest}"),
            Err(_) => key.to_string(),
        }
    } else {
        key.to_string()
    };

    let output = std::process::Command::new("ssh")
        .args([
            "-o", "BatchMode=yes",
            "-o", "ConnectTimeout=10",
            "-o", "StrictHostKeyChecking=accept-new",
            "-i", &resolved_key,
            &format!("{user}@{host}"),
            remote_cmd,
        ])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| format!("failed to run ssh: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "SSH command failed".to_string()
        } else {
            stderr
        });
    }

    Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
}
```

**Step 2: Add get_exec_policy command**

```rust
#[tauri::command]
async fn get_exec_policy(app: tauri::AppHandle) -> Result<bool, String> {
    let state = app.state::<AppState>();
    let cfg = load_app_config(app.clone())?;
    let active_id = cfg.active_profile_id.ok_or("no active profile")?;
    let profile = cfg.profiles.iter().find(|p| p.id == active_id).ok_or("profile not found")?;

    let host = &profile.server.host;
    let user = &profile.server.user;
    let key_path = profile.server.key_path.as_deref();

    let result = ssh_exec(host, user, key_path, "openclaw config get tools.exec.host")?;
    // result is something like "node" or "sandbox" (possibly with quotes)
    let val = result.trim().trim_matches('"');
    Ok(val == "node")
}
```

**Step 3: Add set_exec_policy command**

```rust
#[tauri::command]
async fn set_exec_policy(app: tauri::AppHandle, enabled: bool) -> Result<(), String> {
    let cfg = load_app_config(app.clone())?;
    let active_id = cfg.active_profile_id.ok_or("no active profile")?;
    let profile = cfg.profiles.iter().find(|p| p.id == active_id).ok_or("profile not found")?;

    let host = &profile.server.host;
    let user = &profile.server.user;
    let key_path = profile.server.key_path.as_deref();

    if enabled {
        ssh_exec(host, user, key_path, "openclaw config set tools.exec.host node")?;
        ssh_exec(host, user, key_path, "openclaw config set tools.exec.security full")?;
        ssh_exec(host, user, key_path, "openclaw config set tools.exec.ask off")?;
    } else {
        ssh_exec(host, user, key_path, "openclaw config set tools.exec.host sandbox")?;
    }

    Ok(())
}
```

**Step 4: Register in generate_handler!**

Add `get_exec_policy` and `set_exec_policy` to the handler list at line ~879:

```rust
export_diagnostics,
get_exec_policy,
set_exec_policy,
```

**Step 5: Verify compilation**

Run: `cd src-tauri && cargo check`
Expected: compiles without errors

**Step 6: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: add get/set_exec_policy commands via SSH"
```

---

### Task 3: Add toggle UI to ProfileDetail

**Files:**
- Modify: `src/components/ProfileDetail.tsx`

**Step 1: Add exec policy state**

After the `latencyMs` state (around line 156), add:

```typescript
// Exec policy state
const [execPolicyEnabled, setExecPolicyEnabled] = useState<boolean | null>(null);
const [execPolicyBusy, setExecPolicyBusy] = useState(false);
```

**Step 2: Add effect to read policy on connect**

After the existing `fullyConnected` memo, add an effect that reads policy when fully connected:

```typescript
// Read exec policy when fully connected
useEffect(() => {
  if (!fullyConnected) {
    setExecPolicyEnabled(null);
    return;
  }
  invoke<boolean>("get_exec_policy")
    .then((enabled) => setExecPolicyEnabled(enabled))
    .catch(() => setExecPolicyEnabled(null));
}, [fullyConnected]);
```

**Step 3: Add toggle handler**

```typescript
const toggleExecPolicy = async () => {
  if (execPolicyBusy || execPolicyEnabled === null) return;
  const next = !execPolicyEnabled;
  setExecPolicyBusy(true);
  try {
    await invoke("set_exec_policy", { enabled: next });
    setExecPolicyEnabled(next);
    pushActivity("info", t(next ? "events.exec_policy_set_node" : "events.exec_policy_set_sandbox"));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    pushActivity("error", t("events.exec_policy_set_failed", { msg }));
  } finally {
    setExecPolicyBusy(false);
  }
};
```

**Step 4: Add toggle UI in the connection card**

Insert after the Connect/Disconnect/Console buttons div (after line 667), inside the `<CardContent>`:

```tsx
{/* Exec policy toggle — only when fully connected */}
{fullyConnected && (
  <div className="mt-4 flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-border">
    <div className="flex items-center gap-2">
      <Terminal className="w-4 h-4 text-muted-foreground" />
      <span className="text-sm font-medium text-foreground">{t("connection.exec_policy_label")}</span>
    </div>
    <button
      onClick={toggleExecPolicy}
      disabled={execPolicyBusy || execPolicyEnabled === null}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50 ${
        execPolicyEnabled ? "bg-primary" : "bg-muted-foreground/30"
      } ${(execPolicyBusy || execPolicyEnabled === null) ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
          execPolicyEnabled ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  </div>
)}
```

**Step 5: Verify build**

Run: `pnpm build`
Expected: builds without errors

**Step 6: Commit**

```bash
git add src/components/ProfileDetail.tsx
git commit -m "feat: add exec policy toggle to connection card"
```

---

### Task 4: Verify end-to-end

**Step 1: Run dev server**

Run: `pnpm tauri dev`

**Step 2: Manual verification**

1. Connect to a profile
2. Verify toggle appears after connection succeeds
3. Verify toggle reflects current exec policy state
4. Toggle on → check activity log shows "已开启远程执行策略"
5. Toggle off → check activity log shows "已切换为沙盒模式"
6. Verify on the server: `openclaw config get tools.exec.host` matches toggle state

**Step 3: Final commit with version bump**

```bash
# Bump version
# Edit src-tauri/tauri.conf.json: "version": "0.3.2"
# Edit src-tauri/Cargo.toml: version = "0.3.2"
git add -A
git commit -m "feat: exec policy toggle — allow AI to control local machine"
```
