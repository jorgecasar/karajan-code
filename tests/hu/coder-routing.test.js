// KJC-TSK-0701 (MR-D): the coder of each HU runs on its tier's model and effort,
// climbs to the most capable one after a failed iteration, and never overrides
// a model the user chose.
import { describe, it, expect } from "vitest";
import { routeCoder } from "../../src/hu/coder-routing.js";
import { safeParseConfig } from "../../src/config/schema.js";

const config = (extra = {}) => ({ coder: "claude", roles: { coder: { provider: null, model: null } }, ...extra });

describe("routeCoder", () => {
  it("gives a trivial or standard HU its tier's model and effort", () => {
    expect(routeCoder({ tier: "trivial", attempt: 1, config: config() })).toMatchObject({ model: "haiku", effort: "low", escalated: false });
    expect(routeCoder({ tier: "standard", attempt: 1, config: config() })).toMatchObject({ model: "sonnet", effort: "medium", escalated: false });
  });

  it("leaves a deep HU on the usual model and effort", () => {
    expect(routeCoder({ tier: "deep", attempt: 1, config: config() })).toMatchObject({ skip: true });
  });

  it("climbs to the most capable model after a failed iteration", () => {
    for (const tier of ["trivial", "standard", "deep"]) {
      expect(routeCoder({ tier, attempt: 2, config: config() }), tier).toMatchObject({ model: "opus", effort: "max", escalated: true });
    }
  });

  it("follows the coder's provider and gives effort only to claude", () => {
    const codex = config({ coder: "codex" });
    expect(routeCoder({ tier: "trivial", attempt: 1, config: codex })).toMatchObject({ model: "gpt-5.6-luna", effort: null });
    expect(routeCoder({ tier: "trivial", attempt: 1, config: { ...codex, roles: { coder: { provider: "claude", model: null } } } })).toMatchObject({ model: "haiku", effort: "low" });
  });

  it("never routes over a model the user chose, nor with routing off", () => {
    const chosen = [
      config({ roles: { coder: { provider: null, model: "opus" } } }),
      config({ coder_options: { model: "sonnet" } }),
      config({ model_profile: "frugal" }),
      config({ model_routing: { fixed: { coder: "sonnet" } } }),
      config({ model_routing: { enabled: false } })
    ];
    for (const c of chosen) {
      const r = routeCoder({ tier: "trivial", attempt: 2, config: c });
      expect(r.skip, JSON.stringify(c)).toBe(true);
      expect(r.reason).toMatch(/\S/);
    }
  });

  it("takes the per-level models of model_routing.by_provider, and enabled is a boolean", () => {
    const own = config({ model_routing: { by_provider: { claude: { trivial: "claude-haiku-5-5" } } } });
    expect(routeCoder({ tier: "trivial", attempt: 1, config: own })).toMatchObject({ model: "claude-haiku-5-5" });
    expect(safeParseConfig({ model_routing: { enabled: false } }).success).toBe(true);
    expect(safeParseConfig({ model_routing: { enabled: "off" } }).success).toBe(false);
  });

  it("says why, and skips a provider with no known models or an unknown tier", () => {
    expect(routeCoder({ tier: "trivial", attempt: 1, config: config() }).reason).toMatch(/trivial/);
    expect(routeCoder({ tier: "trivial", attempt: 1, config: config({ coder: "aider" }) })).toMatchObject({ skip: true });
    expect(routeCoder({ tier: undefined, attempt: 1, config: config() })).toMatchObject({ skip: true });
  });
});
