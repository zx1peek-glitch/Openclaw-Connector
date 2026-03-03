use crate::tasks::IncomingTask;
use serde::Serialize;
use std::process::Command;
use std::time::Instant;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskExecutionOutput {
    pub exit_code: i32,
    pub stdout: String,
    pub stderr: String,
    pub duration_ms: u128,
}

#[derive(Debug, Default, Clone)]
pub struct TaskExecutor;

impl TaskExecutor {
    pub fn new() -> Self {
        Self
    }

    pub fn execute(&self, task: &IncomingTask) -> Result<TaskExecutionOutput, String> {
        match task.action.as_str() {
            "system.run" => self.run_shell_command(task),
            other => Err(format!("unsupported action: {other}")),
        }
    }

    fn run_shell_command(&self, task: &IncomingTask) -> Result<TaskExecutionOutput, String> {
        let command = task
            .args
            .get("command")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "system.run requires args.command string".to_string())?;

        let start = Instant::now();
        let output = Command::new("/bin/zsh")
            .arg("-lc")
            .arg(command)
            .output()
            .map_err(|err| format!("failed to run command: {err}"))?;

        Ok(TaskExecutionOutput {
            exit_code: output.status.code().unwrap_or(-1),
            stdout: String::from_utf8_lossy(&output.stdout).trim_end().to_string(),
            stderr: String::from_utf8_lossy(&output.stderr).trim_end().to_string(),
            duration_ms: start.elapsed().as_millis(),
        })
    }
}
