use crate::config::ServerConfig;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TunnelState {
    Disconnected,
    Connecting,
    Connected,
    Reconnecting,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TunnelStatus {
    pub state: TunnelState,
    pub reconnect_attempts: u32,
    pub last_error: Option<String>,
}

#[derive(Debug, Default)]
pub struct TunnelManager {
    state: TunnelState,
    reconnect_attempts: u32,
    last_error: Option<String>,
    active_server: Option<ServerConfig>,
}

impl TunnelManager {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn start(&mut self, server: ServerConfig) -> Result<(), String> {
        if server.host.trim().is_empty() {
            self.last_error = Some("server host cannot be empty".to_string());
            return Err(self.last_error.clone().unwrap_or_default());
        }

        self.state = TunnelState::Connecting;
        self.active_server = Some(server);
        self.last_error = None;
        self.state = TunnelState::Connected;
        Ok(())
    }

    pub fn stop(&mut self) -> Result<(), String> {
        self.active_server = None;
        self.state = TunnelState::Disconnected;
        Ok(())
    }

    pub fn reconnect(&mut self) -> Result<(), String> {
        let Some(server) = self.active_server.clone() else {
            self.last_error = Some("cannot reconnect without active tunnel".to_string());
            return Err(self.last_error.clone().unwrap_or_default());
        };

        self.state = TunnelState::Reconnecting;
        self.reconnect_attempts += 1;
        self.start(server)
    }

    pub fn state(&self) -> TunnelState {
        self.state
    }

    pub fn is_connected(&self) -> bool {
        self.state == TunnelState::Connected
    }

    pub fn status(&self) -> TunnelStatus {
        TunnelStatus {
            state: self.state,
            reconnect_attempts: self.reconnect_attempts,
            last_error: self.last_error.clone(),
        }
    }

    pub fn build_ssh_args(server: &ServerConfig) -> Vec<String> {
        vec![
            "-N".to_string(),
            "-L".to_string(),
            format!("{}:127.0.0.1:{}", server.local_port, server.remote_port),
            "-i".to_string(),
            server.key_path.clone(),
            format!("{}@{}", server.user, server.host),
        ]
    }
}

impl Default for TunnelState {
    fn default() -> Self {
        Self::Disconnected
    }
}
