/**
 * KJC-TSK-0701 (MR-D): the model and effort the coder of an HU runs on. Its
 * tier (MR-A) picks them on the first iteration; after a failed one the coder
 * climbs to the most capable model. A model the user chose always wins, the
 * reviewer and Solomon are never routed, and model_routing.enabled: false turns
 * it off; model_routing.by_provider picks other models per level.
 */
import { getDefaultModelTiers, resolveModelForRole } from "../utils/model-selector.js";

const TIER_ROUTE = { trivial: { level: "trivial", effort: "low" }, standard: { level: "medium", effort: "medium" } };
const ESCALATED = { level: "complex", effort: "max" };
// Only claude's CLI takes --effort.
const EFFORT_PROVIDERS = new Set(["claude"]);

const userChoice = (config) => {
  if (config.model_routing?.enabled === false) return "model_routing.enabled is false";
  if (config.model_routing?.fixed?.coder) return `model_routing.fixed.coder is ${config.model_routing.fixed.coder}`;
  if (config.roles?.coder?.model) return `the coder model was chosen (${config.roles.coder.model})`;
  if (config.coder_options?.model) return `the coder model was chosen (${config.coder_options.model})`;
  if (config.model_profile) return `the model profile ${config.model_profile} was chosen`;
  return null;
};

/**
 * @param {{ tier?: string, attempt: number, config: object }} args
 * @returns {{ skip: true, reason: string } | { skip: false, model: string, effort: string|null, escalated: boolean, reason: string }}
 */
export function routeCoder({ tier, attempt, config }) {
  const chosen = userChoice(config);
  if (chosen) return { skip: true, reason: chosen };
  const escalated = attempt > 1;
  const route = escalated ? ESCALATED : TIER_ROUTE[tier];
  if (!route) return { skip: true, reason: tier === "deep" ? "deep HU: the usual model and effort" : `no tier to route by (${tier ?? "none"})` };
  const provider = config.roles?.coder?.provider || config.coder;
  const tierMap = getDefaultModelTiers();
  for (const [name, levels] of Object.entries(config.model_routing?.by_provider ?? {})) tierMap[name] = { ...tierMap[name], ...levels };
  const model = resolveModelForRole({ role: "coder", provider, level: route.level, tierMap });
  if (!model) return { skip: true, reason: `${provider} has no known model for the ${route.level} level` };
  const effort = EFFORT_PROVIDERS.has(provider) ? route.effort : null;
  const why = escalated ? `iteration ${attempt} after a failed one: the most capable model` : `${tier} HU`;
  return { skip: false, model, effort, escalated, reason: `${why} -> ${model}${effort ? ` (effort ${effort})` : ""}` };
}
