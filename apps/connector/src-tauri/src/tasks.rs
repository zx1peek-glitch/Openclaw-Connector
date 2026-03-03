use crate::bindings::BindingMap;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IncomingTask {
    pub task_id: String,
    pub agent_id: String,
    pub action: String,
    pub args: Value,
    pub timeout_sec: u64,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TaskRoute {
    ExecuteLocally,
    Ignore,
}

#[derive(Debug, Clone)]
pub struct TaskRouter {
    local_node_id: String,
}

impl TaskRouter {
    pub fn new(local_node_id: impl Into<String>) -> Self {
        Self {
            local_node_id: local_node_id.into(),
        }
    }

    pub fn should_execute(&self, task: &IncomingTask, bindings: &BindingMap) -> bool {
        match bindings.get(&task.agent_id) {
            Some(node_id) => node_id == self.local_node_id,
            None => false,
        }
    }

    pub fn route(&self, task: &IncomingTask, bindings: &BindingMap) -> TaskRoute {
        if self.should_execute(task, bindings) {
            TaskRoute::ExecuteLocally
        } else {
            TaskRoute::Ignore
        }
    }
}

#[derive(Debug, Clone)]
pub struct TaskLoopControl {
    active: bool,
}

impl TaskLoopControl {
    pub fn new() -> Self {
        Self { active: true }
    }

    pub fn stop(&mut self) {
        self.active = false;
    }

    pub fn is_active(&self) -> bool {
        self.active
    }
}

impl Default for TaskLoopControl {
    fn default() -> Self {
        Self::new()
    }
}
