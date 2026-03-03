use std::collections::HashMap;

pub type AgentId = String;
pub type NodeId = String;

#[derive(Debug, Default, Clone)]
pub struct BindingMap {
    bindings: HashMap<AgentId, NodeId>,
}

impl BindingMap {
    pub fn set(&mut self, agent_id: impl Into<String>, node_id: impl Into<String>) {
        self.bindings.insert(agent_id.into(), node_id.into());
    }

    pub fn get(&self, agent_id: &str) -> Option<String> {
        self.bindings.get(agent_id).cloned()
    }

    pub fn remove(&mut self, agent_id: &str) {
        self.bindings.remove(agent_id);
    }

    pub fn all(&self) -> HashMap<String, String> {
        self.bindings.clone()
    }
}
