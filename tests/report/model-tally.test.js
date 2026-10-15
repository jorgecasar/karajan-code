// KJC-TSK-1057 (MR-E2): kj report adds up, per coder model, what each HU cost
// and how often it failed first time; unmeasured HUs are the baseline, never zero.
import { describe, it, expect } from "vitest";
import { modelTally, formatModelTally } from "../../src/report/model-tally.js";

const hu = (model, outcome = {}) => ({ id: `h-${Math.random()}`, outcome: { status: "done", coder: model ? { provider: "p", model } : undefined, ...outcome } });

describe("modelTally", () => {
  it("groups HUs by coder model: count, cost, tokens, mean iterations and failure rate", () => {
    const hus = [
      hu("opus", { cost_usd: 0.4, tokens_in: 1000, tokens_out: 200, iterations: 1, reviewer_rejections: 0 }),
      hu("opus", { cost_usd: 0.6, tokens_in: 2000, tokens_out: 300, iterations: 3, reviewer_rejections: 2 }),
      hu("glm", { cost_usd: 0.1, tokens_in: 500, tokens_out: 100, iterations: 2, reviewer_rejections: 1, status: "failed" }),
    ];
    expect(modelTally(hus)).toEqual({
      models: [
        { model: "opus", hus: 2, cost_usd: 1, tokens_in: 3000, tokens_out: 500, mean_iterations: 2, failure_rate: 0.5 },
        { model: "glm", hus: 1, cost_usd: 0.1, tokens_in: 500, tokens_out: 100, mean_iterations: 2, failure_rate: 1 },
      ],
      unmeasured: 0,
    });
  });

  it("HUs without a measured coder are the baseline, counted apart", () => {
    expect(modelTally([hu(null), { id: "x" }, hu("opus", { reviewer_rejections: 0 })]).unmeasured).toBe(2);
  });
});

describe("formatModelTally", () => {
  it("one line per model and the unmeasured baseline; nothing when no HU was run", () => {
    const text = formatModelTally({ models: [{ model: "opus", hus: 2, cost_usd: 1, tokens_in: 3000, tokens_out: 500, mean_iterations: 2, failure_rate: 0.5 }], unmeasured: 3 });
    expect(text).toMatch(/Coder models/);
    expect(text).toMatch(/opus\s+2 HU.*\$1\.0000.*3000 in.*500 out.*2\.0 iter.*50% failed first time/);
    expect(text).toMatch(/3 HU\(s\) before the measurement \(baseline, unmeasured\)/);
    expect(formatModelTally({ models: [], unmeasured: 0 })).toBeNull();
  });
});
