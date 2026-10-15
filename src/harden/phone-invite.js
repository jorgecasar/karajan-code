/**
 * KJC-TSK-0986 (HUM-F, ADR 0018): whoever runs kj without a phone enrolled
 * learns it once per version, not the day the maximum level (HUM-D) refuses a
 * seal. One text, used by the SessionStart notice, by `kj doctor` and, when
 * HUM-D lands, by the deny itself: what the signature protects, how to enroll,
 * and how one proceeds today without it.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import { isPhoneEnrolled } from "./phone-sign.js";
import { STRATEGY } from "../checks/types.js";

export const PHONE_ENROLL =
  "Enrólalo con kj identity enroll-phone <clave pública de la app>: cada acto queda atado a tu clave privada, que nunca sale del móvil (ADR 0018).";

/** Normal level: without a phone the acts are signed with a typed code. */
export const PHONE_INVITE =
  `El móvil no está enrolado: los sellos (kj harden --commit), las aprobaciones y los comandos del catálogo se firman hoy con un código tecleado, con menos garantía. ${PHONE_ENROLL}`;

/** KJC-BUG-0360: max level, the default: without a phone the acts are REFUSED, not signed with a code. */
export const PHONE_REFUSED_AT_MAX =
  `El móvil no está enrolado y la seguridad es máxima (la de por defecto): kj harden --commit, kj rules approve y enrolar otro móvil se rechazan hasta enrolarlo. ${PHONE_ENROLL}`;

const phoneTextFor = (level) => (level === "normal" ? PHONE_INVITE : PHONE_REFUSED_AT_MAX);

const markerPath = (home) => join(home ?? homedir(), ".karajan", "phone-invite.json");

/**
 * The invitation, once per kj version, or null (phone enrolled, or already said
 * for this version). Saying it records it; a marker that cannot be written
 * never silences the invitation.
 * @param {{home?: string, version?: string, level?: "max"|"normal"}} [opts]
 * @returns {string|null}
 */
export function phoneInvite({ home, version = "unknown", level = "max" } = {}) {
  if (isPhoneEnrolled({ home })) return null;
  let seen = null;
  try { seen = JSON.parse(readFileSync(markerPath(home), "utf8")).version; } catch { /* never invited */ }
  if (seen === version) return null;
  try {
    mkdirSync(dirname(markerPath(home)), { recursive: true });
    writeFileSync(markerPath(home), `${JSON.stringify({ version, at: new Date().toISOString() })}\n`, "utf8");
  } catch { /* the invitation still goes out */ }
  return phoneTextFor(level);
}

// Dynamic import: security-level.js imports this module's texts.
const projectLevel = async (projectDir, home) => (await import("./security-level.js")).readSecurityLevel({ projectDir, home }).level;

/**
 * `kj doctor`: without a phone, a FAILURE at the max level (the default, where
 * the acts are refused) and a warning at the normal level (KJC-BUG-0360).
 */
export function createPhoneCheck({ home, projectDir = process.cwd(), readLevel = () => projectLevel(projectDir, home) } = {}) {
  return {
    name: "phone-enrolled",
    label: "móvil enrolado (firma de sellos y aprobaciones)",
    strategy: STRATEGY.MANUAL,
    describe: "Whether a phone's public key is enrolled for the supervisor seal and approvals (ADR 0018)",
    async detect() {
      if (isPhoneEnrolled({ home })) return { ok: true, severity: "info", detail: "clave pública en ~/.karajan/supervisor-phone.json" };
      const level = await readLevel();
      return { ok: false, severity: level === "normal" ? "warn" : "fail", detail: phoneTextFor(level), fix: "kj identity enroll-phone <clave pública de la app>" };
    },
  };
}

export const getPhoneChecks = (opts) => [createPhoneCheck(opts)];
