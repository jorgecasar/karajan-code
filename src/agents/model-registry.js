const modelRegistry = new Map();

export function registerModel(name, { provider, pricing, deprecated } = {}) {
  if (!name || typeof name !== "string") {
    throw new Error("Model name must be a non-empty string");
  }
  if (!pricing || typeof pricing.input_per_million !== "number" || typeof pricing.output_per_million !== "number") {
    throw new Error(`Model "${name}" requires pricing with input_per_million and output_per_million`);
  }
  modelRegistry.set(name, {
    provider: provider || name.split("/")[0],
    pricing: { input_per_million: pricing.input_per_million, output_per_million: pricing.output_per_million },
    deprecated: deprecated || null,
  });
}

export function getModelPricing(name) {
  const entry = modelRegistry.get(name);
  return entry ? { ...entry.pricing } : null;
}

export function isModelDeprecated(name) {
  const entry = modelRegistry.get(name);
  if (!entry?.deprecated) return false;
  return new Date(entry.deprecated) <= new Date();
}

export function getModelInfo(name) {
  const entry = modelRegistry.get(name);
  if (!entry) return null;
  return { name, provider: entry.provider, pricing: { ...entry.pricing }, deprecated: entry.deprecated };
}

export function getRegisteredModels() {
  return [...modelRegistry.entries()].map(([name, entry]) => ({
    name,
    provider: entry.provider,
    pricing: { ...entry.pricing },
    deprecated: entry.deprecated,
  }));
}

export function buildDefaultPricingTable() {
  const table = {};
  for (const [name, entry] of modelRegistry) {
    table[name] = { ...entry.pricing };
  }
  return table;
}

// Auto-register built-in models
// Names must match what each CLI accepts as --model argument
registerModel("claude", { provider: "anthropic", pricing: { input_per_million: 3, output_per_million: 15 } });
registerModel("sonnet", { provider: "anthropic", pricing: { input_per_million: 3, output_per_million: 15 } });
registerModel("opus", { provider: "anthropic", pricing: { input_per_million: 15, output_per_million: 75 } });
registerModel("haiku", { provider: "anthropic", pricing: { input_per_million: 0.25, output_per_million: 1.25 } });
registerModel("codex", { provider: "openai", pricing: { input_per_million: 1.5, output_per_million: 4 } });
registerModel("o4-mini", { provider: "openai", pricing: { input_per_million: 1.5, output_per_million: 4 } });
registerModel("o3", { provider: "openai", pricing: { input_per_million: 10, output_per_million: 40 } });
registerModel("gemini", { provider: "google", pricing: { input_per_million: 1.25, output_per_million: 5 } });
registerModel("gemini-2.5-pro", { provider: "google", pricing: { input_per_million: 1.25, output_per_million: 5 } });
registerModel("gemini-2.0-flash", { provider: "google", pricing: { input_per_million: 0.075, output_per_million: 0.3 } });
registerModel("aider", { provider: "aider", pricing: { input_per_million: 3, output_per_million: 15 } });
registerModel("opencode", { provider: "opencode", pricing: { input_per_million: 0, output_per_million: 0 } });
