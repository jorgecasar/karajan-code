import { BaseAgent } from "./base-agent.js";
import { resolveBin } from "./resolve-bin.js";

/**
 * Extract OpenAI-style `usage` from OpenCode stdout. With `--format json`
 * (used in reviewTask) the CLI emits a JSON document; with LiteLLM-backed
 * runs that document carries `usage.prompt_tokens_details.cached_tokens`.
 *
 * Accepts the whole payload, individual lines, or array elements with a
 * nested `usage` object. Returns `{tokens_in, tokens_out, cached_tokens}`
 * or null (= unmeasured).
 */
function extractOpenCodeUsage(text) {
  if (!text) return null;
  const candidates = [text.trim()];
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (t.startsWith("{") || t.startsWith("[")) candidates.push(t);
  }
  for (const candidate of candidates) {
    let obj;
    try { obj = JSON.parse(candidate); } catch { continue; }
    const usage = obj?.usage
      ?? obj?.result?.usage
      ?? (Array.isArray(obj) ? obj.find((e) => e?.usage)?.usage : null);
    if (!usage || typeof usage.prompt_tokens !== "number") continue;
    return {
      tokens_in: usage.prompt_tokens,
      tokens_out: usage.completion_tokens ?? 0,
      cached_tokens: usage.prompt_tokens_details?.cached_tokens ?? 0
    };
  }
  return null;
}

/**
 * KJC-BUG-0358: with --format json opencode reports a failure as an error event
 * on stdout ({"type":"error","error":{"name","data":{"message"}}}) and leaves
 * stderr empty. Returns that message, or "" when there is no error event.
 */
function openCodeErrorEvent(stdout) {
  for (const line of String(stdout ?? "").split("\n")) {
    let event;
    try { event = JSON.parse(line); } catch { continue; }
    if (event?.type === "error") return event.error?.data?.message ?? event.error?.name ?? "opencode reported an error";
  }
  return "";
}

export class OpenCodeAgent extends BaseAgent {
  async runTask(task) {
    const role = task.role || "coder";
    const model = this.getRoleModel(role);
    return this._exec(task, model, false);
  }

  async reviewTask(task) {
    const role = task.role || "reviewer";
    const model = this.getRoleModel(role);
    return this._exec(task, model, true);
  }

  async _exec(task, model, jsonFormat) {
    const args = ["run"];
    if (jsonFormat) args.push("--format", "json");
    if (model) args.push("--model", model);
    args.push(task.prompt);
    const res = await this.runCommand(resolveBin("opencode"), args, {
      onOutput: task.onOutput,
      silenceTimeoutMs: task.silenceTimeoutMs,
      timeout: task.timeoutMs
    });
    const usage = extractOpenCodeUsage(res.stdout) ?? extractOpenCodeUsage(res.stderr);
    const error = res.exitCode === 0 ? res.stderr : res.stderr || openCodeErrorEvent(res.stdout);
    return { ok: res.exitCode === 0, output: res.stdout, error, exitCode: res.exitCode, ...usage };
  }
}
