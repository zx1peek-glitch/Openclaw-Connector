pub mod bindings;
pub mod config;
pub mod emergency;
pub mod executor;
pub mod health;
pub mod heartbeat;
pub mod ssh_tunnel;
pub mod tasks;

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

use tauri::Manager;

#[derive(Default)]
struct AppState {
    tunnel: Mutex<ssh_tunnel::TunnelManager>,
    bindings: Mutex<bindings::BindingMap>,
    task_loop: Mutex<tasks::TaskLoopControl>,
}

fn config_path(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    let app_dir = app_handle
        .path()
        .app_config_dir()
        .map_err(|err| format!("failed to get app config dir: {err}"))?;
    Ok(app_dir.join("connector-config.json"))
}

#[tauri::command]
fn load_app_config(app_handle: tauri::AppHandle) -> Result<config::AppConfig, String> {
    let path = config_path(&app_handle)?;
    config::load_config(&path)
}

#[tauri::command]
fn save_app_config(app_handle: tauri::AppHandle, cfg: config::AppConfig) -> Result<(), String> {
    let path = config_path(&app_handle)?;
    config::save_config(&path, &cfg)
}

#[tauri::command]
fn start_tunnel(state: tauri::State<'_, AppState>, server: config::ServerConfig) -> Result<(), String> {
    state
        .tunnel
        .lock()
        .map_err(|_| "failed to acquire tunnel lock".to_string())?
        .start(server)
}

#[tauri::command]
fn stop_tunnel(state: tauri::State<'_, AppState>) -> Result<(), String> {
    state
        .tunnel
        .lock()
        .map_err(|_| "failed to acquire tunnel lock".to_string())?
        .stop()
}

#[tauri::command]
fn get_tunnel_status(state: tauri::State<'_, AppState>) -> Result<ssh_tunnel::TunnelStatus, String> {
    let status = state
        .tunnel
        .lock()
        .map_err(|_| "failed to acquire tunnel lock".to_string())?
        .status();
    Ok(status)
}

#[tauri::command]
fn set_agent_binding(
    state: tauri::State<'_, AppState>,
    agent_id: String,
    node_id: String,
) -> Result<(), String> {
    state
        .bindings
        .lock()
        .map_err(|_| "failed to acquire bindings lock".to_string())?
        .set(agent_id, node_id);
    Ok(())
}

#[tauri::command]
fn remove_agent_binding(state: tauri::State<'_, AppState>, agent_id: String) -> Result<(), String> {
    state
        .bindings
        .lock()
        .map_err(|_| "failed to acquire bindings lock".to_string())?
        .remove(&agent_id);
    Ok(())
}

#[tauri::command]
fn list_agent_bindings(state: tauri::State<'_, AppState>) -> Result<HashMap<String, String>, String> {
    let map = state
        .bindings
        .lock()
        .map_err(|_| "failed to acquire bindings lock".to_string())?
        .all();
    Ok(map)
}

#[tauri::command]
fn execute_task(
    state: tauri::State<'_, AppState>,
    local_node_id: String,
    task: tasks::IncomingTask,
) -> Result<executor::TaskExecutionOutput, String> {
    let bindings = state
        .bindings
        .lock()
        .map_err(|_| "failed to acquire bindings lock".to_string())?
        .clone();

    let router = tasks::TaskRouter::new(local_node_id);
    if !router.should_execute(&task, &bindings) {
        return Err(format!(
            "task {} ignored because agent {} is not bound to this node",
            task.task_id, task.agent_id
        ));
    }

    let executor = executor::TaskExecutor::new();
    executor.execute(&task)
}

#[tauri::command]
fn emergency_disconnect(state: tauri::State<'_, AppState>) -> Result<(), String> {
    let mut tunnel = state
        .tunnel
        .lock()
        .map_err(|_| "failed to acquire tunnel lock".to_string())?;
    let mut task_loop = state
        .task_loop
        .lock()
        .map_err(|_| "failed to acquire task loop lock".to_string())?;

    emergency::emergency_disconnect_internal(&mut tunnel, &mut task_loop)
}

pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            load_app_config,
            save_app_config,
            start_tunnel,
            stop_tunnel,
            get_tunnel_status,
            set_agent_binding,
            remove_agent_binding,
            list_agent_bindings,
            execute_task,
            emergency_disconnect
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
