# Diagnostic Log Export — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 用户点击一个按钮，导出诊断日志 JSON 文件，用于远程排查问题。

**Architecture:** 新增 Rust 命令 `export_diagnostics`，接收前端传入的完整诊断 JSON 字符串，弹出系统保存对话框（rfd crate），写入用户选择的路径。前端负责收集 activity log + connection status + health + profile 信息并组装 JSON。UI 入口在 Activity Log 卡片标题栏。

**Tech Stack:** Rust (rfd crate for native file dialog), React/TypeScript (数据收集 + 触发导出)

---

### Task 1: Add `rfd` dependency and `export_diagnostics` Rust command

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`

**Step 1: Add `rfd` to Cargo.toml**

In `src-tauri/Cargo.toml`, add to `[dependencies]`:

```toml
rfd = "0.15"
```

**Step 2: Add `export_diagnostics` command to `lib.rs`**

Add the following command (before `generate_handler!`):

```rust
#[tauri::command]
async fn export_diagnostics(json_content: String) -> Result<bool, String> {
    let handle = rfd::AsyncFileDialog::new()
        .set_title("Export Diagnostics")
        .set_file_name("openclaw-diagnostics.json")
        .add_filter("JSON", &["json"])
        .save_file()
        .await;

    match handle {
        Some(file) => {
            file.write(json_content.as_bytes())
                .await
                .map_err(|e| format!("Failed to write file: {}", e))?;
            Ok(true)
        }
        None => Ok(false), // User cancelled
    }
}
```

Register it in `generate_handler!`:

```rust
generate_handler![
    // ... existing commands ...
    export_diagnostics
]
```

**Step 3: Build to verify**

Run: `cd src-tauri && cargo check`
Expected: Compiles without errors.

**Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/lib.rs
git commit -m "feat: add export_diagnostics command with rfd file dialog"
```

---

### Task 2: Add i18n keys for export button

**Files:**
- Modify: `src/i18n/zh.json`
- Modify: `src/i18n/en.json`

**Step 1: Add keys to both files**

In `zh.json`, add to `"activity"` section:

```json
"export": "导出诊断日志",
"export_success": "日志已导出",
"export_failed": "导出失败：{{msg}}"
```

In `en.json`, add to `"activity"` section:

```json
"export": "Export Diagnostics",
"export_success": "Diagnostics exported",
"export_failed": "Export failed: {{msg}}"
```

**Step 2: Commit**

```bash
git add src/i18n/zh.json src/i18n/en.json
git commit -m "feat: add i18n keys for diagnostic export"
```

---

### Task 3: Add export button and logic to ProfileDetail

**Files:**
- Modify: `src/components/ProfileDetail.tsx`

**Step 1: Add import for Bug icon**

In the `lucide-react` import line, add `Bug` to the existing icons.

**Step 2: Add export handler function**

Inside the `ProfileDetail` component, add a function that:

1. Calls `invoke("get_connection_status")` and `invoke("get_health_summary")` to get fresh backend data
2. Reads `useActivityStore.getState().entries` for the activity log
3. Gets the current profile from props (sanitize: replace `gatewayToken` with `"***"`)
4. Assembles a diagnostic JSON object:

```typescript
const exportDiagnostics = async () => {
  try {
    const [conn, health] = await Promise.all([
      invoke<ConnectionStatus>("get_connection_status"),
      invoke<{ latencyMs: number; tunnelConnected: boolean; gatewayOk: boolean; consecutiveFailures: number }>("get_health_summary"),
    ]);

    const entries = useActivityStore.getState().entries;

    const diag = {
      exported_at: new Date().toISOString(),
      app_version: "0.3.0",
      os: navigator.userAgent,
      profile: {
        name: profile.name,
        host: profile.server.host,
        user: profile.server.user,
        remotePort: profile.server.remotePort,
        localPort: profile.server.localPort,
        keyPath: profile.server.keyPath,
        token: "***",
      },
      connection: conn,
      health,
      activity_log: entries,
    };

    const json = JSON.stringify(diag, null, 2);
    const saved = await invoke<boolean>("export_diagnostics", { jsonContent: json });
    if (saved) {
      pushActivity("info", t("activity.export_success"));
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    pushActivity("error", t("activity.export_failed", { msg }));
  }
};
```

**Step 3: Add Bug icon button next to Clear button in Activity Log card header**

In the `CardHeader` of the Activity Log card (around line 856), add a `Bug` icon button before the existing Clear button:

```tsx
<CardHeader className="flex flex-row items-center justify-between pb-4">
  <CardTitle>
    <Terminal className="w-5 h-5 text-muted-foreground" />
    {t("activity.title")}
  </CardTitle>
  <div className="flex items-center gap-1">
    <Button
      variant="ghost"
      size="sm"
      onClick={exportDiagnostics}
      className="h-8 text-xs text-muted-foreground hover:text-foreground"
      title={t("activity.export")}
    >
      <Bug className="w-4 h-4" />
    </Button>
    {entries.length > 0 && (
      <Button variant="ghost" size="sm" onClick={clearActivity} className="h-8 text-xs text-muted-foreground hover:text-foreground">
        {t("activity.clear")}
      </Button>
    )}
  </div>
</CardHeader>
```

**Step 4: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: No errors.

**Step 5: Test manually**

1. Start dev server: `pnpm tauri dev`
2. Click Bug icon in Activity Log card
3. Should see native save dialog with filename "openclaw-diagnostics.json"
4. Save and verify file contents contain all expected fields

**Step 6: Commit**

```bash
git add src/components/ProfileDetail.tsx
git commit -m "feat: add diagnostic log export button to activity log"
```
