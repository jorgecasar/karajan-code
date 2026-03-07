/**
 * Session-scoped preflight state.
 * Lives in memory — dies when the MCP server restarts.
 */
let preflightAcked = false;
let sessionOverrides = {};

export function isPreflightAcked() {
  return preflightAcked;
}

export function ackPreflight(overrides = {}) {
  preflightAcked = true;
  sessionOverrides = { ...overrides };
}

export function getSessionOverrides() {
  return { ...sessionOverrides };
}

export function setSessionOverride(key, value) {
  sessionOverrides[key] = value;
}

export function resetPreflight() {
  preflightAcked = false;
  sessionOverrides = {};
}
