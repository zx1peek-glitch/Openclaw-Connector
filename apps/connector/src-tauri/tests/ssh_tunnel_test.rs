use connector::config::AppConfig;
use connector::ssh_tunnel::{TunnelManager, TunnelState};

fn sample_cfg() -> AppConfig {
    AppConfig::default()
}

#[test]
fn starts_and_stops_tunnel() {
    let mut mgr = TunnelManager::new();
    assert!(mgr.start(sample_cfg().server).is_ok());
    assert_eq!(mgr.state(), TunnelState::Connected);
    assert!(mgr.stop().is_ok());
    assert_eq!(mgr.state(), TunnelState::Disconnected);
}
