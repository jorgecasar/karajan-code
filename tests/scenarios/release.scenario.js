// KJC-TSK-1027 (QS-A2): the first release of a freshly hardened repo. With no
// previous tag the release check judged the whole tree, and the hooks the
// human's setup commit installed read as supervisor writes (KJC-BUG-0342).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { makeScenarioProject } from "./helpers/scenario-project.js";

let p;
const policyCheck = () => {
  const res = p.kj("release", "check", "--json");
  const parsed = JSON.parse(res.stdout);
  return parsed.checks.find((c) => c.name === "policy");
};

beforeAll(() => {
  p = makeScenarioProject();
  const res = p.kj("harden");
  if (res.status !== 0) throw new Error(`kj harden failed: ${res.stderr || res.stdout}`);
  // The human commits the setup on a branch, as kj asks (it never commits on main).
  p.git("checkout", "-q", "-b", "chore/kj-setup");
  p.git("add", "-A");
  p.git("commit", "-q", "-m", "chore(kj): setup");
}, 300_000);
afterAll(() => p?.cleanup());

describe("scenario: the first release after kj setup", () => {
  it("the files the setup commit installed are not supervisor violations (0342)", () => {
    const c = policyCheck();
    expect(c.ok, c.detail).toBe(true);
  });

  it("a later change to a git hook still is", () => {
    const hook = path.join(p.dir, ".karajan", "hooks", "pre-commit");
    fs.appendFileSync(hook, "\n# edited after the setup\n");
    p.git("add", ".karajan/hooks/pre-commit");
    p.git("commit", "-q", "--no-verify", "-m", "an agent edits the hook");
    const c = policyCheck();
    expect(c.ok).toBe(false);
    expect(c.detail).toContain(".karajan/hooks/pre-commit");
  });
});
