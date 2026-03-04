import { BaseAgent } from "./base-agent.js";
import { runCommand } from "../utils/process.js";
import { resolveBin } from "./resolve-bin.js";

export class AiderAgent extends BaseAgent {
  async runTask(task) {
    const role = task.role || "coder";
    const args = ["--yes", "--message", task.prompt];
    const model = this.getRoleModel(role);
    if (model) args.push("--model", model);
    const res = await runCommand(resolveBin("aider"), args, {
      onOutput: task.onOutput,
      silenceTimeoutMs: task.silenceTimeoutMs
    });
    return { ok: res.exitCode === 0, output: res.stdout, error: res.stderr, exitCode: res.exitCode };
  }

  async reviewTask(task) {
    const role = task.role || "reviewer";
    const args = ["--yes", "--message", task.prompt];
    const model = this.getRoleModel(role);
    if (model) args.push("--model", model);
    const res = await runCommand(resolveBin("aider"), args, {
      onOutput: task.onOutput,
      silenceTimeoutMs: task.silenceTimeoutMs
    });
    return { ok: res.exitCode === 0, output: res.stdout, error: res.stderr, exitCode: res.exitCode };
  }
}
