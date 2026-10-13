// KJC-TSK-1027 (QS-A2): a plan run of a code HU, as a user runs it (no
// --task-type shortcut). It triaged the plan's task and generated other HUs
// (KJC-BUG-0332), and approved a code HU without running the project's suite
// (KJC-BUG-0328).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeScenarioProject } from "./helpers/scenario-project.js";

const opened = [];

/** A project with a one-HU certified plan whose shell acceptance test is `acceptance`, run once. */
function planRun(acceptance) {
  const p = makeScenarioProject();
  const fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "kj-scn-fixture-"));
  opened.push(() => { p.cleanup(); fs.rmSync(fixtureDir, { recursive: true, force: true }); });
  fs.writeFileSync(path.join(p.dir, "SPEC.md"), "# Greeting\n\n## 1. Greeting\n\nThe system shall print hello.\n");
  p.git("add", "SPEC.md");
  p.git("commit", "-q", "-m", "docs: spec");
  const planner = JSON.stringify({
    approach: "one code HU",
    steps: [{ description: "print hello", commit: "feat: hello", spec_section: "1", acceptance_tests: [acceptance] }],
    risks: [], outOfScope: [],
  });
  fs.writeFileSync(path.join(fixtureDir, "coder-script.json"), JSON.stringify({ planner: { output: planner } }));
  const gen = p.kjFake(fixtureDir, "plan", "generate", "--task-file", "SPEC.md", "-y", "--planner", "fake", "--no-preflight-hu");
  if (gen.status !== 0) throw new Error(`plan generate failed: ${gen.stderr}`);
  const plansRoot = path.join(p.kjHome, "plans");
  const slug = fs.readdirSync(plansRoot)[0];
  const file = fs.readdirSync(path.join(plansRoot, slug)).find((f) => f.endsWith(".json"));
  const planPath = path.join(plansRoot, slug, file);
  const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  for (const h of plan.hus) h.status = "certified";
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));
  const run = p.kjFake(fixtureDir, "run", "--plan", plan.planId, "--hu", plan.hus[0].id, "-y",
    "--coder", "fake", "--reviewer", "fake", "--planner", "fake", "--max-iterations", "1");
  const huStatus = () => JSON.parse(fs.readFileSync(planPath, "utf8")).hus[0].status;
  return { run, huStatus };
}

let run;
let huStatus;
let failing;

beforeAll(() => {
  ({ run, huStatus } = planRun("true"));
  failing = planRun("test -f tests/does-not-exist.test.js");
}, 600_000);
afterAll(() => { for (const close of opened) close(); });

describe("scenario: kj run --plan --hu on a code HU", () => {
  it("does not triage the plan's task (0332)", () => {
    const out = `${run.stdout}\n${run.stderr}`;
    expect(out).toMatch(/Triage skipped: plan/);
    expect(out).not.toMatch(/Analysis-only task/);
  });

  it("runs the project's test suite before approving the HU (0328)", () => {
    expect(`${run.stdout}\n${run.stderr}`).toMatch(/npm test: green/);
  });

  it("finishes the HU", () => {
    expect(huStatus(), `${run.stderr.slice(-1500)}`).toBe("done");
  });

  it("does not approve an HU whose shell acceptance test fails (0331)", () => {
    const out = `${failing.run.stdout}\n${failing.run.stderr}`;
    expect(out).toMatch(/0\/1 shell tests passed/);
    expect(failing.huStatus(), out.slice(-1500)).not.toBe("done");
  });
});
