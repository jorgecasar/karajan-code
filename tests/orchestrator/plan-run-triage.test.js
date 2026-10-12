import { describe, it, expect, vi } from "vitest";
import { triageForRun } from "../../src/orchestrator/drivers/pre-loop.js";

// KJC-BUG-0332 (#2092), and the root of 0330/0331 (#2090, #2091): in a plan run
// the triage read the plan's original task, auto-generated its own HUs (HU-01..)
// that ran instead of the plan's, and could call the task analysis-only, so the
// coder was skipped and an empty diff APPROVED. A plan run implements the plan's
// certified HUs: no triage, and the task type is code.
describe("triageForRun", () => {
  it("in a plan run does not triage, and the task is code with no extra roles", async () => {
    const runTriage = vi.fn();
    const r = await triageForRun({ flags: { plan: "plan-20261011000000-abcd" }, runTriage });
    expect(runTriage).not.toHaveBeenCalled();
    expect(r.roleOverrides).toEqual({}); // applyTriageOverrides reads its keys
    expect(r.stageResult).toMatchObject({ ok: true, taskType: "sw", roles: [], shouldDecompose: false, fromPlan: "plan-20261011000000-abcd" });
  });

  it("outside a plan run it triages as always", async () => {
    const triaged = { roleOverrides: { reviewer: true }, stageResult: { taskType: "analysis" } };
    expect(await triageForRun({ flags: {}, runTriage: async () => triaged })).toBe(triaged);
    expect(await triageForRun({ flags: {}, runTriage: async () => null })).toEqual({ roleOverrides: null, stageResult: null });
  });
});
