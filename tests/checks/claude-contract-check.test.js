// KJC-TSK-1063 (QS-C4): the contract recordings note the claude version they
// were made with. A claude installed newer than that has not been checked
// against kj: kj release check goes red until npm run contract:claude runs.
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { claudeContractCheck, versionOf } from "../../src/checks/claude-contract-check.js";

function project(recorded) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kj-claude-contract-"));
  if (recorded) {
    fs.mkdirSync(path.join(dir, "tests/agents/fixtures/claude"), { recursive: true });
    fs.writeFileSync(path.join(dir, "tests/agents/fixtures/claude/review.json"), JSON.stringify({ cli: "claude", version: recorded }));
  }
  return dir;
}
const claude = (stdout, exitCode = 0) => async () => ({ exitCode, stdout });

describe("claudeContractCheck", () => {
  it("reads the version out of the CLI's text", () => {
    expect(versionOf("2.1.301 (Claude Code)")).toBe("2.1.301");
    expect(versionOf("no version here")).toBeNull();
  });

  it("a project without contract recordings has nothing to check", async () => {
    expect(await claudeContractCheck(project(null), claude("2.1.301 (Claude Code)"))).toBeNull();
  });

  it("the installed claude is the recorded one: ok", async () => {
    expect(await claudeContractCheck(project("2.1.301 (Claude Code)"), claude("2.1.301 (Claude Code)\n"))).toMatchObject({ name: "claude-contract", ok: true });
  });

  it("a different installed claude is red, naming both versions and the command that checks it", async () => {
    const c = await claudeContractCheck(project("2.1.301 (Claude Code)"), claude("2.1.310 (Claude Code)"));
    expect(c.ok).toBe(false);
    expect(c.detail).toMatch(/claude 2\.1\.310 installed, contract recorded with 2\.1\.301: run npm run contract:claude/);
  });

  it("no claude on this machine is red too: the contract cannot be checked", async () => {
    const c = await claudeContractCheck(project("2.1.301 (Claude Code)"), claude("", 127));
    expect(c).toMatchObject({ ok: false });
    expect(c.detail).toMatch(/claude --version gave no version/);
  });
});
