#!/usr/bin/env node
/**
 * KJC-TSK-1063 (QS-C4): npm run contract:claude. With the claude installed on
 * this machine (and its session), records the contract answers again when its
 * version differs from the recorded one, then replays the contract test. The
 * new recordings go in a PR like any other change. --force records anyway.
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { claudeContractCheck } from "../src/checks/claude-contract-check.js";

const root = fileURLToPath(new URL("..", import.meta.url));
const step = (cmd, args) => {
  const res = spawnSync(cmd, args, { cwd: root, stdio: "inherit" });
  if (res.status !== 0) process.exit(res.status ?? 1);
};

const check = await claudeContractCheck(root);
console.log(`${check.ok ? "✓" : "⚠"} ${check.detail}`);
if (check.ok && !process.argv.includes("--force")) process.exit(0);
step("node", ["scripts/record-agent-fixtures.mjs", "claude"]);
step("node", ["scripts/record-agent-fixtures.mjs", "claude", "--task"]);
step("npx", ["vitest", "run", "tests/agents/agent-contract-fixtures.test.js"]);
console.log("✓ kj reads the installed claude: commit tests/agents/fixtures/claude in a PR");
