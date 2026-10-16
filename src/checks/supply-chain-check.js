/**
 * KJC-TSK-1059: the supply-chain cooldown outside the review. kj check reads
 * what the branch's lockfile installs against the merge base with the base
 * branch; kj release check reads how old the long-lived npm tokens are.
 * Both warn, never block: they are signals, and a signal never stays silent.
 */
import { runCommand } from "../utils/process.js";
import { cooldownAdvisories, DEFAULT_COOLDOWN_HOURS, formatCooldown } from "../review/dep-cooldown.js";

export const DEFAULT_TOKEN_MAX_DAYS = 90;
const DAY_MS = 86_400_000;

/** The cooldown warnings for what the branch brings in, committed or not. */
export async function branchCooldownLines({ projectDir = process.cwd(), base = "main", thresholdHours = DEFAULT_COOLDOWN_HOURS, run = runCommand, now = Date.now() } = {}) {
  let from = null;
  for (const ref of [`origin/${base}`, base]) {
    const res = await run("git", ["-C", projectDir, "merge-base", "HEAD", ref]);
    if (res.exitCode === 0 && res.stdout.trim()) { from = res.stdout.trim(); break; }
  }
  if (!from) return [`⚠ supply-chain cooldown not checked: no merge base with ${base}`];
  const diff = await run("git", ["-C", projectDir, "diff", from, "--", "package-lock.json", "**/package-lock.json"]);
  if (diff.exitCode !== 0) return [`⚠ supply-chain cooldown not checked: git diff failed (${(diff.stderr || "").trim()})`];
  return formatCooldown(await cooldownAdvisories(diff.stdout, { thresholdHours, run, now }), thresholdHours).lines;
}

/**
 * A token without an expiry is a long-lived (classic) one: the older it is,
 * the longer a leaked copy keeps working. Each one over maxDays is named.
 */
export async function npmTokenAgeCheck({ run = runCommand, now = Date.now(), maxDays = DEFAULT_TOKEN_MAX_DAYS } = {}) {
  const res = await run("npm", ["token", "list", "--json"]);
  if (res.exitCode !== 0) {
    return { name: "npm-tokens", ok: true, warn: true, detail: `could not list npm tokens (${(res.stderr || res.stdout || "").trim()}): their age is unverified` };
  }
  let tokens;
  try { tokens = JSON.parse(res.stdout || "[]"); } catch (err) {
    return { name: "npm-tokens", ok: true, warn: true, detail: `npm token list gave no JSON (${err.message}): their age is unverified` };
  }
  const old = tokens
    .filter((t) => !t.expires && t.created)
    // Never the token field, masked or not: only a short prefix of its id reaches a log.
    .map((t) => ({ label: `id ${String(t.key ?? "?").slice(0, 6)}…`, days: Math.floor((now - Date.parse(t.created)) / DAY_MS) }))
    .filter((t) => t.days > maxDays);
  if (old.length === 0) return { name: "npm-tokens", ok: true, warn: false, detail: `no long-lived npm token older than ${maxDays} days` };
  const list = old.map((t) => `${t.label} (${t.days} days)`).join(", ");
  return { name: "npm-tokens", ok: true, warn: true, detail: `${old.length} long-lived npm token(s) older than ${maxDays} days: ${list}. Rotate them, or move to granular tokens with an expiry` };
}
