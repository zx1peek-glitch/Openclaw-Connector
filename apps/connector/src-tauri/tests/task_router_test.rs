use connector::bindings::BindingMap;
use connector::tasks::{IncomingTask, TaskRouter};

#[test]
fn executes_task_only_when_agent_is_bound_to_local_node() {
    let router = TaskRouter::new("mac-node-1");
    let mut bindings = BindingMap::default();
    bindings.set("main", "mac-node-1");

    let task = IncomingTask {
        task_id: "t-1".to_string(),
        agent_id: "main".to_string(),
        action: "system.run".to_string(),
        args: serde_json::json!({"command": "echo hello"}),
        timeout_sec: 5,
    };

    assert!(router.should_execute(&task, &bindings));
}
