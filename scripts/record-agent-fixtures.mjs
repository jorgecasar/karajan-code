#!/usr/bin/env node
/**
 * QS-B (KJC-TSK-1039): records what each agent CLI REALLY emits for a review,
 * so the contract tests replay real answers instead of the ones we imagine.
 *
 *   node scripts/record-agent-fixtures.mjs claude codex
 *
 * Each CLI runs through its own kj adapter (same argv kj uses) in a throwaway
 * directory; claude is recorded twice, the second time with a SessionStart hook
 * in that directory, the way a session with hooks meets it (#2151). The answer
 * is redacted (home, user, emails, session ids) and must pass the privacy scan
 * before tests/agents/fixtures/<cli>/review.json is written.
 */
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { homedir, tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { createAgent } from "../src/agents/index.js";
import { buildEnvironment, defaultEnvironment } from "../src/infrastructure/environment.js";
import { loadPrivacyList, scanPaths } from "../src/privacy/scan.js";

const PROMPT = [
  "You are reviewing this diff. Answer ONLY with one JSON object:",
  '{"approved": boolean, "blocking_issues": [], "non_blocking_suggestions": [], "summary": string, "confidence": number}',
  "diff --git a/sum.js b/sum.js",
  "+export const sum = (a, b) => a + b;",
].join("\n");

const OUT = new URL("../tests/agents/fixtures/", import.meta.url).pathname;
const logger = { info() {}, warn() {}, error() {}, debug() {} };

export function redact(text, { home = homedir(), user = userInfo().username } = {}) {
  return String(text ?? "")
    .replaceAll(home, "/home/user")
    .replaceAll(new RegExp(`\\b${user}\\b`, "g"), "user")
    .replaceAll(/[\w.+-]+@[\w-]+\.[\w.]+/g, "user@example.com")
    .replaceAll(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "redacted-id");
}

// The init event describes the recording machine (tools, MCP servers, plugins,
// paths): only its shape stays, so it leaks nothing about that machine.
const isInit = (event) => event?.type === "system" && event.subtype === "init";
// An allowlist, not a denylist: each CLI version adds fields about the machine
// (socket paths, memory paths, terminal commands). Only the event's shape stays.
const INIT_KEEP = ["type", "subtype", "session_id", "uuid", "model", "permissionMode", "apiKeySource", "claude_code_version", "output_style"];
const trimEvent = (event) => (isInit(event) ? Object.fromEntries(INIT_KEEP.filter((k) => k in event).map((k) => [k, event[k]])) : event);

// Both shapes claude emits: NDJSON (stream-json) and one JSON array (json, the coder's runTask).
export function trimInitEvents(stdout) {
  const text = String(stdout ?? "");
  if (text.trim().startsWith("[")) {
    try { return JSON.stringify(JSON.parse(text).map(trimEvent)); } catch { /* not one array: read it by lines */ }
  }
  return text.split("\n").map((line) => {
    let event;
    try { event = JSON.parse(line); } catch { return line; }
    return isInit(event) ? JSON.stringify(trimEvent(event)) : line;
  }).join("\n");
}

// #2151: a SessionStart hook makes claude open its answer with hook events.
function withSessionHook(dir) {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  const hooks = { SessionStart: [{ hooks: [{ type: "command", command: "echo kj-fixture-hook" }] }] };
  writeFileSync(join(dir, ".claude", "settings.json"), `${JSON.stringify({ hooks }, null, 2)}\n`);
}

// KJC-TSK-1044: the coder's answer, with no tool to use and one exact line to say.
const TASK_PROMPT = "Reply with exactly this line and nothing else: kj-contract-ok";

async function record(cli, { hooks = false, task = false } = {}) {
  process.chdir(mkdtempSync(join(tmpdir(), "kj-fixtures-")));
  if (hooks) withSessionHook(process.cwd());
  const calls = [];
  const runner = { run: async (cmd, args, opts) => { const res = await defaultEnvironment.runner.run(cmd, args, opts); calls.push(res); return res; } };
  const agent = createAgent(cli, {}, logger, buildEnvironment({ runner }));
  const version = (await defaultEnvironment.runner.run(cli, ["--version"], {})).stdout?.trim() || "unknown";
  if (task) await agent.runTask({ prompt: TASK_PROMPT, role: "coder" });
  else await agent.reviewTask({ prompt: PROMPT, role: "reviewer" });
  const last = calls.at(-1);
  if (!last) throw new Error(`${cli}: the adapter ran no command`);
  // Scanned in the throwaway directory: a fixture with a privacy hit never reaches the repo.
  const candidate = join(process.cwd(), "fixture.json");
  writeFileSync(candidate, `${JSON.stringify({ cli, version: redact(version), exitCode: last.exitCode, stdout: redact(trimInitEvents(last.stdout)), stderr: redact(last.stderr) }, null, 2)}\n`);
  const blocks = scanPaths([candidate], { list: loadPrivacyList() }).filter((f) => f.severity === "block");
  if (blocks.length > 0) throw new Error(`${cli}: ${blocks.length} privacy hit(s) in the recording; fix the redaction (left in ${candidate})`);
  const file = join(OUT, cli, `${task ? "task" : "review"}${hooks ? "-hooks" : ""}.json`);
  mkdirSync(join(OUT, cli), { recursive: true });
  copyFileSync(candidate, file);
  return `${cli} ${version}: exit ${last.exitCode} → ${file}`;
}

// --task records the coder (runTask) instead of the reviewer.
const task = process.argv.includes("--task");
const clis = process.argv.slice(2).filter((a) => a !== "--task");
for (const cli of clis) {
  console.log(await record(cli, { task }));
  if (cli === "claude" && !task) console.log(await record(cli, { hooks: true }));
}
