// KJC-TSK-0699: the ONE table of default models per provider and level (the HU
// router reads it too). Ids verified 2026-10-16: claude takes its CLI aliases,
// which follow the current version; codex takes the models its CLI lists
// (models_cache.json: luna fast, terra balanced, sol the most capable). null
// leaves the CLI's own default where no id could be verified: aider and
// opencode run on each user's providers, gemini and qwen no longer serve
// individuals, copilot publishes no list.
const NO_MODEL = { trivial: null, simple: null, medium: null, complex: null };
const DEFAULT_MODEL_TIERS = {
  claude: { trivial: "haiku", simple: "haiku", medium: "sonnet", complex: "opus" },
  codex: { trivial: "gpt-5.6-luna", simple: "gpt-5.6-luna", medium: "gpt-5.6-terra", complex: "gpt-5.6-sol" },
  gemini: NO_MODEL,
  qwen: NO_MODEL,
  copilot: NO_MODEL,
  opencode: NO_MODEL,
  aider: NO_MODEL
};

const DEFAULT_ROLE_OVERRIDES = {
  reviewer: { trivial: "medium", simple: "medium" },
  triage: { medium: "simple", complex: "simple" }
};

const VALID_LEVELS = new Set(["trivial", "simple", "medium", "complex"]);

/**
 * KJC-TSK-0699 (MR-B): named profiles over the levels, so the user talks of
 * profiles, not model ids. Resolution: flag > roles.<role>.model > profile >
 * the CLI's own default. The reviewer keeps its floor (never below medium).
 */
export const MODEL_PROFILES = { frugal: "trivial", standard: "medium", deep: "complex" };
const CODER_PROVIDER_ROLES = new Set(["planner", "refactorer", "solomon", "researcher", "tester", "security", "impeccable", "triage", "discover", "architect", "audit"]);

/** Fills the model of every role that has none yet; returns what it set. */
export function applyModelProfile(config, profile) {
  const level = MODEL_PROFILES[profile];
  if (!level) throw new Error(`model profile "${profile}" does not exist: use one of ${Object.keys(MODEL_PROFILES).join(", ")}`);
  const coderProvider = config.roles?.coder?.provider || config.coder || null;
  const set = {};
  for (const [role, entry] of Object.entries(config.roles ?? {})) {
    if (entry?.model) continue;
    const provider = entry?.provider || (role === "reviewer" ? config.reviewer : null) || (CODER_PROVIDER_ROLES.has(role) || role === "coder" ? coderProvider : null);
    const model = resolveModelForRole({ role, provider, level });
    // A new object: the entry may be shared with the shipped defaults.
    if (!model) continue;
    set[role] = model;
    config.roles[role] = { ...entry, model };
  }
  return set;
}

/** The line kj config prints about the effective profile. */
export function formatModelProfile(config) {
  const profile = config?.model_profile;
  if (!profile) return "Model profile: none (each CLI uses its own default model)";
  return `Model profile: ${profile} (${MODEL_PROFILES[profile]} models; reviewer never below standard)`;
}

export function getDefaultModelTiers() {
  return structuredClone(DEFAULT_MODEL_TIERS);
}

export function getDefaultRoleOverrides() {
  return structuredClone(DEFAULT_ROLE_OVERRIDES);
}

export function resolveModelForRole({ role, provider, level, tierMap, roleOverrides }) {
  if (!provider || !level || !VALID_LEVELS.has(level)) return null;

  const tiers = tierMap || DEFAULT_MODEL_TIERS;
  const providerTiers = tiers[provider];
  if (!providerTiers) return null;

  const overrides = roleOverrides || DEFAULT_ROLE_OVERRIDES;
  const roleOvr = overrides[role];

  let effectiveLevel = level;
  if (roleOvr?.[level]) {
    const mappedLevel = roleOvr[level];
    if (VALID_LEVELS.has(mappedLevel)) {
      effectiveLevel = mappedLevel;
    }
  }

  return providerTiers[effectiveLevel] || null;
}

export function selectModelsForRoles({ level, config, roles }) {
  if (!level || !VALID_LEVELS.has(level)) {
    return { modelOverrides: {}, reasoning: "No valid triage level provided" };
  }

  const modelSelection = config?.model_selection || {};
  const userTiers = modelSelection.tiers || {};
  const userRoleOverrides = modelSelection.role_overrides || {};

  const mergedTiers = { ...getDefaultModelTiers() };
  for (const [provider, levels] of Object.entries(userTiers)) {
    mergedTiers[provider] = { ...mergedTiers[provider], ...levels };
  }

  const mergedRoleOverrides = { ...getDefaultRoleOverrides() };
  for (const [role, levels] of Object.entries(userRoleOverrides)) {
    mergedRoleOverrides[role] = { ...mergedRoleOverrides[role], ...levels };
  }

  const allRoles = roles || Object.keys(config?.roles || {});
  const modelOverrides = {};
  const details = [];

  for (const role of allRoles) {
    const roleConfig = config?.roles?.[role];
    if (!roleConfig) continue;

    if (roleConfig.model) {
      details.push(`${role}: skipped (explicit model "${roleConfig.model}")`);
      continue;
    }

    if (roleConfig.disabled) {
      details.push(`${role}: skipped (disabled)`);
      continue;
    }

    const provider = roleConfig.provider;
    if (!provider) {
      details.push(`${role}: skipped (no provider)`);
      continue;
    }

    const model = resolveModelForRole({
      role,
      provider,
      level,
      tierMap: mergedTiers,
      roleOverrides: mergedRoleOverrides
    });

    if (model) {
      modelOverrides[role] = model;
      details.push(`${role}: ${model} (level=${level}, provider=${provider})`);
    } else {
      details.push(`${role}: no model for provider "${provider}"`);
    }
  }

  return {
    modelOverrides,
    reasoning: `Smart model selection (level=${level}): ${details.join("; ")}`
  };
}
