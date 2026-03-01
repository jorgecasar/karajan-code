import { buildDefaultPricingTable } from "../agents/model-registry.js";

export const DEFAULT_MODEL_PRICING = buildDefaultPricingTable();

export function calculateUsageCostUsd({ model, tokens_in, tokens_out, pricing }) {
  const table = pricing || DEFAULT_MODEL_PRICING;
  const entry = table[model] || null;
  if (!entry) return 0;

  const inputCost = (tokens_in * entry.input_per_million) / 1_000_000;
  const outputCost = (tokens_out * entry.output_per_million) / 1_000_000;
  return inputCost + outputCost;
}

export function mergePricing(defaults, overrides) {
  if (!overrides || typeof overrides !== "object") return { ...defaults };
  return { ...defaults, ...overrides };
}
