/**
 * KJC-TSK-1063 (QS-C4): the agent contract recordings (tests/agents/fixtures)
 * note the claude version they were made with. Anthropic updates claude on its
 * own; a newer one may change its output and break kj. The check lives on the
 * maintainer's machine, with the claude session already there, not in CI with
 * a credential: kj release check is red until npm run contract:claude records
 * again with the installed claude and the contract test passes.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runCommand } from "../utils/process.js";

const RECORDING = join("tests", "agents", "fixtures", "claude", "review.json");

export const versionOf = (text) => /\d+\.\d+\.\d+/.exec(String(text ?? ""))?.[0] ?? null;

/** null where the project carries no contract recordings (any project but kj itself). */
export async function claudeContractCheck(projectDir, run = runCommand) {
  const file = join(projectDir, RECORDING);
  if (!existsSync(file)) return null;
  const recorded = versionOf(JSON.parse(readFileSync(file, "utf8")).version);
  const res = await run("claude", ["--version"], { cwd: projectDir }).catch((err) => ({ exitCode: 1, stdout: "", stderr: err.message }));
  const installed = res.exitCode === 0 ? versionOf(res.stdout) : null;
  if (!installed) return { name: "claude-contract", ok: false, detail: "claude --version gave no version: the contract with claude cannot be checked on this machine" };
  if (installed === recorded) return { name: "claude-contract", ok: true, detail: `contract recorded with the installed claude ${installed}` };
  return { name: "claude-contract", ok: false, detail: `claude ${installed} installed, contract recorded with ${recorded}: run npm run contract:claude and commit the recordings in a PR` };
}
