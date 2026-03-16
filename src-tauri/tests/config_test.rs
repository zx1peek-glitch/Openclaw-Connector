use connector::config::{load_config, save_config, AppConfig};

#[test]
fn loads_and_saves_single_server_config() {
    let base = std::env::temp_dir().join(format!(
        "connector-config-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("unix time")
            .as_nanos()
    ));
    std::fs::create_dir_all(&base).expect("create temp dir");
    let path = base.join("config.json");
    let cfg = AppConfig::default();
    save_config(&path, &cfg).expect("save config");
    let loaded = load_config(&path).expect("load config");
    assert_eq!(loaded.profiles.len(), 1);
    assert_eq!(loaded.profiles[0].server.host, cfg.profiles[0].server.host);
    assert_eq!(loaded.profiles[0].server.local_port, cfg.profiles[0].server.local_port);
    std::fs::remove_dir_all(base).expect("cleanup");
}

#[test]
fn migrates_old_config_format() {
    let base = std::env::temp_dir().join(format!(
        "connector-migrate-{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("unix time")
            .as_nanos()
    ));
    std::fs::create_dir_all(&base).expect("create temp dir");
    let path = base.join("config.json");
    let old_json = r#"{
        "server": { "host": "10.0.0.1", "user": "testuser", "keyPath": "~/.ssh/id_rsa", "localPort": 18789, "remotePort": 18789 },
        "runtime": { "heartbeatIntervalSec": 15, "reconnectIntervalSec": 5 },
        "globalAllow": true,
        "gatewayToken": "abc123",
        "nodeId": "old-node-id",
        "nodeName": "Old Node",
        "cdpPort": 9222,
        "cdpRemotePort": 19222
    }"#;
    std::fs::write(&path, old_json).expect("write old config");
    let loaded = load_config(&path).expect("load old config");
    assert_eq!(loaded.profiles.len(), 1);
    assert_eq!(loaded.profiles[0].name, "Old Node");
    assert_eq!(loaded.profiles[0].server.host, "10.0.0.1");
    assert_eq!(loaded.profiles[0].server.user, "testuser");
    assert_eq!(loaded.profiles[0].gateway_token, "abc123");
    assert_eq!(loaded.profiles[0].node_id, "old-node-id");
    assert!(loaded.active_profile_id.is_some());
    std::fs::remove_dir_all(base).expect("cleanup");
}

#[test]
fn default_config_has_one_profile() {
    let cfg = AppConfig::default();
    assert_eq!(cfg.profiles.len(), 1);
    assert!(cfg.active_profile_id.is_some());
    assert!(!cfg.profiles[0].id.is_empty());
    assert!(!cfg.profiles[0].node_id.is_empty());
}
