import { BaseAgent } from "./base-agent.js";
import { runCommand } from "../utils/process.js";
import { resolveBin } from "./resolve-bin.js";

export class GeminiAgent extends BaseAgent {
  async runTask(task) {
    const role = task.role || "coder";
    const args = ["-p", task.prompt];
    const model = this.getRoleModel(role);
    if (model) args.push("--model", model);
    const res = await runCommand(resolveBin("gemini"), args, {
      onOutput: task.onOutput,
      silenceTimeoutMs: task.silenceTimeoutMs
    });
    return { ok: res.exitCode === 0, output: res.stdout, error: res.stderr, exitCode: res.exitCode };
  }

  async reviewTask(task) {
    const role = task.role || "reviewer";
    const args = ["-p", task.prompt, "--output-format", "json"];
    const model = this.getRoleModel(role);
    if (model) args.push("--model", model);
    const res = await runCommand(resolveBin("gemini"), args, {
      onOutput: task.onOutput,
      silenceTimeoutMs: task.silenceTimeoutMs
    });
    return { ok: res.exitCode === 0, output: res.stdout, error: res.stderr, exitCode: res.exitCode };
  }
}
