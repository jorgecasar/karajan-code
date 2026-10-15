/**
 * KJC-TSK-0722 (step 1): supply-chain campaigns (Shai-Hulud, CanisterWorm) are
 * caught in their first hours, so a dependency published minutes ago is the
 * riskiest one to take. kj reads what a package-lock.json diff installs and
 * asks npm how old each version is. A signal, never a crash: without the
 * registry, the package is listed as unverified with the reason.
 */
import { runCommand } from "../utils/process.js";

export const DEFAULT_COOLDOWN_HOURS = 72;
// npm view per package: a lockfile refresh of hundreds is said, not queried one by one.
const MAX_QUERIES = 40;

const KEY = /^[ +]\s*"(?:[^"]*\/)?node_modules\/((?:@[^/"]+\/)?[^/"]+)":\s*\{/;
const VERSION = /^\+\s*"version":\s*"([^"]+)"/;

/** The packages a diff of package-lock.json adds or moves to another version. */
export function lockfileChanges(diff) {
  const changes = [];
  for (const chunk of String(diff ?? "").split(/^diff --git /m)) {
    if (!/^a\/(?:\S*\/)?package-lock\.json /.test(chunk)) continue;
    let current = null;
    for (const line of chunk.split("\n")) {
      const key = KEY.exec(line);
      if (key) { current = key[1]; continue; }
      const version = VERSION.exec(line);
      if (version && current) { changes.push({ name: current, version: version[1] }); current = null; }
    }
  }
  return changes;
}

async function publishedAt({ name, version }, run) {
  const res = await run("npm", ["view", `${name}@${version}`, "time", "--json"]);
  if (res.exitCode !== 0) throw new Error((res.stderr || res.stdout || "npm view failed").trim());
  const when = Date.parse(JSON.parse(res.stdout || "{}")[version]);
  if (Number.isNaN(when)) throw new Error(`npm gives no publish time for ${version}`);
  return when;
}

/** What kj review prints, and the note the reviewer gets; empty when there is nothing to say. */
export function formatCooldown({ young, unverified, skipped = 0 }, thresholdHours = DEFAULT_COOLDOWN_HOURS) {
  const lines = [
    ...young.map((p) => `⚠ supply-chain cooldown: ${p.name}@${p.version} was published ${p.hours} h ago (under ${thresholdHours} h): campaigns are caught in their first hours`),
    ...unverified.map((p) => `⚠ supply-chain cooldown: ${p.name}@${p.version} unverified (${p.reason})`),
    ...(skipped > 0 ? [`⚠ supply-chain cooldown: ${skipped} packages changed (a regenerated lockfile?), too many to check one by one: none was checked`] : []),
  ];
  const note = young.length === 0 ? "" : `Dependencies published under ${thresholdHours} h ago (weigh them as a supply-chain risk): ${young.map((p) => `${p.name}@${p.version} (${p.hours} h)`).join(", ")}`;
  return { lines, note };
}

/**
 * Over MAX_QUERIES changed packages (a regenerated lockfile) none is queried:
 * one line says so, instead of a line per package and a call per package.
 * @returns {Promise<{young: {name, version, hours}[], unverified: {name, version, reason}[], skipped?: number}>}
 */
export async function cooldownAdvisories(diff, { thresholdHours = DEFAULT_COOLDOWN_HOURS, run = runCommand, now = Date.now() } = {}) {
  const changes = lockfileChanges(diff);
  if (changes.length > MAX_QUERIES) return { young: [], unverified: [], skipped: changes.length };
  const young = [];
  const unverified = [];
  for (const pkg of changes) {
    try {
      const hours = Math.floor((now - await publishedAt(pkg, run)) / 3_600_000);
      if (hours < thresholdHours) young.push({ ...pkg, hours });
    } catch (err) {
      unverified.push({ ...pkg, reason: err.message });
    }
  }
  return { young, unverified };
}
