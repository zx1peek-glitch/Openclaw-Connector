use connector::emergency::emergency_disconnect_internal;
use connector::ssh_tunnel::{TunnelManager, TunnelState};
use connector::tasks::TaskLoopControl;

#[test]
fn emergency_disconnect_stops_tunnel_and_task_loop() {
    let mut tunnel = TunnelManager::new();
    let mut loop_control = TaskLoopControl::new();

    emergency_disconnect_internal(&mut tunnel, &mut loop_control).expect("disconnect works");

    assert_eq!(tunnel.state(), TunnelState::Disconnected);
    assert!(!loop_control.is_active());
}
