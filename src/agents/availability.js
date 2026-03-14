import { runCommand } from "../utils/process.js";
import { resolveBin } from "./resolve-bin.js";
import { getAgentMeta } from "./index.js";

export async function assertAgentsAvailable(agentNames = []) {
  const unique = [...new Set(agentNames.filter(Boolean))];
  const missing = [];

  for (const name of unique) {
    const meta = getAgentMeta(name);
    if (!meta?.bin) continue;
    const res = await runCommand(resolveBin(meta.bin), ["--version"]);
    if (res.exitCode !== 0) {
      missing.push({ name, ...meta });
    }
  }

  if (missing.length === 0) return;

  const lines = ["Missing required AI CLIs for this command:"];
  for (const m of missing) {
    lines.push(`- ${m.name}: command '${m.bin}' not found`, `  Install: ${m.installUrl}`);
  }
  throw new Error(lines.join("\n"));
}
