# Connection Wizard Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the single-form profile creation with a 3-step wizard that validates SSH and Gateway connectivity before saving.

**Architecture:** Two new Rust backend commands (`test_ssh_connection`, `read_remote_gateway_config`) that spawn short-lived SSH processes for validation. A new `ProfileWizard.tsx` React component replaces `NewProfileForm.tsx` with a step-based UI. The existing `connect()` command is reused for the WS test in Step 2.

**Tech Stack:** Rust (Tauri commands, `std::process::Command` for SSH), React 19, TypeScript, Zustand, i18n (react-i18next)

---

### Task 1: Backend — `test_ssh_connection` command

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Context:** The existing `ssh_tunnel.rs` uses `TunnelManager::build_ssh_args()` to construct SSH args and spawns `ssh -N -L ...` for port forwarding. For testing, we need a simpler SSH connection that just validates credentials and exits.

**Step 1: Add the `test_ssh_connection` Tauri command**

Add this command to `src-tauri/src/lib.rs`, after the `detect_local_gateway` function (around line 596) and before `pub fn run()`:

```rust
#[tauri::command]
fn test_ssh_connection(host: String, user: String, key_path: Option<String>) -> Result<(), String> {
    if host.trim().is_empty() {
        return Err("host cannot be empty".to_string());
    }
    if user.trim().is_empty() {
        return Err("user cannot be empty".to_string());
    }

    let key = key_path.unwrap_or_else(|| "~/.ssh/id_ed25519".to_string());

    // Resolve ~ in key path
    let resolved_key = if let Some(rest) = key.strip_prefix("~/") {
        match std::env::var("HOME") {
            Ok(home) => format!("{home}/{rest}"),
            Err(_) => key.clone(),
        }
    } else {
        key.clone()
    };

    // Test mode for integration tests
    if std::env::var("OPENCLAW_CONNECTOR_FAKE_TUNNEL").as_deref() == Ok("1") {
        return Ok(());
    }

    let output = std::process::Command::new("ssh")
        .args([
            "-o", "BatchMode=yes",
            "-o", "ConnectTimeout=10",
            "-o", "StrictHostKeyChecking=accept-new",
            "-i", &resolved_key,
            &format!("{user}@{host}"),
            "echo", "ok",
        ])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| format!("failed to run ssh: {e}"))?;

    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let msg = stderr.trim();
        if msg.is_empty() {
            Err(format!("SSH connection failed (exit code {})", output.status))
        } else {
            Err(msg.to_string())
        }
    }
}
```

**Step 2: Register the command in the Tauri handler**

In `pub fn run()`, add `test_ssh_connection` to the `generate_handler!` macro:

```rust
.invoke_handler(tauri::generate_handler![
    load_app_config,
    save_app_config,
    connect,
    disconnect,
    get_connection_status,
    get_health_summary,
    open_url,
    detect_local_gateway,
    test_ssh_connection,       // <-- ADD
    list_agents,
    // ... rest unchanged
])
```

**Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: no errors

**Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: add test_ssh_connection command"
```

---

### Task 2: Backend — `read_remote_gateway_config` command

**Files:**
- Modify: `src-tauri/src/lib.rs`

**Context:** After SSH is validated in Step 1 of the wizard, Step 2 needs to read the remote `~/.openclaw/openclaw.json` via SSH to auto-extract the Gateway token and port. This is similar to the existing `detect_local_gateway` but reads via SSH instead of local filesystem.

**Step 1: Add the `read_remote_gateway_config` command**

Add after `test_ssh_connection`:

```rust
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct RemoteGatewayConfig {
    token: String,
    port: u16,
}

#[tauri::command]
fn read_remote_gateway_config(host: String, user: String, key_path: Option<String>) -> Result<RemoteGatewayConfig, String> {
    let key = key_path.unwrap_or_else(|| "~/.ssh/id_ed25519".to_string());

    let resolved_key = if let Some(rest) = key.strip_prefix("~/") {
        match std::env::var("HOME") {
            Ok(home) => format!("{home}/{rest}"),
            Err(_) => key.clone(),
        }
    } else {
        key.clone()
    };

    // Test mode
    if std::env::var("OPENCLAW_CONNECTOR_FAKE_TUNNEL").as_deref() == Ok("1") {
        return Ok(RemoteGatewayConfig {
            token: "fake-token".to_string(),
            port: 18789,
        });
    }

    let output = std::process::Command::new("ssh")
        .args([
            "-o", "BatchMode=yes",
            "-o", "ConnectTimeout=10",
            "-o", "StrictHostKeyChecking=accept-new",
            "-i", &resolved_key,
            &format!("{user}@{host}"),
            "cat", "~/.openclaw/openclaw.json",
        ])
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .output()
        .map_err(|e| format!("failed to run ssh: {e}"))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(if stderr.is_empty() {
            "failed to read remote openclaw.json".to_string()
        } else {
            stderr
        });
    }

    let content = String::from_utf8_lossy(&output.stdout);
    let val: serde_json::Value = serde_json::from_str(&content)
        .map_err(|e| format!("failed to parse remote openclaw.json: {e}"))?;

    let token = val
        .pointer("/gateway/auth/token")
        .and_then(|v| v.as_str())
        .ok_or("gateway.auth.token not found in remote openclaw.json")?
        .to_string();
    let port = val
        .pointer("/gateway/port")
        .and_then(|v| v.as_u64())
        .unwrap_or(18789) as u16;

    Ok(RemoteGatewayConfig { token, port })
}
```

**Step 2: Register the command**

Add `read_remote_gateway_config` to `generate_handler!`:

```rust
test_ssh_connection,
read_remote_gateway_config,    // <-- ADD
```

**Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: no errors

**Step 4: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat: add read_remote_gateway_config command"
```

---

### Task 3: i18n — Add wizard translation keys

**Files:**
- Modify: `src/i18n/zh.json`
- Modify: `src/i18n/en.json`

**Context:** The wizard UI needs new i18n keys under a `wizard` namespace. The existing `profile.*` and `connection.*` keys remain unchanged.

**Step 1: Add wizard keys to zh.json**

Add this new `wizard` section after the `profile` section (after line 55, before `"browser"`):

```json
  "wizard": {
    "step1_title": "SSH 连接",
    "step2_title": "Gateway 配置",
    "step3_title": "命名保存",
    "test_ssh": "测试连接",
    "test_gateway": "测试 Gateway",
    "testing": "测试中...",
    "ssh_success": "SSH 连接成功",
    "ssh_failed": "SSH 连接失败：{{msg}}",
    "reading_config": "正在读取远程配置...",
    "config_read_success": "Token 已自动获取",
    "config_read_failed": "未读取到远程配置，请手动输入",
    "ws_success": "Gateway 连接成功",
    "ws_failed": "Gateway 连接失败：{{msg}}",
    "next": "下一步",
    "back": "上一步",
    "save": "保存配置",
    "profile_name": "配置名称"
  },
```

**Step 2: Add wizard keys to en.json**

Same structure:

```json
  "wizard": {
    "step1_title": "SSH Connection",
    "step2_title": "Gateway Config",
    "step3_title": "Name & Save",
    "test_ssh": "Test Connection",
    "test_gateway": "Test Gateway",
    "testing": "Testing...",
    "ssh_success": "SSH connected successfully",
    "ssh_failed": "SSH connection failed: {{msg}}",
    "reading_config": "Reading remote config...",
    "config_read_success": "Token auto-detected",
    "config_read_failed": "Remote config not found, enter manually",
    "ws_success": "Gateway connected successfully",
    "ws_failed": "Gateway connection failed: {{msg}}",
    "next": "Next",
    "back": "Back",
    "save": "Save Profile",
    "profile_name": "Profile Name"
  },
```

**Step 3: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('src/i18n/zh.json'))" && echo OK`
Run: `node -e "JSON.parse(require('fs').readFileSync('src/i18n/en.json'))" && echo OK`
Expected: `OK` for both

**Step 4: Commit**

```bash
git add src/i18n/zh.json src/i18n/en.json
git commit -m "feat: add i18n keys for connection wizard"
```

---

### Task 4: Frontend — Create `ProfileWizard.tsx`

**Files:**
- Create: `src/components/ProfileWizard.tsx`
- Delete contents of: `src/components/NewProfileForm.tsx` (will be replaced by import redirect in Task 5)

**Context:** This is the main wizard component. It replaces `NewProfileForm`. It has 3 steps controlled by an internal `step` state. Each step validates before allowing progression. The component uses `invoke()` from Tauri to call the backend commands.

**Step 1: Create the `ProfileWizard.tsx` component**

Create `src/components/ProfileWizard.tsx` with this content:

```tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { Input } from "./ui/input";
import { Button } from "./ui/button";
import { addProfile, createDefaultProfile } from "../store/useProfileStore";
import {
  CheckCircle2, AlertCircle, Loader2, ArrowRight, ArrowLeft,
} from "lucide-react";

type Props = {
  onCreated: (profileId: string) => void;
  onCancel: () => void;
};

type TestStatus = "idle" | "testing" | "success" | "error";

export function ProfileWizard({ onCreated, onCancel }: Props) {
  const { t } = useTranslation();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Step 1 state
  const [host, setHost] = useState("");
  const [user, setUser] = useState("");
  const [keyPath, setKeyPath] = useState("~/.ssh/id_ed25519");
  const [sshStatus, setSshStatus] = useState<TestStatus>("idle");
  const [sshError, setSshError] = useState("");

  // Step 2 state
  const [gatewayToken, setGatewayToken] = useState("");
  const [gatewayPort, setGatewayPort] = useState(18789);
  const [configReadStatus, setConfigReadStatus] = useState<TestStatus>("idle");
  const [wsStatus, setWsStatus] = useState<TestStatus>("idle");
  const [wsError, setWsError] = useState("");
  const [connectedProfileId, setConnectedProfileId] = useState<string | null>(null);

  // Step 3 state
  const [name, setName] = useState("");

  // ── Step 1: Test SSH ──
  const testSsh = async () => {
    setSshStatus("testing");
    setSshError("");
    try {
      await invoke("test_ssh_connection", {
        host: host.trim(),
        user: user.trim(),
        keyPath: keyPath.trim() || null,
      });
      setSshStatus("success");
    } catch (err) {
      setSshStatus("error");
      setSshError(String(err));
    }
  };

  // ── Step 2: Auto-read remote config on enter ──
  useEffect(() => {
    if (step !== 2) return;
    setConfigReadStatus("testing");
    invoke<{ token: string; port: number }>("read_remote_gateway_config", {
      host: host.trim(),
      user: user.trim(),
      keyPath: keyPath.trim() || null,
    })
      .then((result) => {
        setGatewayToken(result.token);
        setGatewayPort(result.port);
        setConfigReadStatus("success");
      })
      .catch(() => {
        setConfigReadStatus("error");
      });
  }, [step]);

  // ── Step 2: Test Gateway (create temporary profile → connect) ──
  const testGateway = async () => {
    setWsStatus("testing");
    setWsError("");
    try {
      // Create a temporary profile in the store, connect, then we keep it
      const profile = createDefaultProfile();
      profile.name = name || `${user.trim()}@${host.trim()}`;
      profile.server.host = host.trim();
      profile.server.user = user.trim();
      profile.server.keyPath = keyPath.trim();
      profile.server.localPort = gatewayPort;
      profile.server.remotePort = gatewayPort;
      profile.gatewayToken = gatewayToken;
      addProfile(profile);
      setConnectedProfileId(profile.id);

      await invoke("connect", { profileId: profile.id });
      setWsStatus("success");
    } catch (err) {
      setWsStatus("error");
      setWsError(String(err));
      // Clean up failed temporary profile
      if (connectedProfileId) {
        const { removeProfile } = await import("../store/useProfileStore");
        removeProfile(connectedProfileId);
        setConnectedProfileId(null);
      }
    }
  };

  // ── Step 3: Save ──
  const handleSave = () => {
    if (!connectedProfileId) return;
    // Update the already-created profile with the final name
    const { updateProfile } = require("../store/useProfileStore") as typeof import("../store/useProfileStore");
    const finalName = name.trim() || `${user.trim()}@${host.trim()}`;
    updateProfile(connectedProfileId, { name: finalName });
    onCreated(connectedProfileId);
  };

  // Default name when entering step 3
  useEffect(() => {
    if (step === 3 && !name) {
      setName(`${user.trim()}@${host.trim()}`);
    }
  }, [step]);

  // ── Navigation helpers ──
  const canGoToStep2 = sshStatus === "success";
  const canGoToStep3 = wsStatus === "success";

  const goNext = () => {
    if (step === 1 && canGoToStep2) setStep(2);
    else if (step === 2 && canGoToStep3) setStep(3);
  };

  const goBack = () => {
    if (step === 2) setStep(1);
    else if (step === 3) setStep(2);
  };

  // ── Step indicator ──
  const StepIndicator = () => (
    <div className="flex items-center gap-2 mb-6">
      {[1, 2, 3].map((s) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold ${
              s === step
                ? "bg-primary text-primary-foreground"
                : s < step
                  ? "bg-primary/20 text-primary"
                  : "bg-muted text-muted-foreground"
            }`}
          >
            {s}
          </div>
          <span
            className={`text-sm ${
              s === step ? "text-foreground font-medium" : "text-muted-foreground"
            }`}
          >
            {s === 1 ? t("wizard.step1_title") : s === 2 ? t("wizard.step2_title") : t("wizard.step3_title")}
          </span>
          {s < 3 && <div className="w-8 h-px bg-border" />}
        </div>
      ))}
    </div>
  );

  // ── Status feedback component ──
  const StatusFeedback = ({ status, successMsg, errorMsg }: {
    status: TestStatus;
    successMsg: string;
    errorMsg: string;
  }) => {
    if (status === "testing") {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
          <Loader2 className="w-4 h-4 animate-spin" />
          {t("wizard.testing")}
        </div>
      );
    }
    if (status === "success") {
      return (
        <div className="flex items-center gap-2 text-sm text-primary">
          <CheckCircle2 className="w-4 h-4" />
          {successMsg}
        </div>
      );
    }
    if (status === "error") {
      return (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="w-4 h-4" />
          {errorMsg}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="p-6 space-y-6">
      <StepIndicator />

      {/* ── Step 1: SSH Connection ── */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                {t("connection.host")}
              </label>
              <Input
                value={host}
                onChange={(e) => { setHost(e.target.value); setSshStatus("idle"); }}
                placeholder="192.168.16.30"
                autoCapitalize="none" autoCorrect="off" spellCheck={false}
                autoFocus
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                {t("connection.user")}
              </label>
              <Input
                value={user}
                onChange={(e) => { setUser(e.target.value); setSshStatus("idle"); }}
                placeholder="root"
                autoCapitalize="none" autoCorrect="off" spellCheck={false}
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
              {t("connection.key_path")}
            </label>
            <Input
              value={keyPath}
              onChange={(e) => { setKeyPath(e.target.value); setSshStatus("idle"); }}
              placeholder="~/.ssh/id_ed25519"
              autoCapitalize="none" autoCorrect="off" spellCheck={false}
            />
          </div>

          <div className="flex items-center gap-4">
            <Button
              onClick={testSsh}
              disabled={!host.trim() || !user.trim() || sshStatus === "testing"}
            >
              {sshStatus === "testing" ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" />{t("wizard.testing")}</>
              ) : (
                t("wizard.test_ssh")
              )}
            </Button>
            <StatusFeedback
              status={sshStatus}
              successMsg={t("wizard.ssh_success")}
              errorMsg={t("wizard.ssh_failed", { msg: sshError })}
            />
          </div>
        </div>
      )}

      {/* ── Step 2: Gateway Config ── */}
      {step === 2 && (
        <div className="space-y-4">
          {/* Auto-read status */}
          <StatusFeedback
            status={configReadStatus}
            successMsg={t("wizard.config_read_success")}
            errorMsg={t("wizard.config_read_failed")}
          />

          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
              {t("connection.gateway_token")}
            </label>
            <Input
              value={gatewayToken}
              onChange={(e) => { setGatewayToken(e.target.value); setWsStatus("idle"); }}
              disabled={configReadStatus === "testing"}
              placeholder={t("connection.gateway_token_placeholder")}
              type="password"
              autoCapitalize="none" autoCorrect="off" spellCheck={false}
            />
          </div>

          <div className="flex items-center gap-4">
            <Button
              onClick={testGateway}
              disabled={!gatewayToken.trim() || wsStatus === "testing" || configReadStatus === "testing"}
            >
              {wsStatus === "testing" ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" />{t("wizard.testing")}</>
              ) : (
                t("wizard.test_gateway")
              )}
            </Button>
            <StatusFeedback
              status={wsStatus}
              successMsg={t("wizard.ws_success")}
              errorMsg={t("wizard.ws_failed", { msg: wsError })}
            />
          </div>
        </div>
      )}

      {/* ── Step 3: Name & Save ── */}
      {step === 3 && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-muted-foreground mb-1.5">
              {t("wizard.profile_name")}
            </label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={`${user}@${host}`}
              autoFocus
            />
          </div>
        </div>
      )}

      {/* ── Bottom Navigation ── */}
      <div className="flex items-center gap-3 pt-2 border-t border-border">
        <Button variant="ghost" onClick={onCancel}>
          {t("profile.cancel")}
        </Button>
        <div className="flex-1" />
        {step > 1 && (
          <Button variant="outline" onClick={goBack}>
            <ArrowLeft className="w-4 h-4 mr-1" />
            {t("wizard.back")}
          </Button>
        )}
        {step < 3 ? (
          <Button
            onClick={goNext}
            disabled={step === 1 ? !canGoToStep2 : !canGoToStep3}
          >
            {t("wizard.next")}
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <Button onClick={handleSave} disabled={!name.trim()}>
            {t("wizard.save")}
          </Button>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 3: Commit**

```bash
git add src/components/ProfileWizard.tsx
git commit -m "feat: add ProfileWizard 3-step component"
```

---

### Task 5: Frontend — Wire wizard into ConnectionPage

**Files:**
- Modify: `src/pages/ConnectionPage.tsx`

**Context:** Replace the `NewProfileForm` import with `ProfileWizard`. The props interface is identical (`onCreated`, `onCancel`), so ConnectionPage barely changes.

**Step 1: Update ConnectionPage.tsx**

Change the import on line 7:

```tsx
// Before:
import { NewProfileForm } from "../components/NewProfileForm";

// After:
import { ProfileWizard } from "../components/ProfileWizard";
```

Change the JSX usage (around line 34):

```tsx
// Before:
<NewProfileForm
  onCreated={(id) => {
    setActiveProfileId(id);
    setMode("view");
  }}
  onCancel={() => setMode("view")}
/>

// After:
<ProfileWizard
  onCreated={(id) => {
    setActiveProfileId(id);
    setMode("view");
  }}
  onCancel={() => setMode("view")}
/>
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 3: Commit**

```bash
git add src/pages/ConnectionPage.tsx
git commit -m "feat: wire ProfileWizard into ConnectionPage"
```

---

### Task 6: Fix — Clean up the testGateway flow in ProfileWizard

**Files:**
- Modify: `src/components/ProfileWizard.tsx`

**Context:** The current `testGateway` creates a temporary profile and connects. This has a subtle issue: if the user goes back to Step 1 or cancels after a successful WS test, the temporary profile and its active connection remain in the store. We need to handle cleanup properly.

**Step 1: Refactor testGateway to use import() properly and handle cleanup on cancel**

Replace the `testGateway` function and `handleSave` with a cleaner approach:

- `testGateway`: create temp profile, call `connect()`. On failure, remove the temp profile.
- `handleSave`: just rename the already-created profile.
- Add `onCancel` cleanup: if `connectedProfileId` exists on cancel, disconnect and remove it.

Replace the `handleSave` function (around line 93) with:

```tsx
const handleSave = async () => {
  if (!connectedProfileId) return;
  const finalName = name.trim() || `${user.trim()}@${host.trim()}`;
  updateProfile(connectedProfileId, { name: finalName });
  onCreated(connectedProfileId);
};
```

Add this import at top of file:

```tsx
import { addProfile, createDefaultProfile, updateProfile, removeProfile } from "../store/useProfileStore";
```

(removing the old `import { addProfile, createDefaultProfile }` line)

Replace the `onCancel` button's `onClick` to handle cleanup:

```tsx
const handleCancel = async () => {
  if (connectedProfileId) {
    try { await invoke("disconnect"); } catch {}
    removeProfile(connectedProfileId);
  }
  onCancel();
};
```

Update `testGateway` to use the imported `removeProfile` directly (no dynamic import):

```tsx
const testGateway = async () => {
  setWsStatus("testing");
  setWsError("");
  try {
    const profile = createDefaultProfile();
    profile.name = `${user.trim()}@${host.trim()}`;
    profile.server.host = host.trim();
    profile.server.user = user.trim();
    profile.server.keyPath = keyPath.trim();
    profile.server.localPort = gatewayPort;
    profile.server.remotePort = gatewayPort;
    profile.gatewayToken = gatewayToken;
    addProfile(profile);
    setConnectedProfileId(profile.id);

    await invoke("connect", { profileId: profile.id });
    setWsStatus("success");
  } catch (err) {
    setWsStatus("error");
    setWsError(String(err));
    if (connectedProfileId) {
      try { await invoke("disconnect"); } catch {}
      removeProfile(connectedProfileId);
      setConnectedProfileId(null);
    }
  }
};
```

And in the Cancel button JSX, use `handleCancel` instead of `onCancel`:

```tsx
<Button variant="ghost" onClick={handleCancel}>
```

**Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 3: Commit**

```bash
git add src/components/ProfileWizard.tsx
git commit -m "fix: clean up temp profile on wizard cancel/failure"
```

---

### Task 7: Verify full build + manual test

**Files:** None (verification only)

**Step 1: Run frontend type check**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 2: Run backend tests**

Run: `cd src-tauri && cargo test`
Expected: all tests pass

**Step 3: Start dev server and test manually**

Run: `pnpm tauri dev`

Manual test checklist:
1. Click "+" to create a new profile
2. See Step 1 with Host, User, Key Path fields and step indicator showing "1 2 3"
3. Enter `192.168.16.30`, `root`, leave default key path
4. Click "Test Connection" → should succeed with green checkmark
5. Click "Next" → moves to Step 2
6. Should auto-read remote config, show "Token auto-detected"
7. Click "Test Gateway" → establishes real connection
8. Click "Next" → moves to Step 3 with default name `root@192.168.16.30`
9. Click "Save" → profile created, sidebar updated, detail view shown

**Step 4: Commit version bump**

```bash
# Only if all tests pass
git add -A
git commit -m "chore: connection wizard verified working"
```
