import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

type IncomingTask = {
  taskId: string;
  agentId: string;
  action: string;
  args: {
    command?: string;
  };
  timeoutSec: number;
};

type RunConnectorFlowInput = {
  gatewayBaseUrl: string;
  localNodeId: string;
  bindings: Record<string, string>;
};

export async function runConnectorFlow(input: RunConnectorFlowInput): Promise<void> {
  const healthRes = await fetch(`${input.gatewayBaseUrl}/health`);
  if (!healthRes.ok) {
    throw new Error(`gateway health failed: ${healthRes.status}`);
  }

  const nextTaskRes = await fetch(`${input.gatewayBaseUrl}/tasks/next`, {
    method: "POST"
  });
  if (!nextTaskRes.ok) {
    throw new Error(`task polling failed: ${nextTaskRes.status}`);
  }

  const task = (await nextTaskRes.json()) as IncomingTask;
  const boundNode = input.bindings[task.agentId];
  if (!boundNode || boundNode !== input.localNodeId) {
    return;
  }

  if (task.action !== "system.run" || !task.args.command) {
    throw new Error(`unsupported task action: ${task.action}`);
  }

  let exitCode = 0;
  let stdout = "";
  let stderr = "";

  try {
    const result = await execFileAsync("/bin/zsh", ["-lc", task.args.command], {
      timeout: task.timeoutSec * 1000
    });
    stdout = result.stdout.trimEnd();
    stderr = result.stderr.trimEnd();
  } catch (error: unknown) {
    const err = error as { code?: number; stdout?: string; stderr?: string };
    exitCode = typeof err.code === "number" ? err.code : 1;
    stdout = (err.stdout ?? "").trimEnd();
    stderr = (err.stderr ?? "").trimEnd();
  }

  await fetch(`${input.gatewayBaseUrl}/tasks/${task.taskId}/callback`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      taskId: task.taskId,
      exitCode,
      stdout,
      stderr
    })
  });
}
