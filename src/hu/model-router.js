import { getDefaultModelTiers } from "../utils/model-selector.js";
import { huComplexity } from "./complexity-tier.js";
import { routeCoder } from "./coder-routing.js";

// KJC-TSK-0405: dado un HU con complexity score, recomienda coder_model y
// reviewer_model. El reviewer por defecto usa el provider alternativo al
// coder (cross-provider review) para que dos cabezas distintas miren el
// código y se detecten más patrones.

const LEVELS = ["trivial", "simple", "medium", "complex"];

// Mapping complexity score numérico → nivel categórico.
// 1 → trivial, 2 → simple, 3/4 → medium, 5+ → complex.
const SCORE_TO_LEVEL = {
  1: "trivial",
  2: "simple",
  3: "medium",
  4: "medium",
  5: "complex",
};

// KJC-TSK-0699: los defaults por provider viven en UNA tabla, la de
// utils/model-selector.js. Quien quiera otros modelos (opencode con sus
// proveedores, aider) los pone en config.model_routing.by_provider o en el
// override del modal por HU.
const DEFAULT_TIERS = getDefaultModelTiers();

// Cross-provider reviewer default: para cada coder provider, qué provider
// usa el reviewer por defecto. Dos cabezas distintas miran el código.
// opencode → claude: pattern "local barato escribe + cloud revisa".
// aider → claude: aider suele correr en un model pequeño, claude verifica.
const CROSS_PROVIDER_REVIEWER = {
  claude: "codex",
  codex: "claude",
  gemini: "claude",
  opencode: "claude",
  aider: "claude",
};

export function complexityToLevel(complexity) {
  if (typeof complexity === "string" && LEVELS.includes(complexity)) return complexity;
  if (typeof complexity === "number" && SCORE_TO_LEVEL[complexity]) return SCORE_TO_LEVEL[complexity];
  return "medium";
}

/**
 * @param {object} args
 * @param {string|number} args.complexity - "trivial" | "simple" | "medium" | "complex" | score 1-5
 * @param {string} args.coderProvider - "claude" | "codex" | "gemini"
 * @param {object} args.config - karajan config (lee model_routing si existe)
 * @returns {{ coder_model: string|null, coder_provider: string, reviewer_model: string|null, reviewer_provider: string }}
 */
export function recommendModelsForHu({ complexity, coderProvider, config = {} }) {
  const level = complexityToLevel(complexity);
  const routing = config.model_routing || {};
  const fixed = routing.fixed || {};

  // Merge tiers: defaults + user overrides per provider.
  const tiers = { ...DEFAULT_TIERS };
  if (routing.by_provider) {
    for (const [prov, levels] of Object.entries(routing.by_provider)) {
      tiers[prov] = { ...(tiers[prov] || {}), ...levels };
    }
  }

  const coderTier = tiers[coderProvider];
  const coderAuto = coderTier ? (coderTier[level] || null) : null;
  const coder_model = fixed.coder || coderAuto;

  const reviewer_provider = CROSS_PROVIDER_REVIEWER[coderProvider] || "claude";
  const reviewerTier = tiers[reviewer_provider];
  const reviewerAuto = reviewerTier ? (reviewerTier[level] || null) : null;
  const reviewer_model = fixed.reviewer || reviewerAuto;

  return {
    coder_model,
    coder_provider: coderProvider,
    reviewer_model,
    reviewer_provider,
  };
}

const TIER_LEVEL = { trivial: "trivial", standard: "medium", deep: "complex" };

/**
 * KJC-TSK-1072 (MR-D4): the models kj plan writes on an HU. coder_model comes
 * from the HU's tier (MR-A) through routeCoder, the criterion the run uses;
 * empty for a deep HU or a model the config already chose. The reviewer keeps
 * its cross-provider recommendation. The tier travels as `complexity`.
 */
export function planHuModels({ title = "", goal = "", acceptanceCriteria = [], tier = null, tierReason = null, config = {} }) {
  const complexity = huComplexity({ title, goal, acceptanceCriteria, tier, tierReason });
  const coderProvider = config.roles?.coder?.provider || config.coder || "claude";
  const route = routeCoder({ tier: complexity.tier, attempt: 1, config });
  const reviewer = recommendModelsForHu({ complexity: TIER_LEVEL[complexity.tier], coderProvider, config });
  return { ...reviewer, coder_model: route.skip ? null : route.model, complexity };
}
