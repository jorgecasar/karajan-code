/**
 * mcp-wiring — RAG as a NATIVE tool (KJC-TSK-0711). Field case 2026-08-03:
 * agents in karajan projects grep code by hand because the RAG is only "a
 * Bash command a text line told them about". Agents use the tools in their
 * toolbox, so env install wires kj's RAG-only MCP server (`kj-rag-mcp`,
 * ships with the package) into the project's `.mcp.json` — the official
 * path must be cheaper than the shortcut. Merge preserves the user's
 * entries; invalid JSON is left untouched (preserve, never clobber).
 */

import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// KJC-TSK-1067: a server spec that launches `qmd mcp` (command or args, any path).
const launchesQmd = (s) => Boolean(s) && typeof s === "object"
  && [s.command, ...(Array.isArray(s.args) ? s.args : [])].some((a) => typeof a === "string" && /(^|\/)qmd$/.test(a))
  && Array.isArray(s.args) && s.args.includes("mcp");

const defaultQmd = {
  installed: () => spawnSync("qmd", ["--version"], { stdio: "ignore" }).status === 0,
  // The user's own Claude Code config: global servers and every project's.
  wiredGlobally: () => {
    try {
      const c = JSON.parse(readFileSync(join(homedir(), ".claude.json"), "utf8"));
      return [c.mcpServers, ...Object.values(c.projects || {}).map((p) => p?.mcpServers)].some((m) => Object.values(m || {}).some(launchesQmd));
    } catch { return false; }
  },
};

export function installProjectMcp({ projectDir = process.cwd(), logger = console, qmd = defaultQmd } = {}) {
  const mcpPath = join(projectDir, ".mcp.json");
  let cfg = {};
  if (existsSync(mcpPath)) {
    try {
      cfg = JSON.parse(readFileSync(mcpPath, "utf8"));
    } catch {
      logger.warn?.(`kj env: ${mcpPath} is not valid JSON — leaving it untouched (wire kj-rag-mcp manually for native RAG queries)`);
      return { wired: false, reason: "invalid-json" };
    }
  }
  if (cfg.mcpServers && typeof cfg.mcpServers !== "object") {
    logger.warn?.(`kj env: ${mcpPath} has a non-object mcpServers — leaving it untouched`);
    return { wired: false, reason: "unexpected-shape" };
  }
  cfg.mcpServers = cfg.mcpServers || {};
  // Wired = the LAUNCH SPEC runs kj-rag-mcp (command or an arg, so `npx
  // kj-rag-mcp` and absolute paths count) — never env/description fields.
  const launchesRagMcp = (s) =>
    Boolean(s) && typeof s === "object" && (
      (typeof s.command === "string" && s.command.includes("kj-rag-mcp")) ||
      (Array.isArray(s.args) && s.args.some((a) => typeof a === "string" && a.includes("kj-rag-mcp")))
    );
  const present = Object.values(cfg.mcpServers).some(launchesRagMcp);
  if (!present) {
    cfg.mcpServers["kj-rag"] = { command: "kj-rag-mcp", args: [] };
    logger.info?.("✓ kj_rag_query wired as a NATIVE tool (.mcp.json → kj-rag-mcp): querying the RAG is now the agent's cheapest path");
  }
  // KJC-TSK-1067: qmd answers about the project's documents with fewer tokens and a source.
  let qmdState = "absent";
  if (Object.values(cfg.mcpServers).some(launchesQmd)) qmdState = "present";
  else if (qmd.installed() && qmd.wiredGlobally()) qmdState = "global";
  else if (qmd.installed()) {
    cfg.mcpServers.qmd = { command: "qmd", args: ["mcp"] };
    qmdState = "added";
    logger.info?.("✓ qmd wired as a NATIVE tool (.mcp.json → qmd mcp): questions about docs, notes, ADRs and plans answer from the documents, with fewer tokens");
  }
  if (!present || qmdState === "added") writeFileSync(mcpPath, `${JSON.stringify(cfg, null, 2)}\n`);
  return { wired: true, added: !present, qmd: qmdState };
}
