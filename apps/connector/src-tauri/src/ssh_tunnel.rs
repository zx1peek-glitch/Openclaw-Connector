use crate::config::ServerConfig;
use serde::{Deserialize, Serialize};
use std::io::Read;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

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
    child: Option<Child>,
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
        if server.user.trim().is_empty() {
            self.last_error = Some("server user cannot be empty".to_string());
            return Err(self.last_error.clone().unwrap_or_default());
        }
        if server.key_path.trim().is_empty() {
            self.last_error = Some("server key path cannot be empty".to_string());
            return Err(self.last_error.clone().unwrap_or_default());
        }

        // Test mode keeps integration tests deterministic without relying on external SSH.
        if std::env::var("OPENCLAW_CONNECTOR_FAKE_TUNNEL").as_deref() == Ok("1") {
            self.state = TunnelState::Connected;
            self.active_server = Some(server);
            self.last_error = None;
            return Ok(());
        }

        // Ensure we don't leak previous ssh child when reconnecting.
        if self.child.is_some() {
            let _ = self.stop();
        }

        self.state = TunnelState::Connecting;
        self.active_server = Some(server.clone());
        self.last_error = None;

        let mut child = Command::new("ssh")
            .args(Self::build_ssh_args(&server))
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|err| {
                let msg = format!("failed to spawn ssh: {err}");
                self.last_error = Some(msg.clone());
                self.state = TunnelState::Disconnected;
                msg
            })?;

        // If ssh exits within timeout, treat it as failed connection.
        let deadline = Instant::now() + Duration::from_secs(4);
        loop {
            match child.try_wait() {
                Ok(Some(status)) => {
                    let mut stderr = String::new();
                    if let Some(mut pipe) = child.stderr.take() {
                        let _ = pipe.read_to_string(&mut stderr);
                    }

                    let raw = stderr.trim();
                    let reason = if raw.is_empty() {
                        format!("ssh exited early with status {status}")
                    } else {
                        format!("ssh exited early ({status}): {raw}")
                    };

                    self.state = TunnelState::Disconnected;
                    self.last_error = Some(reason.clone());
                    self.child = None;
                    return Err(reason);
                }
                Ok(None) => {
                    if Instant::now() >= deadline {
                        self.child = Some(child);
                        self.state = TunnelState::Connected;
                        self.last_error = None;
                        return Ok(());
                    }
                    std::thread::sleep(Duration::from_millis(120));
                }
                Err(err) => {
                    let msg = format!("failed to check ssh process: {err}");
                    self.state = TunnelState::Disconnected;
                    self.last_error = Some(msg.clone());
                    self.child = None;
                    return Err(msg);
                }
            }
        }
    }

    pub fn stop(&mut self) -> Result<(), String> {
        if let Some(mut child) = self.child.take() {
            // Kill is fine here because this is user-requested immediate disconnect.
            let _ = child.kill();
            let _ = child.wait();
        }
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

    pub fn refresh_status(&mut self) -> TunnelStatus {
        if let Some(child) = self.child.as_mut() {
            match child.try_wait() {
                Ok(Some(status)) => {
                    self.state = TunnelState::Disconnected;
                    self.last_error = Some(format!("ssh process exited: {status}"));
                    self.child = None;
                }
                Ok(None) => {}
                Err(err) => {
                    self.state = TunnelState::Disconnected;
                    self.last_error = Some(format!("ssh status check failed: {err}"));
                    self.child = None;
                }
            }
        }
        self.status()
    }

    pub fn build_ssh_args(server: &ServerConfig) -> Vec<String> {
        let key_path = if let Some(rest) = server.key_path.strip_prefix("~/") {
            match std::env::var("HOME") {
                Ok(home) => format!("{home}/{rest}"),
                Err(_) => server.key_path.clone(),
            }
        } else {
            server.key_path.clone()
        };

        vec![
            "-N".to_string(),
            "-L".to_string(),
            format!("{}:127.0.0.1:{}", server.local_port, server.remote_port),
            "-o".to_string(),
            "ExitOnForwardFailure=yes".to_string(),
            "-o".to_string(),
            "BatchMode=yes".to_string(),
            "-o".to_string(),
            "ConnectTimeout=4".to_string(),
            "-o".to_string(),
            "ServerAliveInterval=20".to_string(),
            "-o".to_string(),
            "ServerAliveCountMax=1".to_string(),
            "-o".to_string(),
            "StrictHostKeyChecking=accept-new".to_string(),
            "-i".to_string(),
            key_path,
            format!("{}@{}", server.user, server.host),
        ]
    }
}

impl Default for TunnelState {
    fn default() -> Self {
        Self::Disconnected
    }
}
