use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ServerConfig {
    pub host: String,
    pub user: String,
    pub key_path: String,
    pub local_port: u16,
    pub remote_port: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RuntimeConfig {
    pub heartbeat_interval_sec: u16,
    pub reconnect_interval_sec: u16,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionProfile {
    pub id: String,
    pub name: String,
    pub server: ServerConfig,
    pub gateway_token: String,
    pub node_name: String,
    pub node_id: String,
    pub cdp_port: u16,
    pub cdp_remote_port: u16,
    pub created_at: String,
}

impl Default for ConnectionProfile {
    fn default() -> Self {
        Self {
            id: generate_node_id(),
            name: format!("Default ({})", default_node_name()),
            server: ServerConfig {
                host: "127.0.0.1".to_string(),
                user: String::new(),
                key_path: "~/.ssh/id_ed25519".to_string(),
                local_port: 18789,
                remote_port: 18789,
            },
            gateway_token: String::new(),
            node_name: default_node_name(),
            node_id: generate_node_id(),
            cdp_port: 9222,
            cdp_remote_port: 19222,
            created_at: chrono_now(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub profiles: Vec<ConnectionProfile>,
    pub active_profile_id: Option<String>,
    pub runtime: RuntimeConfig,
    pub global_allow: bool,
}

fn generate_node_id() -> String {
    Uuid::new_v4().to_string()
}

fn default_node_name() -> String {
    let os = match std::env::consts::OS {
        "macos" => "macOS",
        "windows" => "Windows",
        "linux" => "Linux",
        other => other,
    };
    format!("OpenClaw Connector ({os})")
}

fn default_cdp_port() -> u16 {
    9222
}

fn default_cdp_remote_port() -> u16 {
    19222
}

impl Default for AppConfig {
    fn default() -> Self {
        let profile = ConnectionProfile::default();
        let id = profile.id.clone();
        Self {
            profiles: vec![profile],
            active_profile_id: Some(id),
            runtime: RuntimeConfig {
                heartbeat_interval_sec: 15,
                reconnect_interval_sec: 5,
            },
            global_allow: true,
        }
    }
}

fn chrono_now() -> String {
    let dur = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}", dur.as_secs())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct LegacyAppConfig {
    server: ServerConfig,
    runtime: RuntimeConfig,
    global_allow: bool,
    #[serde(default)]
    gateway_token: String,
    #[serde(default = "generate_node_id")]
    node_id: String,
    #[serde(default = "default_node_name")]
    node_name: String,
    #[serde(default = "default_cdp_port")]
    cdp_port: u16,
    #[serde(default = "default_cdp_remote_port")]
    cdp_remote_port: u16,
}

pub fn load_config(path: &Path) -> Result<AppConfig, String> {
    if !path.exists() {
        return Ok(AppConfig::default());
    }

    let content = fs::read_to_string(path)
        .map_err(|err| format!("failed to read config {}: {err}", path.display()))?;

    // Try new format first
    if let Ok(cfg) = serde_json::from_str::<AppConfig>(&content) {
        return Ok(cfg);
    }

    // Try legacy format and migrate
    let legacy: LegacyAppConfig = serde_json::from_str(&content)
        .map_err(|err| format!("failed to parse config {}: {err}", path.display()))?;

    let profile = ConnectionProfile {
        id: generate_node_id(),
        name: legacy.node_name.clone(),
        server: legacy.server,
        gateway_token: legacy.gateway_token,
        node_name: legacy.node_name,
        node_id: legacy.node_id,
        cdp_port: legacy.cdp_port,
        cdp_remote_port: legacy.cdp_remote_port,
        created_at: chrono_now(),
    };
    let id = profile.id.clone();

    Ok(AppConfig {
        profiles: vec![profile],
        active_profile_id: Some(id),
        runtime: legacy.runtime,
        global_allow: legacy.global_allow,
    })
}

pub fn save_config(path: &Path, config: &AppConfig) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .map_err(|err| format!("failed to create config dir {}: {err}", parent.display()))?;
    }
    let data = serde_json::to_string_pretty(config)
        .map_err(|err| format!("failed to serialize config: {err}"))?;
    fs::write(path, data)
        .map_err(|err| format!("failed to write config {}: {err}", path.display()))
}
