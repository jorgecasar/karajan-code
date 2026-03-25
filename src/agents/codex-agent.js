import { BaseAgent } from "./base-agent.js";
import { runCommand } from "../utils/process.js";
import { resolveBin } from "./resolve-bin.js";

export class CodexAgent extends BaseAgent {
  async runTask(task) {
    const role = task.role || "coder";
    const model = this.getRoleModel(role);
    const result = await this._exec(task, model, role);
    if (!result.ok && model && this.isModelNotSupportedError(result)) {
      this.logger?.warn(`Codex model "${model}" not supported — retrying with agent default`);
      return this._exec(task, null, role);
    }
    return result;
  }

  async reviewTask(task) {
    const role = task.role || "reviewer";
    const model = this.getRoleModel(role);
    const result = await this._exec(task, model, role);
    if (!result.ok && model && this.isModelNotSupportedError(result)) {
      this.logger?.warn(`Codex model "${model}" not supported — retrying with agent default`);
      return this._exec(task, null, role);
    }
    return result;
  }

  async _exec(task, model, role) {
    const args = ["exec"];
    if (model) args.push("--model", model);
    if (role !== "reviewer" && this.isAutoApproveEnabled(role)) args.push("--full-auto");
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
