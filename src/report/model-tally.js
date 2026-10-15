/**
 * KJC-TSK-1057 (MR-E2): what each coder model cost across the plan's HUs and
 * how often its HUs failed first time (rejected by the reviewer, or failed),
 * from the per-HU measurement of KJC-TSK-0702. HUs run before it are the
 * baseline: counted apart, never as zeros.
 */
const sum = (rows, field) => rows.reduce((acc, r) => acc + (Number.isFinite(r.outcome[field]) ? r.outcome[field] : 0), 0);
const round = (n, digits) => Math.round(n * 10 ** digits) / 10 ** digits;

export function modelTally(hus) {
  const measured = (hus ?? []).filter((h) => h?.outcome?.coder?.model);
  const byModel = Object.groupBy(measured, (h) => h.outcome.coder.model);
  const models = Object.entries(byModel).map(([model, rows]) => {
    const withIterations = rows.filter((r) => Number.isFinite(r.outcome.iterations));
    const failed = rows.filter((r) => r.outcome.status !== "done" || r.outcome.reviewer_rejections > 0).length;
    return {
      model,
      hus: rows.length,
      cost_usd: round(sum(rows, "cost_usd"), 6),
      tokens_in: sum(rows, "tokens_in"),
      tokens_out: sum(rows, "tokens_out"),
      mean_iterations: withIterations.length ? round(sum(withIterations, "iterations") / withIterations.length, 2) : null,
      failure_rate: round(failed / rows.length, 4),
    };
  });
  return { models, unmeasured: (hus ?? []).length - measured.length };
}

/** The kj report block, or null when no HU was run at all. */
export function formatModelTally({ models, unmeasured }) {
  if (models.length === 0 && unmeasured === 0) return null;
  const lines = ["Coder models (per HU, from the plans):"];
  for (const m of models) {
    const iterations = m.mean_iterations === null ? "-" : m.mean_iterations.toFixed(1);
    lines.push(`  ${m.model.padEnd(24)} ${m.hus} HU · $${m.cost_usd.toFixed(4)} · ${m.tokens_in} in / ${m.tokens_out} out · ${iterations} iter · ${Math.round(m.failure_rate * 100)}% failed first time`);
  }
  if (unmeasured > 0) lines.push(`  ${unmeasured} HU(s) before the measurement (baseline, unmeasured)`);
  return lines.join("\n");
}
