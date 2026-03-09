use connector::executor::TaskExecutor;

#[test]
fn executes_system_run_command() {
    let exec = TaskExecutor::new();
    let parts = vec!["printf".to_string(), "ok".to_string()];

    let out = exec.execute_command(&parts).expect("exec success");
    assert_eq!(out.exit_code, 0);
    assert_eq!(out.stdout, "ok");
}
