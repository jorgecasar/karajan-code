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

// The init event lists the recording machine's tools, MCP servers, plugins and
// skills: emptied, the event keeps its shape and leaks nothing about that machine.
const INIT_LISTS = ["tools", "mcp_servers", "slash_commands", "skills", "plugins", "agents"];
export function trimInitEvents(stdout) {
  return String(stdout ?? "").split("\n").map((line) => {
    let event;
    try { event = JSON.parse(line); } catch { return line; }
    if (event?.type !== "system" || event.subtype !== "init") return line;
    for (const key of INIT_LISTS) if (Array.isArray(event[key])) event[key] = [];
    return JSON.stringify(event);
  }).join("\n");
}

// #2151: a SessionStart hook makes claude open its answer with hook events.
function withSessionHook(dir) {
  mkdirSync(join(dir, ".claude"), { recursive: true });
  const hooks = { SessionStart: [{ hooks: [{ type: "command", command: "echo kj-fixture-hook" }] }] };
  writeFileSync(join(dir, ".claude", "settings.json"), `${JSON.stringify({ hooks }, null, 2)}\n`);
}

async function record(cli, { hooks = false } = {}) {
  process.chdir(mkdtempSync(join(tmpdir(), "kj-fixtures-")));
  if (hooks) withSessionHook(process.cwd());
  const calls = [];
  const runner = { run: async (cmd, args, opts) => { const res = await defaultEnvironment.runner.run(cmd, args, opts); calls.push(res); return res; } };
  const agent = createAgent(cli, {}, logger, buildEnvironment({ runner }));
  const version = (await defaultEnvironment.runner.run(cli, ["--version"], {})).stdout?.trim() || "unknown";
  await agent.reviewTask({ prompt: PROMPT, role: "reviewer" });
  const last = calls.at(-1);
  if (!last) throw new Error(`${cli}: the adapter ran no command`);
  // Scanned in the throwaway directory: a fixture with a privacy hit never reaches the repo.
  const candidate = join(process.cwd(), "fixture.json");
  writeFileSync(candidate, `${JSON.stringify({ cli, version: redact(version), exitCode: last.exitCode, stdout: redact(trimInitEvents(last.stdout)), stderr: redact(last.stderr) }, null, 2)}\n`);
  const blocks = scanPaths([candidate], { list: loadPrivacyList() }).filter((f) => f.severity === "block");
  if (blocks.length > 0) throw new Error(`${cli}: ${blocks.length} privacy hit(s) in the recording; fix the redaction (left in ${candidate})`);
  const file = join(OUT, cli, hooks ? "review-hooks.json" : "review.json");
  mkdirSync(join(OUT, cli), { recursive: true });
  copyFileSync(candidate, file);
  return `${cli} ${version}: exit ${last.exitCode} → ${file}`;
}

const clis = process.argv.slice(2);
for (const cli of clis) {
  console.log(await record(cli));
  if (cli === "claude") console.log(await record(cli, { hooks: true }));
}
