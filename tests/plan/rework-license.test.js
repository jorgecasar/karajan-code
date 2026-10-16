// KJC-TSK-0717 (SPD-A): a plan that changes existing code classifies each HU as
// EXTEND, REWORK or REBUILD with a written criterion. REWORK needs a licence:
// the module's mutation score at or over the threshold; under it, the plan goes
// in two phases, hardening first, never regenerating against a thin contract.
import { describe, it, expect } from "vitest";
import { licenseFor, changeClassErrors, DEFAULT_REWORK_MIN } from "../../src/plan/rework-license.js";
import { validatePlan, createPlanV2 } from "../../src/plan/plan-schema.js";
import { DEFAULTS } from "../../src/config/defaults.js";

const hu = (over) => ({ id: "HU-2", title: "regenerate parser", status: "pending", ...over });

describe("licenseFor", () => {
  it("grants at or over the threshold and denies under it, keeping score and threshold", () => {
    expect(DEFAULT_REWORK_MIN).toBe(0.8);
    expect(DEFAULTS.method_gates.rework_mutation_min).toBe(DEFAULT_REWORK_MIN);
    expect(licenseFor({ module: "src/parser.js", score: 85 })).toEqual({ module: "src/parser.js", mutation_score: 85, threshold: 0.8, granted: true });
    expect(licenseFor({ module: "src/parser.js", score: 80 }).granted).toBe(true);
    expect(licenseFor({ module: "src/parser.js", score: 62, threshold: 0.7 })).toMatchObject({ threshold: 0.7, granted: false });
  });
});

describe("changeClassErrors", () => {
  it("no classification is still allowed (plans made before SPD-A)", () => {
    expect(changeClassErrors(hu({}), [])).toEqual([]);
  });

  it("a class needs a known value and a written criterion", () => {
    expect(changeClassErrors(hu({ change_class: "rewrite" }), [])[0]).toMatch(/HU-2: change_class must be extend\|rework\|rebuild/);
    expect(changeClassErrors(hu({ change_class: "extend" }), [])[0]).toMatch(/HU-2: change_criterion/);
    expect(changeClassErrors(hu({ change_class: "extend", change_criterion: 42 }), [])[0]).toMatch(/HU-2: change_criterion/);
    expect(changeClassErrors(hu({ change_class: "extend", change_criterion: "adds one branch" }), [])).toEqual([]);
  });

  it("REWORK without a licence is refused, naming the command that computes it", () => {
    expect(changeClassErrors(hu({ change_class: "rework", change_criterion: "tests are the contract" }), [])[0]).toMatch(/needs a licence: kj plan license <plan> HU-2 --module <path>/);
  });

  it("a denied licence shows score vs threshold and demands the hardening HU first", () => {
    const denied = hu({ change_class: "rework", change_criterion: "c", rework_license: licenseFor({ module: "src/parser.js", score: 62 }) });
    expect(changeClassErrors(denied, [])[0]).toMatch(/licence denied for src\/parser\.js: mutation score 62% under 80%.*hardens: src\/parser\.js/);
    const hardening = { id: "HU-1", title: "harden parser contract", status: "pending", hardens: "src/parser.js" };
    expect(changeClassErrors({ ...denied, blocked_by: ["HU-1"] }, [hardening, denied])).toEqual([]);
  });

  it("the licence is judged again from its score: a hand-edited granted or threshold does not open REWORK", () => {
    const forged = hu({ change_class: "rework", change_criterion: "c", rework_license: { module: "m.js", mutation_score: 40, threshold: 0.1, granted: true } });
    expect(changeClassErrors(forged, [])[0]).toMatch(/mutation score 40% under 80%/);
    expect(changeClassErrors(hu({ change_class: "rework", change_criterion: "c", rework_license: { module: "m.js" } }), [])[0]).toMatch(/mutation_score between 0 and 100/);
  });

  it("the configured threshold is the one applied", () => {
    const at70 = hu({ change_class: "rework", change_criterion: "c", rework_license: licenseFor({ module: "m.js", score: 72 }) });
    expect(changeClassErrors(at70, [], { reworkMin: 0.7 })).toEqual([]);
    expect(validatePlan({ ...createPlanV2("t"), hus: [at70] }, { reworkMin: 0.7 }).valid).toBe(true);
    expect(validatePlan({ ...createPlanV2("t"), hus: [at70] }).errors.join("\n")).toMatch(/72% under 80%/);
  });
});
