use crate::ssh_tunnel::TunnelManager;
use crate::tasks::TaskLoopControl;

pub fn emergency_disconnect_internal(
    tunnel: &mut TunnelManager,
    loop_control: &mut TaskLoopControl,
) -> Result<(), String> {
    tunnel.stop()?;
    loop_control.stop();
    Ok(())
}
