const DEFAULT_MODEL_TIERS = {
  claude: { trivial: "claude/haiku", simple: "claude/haiku", medium: "claude/sonnet", complex: "claude/opus" },
  codex: { trivial: "codex/o4-mini", simple: "codex/o4-mini", medium: "codex/o4-mini", complex: "codex/o3" },
  gemini: { trivial: "gemini/flash", simple: "gemini/flash", medium: "gemini/pro", complex: "gemini/pro" },
  aider: { trivial: null, simple: null, medium: null, complex: null }
};

const DEFAULT_ROLE_OVERRIDES = {
  reviewer: { trivial: "medium", simple: "medium" },
  triage: { medium: "simple", complex: "simple" }
};

const VALID_LEVELS = new Set(["trivial", "simple", "medium", "complex"]);

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
