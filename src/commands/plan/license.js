/**
 * kj plan license <planId> <huId> --module <path> (KJC-TSK-0717, SPD-A): scores
 * the module with kj mutate and records the REWORK licence on the HU, with the
 * threshold in force. validatePlan judges it again from the score.
 */
import { loadPlan, savePlan } from "../../plan/plan-store.js";
import { licenseFor, DEFAULT_REWORK_MIN } from "../../plan/rework-license.js";
import { mutateCommand } from "../mutate.js";

/** The module's mutation score in percent, or null when kj mutate gives none. */
async function scoreModule(projectDir, module) {
  let report = null;
  const logger = { info: (line) => { try { report = JSON.parse(line); } catch { /* a progress line */ } } };
  await mutateCommand({ projectDir, path: module, json: true, maxSurvivors: Number.POSITIVE_INFINITY, logger });
  return Number.isFinite(report?.score) ? report.score : null;
}

export async function planLicenseCommand({ config, planId, huId, module, deps = {} }) {
  const say = deps.say ?? console.log;
  const projectDir = config.projectDir || process.cwd();
  if (!module) { say("kj plan license: --module <path> is required (the module the REWORK regenerates)"); return 1; }
  const plan = await (deps.loadPlan ?? loadPlan)(projectDir, planId);
  if (!plan) { say(`Plan not found: ${planId}`); return 1; }
  const hu = plan.hus?.find((h) => h.id === huId);
  if (!hu) { say(`HU not found: ${huId}`); return 1; }
  const score = await (deps.scoreModule ?? scoreModule)(projectDir, module);
  if (score === null) { say(`kj mutate could not score ${module}: no licence recorded (run kj mutate ${module} to see why)`); return 1; }
  const threshold = config?.method_gates?.rework_mutation_min ?? DEFAULT_REWORK_MIN;
  hu.rework_license = licenseFor({ module, score, threshold });
  await (deps.savePlan ?? savePlan)(projectDir, plan);
  const pct = `${Math.round(threshold * 100)}%`;
  if (hu.rework_license.granted) { say(`✓ REWORK licence granted for ${module} on ${huId}: mutation score ${score}% at or over ${pct}`); return 0; }
  say(`✗ REWORK licence denied for ${module} on ${huId}: mutation score ${score}% under ${pct}. Plan two phases: add an HU with hardens: ${module} (kill the survivors first) and put it in ${huId}'s blocked_by`);
  return 1;
}
