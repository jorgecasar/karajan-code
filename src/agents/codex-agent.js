import { BaseAgent } from "./base-agent.js";
import { runCommand } from "../utils/process.js";
import { resolveBin } from "./resolve-bin.js";

export class CodexAgent extends BaseAgent {
  async runTask(task) {
    const role = task.role || "coder";
    const args = ["exec"];
    const model = this.getRoleModel(role);
    if (model) args.push("--model", model);
    if (this.isAutoApproveEnabled(role)) args.push("--full-auto");
    args.push("-");
    const res = await runCommand(resolveBin("codex"), args, {
      onOutput: task.onOutput,
      silenceTimeoutMs: task.silenceTimeoutMs,
      timeout: task.timeoutMs,
      input: task.prompt
    });
    return { ok: res.exitCode === 0, output: res.stdout, error: res.stderr, exitCode: res.exitCode };
  }

  async reviewTask(task) {
    const args = ["exec"];
    const model = this.getRoleModel(task.role || "reviewer");
    if (model) args.push("--model", model);
    args.push("-");
    const res = await runCommand(resolveBin("codex"), args, {
      onOutput: task.onOutput,
      silenceTimeoutMs: task.silenceTimeoutMs,
      timeout: task.timeoutMs,
      input: task.prompt
    });
    return { ok: res.exitCode === 0, output: res.stdout, error: res.stderr, exitCode: res.exitCode };
  }
}
