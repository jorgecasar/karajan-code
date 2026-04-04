import fs from "node:fs/promises";
import path from "node:path";
import yaml from "js-yaml";
import * as v from "valibot";
import { ensureDir, exists } from "./utils/fs.js";
import { getKarajanHome } from "./utils/paths.js";
import { ConfigSchema } from "./config/schema.js";

/** @typedef {v.InferOutput<typeof ConfigSchema>} KarajanConfig */

export function getConfigPath() {
  return path.join(getKarajanHome(), "kj.config.yml");
}

export function getProjectConfigPath(projectDir = process.cwd()) {
  return path.join(projectDir, ".karajan", "kj.config.yml");
}

export async function loadProjectConfig(projectDir = process.cwd()) {
  const projectConfigPath = getProjectConfigPath(projectDir);
  if (!(await exists(projectConfigPath))) {
    return null;
  }
  const raw = await fs.readFile(projectConfigPath, "utf8");
  return yaml.load(raw, { json: true }) || {};
}

async function loadProjectPricingOverrides(projectDir = process.cwd()) {
  const projectConfigPath = path.join(projectDir, ".karajan.yml");
  if (!(await exists(projectConfigPath))) {
    return null;
  }

  const raw = await fs.readFile(projectConfigPath, "utf8");
  const parsed = yaml.load(raw, { json: true }) || {};
  const pricing = parsed?.budget?.pricing;
  if (!pricing || typeof pricing !== "object") {
    return null;
  }

  return pricing;
}

/**
 * Deep merge two objects natively without a dedicated utility function.
 */
function nativeDeepMerge(target, source) {
  const output = { ...target };
  if (source && typeof source === "object") {
    Object.keys(source).forEach((key) => {
      if (source[key] && typeof source[key] === "object" && !Array.isArray(source[key])) {
        if (!(key in target)) {
          Object.assign(output, { [key]: source[key] });
        } else {
          output[key] = nativeDeepMerge(target[key], source[key]);
        }
      } else {
        Object.assign(output, { [key]: source[key] });
      }
    });
  }
  return output;
}

export async function loadConfig(projectDir) {
  const configPath = getConfigPath();
  const projectPricing = await loadProjectPricingOverrides(projectDir);

  // Load global config
  let globalConfig = {};
  const globalExists = await exists(configPath);
  if (globalExists) {
    const raw = await fs.readFile(configPath, "utf8");
    globalConfig = yaml.load(raw, { json: true }) || {};
  }

  // Load project config (.karajan/kj.config.yml)
  const projectConfig = await loadProjectConfig(projectDir);

  // Merge: global < project
  // We use a local deep merge to preserve nested properties between global and project config
  let rawMerged = nativeDeepMerge(globalConfig, projectConfig || {});

  if (projectPricing) {
    rawMerged.budget = nativeDeepMerge(rawMerged.budget || {}, { pricing: projectPricing });
  }

  const validatedConfig = v.parse(ConfigSchema, rawMerged);

  return { config: validatedConfig, path: configPath, exists: globalExists, hasProjectConfig: !!projectConfig };
}

export async function writeConfig(configPath, config) {
  await ensureDir(path.dirname(configPath));
  await fs.writeFile(configPath, yaml.dump(config, { lineWidth: 120 }), "utf8");
}

// Declarative mappings for applyRunOverrides to reduce cognitive complexity.

// Role provider flags: [flagName, roleName] — truthy check
const ROLE_PROVIDER_FLAGS = [
  ["planner", "planner"],
  ["coder", "coder"],
  ["reviewer", "reviewer"],
  ["refactorer", "refactorer"],
  ["solomon", "solomon"],
  ["researcher", "researcher"],
  ["tester", "tester"],
  ["security", "security"],
  ["triage", "triage"],
  ["discover", "discover"],
  ["architect", "architect"],
];

// Role model flags: [flagName, roleName] — truthy check, String coercion
const ROLE_MODEL_FLAGS = [
  ["plannerModel", "planner"],
  ["coderModel", "coder"],
  ["reviewerModel", "reviewer"],
  ["refactorerModel", "refactorer"],
  ["solomonModel", "solomon"],
  ["discoverModel", "discover"],
  ["architectModel", "architect"],
];

// Pipeline enable flags: [flagName, pipelineKey] — !== undefined check, Boolean coercion
const PIPELINE_ENABLE_FLAGS = [
  ["enablePlanner", "planner"],
  ["enableRefactorer", "refactorer"],
  ["enableSolomon", "solomon"],
  ["enableResearcher", "researcher"],
  ["enableTester", "tester"],
  ["enableSecurity", "security"],
  ["enableImpeccable", "impeccable"],
  ["enableTriage", "triage"],
  ["enableDiscover", "discover"],
  ["enableArchitect", "architect"],
  ["enableHuReviewer", "hu_reviewer"],
];

const AUTO_SIMPLIFY_FLAG = "autoSimplify";

// Scalar flags: [flagName, setter] — truthy check
const SCALAR_FLAGS = [
  [
    "mode",
    (out, v) => {
      out.review_mode = v;
    },
  ],
  [
    "baseBranch",
    (out, v) => {
      out.base_branch = v;
    },
  ],
  [
    "maxIterationMinutes",
    (out, v) => {
      out.session.max_iteration_minutes = Number(v);
    },
  ],
  [
    "maxTotalMinutes",
    (out, v) => {
      out.session.max_total_minutes = Number(v);
    },
  ],
  [
    "reviewerFallback",
    (out, v) => {
      out.reviewer_options.fallback_reviewer = String(v);
    },
  ],
  [
    "reviewerRetries",
    (out, v) => {
      out.reviewer_options.retries = Number(v);
    },
  ],
  [
    "autoCommit",
    (out, v) => {
      out.git.auto_commit = Boolean(v);
    },
  ],
  [
    "autoPush",
    (out, v) => {
      out.git.auto_push = Boolean(v);
    },
  ],
  [
    "autoPr",
    (out, v) => {
      out.git.auto_pr = Boolean(v);
    },
  ],
  [
    "noRebase",
    (out, v) => {
      out.git.auto_rebase = !v;
    },
  ],
  [
    "autoRebase",
    (out, v) => {
      out.git.auto_rebase = Boolean(v);
    },
  ],
  [
    "branchPrefix",
    (out, v) => {
      out.git.branch_prefix = String(v);
    },
  ],
  [
    "iterations",
    (out, v) => {
      out.max_iterations = Number(v);
    },
  ],
  [
    "methodology",
    (out, v) => {
      out.development.methodology = v;
      if (v === "standard") out.development.require_test_changes = false;
    },
  ],
  [
    "verbose",
    (out, v) => {
      out.output.quiet = !v;
    },
  ],
  [
    "quiet",
    (out, v) => {
      out.output.quiet = Boolean(v);
    },
  ],
  [
    "proxyPort",
    (out, v) => {
      out.proxy.port = String(v);
    },
  ],
];

/**
 * Applies CLI flag overrides to a base configuration object.
 * Returns a new object with merged values.
 */
export function applyRunOverrides(base, flags) {
  // We don't use ConfigSchema.parse(base) here because 'base' might be incomplete
  // or a mock during tests. Valibot will be called in loadConfig.
  const out = nativeDeepMerge({}, base);

  // 1. Roles: Provider and Model
  out.roles = out.roles || {};
  for (const [flag, role] of ROLE_PROVIDER_FLAGS) {
    if (flags[flag]) {
      out.roles[role] = nativeDeepMerge(out.roles[role] || {}, { provider: String(flags[flag]) });
    }
  }
  for (const [flag, role] of ROLE_MODEL_FLAGS) {
    if (flags[flag]) {
      out.roles[role] = nativeDeepMerge(out.roles[role] || {}, { model: String(flags[flag]) });
    }
  }

  // 2. Pipeline: Enable/Disable
  out.pipeline = out.pipeline || {};
  for (const [flag, key] of PIPELINE_ENABLE_FLAGS) {
    if (flags[flag] !== undefined) {
      out.pipeline[key] = nativeDeepMerge(out.pipeline[key] || {}, { enabled: Boolean(flags[flag]) });
    }
  }

  // noSonar shorthand
  if (flags.noSonar !== undefined) {
    out.sonarqube = nativeDeepMerge(out.sonarqube || {}, { enabled: !flags.noSonar });
  }

  // noRebase shorthand
  if (flags.noRebase !== undefined) {
    out.git = nativeDeepMerge(out.git || {}, { auto_rebase: !flags.noRebase });
  }

  // noProxy shorthand
  if (flags.noProxy !== undefined) {
    out.proxy = nativeDeepMerge(out.proxy || {}, { enabled: !flags.noProxy });
  }

  // autoSimplify
  if (flags[AUTO_SIMPLIFY_FLAG] !== undefined) {
    out.pipeline.auto_simplify = Boolean(flags[AUTO_SIMPLIFY_FLAG]);
  }

  // 3. Scalar fields and nested setters
  out.session = out.session || {};
  out.reviewer_options = out.reviewer_options || {};
  out.git = out.git || {};
  out.development = out.development || {};
  out.output = out.output || {};
  out.proxy = out.proxy || {};

  for (const [flag, setter] of SCALAR_FLAGS) {
    if (flags[flag] !== undefined) {
      setter(out, flags[flag]);
    }
  }

  // Final validation and default filling via Valibot
  return v.parse(ConfigSchema, out);
}

/**
 * Identify the provider from a string that might be "provider/model" or just "model".
 */
function resolveProvider(roleConfig, roleName, allRoles, legacyCoder, legacyReviewer) {
  if (roleConfig.provider) return roleConfig.provider;

  // Inference from model field: "gemini/pro" -> "gemini"
  if (roleConfig.model?.includes("/")) {
    return roleConfig.model.split("/")[0];
  }

  // Legacy fallbacks for coder/reviewer
  if (roleName === "coder" && legacyCoder) return legacyCoder;
  if (roleName === "reviewer" && legacyReviewer) return legacyReviewer;

  // Fallback to roles.coder.provider for other roles (planner, researcher, etc.)
  if (roleName !== "coder" && allRoles.coder?.provider) {
    return allRoles.coder.provider;
  }

  return null;
}

/**
 * Identify the model for a role, considering explicit config and global options.
 */
function resolveModel(roleConfig, roleName, config) {
  let model = roleConfig.model || null;
  let inherited = false;

  // Strip provider prefix if present: "gemini/pro" -> "pro"
  if (model?.includes("/")) {
    model = model.split("/").slice(1).join("/");
  }

  // Fallback to legacy options
  if (!model) {
    if (roleName === "reviewer") {
      model = config.reviewer_options?.model || null;
    } else {
      model = config.coder_options?.model || null;
    }
    if (model) inherited = true;
  }

  return { model, inherited };
}

/**
 * Check if a model is compatible with a provider.
 */
function isModelCompatible(provider, model) {
  if (provider === "claude" && model.includes("gemini")) return false;
  if (provider === "gemini" && (model.includes("claude") || model.includes("gpt"))) return false;
  return true;
}

export function resolveRole(config, role) {
  const roles = config?.roles || {};
  const roleConfig = roles[role] || {};
  const legacyCoder = config?.coder || null;
  const legacyReviewer = config?.reviewer || null;

  const provider = resolveProvider(roleConfig, role, roles, legacyCoder, legacyReviewer);
  let { model } = resolveModel(roleConfig, role, config);

  // Drop model if incompatible with the resolved provider
  if (provider && model && !isModelCompatible(provider, model)) {
    model = null;
  }

  return { provider, model };
}

// Pipeline roles checked when commandName is "run"
const RUN_PIPELINE_ROLES = [
  ["reviewer", "reviewer"],
  ["triage", "triage"],
  ["planner", "planner"],
  ["refactorer", "refactorer"],
  ["researcher", "researcher"],
  ["tester", "tester"],
  ["security", "security"],
  ["impeccable", "impeccable"],
];

// Direct command-to-role mapping
const COMMAND_ROLE_MAP = {
  discover: ["discover"],
  plan: ["planner"],
  code: ["coder"],
  review: ["reviewer"],
};

function requiredRolesFor(commandName, config) {
  if (commandName !== "run") {
    return COMMAND_ROLE_MAP[commandName] || [];
  }
  const required = ["coder"];
  for (const [pipelineKey, roleName] of RUN_PIPELINE_ROLES) {
    const pipelineEntry = config?.pipeline?.[pipelineKey];
    // If pipeline block is missing, it's disabled (legacy behavior)
    // Reviewer is enabled by default unless explicitly disabled
    const isEnabled = pipelineKey === "reviewer" 
      ? pipelineEntry?.enabled !== false 
      : Boolean(pipelineEntry?.enabled);
    if (isEnabled) required.push(roleName);
  }
  return required;
}

export function validateConfig(config, commandName = "run") {
  const errors = [];

  // 1. Structural and type validation via Valibot
  // We use the raw input for role check to avoid default filling triggering required roles
  const requiredRoles = requiredRolesFor(commandName, config);
  
  // 2. Perform Valibot validation
  let validatedConfig;
  try {
    validatedConfig = v.parse(ConfigSchema, config);
  } catch (err) {
    // Re-throw as a combined error string for compatibility with existing tests
    throw new Error(err.message || "Invalid configuration");
  }

  // 3. Logic validation (required roles) on validatedConfig
  for (const role of requiredRoles) {
    const { provider } = resolveRole(validatedConfig, role);
    if (!provider) {
      errors.push(`Missing provider for required role '${role}'. Set 'roles.${role}.provider' or pass '--${role} <name>'`);
    }
  }

  if (errors.length > 0) {
    throw new Error(errors.join("\n"));
  }

  return validatedConfig;
}
