/**
 * Plan fixer (KJC-BUG-0045 / P4) — self-fix loop after plan-reviewer.
 *
 * The reviewer is flag-only by contract. This module asks the planner
 * to PATCH the plan with the missing pieces and applies the patch
 * in-process. Patch shape:
 *   - additions:    new HUs (planner-step shape, id is auto-assigned)
 *   - deps_to_add:  blocked_by edges to declare on existing HUs
 *   - deletions:    HU ids to drop (used for overlap resolution)
 */

import { extractFirstJson } from "../utils/json-extract.js";
import { addHu } from "./plan-hu-ops.js";
import { normaliseAcceptanceTests } from "./plan-schema.js";
import { withBrainRecovery } from "../brain/with-brain-recovery.js";

export function buildFixerPrompt({ task, hus, findings }) {
  // KJC-BUG-0314: archived (skipped) HUs are not offered to the fixer to patch.
  const huSummary = hus.filter((h) => h.status !== "skipped").map((h) => {
    const deps = Array.isArray(h.blocked_by) && h.blocked_by.length > 0
      ? ` ← blocked_by: ${h.blocked_by.join(", ")}` : "";
    return `- ${h.id}: ${h.title || "(untitled)"}${deps}`;
  }).join("\n");

  const missingHus = (findings?.missing_hus || [])
    .map(m => `  - §${m.spec_section}: ${m.rationale}`).join("\n");
  const missingDeps = (findings?.missing_dependencies || [])
    .map(d => `  - ${d.from} should be blocked_by ${d.on} (${d.rationale})`).join("\n");
  const overlaps = (findings?.scope_overlaps || [])
    .map(o => `  - ${o.between.join(" ↔ ")}: ${o.rationale}`).join("\n");

  return [
    "A reviewer flagged the issues listed under \"Findings\". Your ONLY",
    "job is to PATCH the plan to fix EXACTLY those issues:",
    "- missing_hus → MUST add one HU each",
    "- missing_dependencies → MUST declare each edge",
    "- scope_overlaps → MUST drop one of the pair or merge them",
    "- USER FEEDBACK in the task (if any) → apply it too: deps_to_remove for",
    "  an edge it says to drop, scope_edits for a scope it says to narrow",
    "Do NOT propose new features outside the findings list. Do not add new",
    "tests/logging/refactors. The fixer is scoped to the report ONLY.",
    "A dependency that would close a cycle is rejected.",
    "",
    "Output MUST be a JSON object:",
    "```json",
    "{",
    '  "additions": [',
    '    { "id": "<symbolic>", "description": "<sentence>",',
    '      "replaces": "<huId of a deleted HU it supersedes, if any>",',
    '      "spec_section": "<ref>", "dependencies": ["<huId>"],',
    '      "acceptance_tests": [ { "type":"gherkin","content":"…" } ],',
    '      "reuse": [] }',
    "  ],",
    '  "deps_to_add": [ { "huId": "<huId>", "on": "<huId>" } ],',
    '  "deps_to_remove": [ { "huId": "<huId>", "on": "<huId>" } ],',
    '  "scope_edits": [ { "huId": "<huId>", "scope": "<the narrowed scope>" } ],',
    '  "deletions": [ "<huId>" ]',
    "}",
    "```",
    "Reference existing HUs by exact id. Empty arrays OK. JSON only.",
    "",
    "## Original Task",
    task,
    "",
    "## Current plan",
    huSummary,
    "",
    "## Findings to address",
    missingHus ? `### missing_hus (MUST add)\n${missingHus}` : "",
    missingDeps ? `### missing_dependencies (MUST declare)\n${missingDeps}` : "",
    overlaps ? `### scope_overlaps (MUST drop or merge)\n${overlaps}` : "",
  ].filter(Boolean).join("\n");
}

const normaliseEdges = (list) => (Array.isArray(list) ? list : [])
  .filter(d => d && typeof d.huId === "string" && typeof d.on === "string")
  .map(d => ({ huId: d.huId.trim(), on: d.on.trim() }));

function normalisePatch(raw) {
  const out = { additions: [], deps_to_add: [], deps_to_remove: [], scope_edits: [], deletions: [] };
  if (!raw || typeof raw !== "object") return out;
  if (Array.isArray(raw.additions)) {
    out.additions = raw.additions
      .filter(a => a && typeof a === "object" && typeof a.description === "string" && a.description.trim())
      .map(a => ({
        id: typeof a.id === "string" ? a.id.trim() : null,
        replaces: typeof a.replaces === "string" && a.replaces.trim() ? a.replaces.trim() : null,
        description: String(a.description).trim(),
        spec_section: typeof a.spec_section === "string" ? a.spec_section.trim() || null : null,
        dependencies: Array.isArray(a.dependencies) ? a.dependencies.map(String) : [],
        acceptance_tests: normaliseAcceptanceTests(a.acceptance_tests),
        reuse: Array.isArray(a.reuse) ? a.reuse.map(String) : [],
      }));
  }
  out.deps_to_add = normaliseEdges(raw.deps_to_add);
  out.deps_to_remove = normaliseEdges(raw.deps_to_remove);
  if (Array.isArray(raw.scope_edits)) {
    out.scope_edits = raw.scope_edits
      .filter(e => e && typeof e.huId === "string" && typeof e.scope === "string" && e.scope.trim())
      .map(e => ({ huId: e.huId.trim(), scope: e.scope.trim() }));
  }
  if (Array.isArray(raw.deletions)) {
    out.deletions = raw.deletions.filter(d => typeof d === "string" && d.trim()).map(d => d.trim());
  }
  return out;
}

export async function applyReviewerFeedback({ agent, task, hus, findings, onOutput, silenceTimeoutMs, timeoutMs, emitter, eventBase, logger }) {
  const prompt = buildFixerPrompt({ task, hus, findings });
  const runArgs = { prompt, role: "planner" };
  if (onOutput) runArgs.onOutput = onOutput;
  if (silenceTimeoutMs) runArgs.silenceTimeoutMs = silenceTimeoutMs;
  if (timeoutMs) runArgs.timeoutMs = timeoutMs;
  // KJC-TSK-0413: Brain Recovery — fix loop ya no muere silencioso.
  const result = await withBrainRecovery({
    agent, taskArgs: runArgs, role: "plan-fixer",
    emitter, eventBase, logger,
  });
  if (!result.ok) return { ok: false, error: result.error || `fixer agent failed (${result.recovery?.class || "unknown"})`, recovery: result.recovery, action: result.action };
  const parsed = extractFirstJson(result.output || "");
  if (!parsed || typeof parsed !== "object") {
    return { ok: false, error: "fixer returned no JSON object" };
  }
  return { ok: true, patch: normalisePatch(parsed) };
}

// KJC-BUG-0316: whether `from` depends on `target`, directly or transitively.
function dependsOn(plan, from, target) {
  const seen = new Set();
  const stack = [from];
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === target) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    stack.push(...(plan.hus.find((h) => h.id === id)?.blocked_by || []));
  }
  return false;
}

/** Whether applying the patch changed the plan (a rejected cycle is not a change). */
export function patchChanged(counts) {
  return counts.added + counts.depsAdded + counts.depsRemoved + counts.scopesEdited + counts.archived > 0;
}

export function applyFixerPatch(plan, patch) {
  const counts = { added: 0, depsAdded: 0, depsRemoved: 0, scopesEdited: 0, archived: 0, cyclesRejected: 0 };
  // KJC-BUG-0316 (#2066): an edge the feedback says to drop, and a scope it says to narrow.
  for (const { huId, on } of patch.deps_to_remove || []) {
    const hu = plan.hus.find((h) => h.id === huId);
    if (!hu?.blocked_by?.includes(on)) continue;
    hu.blocked_by = hu.blocked_by.filter((d) => d !== on);
    counts.depsRemoved += 1;
  }
  for (const { huId, scope } of patch.scope_edits || []) {
    const hu = plan.hus.find((h) => h.id === huId);
    if (!hu || hu.scope === scope) continue;
    hu.scope = scope;
    counts.scopesEdited += 1;
  }
  // KJC-BUG-0314 (#2063): what a deleted HU depended on and who depended on it,
  // taken before archiving cleans the edges, so its replacement can take over.
  const replaced = new Map((patch.deletions || []).map((id) => [id, {
    deps: [...(plan.hus.find((h) => h.id === id)?.blocked_by || [])],
    dependents: plan.hus.filter((h) => h.id !== id && h.blocked_by?.includes(id)).map((h) => h.id),
  }]));
  // KJC-TSK-0669 (absolute rule): HUs are NEVER deleted — not even by the
  // fix loop. Overlap resolutions ARCHIVE in place (status skipped +
  // provenance), so history survives and ids stay referenceable. The
  // references are cleaned exactly like removeHu used to, because a
  // skipped dependency never satisfies the scheduler (deadlock otherwise).
  for (const huId of patch.deletions || []) {
    const hu = plan.hus.find(h => h.id === huId);
    if (!hu) continue;
    if (hu.status !== "skipped") {
      hu.status = "skipped";
      hu.archived_by = "plan-reviewer";
      hu.archive_reason = "scope overlap resolved by the plan-review fix loop";
      hu.updatedAt = new Date().toISOString();
      counts.archived += 1;
    }
    for (const other of plan.hus) {
      if (other.id === huId) continue;
      if (Array.isArray(other.blocked_by) && other.blocked_by.includes(huId)) {
        other.blocked_by = other.blocked_by.filter(d => d !== huId);
      }
      if (Array.isArray(other.reuse) && other.reuse.includes(huId)) {
        other.reuse = other.reuse.filter(d => d !== huId);
      }
    }
  }
  // KJC-BUG-0053: las HUs añadidas por el fixer dejaban `short_id` y
  // `blocked_by` vacíos porque addHu no recibía esos campos. Resultado:
  // HUs huérfanas con id largo críptico y sin orden de ejecución.
  //
  // Fix: (1) pasar `short_id: a.id` (el id simbólico que el fixer LLM
  // asigna a cada addition). (2) resolver `a.dependencies` simbólicas
  // → hu.id largos contra el plan ya existente + el mapa de símbolos
  // recién añadidos. La resolución necesita 2 pasadas (primera crea
  // las HUs y registra el mapping, segunda asigna deps) para que
  // additions que se referencian entre sí funcionen.
  const symbolicToHuId = new Map();
  for (const hu of plan.hus) {
    if (hu.short_id) symbolicToHuId.set(hu.short_id, hu.id);
  }
  const addedHus = []; // {hu, depsSymbolic}
  for (const a of patch.additions || []) {
    const symbolicId = typeof a.id === "string" && a.id.trim() ? a.id.trim() : null;
    const hu = addHu(plan, {
      title: (a.description || "").slice(0, 80),
      scope: a.description,
      short_id: symbolicId,
      spec_section: a.spec_section,
      acceptance_tests: a.acceptance_tests,
      reuse: a.reuse || [],
    });
    hu.created_by = "plan-reviewer"; // KJC-TSK-0661: provenance stamp
    if (symbolicId) symbolicToHuId.set(symbolicId, hu.id);
    const depsSymbolic = Array.isArray(a.dependencies) ? a.dependencies : [];
    addedHus.push({ hu, depsSymbolic, replaces: a.replaces });
    counts.added += 1;
  }
  // Pasada 2: resolver deps simbólicas de las additions a ids largos. KJC-BUG-0314:
  // a dependency given by the HU's own long id resolves too.
  const liveIds = new Set(plan.hus.filter((h) => h.status !== "skipped").map((h) => h.id));
  for (const { hu, depsSymbolic, replaces } of addedHus) {
    const resolved = depsSymbolic
      .map((s) => (typeof s === "string" ? symbolicToHuId.get(s.trim()) ?? (liveIds.has(s.trim()) ? s.trim() : null) : null))
      .filter(Boolean);
    const takeOver = replaced.get(replaces);
    const deps = [...new Set([...resolved, ...(takeOver?.deps || []).filter((d) => liveIds.has(d))])];
    if (deps.length > 0) hu.blocked_by = deps;
    for (const id of takeOver?.dependents || []) {
      const dependent = plan.hus.find((h) => h.id === id);
      if (dependent && !dependent.blocked_by?.includes(hu.id)) dependent.blocked_by = [...(dependent.blocked_by || []), hu.id];
    }
  }
  const knownIds = new Set(plan.hus.map(h => h.id));
  for (const { huId, on } of patch.deps_to_add || []) {
    if (!knownIds.has(huId) || !knownIds.has(on)) continue;
    const hu = plan.hus.find(h => h.id === huId);
    if (!hu) continue;
    const blocked = Array.isArray(hu.blocked_by) ? hu.blocked_by : [];
    if (blocked.includes(on)) continue;
    if (dependsOn(plan, on, huId)) { counts.cyclesRejected += 1; continue; }
    hu.blocked_by = [...blocked, on];
    counts.depsAdded += 1;
  }
  if (patchChanged(counts)) {
    plan.updatedAt = new Date().toISOString();
  }
  return counts;
}
