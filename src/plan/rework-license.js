/**
 * KJC-TSK-0717 (SPD-A): a plan that changes code already written classifies
 * each HU: EXTEND (edit it), REWORK (regenerate the module with its tests as
 * the contract) or REBUILD (the subsystem), with the criterion written down.
 * REWORK needs a licence: the module's mutation score (kj mutate <path>) at or
 * over the threshold. Under it the plan goes in two phases, an HU that hardens
 * the module first: regenerating against a thin contract is a roulette.
 */
export const CHANGE_CLASSES = ["extend", "rework", "rebuild"];
// The maintainer's choice (2026-10-16): method_gates.rework_mutation_min overrides it.
export const DEFAULT_REWORK_MIN = 0.8;

/** The licence for a module, from its mutation score in percent. */
export function licenseFor({ module, score, threshold = DEFAULT_REWORK_MIN }) {
  return { module, mutation_score: score, threshold, granted: score / 100 >= threshold };
}

/**
 * What is wrong with one HU's classification; empty when nothing is. The
 * licence is judged again from its score against the threshold in force: a
 * stored `granted` (or threshold) is a record, never the authority.
 */
export function changeClassErrors(hu, hus, { reworkMin = DEFAULT_REWORK_MIN } = {}) {
  if (hu.change_class === undefined) return [];
  if (!CHANGE_CLASSES.includes(hu.change_class)) return [`HU ${hu.id}: change_class must be ${CHANGE_CLASSES.join("|")}, got ${hu.change_class}`];
  if (typeof hu.change_criterion !== "string" || !hu.change_criterion.trim()) return [`HU ${hu.id}: change_criterion is required with change_class (why this class, written down)`];
  if (hu.change_class !== "rework") return [];
  const licence = hu.rework_license;
  if (!licence) return [`HU ${hu.id}: REWORK needs a licence: kj plan license <plan> ${hu.id} --module <path>`];
  const score = licence.mutation_score;
  if (typeof licence.module !== "string" || !licence.module || !Number.isFinite(score) || score < 0 || score > 100) {
    return [`HU ${hu.id}: rework_license must carry a module and a mutation_score between 0 and 100: kj plan license <plan> ${hu.id} --module <path>`];
  }
  if (score / 100 >= reworkMin) return [];
  const hardened = (hu.blocked_by ?? []).some((id) => hus.find((h) => h.id === id)?.hardens === licence.module);
  if (hardened) return [];
  return [`HU ${hu.id}: REWORK licence denied for ${licence.module}: mutation score ${score}% under ${Math.round(reworkMin * 100)}%. Plan two phases: an HU with hardens: ${licence.module} in this HU's blocked_by, then the REWORK`];
}
