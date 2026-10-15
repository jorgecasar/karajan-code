/**
 * KJC-TSK-0702 (MR-E): the per-HU measurement model routing is judged by. The
 * sub-pipeline puts it on the HU outcome; karajan-core's setHuOutcome keeps a
 * fixed set of fields, so the measured ones are kept here, in the plan, where
 * kj report reads them. Unmeasured fields stay out rather than written as null.
 */
export const ROUTING_FIELDS = ["cost_usd", "tokens_in", "tokens_out", "cached_tokens", "coder", "reviewer_rejections"];

export function keepRoutingMetrics(plan, huId, outcome) {
  const hu = plan?.hus?.find((h) => h.id === huId);
  if (!hu?.outcome) return false;
  for (const field of ROUTING_FIELDS) {
    if (outcome?.[field] !== null && outcome?.[field] !== undefined) hu.outcome[field] = outcome[field];
  }
  return true;
}
