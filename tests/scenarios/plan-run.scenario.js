// KJC-TSK-1027 (QS-A2): a plan run of a code HU, as a user runs it (no
// --task-type shortcut). It triaged the plan's task and generated other HUs
// (KJC-BUG-0332), and approved a code HU without running the project's suite
// (KJC-BUG-0328).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeScenarioProject } from "./helpers/scenario-project.js";

let p;
let fixtureDir;
let run;
let planPath;

beforeAll(() => {
  p = makeScenarioProject();
  fs.writeFileSync(path.join(p.dir, "SPEC.md"), "# Greeting\n\n## 1. Greeting\n\nThe system shall print hello.\n");
  p.git("add", "SPEC.md");
  p.git("commit", "-q", "-m", "docs: spec");
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "kj-scn-fixture-"));
  const planner = JSON.stringify({
    approach: "one code HU",
    steps: [{ description: "print hello", commit: "feat: hello", spec_section: "1", acceptance_tests: ["true"] }],
    risks: [], outOfScope: [],
  });
  fs.writeFileSync(path.join(fixtureDir, "coder-script.json"), JSON.stringify({ planner: { output: planner } }));
  const gen = p.kjFake(fixtureDir, "plan", "generate", "--task-file", "SPEC.md", "-y", "--planner", "fake", "--no-preflight-hu");
  if (gen.status !== 0) throw new Error(`plan generate failed: ${gen.stderr}`);
  const plansRoot = path.join(p.kjHome, "plans");
  const slug = fs.readdirSync(plansRoot)[0];
  const file = fs.readdirSync(path.join(plansRoot, slug)).find((f) => f.endsWith(".json"));
  planPath = path.join(plansRoot, slug, file);
  const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
  for (const h of plan.hus) h.status = "certified";
  fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));
  run = p.kjFake(fixtureDir, "run", "--plan", plan.planId, "--hu", plan.hus[0].id, "-y",
    "--coder", "fake", "--reviewer", "fake", "--planner", "fake", "--max-iterations", "1");
}, 300_000);
afterAll(() => {
  p?.cleanup();
  if (fixtureDir) fs.rmSync(fixtureDir, { recursive: true, force: true });
});

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
    const plan = JSON.parse(fs.readFileSync(planPath, "utf8"));
    expect(plan.hus[0].status, `${run.stderr.slice(-1500)}`).toBe("done");
  });
});
