import { loadConfig, writeConfig, getConfigPath, resolveRole } from "../config.js";
import { checkBinary, KNOWN_AGENTS } from "../utils/agent-detect.js";

const ASSIGNABLE_ROLES = [
  "coder", "reviewer", "planner", "refactorer", "triage",
  "researcher", "tester", "security", "solomon"
];

const VALID_PROVIDERS = KNOWN_AGENTS.map((a) => a.name);

export function listAgents(config) {
  return ASSIGNABLE_ROLES.map((role) => {
    const resolved = resolveRole(config, role);
    return {
      role,
      provider: resolved.provider || "-",
      model: resolved.model || "-"
    };
  });
}

export async function setAgent(role, provider) {
  if (!ASSIGNABLE_ROLES.includes(role)) {
    throw new Error(`Unknown role "${role}". Valid roles: ${ASSIGNABLE_ROLES.join(", ")}`);
  }
  if (!VALID_PROVIDERS.includes(provider)) {
    const bin = await checkBinary(provider);
    if (!bin.ok) {
      throw new Error(`Provider "${provider}" not found. Available: ${VALID_PROVIDERS.join(", ")}`);
    }
  }

  const { config } = await loadConfig();
  config.roles = config.roles || {};
  config.roles[role] = config.roles[role] || {};
  config.roles[role].provider = provider;

  const configPath = getConfigPath();
  await writeConfig(configPath, config);

  return { role, provider, configPath };
}

export async function agentsCommand({ config, subcommand, role, provider }) {
  if (subcommand === "set") {
    if (!role || !provider) {
      console.log("Usage: kj agents set <role> <provider>");
      console.log(`Roles: ${ASSIGNABLE_ROLES.join(", ")}`);
      console.log(`Providers: ${VALID_PROVIDERS.join(", ")}`);
      return;
    }
    const result = await setAgent(role, provider);
    console.log(`Set ${result.role} -> ${result.provider} (saved to ${result.configPath})`);
    return result;
  }

  const agents = listAgents(config);
  const roleWidth = Math.max(...agents.map((a) => a.role.length), 4);
  const provWidth = Math.max(...agents.map((a) => a.provider.length), 8);
  console.log(`${"Role".padEnd(roleWidth)}  ${"Provider".padEnd(provWidth)}  Model`);
  console.log("-".repeat(roleWidth + provWidth + 10));
  for (const a of agents) {
    console.log(`${a.role.padEnd(roleWidth)}  ${a.provider.padEnd(provWidth)}  ${a.model}`);
  }
  return agents;
}

export { ASSIGNABLE_ROLES, VALID_PROVIDERS };
