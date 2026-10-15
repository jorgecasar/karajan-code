/**
 * What kj says about the phone (ADR 0018). Apart from phone-invite.js so that
 * security-level.js and act-sign.js can use the texts while phone-invite.js
 * reads the security level, with no import cycle.
 */
export const PHONE_ENROLL =
  "Enrólalo con kj identity enroll-phone <clave pública de la app>: cada acto queda atado a tu clave privada, que nunca sale del móvil (ADR 0018).";

/** Normal level: without a phone the acts are signed with a typed code. */
export const PHONE_INVITE =
  `El móvil no está enrolado: los sellos (kj harden --commit), las aprobaciones y los comandos del catálogo se firman hoy con un código tecleado, con menos garantía. ${PHONE_ENROLL}`;

/** KJC-BUG-0360: max level, the default: without a phone the acts are REFUSED, not signed with a code. */
export const PHONE_REFUSED_AT_MAX =
  `El móvil no está enrolado y la seguridad es máxima (la de por defecto): kj harden --commit, kj rules approve y enrolar otro móvil se rechazan hasta enrolarlo. ${PHONE_ENROLL}`;

export const phoneTextFor = (level) => (level === "normal" ? PHONE_INVITE : PHONE_REFUSED_AT_MAX);
