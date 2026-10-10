import { createAgent } from "../agents/index.js";
import { assertAgentsAvailable } from "../agents/availability.js";
import { resolveRole } from "../config.js";
import { buildArchitectPrompt, parseArchitectOutput } from "../prompts/architect.js";
import { createCliProgressReporter } from "../utils/cli-progress.js";
import { withBrainRecovery } from "../brain/with-brain-recovery.js";

// KJC-BUG-0313 (#2061): the agent answers each list with plain strings or with
// objects; both render, and a section with neither prints nothing, never "undefined".
function section(title, items, render, lines) {
  if (!items?.length) return;
  lines.push(`### ${title}`);
  for (const item of items) lines.push(...(typeof item === "string" ? [`- ${item}`] : render(item)));
  lines.push("");
}

const named = (o, detail) => [`- **${o.name ?? o.decision ?? JSON.stringify(o)}**${detail ? `: ${detail}` : ""}`];
const contract = (c) => [`- \`${c.method || "GET"} ${c.endpoint ?? c.path ?? ""}\``];
const tradeoff = (t) => [...named(t, t.rationale), ...(t.alternatives?.length ? [`  Alternatives: ${t.alternatives.join(", ")}`] : [])];
const entity = (e) => named(e, Array.isArray(e.fields) ? e.fields.join(", ") : e.description);

function formatArchitecture(arch, lines) {
  if (arch.type) lines.push(`**Type:** ${arch.type}`, "");
  section("Layers", arch.layers, (l) => named(l, l.responsibility), lines);
  section("Patterns", arch.patterns, (p) => [`- ${p.name ?? JSON.stringify(p)}`], lines);
  section("Data Model", arch.dataModel?.entities, entity, lines);
  // A contract given as a string ("GET /x") is code too: same backticks as an object's.
  section("API Contracts", arch.apiContracts?.map((c) => (typeof c === "string" ? { raw: c } : c)), (c) => (c.raw ? [`- \`${c.raw}\``] : contract(c)), lines);
  section("Dependencies", arch.dependencies, (d) => named(d, d.reason), lines);
  section("Tradeoffs", arch.tradeoffs, tradeoff, lines);
}

export function formatArchitect(result) {
  const lines = [];
  lines.push(`## Architecture Design`);
  lines.push(`**Verdict:** ${result.verdict || "unknown"}`, "");

  if (result.architecture) formatArchitecture(result.architecture, lines);

  if (result.questions?.length) {
    lines.push("### Clarification Questions");
    for (const q of result.questions) lines.push(`- ${q.question || q}`);
    lines.push("");
  }

  if (result.summary) lines.push(`---\n${result.summary}`);
  return lines.join("\n");
}

export async function architectCommand({ task, config, logger, context, json }) {
  const { withCliRunLog } = await import("../utils/cli-run-log.js");
  return withCliRunLog("architect", { projectDir: config?.projectDir, logger }, async ({ runLog }) => {
    const architectRole = resolveRole(config, "architect");
    await assertAgentsAvailable([architectRole.provider]);
    logger.info(`Architect (${architectRole.provider}) starting...`);
    runLog.logText(`[architect] provider=${architectRole.provider}`);

    const agent = createAgent(architectRole.provider, config, logger);
    const prompt = await buildArchitectPrompt({ task, researchContext: context });
    const progress = createCliProgressReporter({ role: "architect" });
    let result;
    try {
      result = await withBrainRecovery({
        agent, taskArgs: { prompt, onOutput: progress.onOutput, role: "architect" },
        role: "architect", provider: architectRole.provider, logger,
      });
      progress.finish(result.ok ? "done" : (result.action || "failed"));
    } catch (err) { progress.finish("failed"); throw err; }

    if (!result.ok) {
      throw new Error(result.error || result.output || "Architect failed");
    }

    const parsed = parseArchitectOutput(result.output);

    if (json) {
      console.log(JSON.stringify(parsed || result.output, null, 2));
      return { ok: true };
    }

    if (parsed?.verdict) {
      console.log(formatArchitect(parsed));
    } else {
      console.log(result.output);
    }

    // Persist ADRs from the architect's tradeoffs[] (v2.7.5). One ADR
    // per tradeoff in Nygard format under `~/.kj/plans/_loose/adrs/`.
    // Coder/reviewer in subsequent runs can pull the active ADRs into
    // their prompt for context — done in a follow-up PR.
    if (parsed?.architecture && config?.projectDir) {
      try {
        const { persistAdrsFromArchitecture } = await import("../plan/adr-generator.js");
        const { adrs, paths } = await persistAdrsFromArchitecture({
          projectDir: config.projectDir,
          planId: null,                  // standalone architect → "_loose" bucket
          architecture: parsed.architecture,
        });
        if (paths.length > 0) {
          console.log(`\n${adrs.length} ADR${adrs.length === 1 ? "" : "s"} written:`);
          for (const p of paths) console.log(`  - ${p}`);
        }
      } catch (err) {
        logger.warn(`ADR write skipped: ${err.message}`);
      }
    }

    logger.info("Architect completed.");
    return { ok: true };
  });
}
