/**
 * SonarQube reachability + auth checks.
 *
 * Auto-remediation strategy (preserving existing behavior from
 * preflight-checks.js): if Sonar is not reachable, try `sonarUp()` which
 * starts the Docker container, then poll for readiness. If auth fails but
 * admin credentials exist, generate a fresh token and persist it.
 */

import { isSonarReachable } from "../sonar/manager.js";
import { getProjectQualityProfiles } from "../sonar/api.js";
import { STRATEGY } from "./types.js";
import { withDocLink } from "../utils/doc-links.js";

/** Which config switch turns Sonar off, or null when none does. */
function disabledSwitch(config) {
  if (config.sonarqube?.enabled === false) return "sonarqube.enabled: false";
  if (config.review_gate?.sonar === false) return "review_gate.sonar: false";
  return null;
}

function sonarHost(config) {
  return config.sonarqube?.host || "http://localhost:9000";
}

/** KJC-TSK-1051 (TEAM-E): the project runs on the team's quality profile, or the check says why not. */
async function teamProfileResult(config, { host, profile }) {
  let profiles;
  try {
    profiles = await getProjectQualityProfiles(config);
  } catch (err) {
    return { ok: false, severity: "warn", detail: `Reachable at ${host}, but the quality profile could not be read (${err.message})`, extra: { host } };
  }
  if (profiles.includes(profile)) return { ok: true, severity: "fail", detail: `Reachable at ${host}, on the team profile ${profile}`, extra: { host } };
  return {
    ok: false,
    severity: "warn",
    detail: `Reachable at ${host}, but the project runs on ${profiles.join(", ") || "no profile"}, not the team profile ${profile}`,
    fix: `An admin assigns ${profile} to the project in SonarQube (Project Settings > Quality Profiles).`,
    extra: { host },
  };
}

/**
 * Informative check: Sonar enabled/disabled status.
 * Produces an OK result with disabled description when Sonar is off.
 */
function createSonarStatusCheck() {
  return {
    name: "sonarqube",
    label: "SonarQube",
    strategy: STRATEGY.NONE,
    async detect({ config }) {
      const host = sonarHost(config);
      // KJC-TSK-0838 (ADR 2026-09-13): Sonar switched off is a DEFECT, not a
      // preference — the commit gate rejects code diffs without a sonar
      // proof, so this config only hurts. Only docs-only diffs are exempt.
      const off = disabledSwitch(config);
      if (off) {
        return {
          ok: false,
          severity: "fail",
          detail: `Disabled in config (${off}) — Sonar is mandatory for code; the commit gate rejects code diffs without a sonar proof`,
          fix: withDocLink(`Set sonarqube.enabled: true and drop review_gate.sonar: false; a laptop without Docker runs 'kj sonar start'. Only a human grant (kj policy grant --rule method.sonar.code) lifts the gate.`, "sonar_docker"),
        };
      }
      let reachable;
      try {
        reachable = await isSonarReachable(host);
      } catch {
        reachable = false;
      }
      // KJC-TSK-1051 (TEAM-E): an external SonarQube is the team's server, never started here.
      const external = config.sonarqube?.external === true;
      if (!reachable) {
        const fix = external
          ? `The team's SonarQube at ${host} is not answering (sonarqube.external: kj does not start a local one): check the network or VPN, or ask whoever runs it.`
          : withDocLink("Run 'kj sonar start' or 'docker start karajan-sonarqube'. Use --no-sonar to skip.", "sonar_docker");
        return { ok: false, severity: "fail", detail: `Not reachable at ${host}`, fix, extra: { host, reachable } };
      }
      const profile = config.sonarqube?.quality_profile;
      if (!profile) return { ok: true, severity: "fail", detail: `Reachable at ${host}`, extra: { host, reachable } };
      return teamProfileResult(config, { host, profile });
    },
  };
}

/**
 * All Sonar-related checks. Keeps just the status check for commit 1;
 * auth + auto-remediation are layered in commit 3.
 */
export function getSonarChecks() {
  return [createSonarStatusCheck()];
}
