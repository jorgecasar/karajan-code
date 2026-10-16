// KJC-TSK-1059: the supply-chain cooldown outside the review. kj check says
// which dependencies the branch brings in are too young, and kj release check
// says which long-lived npm tokens are too old. Both warn, never block.
import { describe, it, expect, vi } from "vitest";
import { branchCooldownLines, npmTokenAgeCheck } from "../../src/checks/supply-chain-check.js";

const LOCK_DIFF = [
  "diff --git a/package-lock.json b/package-lock.json",
  "+    \"node_modules/fresh-pkg\": {",
  "+      \"version\": \"2.3.4\",",
].join("\n");
const now = Date.parse("2026-10-16T12:00:00Z");

describe("branchCooldownLines", () => {
  it("diffs the lockfile against the merge base and names the young dependency with its age and threshold", async () => {
    const run = vi.fn(async (cmd, args) => {
      if (cmd === "git" && args.includes("merge-base")) return { exitCode: 0, stdout: "abc123\n" };
      if (cmd === "git" && args.includes("diff")) return { exitCode: 0, stdout: LOCK_DIFF };
      return { exitCode: 0, stdout: JSON.stringify({ "2.3.4": "2026-10-16T03:00:00Z" }) };
    });
    const lines = await branchCooldownLines({ projectDir: "/p", base: "main", run, now });
    expect(lines).toEqual([expect.stringMatching(/fresh-pkg@2\.3\.4 was published 9 h ago \(under 72 h\)/)]);
    expect(run).toHaveBeenCalledWith("git", ["-C", "/p", "diff", "abc123", "--", "package-lock.json", "**/package-lock.json"]);
  });

  it("without a merge base (no remote, first commit) it says so instead of keeping quiet", async () => {
    const run = async () => ({ exitCode: 128, stdout: "", stderr: "fatal: no merge base" });
    expect(await branchCooldownLines({ projectDir: "/p", base: "main", run, now })).toEqual([expect.stringMatching(/cooldown not checked: no merge base with main/)]);
  });
});

describe("npmTokenAgeCheck", () => {
  const run = (tokens, exitCode = 0) => async () => ({ exitCode, stdout: JSON.stringify(tokens), stderr: "E401" });

  it("warns on each long-lived token older than the threshold, with its age; a token that expires is not one", async () => {
    const tokens = [
      { key: "aaa111", token: "npm_ab...", created: "2026-01-01T00:00:00Z" },
      { key: "bbb222", token: "npm_cd...", created: "2026-10-01T00:00:00Z" },
      { key: "ccc333", token: "npm_ef...", created: "2025-01-01T00:00:00Z", expires: "2026-12-01T00:00:00Z" },
    ];
    const c = await npmTokenAgeCheck({ run: run(tokens), now, maxDays: 90 });
    expect(c).toMatchObject({ name: "npm-tokens", ok: true, warn: true });
    expect(c.detail).toMatch(/id aaa111… \(288 days\)/);
    expect(c.detail).not.toMatch(/bbb222|ccc333|npm_/);
  });

  it("no old long-lived token is a plain pass", async () => {
    expect(await npmTokenAgeCheck({ run: run([]), now, maxDays: 90 })).toMatchObject({ ok: true, warn: false });
  });

  it("when npm cannot list the tokens it warns with the reason, never passes in silence", async () => {
    const c = await npmTokenAgeCheck({ run: run([], 1), now, maxDays: 90 });
    expect(c).toMatchObject({ ok: true, warn: true });
    expect(c.detail).toMatch(/could not list npm tokens.*E401/);
  });
});
