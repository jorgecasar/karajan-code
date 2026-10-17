// KJC-TSK-1072 (MR-D4): kj plan fills each HU's coder_model from its tier
// (MR-A), the same criterion the run uses; the user may change it on the board.
import { describe, it, expect } from "vitest";
import { planHuModels } from "../../src/hu/model-router.js";

const config = (extra = {}) => ({ coder: "claude", roles: { coder: { provider: null, model: null } }, ...extra });

describe("planHuModels", () => {
  it("gives a trivial HU the trivial model and records its tier", () => {
    const r = planHuModels({ title: "rename a label", acceptanceCriteria: ["label reads Save"], config: config() });
    expect(r).toMatchObject({ coder_model: "haiku", coder_provider: "claude", complexity: { tier: "trivial" } });
  });

  it("gives a standard HU the medium model", () => {
    const r = planHuModels({ title: "list page", acceptanceCriteria: ["a", "b", "c"], config: config() });
    expect(r).toMatchObject({ coder_model: "sonnet", complexity: { tier: "standard" } });
  });

  it("leaves coder_model empty for a deep HU or a model chosen by config", () => {
    expect(planHuModels({ title: "auth token refresh", acceptanceCriteria: ["x"], config: config() }).coder_model).toBeNull();
    expect(planHuModels({ title: "rename", acceptanceCriteria: ["x"], config: config({ model_profile: "frugal" }) }).coder_model).toBeNull();
  });

  it("keeps the cross-provider reviewer recommendation", () => {
    expect(planHuModels({ title: "rename", acceptanceCriteria: ["x"], config: config() }).reviewer_provider).toBe("codex");
  });
});
