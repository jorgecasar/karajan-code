// KJC-TSK-0717 (SPD-A): kj plan license <plan> <hu> --module <path> scores the
// module with kj mutate and records the licence on the HU, with the threshold
// in force (method_gates.rework_mutation_min, 0.8 by default).
import { describe, it, expect, vi } from "vitest";
import { planLicenseCommand } from "../../src/commands/plan/license.js";

const makePlan = () => ({ planId: "p1", hus: [{ id: "HU-2", title: "regenerate parser", change_class: "rework" }] });

function run({ score = 85, config = {}, plan = makePlan(), module = "src/parser.js" } = {}) {
  const saved = [];
  const lines = [];
  const deps = {
    loadPlan: vi.fn(async () => plan),
    savePlan: vi.fn(async (_dir, p) => saved.push(structuredClone(p))),
    scoreModule: vi.fn(async () => score),
    say: (l) => lines.push(l),
  };
  return planLicenseCommand({ config: { projectDir: "/p", ...config }, planId: "p1", huId: "HU-2", module, deps }).then((code) => ({ code, saved, lines, deps }));
}

describe("kj plan license", () => {
  it("scores the module and records a granted licence", async () => {
    const { code, saved, lines, deps } = await run();
    expect(code).toBe(0);
    expect(deps.scoreModule).toHaveBeenCalledWith("/p", "src/parser.js");
    expect(saved[0].hus[0].rework_license).toEqual({ module: "src/parser.js", mutation_score: 85, threshold: 0.8, granted: true });
    expect(lines.join("\n")).toMatch(/granted.*85%.*80%/);
  });

  it("under the configured threshold it records a denied licence and says how to plan the two phases", async () => {
    const { code, saved, lines } = await run({ score: 72, config: { method_gates: { rework_mutation_min: 0.9 } } });
    expect(code).toBe(1);
    expect(saved[0].hus[0].rework_license).toMatchObject({ threshold: 0.9, granted: false });
    expect(lines.join("\n")).toMatch(/denied.*72%.*90%.*hardens: src\/parser\.js/);
  });

  it("no module, unknown HU or no score from kj mutate: it says so and records nothing", async () => {
    const noModule = await run({ module: "" });
    expect(noModule.saved).toEqual([]);
    expect(noModule.lines.join("\n")).toMatch(/--module <path> is required/);
    expect((await run({ plan: { planId: "p1", hus: [] } })).lines.join("\n")).toMatch(/HU not found: HU-2/);
    const noScore = await run({ score: null });
    expect(noScore.code).toBe(1);
    expect(noScore.saved).toEqual([]);
    expect(noScore.lines.join("\n")).toMatch(/kj mutate could not score src\/parser\.js/);
  });
});
