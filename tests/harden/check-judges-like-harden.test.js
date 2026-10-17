// KJC-BUG-0370: kj check reported drift kj harden would never repair: a config
// already covered by a same-tool variant (.commitlintrc.json), one omitted
// because its tool is not installed, and the configs of a root the repo
// excludes in package.json kj.harden. kj check now judges like kj harden.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { hardenCommand } from "../../src/commands/harden.js";
import { checkHarden } from "../../src/harden/check.js";

let repo;
beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "kj-check-like-harden-"));
  execFileSync("git", ["init", "-q"], { cwd: repo });
  writeFileSync(join(repo, "package.json"), JSON.stringify({ name: "x", kj: { harden: { exclude: ["wrappers/python"] } } }));
  writeFileSync(join(repo, ".commitlintrc.json"), JSON.stringify({ extends: ["@commitlint/config-conventional"] }));
  mkdirSync(join(repo, "wrappers", "python"), { recursive: true });
  writeFileSync(join(repo, "wrappers", "python", "pyproject.toml"), "[project]\nname = \"w\"\n");
});
afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe("kj check judges configs like kj harden", () => {
  it("a covered config, an omitted one and an excluded root are not drift", async () => {
    await hardenCommand({ projectDir: repo, logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() } });
    const res = await checkHarden({ projectDir: repo, profile: "standard" });
    const byId = Object.fromEntries(res.checks.map((c) => [c.id, c]));
    expect(byId["config:commitlint.config.js"]).toMatchObject({ ok: true, detail: expect.stringMatching(/covered by .*\.commitlintrc\.json/) });
    expect(byId["config:eslint.config.js"]).toMatchObject({ ok: true, detail: expect.stringMatching(/omitted/) });
    expect(Object.keys(byId).some((id) => id.startsWith("config:wrappers/python"))).toBe(false);
    expect(res.checks.filter((c) => c.id.startsWith("config:") && !c.ok)).toEqual([]);
  });
});
