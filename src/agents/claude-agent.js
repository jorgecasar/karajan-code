import { BaseAgent } from "./base-agent.js";
import { runCommand } from "../utils/process.js";
import { resolveBin } from "./resolve-bin.js";

/**
 * Extract the final text result from stream-json NDJSON output.
 * Each line is a JSON object. We collect assistant text content from
 * "result" messages and fall back to accumulating "content_block_delta" text.
 */
function extractTextFromStreamJson(raw) {
  const lines = (raw || "").split("\n").filter(Boolean);
  // Try to find a "result" message with the final text
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const obj = JSON.parse(lines[i]);
      if (obj.type === "result" && obj.result) {
        return typeof obj.result === "string" ? obj.result : JSON.stringify(obj.result);
      }
      // Claude Code stream-json final message
      if (obj.result && typeof obj.result === "string") {
        return obj.result;
      }
    } catch { /* skip unparseable lines */ }
  }
  // Fallback: accumulate all assistant text deltas
  const parts = [];
  for (const line of lines) {
    try {
      const obj = JSON.parse(line);
      if (obj.type === "assistant" && obj.message?.content) {
        for (const block of obj.message.content) {
          if (block.type === "text" && block.text) parts.push(block.text);
        }
      }
    } catch { /* skip */ }
  }
  return parts.join("") || raw;
}

/**
 * Create a wrapping onOutput that parses stream-json lines and forwards
 * meaningful content (assistant text, tool usage) to the original callback.
 */
function createStreamJsonFilter(onOutput) {
  if (!onOutput) return null;
  return ({ stream, line }) => {
    try {
      const obj = JSON.parse(line);
      // Forward assistant text messages
      if (obj.type === "assistant" && obj.message?.content) {
        for (const block of obj.message.content) {
          if (block.type === "text" && block.text) {
            onOutput({ stream, line: block.text.slice(0, 200) });
          } else if (block.type === "tool_use") {
            onOutput({ stream, line: `[tool: ${block.name}]` });
          }
        }
        return;
      }
      // Forward result
      if (obj.type === "result") {
        const summary = typeof obj.result === "string"
          ? obj.result.slice(0, 200)
          : "result received";
        onOutput({ stream, line: `[result] ${summary}` });
        return;
      }
    } catch { /* not JSON, forward raw */ }
    onOutput({ stream, line });
  };
}

export class ClaudeAgent extends BaseAgent {
  async runTask(task) {
    const role = task.role || "coder";
    const args = ["-p", task.prompt];
    const model = this.getRoleModel(role);
    if (model) args.push("--model", model);

    // Use stream-json when onOutput is provided to get real-time feedback
    if (task.onOutput) {
      args.push("--output-format", "stream-json");
      const streamFilter = createStreamJsonFilter(task.onOutput);
      const res = await runCommand(resolveBin("claude"), args, {
        onOutput: streamFilter,
        silenceTimeoutMs: task.silenceTimeoutMs
      });
      const output = extractTextFromStreamJson(res.stdout);
      return { ok: res.exitCode === 0, output, error: res.stderr, exitCode: res.exitCode };
    }

    const res = await runCommand(resolveBin("claude"), args);
    return { ok: res.exitCode === 0, output: res.stdout, error: res.stderr, exitCode: res.exitCode };
  }

  async reviewTask(task) {
    const args = ["-p", task.prompt, "--output-format", "json"];
    const model = this.getRoleModel(task.role || "reviewer");
    if (model) args.push("--model", model);
    const res = await runCommand(resolveBin("claude"), args, {
      onOutput: task.onOutput,
      silenceTimeoutMs: task.silenceTimeoutMs
    });
    return { ok: res.exitCode === 0, output: res.stdout, error: res.stderr, exitCode: res.exitCode };
  }
}
