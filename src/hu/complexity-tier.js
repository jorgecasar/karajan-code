/**
 * KJC-TSK-0698 (MR-A): the tier (trivial, standard, deep) each HU leaves the
 * decomposition with, so the coder model can be chosen per HU on an auditable
 * trail. Two sources: the judgement of the model that already decomposes (same
 * answer, no extra call) and a deterministic signal. The higher one wins, and
 * a sensitive zone is always deep: underestimating there is the costly mistake.
 */
export const TIERS = ["trivial", "standard", "deep"];

const SENSITIVE = /\b(?<zone>auth|secret|token|password|credential|crypt|security|seguridad|migrat|migraci|supervisor|sentinel|polic(?:y|ies)|permission)\w*/i;
const STANDARD_MIN_CRITERIA = 3;

/** The tier the HU's own text implies, with no model involved. */
export function deterministicTier({ title = "", goal = "", acceptanceCriteria = [] }) {
  const zone = SENSITIVE.exec([title, goal, ...acceptanceCriteria].join("\n"))?.groups.zone;
  if (zone) return { tier: "deep", reason: `sensitive zone: ${zone.toLowerCase()}` };
  if (acceptanceCriteria.length >= STANDARD_MIN_CRITERIA) return { tier: "standard", reason: `${acceptanceCriteria.length} acceptance criteria` };
  return { tier: "trivial", reason: `${acceptanceCriteria.length} acceptance criteria, no sensitive zone` };
}

/** The HU's tier: judged against signal, the higher wins, and the record says why. */
export function huComplexity(hu) {
  const signal = deterministicTier(hu);
  const judged = TIERS.includes(hu.tier) ? hu.tier : null;
  if (!judged) return { tier: signal.tier, judged: null, signal: signal.tier, reason: `no judged tier from the decomposition; signal ${signal.tier} (${signal.reason})` };
  const judgedText = `judged ${judged} (${hu.tierReason || "no reason given"})`;
  const signalText = `signal ${signal.tier} (${signal.reason})`;
  const rank = (t) => TIERS.indexOf(t);
  if (rank(judged) === rank(signal.tier)) return { tier: judged, judged, signal: signal.tier, reason: `${judgedText}, ${signalText}` };
  const reason = rank(signal.tier) > rank(judged) ? `${signalText} over ${judgedText}` : `${judgedText} over ${signalText}`;
  return { tier: TIERS[Math.max(rank(judged), rank(signal.tier))], judged, signal: signal.tier, reason };
}
