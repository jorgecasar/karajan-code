import { describe, it, expect } from "vitest";
import {
  recommendModelsForHu, complexityToLevel,
} from "../../src/hu/model-router.js";

// KJC-TSK-0405: dado un HU con complexity score, devuelve qué coder_model
// y reviewer_model usar. Cross-provider reviewer por defecto (claude→codex,
// codex→claude, gemini→claude).

describe("complexityToLevel", () => {
  it("score numérico → level discreto", () => {
    expect(complexityToLevel(1)).toBe("trivial");
    expect(complexityToLevel(2)).toBe("simple");
    expect(complexityToLevel(3)).toBe("medium");
    expect(complexityToLevel(5)).toBe("complex");
  });
  it("acepta string canónico tal cual", () => {
    expect(complexityToLevel("trivial")).toBe("trivial");
    expect(complexityToLevel("medium")).toBe("medium");
    expect(complexityToLevel("complex")).toBe("complex");
  });
  it("desconocido / null → medium (fallback conservador)", () => {
    expect(complexityToLevel(null)).toBe("medium");
    expect(complexityToLevel(undefined)).toBe("medium");
    expect(complexityToLevel("foobar")).toBe("medium");
    expect(complexityToLevel(99)).toBe("medium");
  });
});

describe("recommendModelsForHu", () => {
  const baseConfig = { roles: { coder: { provider: "claude" }, reviewer: { provider: "codex" } } };

  it("complexity=trivial + provider claude → coder haiku", () => {
    const r = recommendModelsForHu({ complexity: "trivial", coderProvider: "claude", config: baseConfig });
    expect(r.coder_model).toBe("haiku");
  });
  it("complexity=medium + provider claude → coder sonnet", () => {
    const r = recommendModelsForHu({ complexity: "medium", coderProvider: "claude", config: baseConfig });
    expect(r.coder_model).toBe("sonnet");
  });
  it("complexity=complex + provider claude → coder opus", () => {
    const r = recommendModelsForHu({ complexity: "complex", coderProvider: "claude", config: baseConfig });
    expect(r.coder_model).toBe("opus");
  });

  it("reviewer default es cross-provider del coder (claude→codex)", () => {
    const r = recommendModelsForHu({ complexity: "medium", coderProvider: "claude", config: baseConfig });
    expect(r.reviewer_provider).toBe("codex");
    expect(r.reviewer_model).toBeTruthy();
  });
  it("reviewer cross-provider de codex es claude", () => {
    const cfg = { roles: { coder: { provider: "codex" }, reviewer: { provider: "claude" } } };
    const r = recommendModelsForHu({ complexity: "medium", coderProvider: "codex", config: cfg });
    expect(r.reviewer_provider).toBe("claude");
  });
  it("reviewer cross-provider de gemini cae a claude", () => {
    const cfg = { roles: { coder: { provider: "gemini" } } };
    const r = recommendModelsForHu({ complexity: "medium", coderProvider: "gemini", config: cfg });
    expect(r.reviewer_provider).toBe("claude");
  });

  it("config.model_routing.fixed.coder es override total", () => {
    const cfg = {
      ...baseConfig,
      model_routing: { fixed: { coder: "claude-sonnet-4-6" } },
    };
    const r = recommendModelsForHu({ complexity: "trivial", coderProvider: "claude", config: cfg });
    expect(r.coder_model).toBe("claude-sonnet-4-6");
  });

  it("config.model_routing.fixed.reviewer es override total", () => {
    const cfg = {
      ...baseConfig,
      model_routing: { fixed: { reviewer: "opus" } },
    };
    const r = recommendModelsForHu({ complexity: "trivial", coderProvider: "claude", config: cfg });
    expect(r.reviewer_model).toBe("opus");
  });

  it("config.model_routing.by_provider override tiers default", () => {
    const cfg = {
      ...baseConfig,
      model_routing: {
        by_provider: {
          claude: { trivial: "haiku-custom", medium: "sonnet-custom", complex: "opus-custom" },
        },
      },
    };
    const r = recommendModelsForHu({ complexity: "medium", coderProvider: "claude", config: cfg });
    expect(r.coder_model).toBe("sonnet-custom");
  });

  it("provider desconocido → coder_model null pero no throws", () => {
    const r = recommendModelsForHu({ complexity: "medium", coderProvider: "unknownProvider", config: baseConfig });
    expect(r.coder_model).toBeNull();
  });
});

// KJC-TSK-0410: opencode + aider como first-class providers en el router.
describe("recommendModelsForHu — opencode / aider", () => {
  // KJC-TSK-0699: opencode ids are provider/model and depend on each user's
  // opencode.json; a bare "coder" is not one. null leaves opencode's own default.
  it("opencode coder deja el modelo al default de opencode en cualquier complexity", () => {
    const cfg = { roles: { coder: { provider: "opencode" } } };
    for (const level of ["trivial", "simple", "medium", "complex"]) {
      const r = recommendModelsForHu({ complexity: level, coderProvider: "opencode", config: cfg });
      expect(r.coder_model).toBeNull();
    }
  });

  it("the router and the selector share ONE table of default models", async () => {
    const { getDefaultModelTiers } = await import("../../src/utils/model-selector.js");
    for (const [provider, tiers] of Object.entries(getDefaultModelTiers())) {
      expect(recommendModelsForHu({ complexity: "complex", coderProvider: provider, config: {} }).coder_model).toBe(tiers.complex);
    }
  });

  it("opencode → reviewer claude (cross-provider: local escribe, cloud revisa)", () => {
    const r = recommendModelsForHu({ complexity: "medium", coderProvider: "opencode", config: {} });
    expect(r.reviewer_provider).toBe("claude");
    expect(r.reviewer_model).toBe("sonnet");
  });

  it("aider coder devuelve null por defecto (aider envuelve a otros, no tiene modelos propios)", () => {
    const r = recommendModelsForHu({ complexity: "medium", coderProvider: "aider", config: {} });
    expect(r.coder_model).toBeNull();
    expect(r.reviewer_provider).toBe("claude");
  });

  it("by_provider.opencode override per-tier funciona — fast para trivial, coder-n3 para complex", () => {
    const cfg = {
      model_routing: {
        by_provider: {
          opencode: { trivial: "fast", complex: "coder-n3" },
        },
      },
    };
    expect(recommendModelsForHu({ complexity: "trivial", coderProvider: "opencode", config: cfg }).coder_model).toBe("fast");
    expect(recommendModelsForHu({ complexity: "complex", coderProvider: "opencode", config: cfg }).coder_model).toBe("coder-n3");
  });
});
