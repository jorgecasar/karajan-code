/**
 * KJC-TSK-0719 (SPD-C): the audit was due by calendar and staleness only. Now
 * it is due by work cycles too: every N cards closed (distinct card refs in
 * the commits) or M commits since the last recorded audit. The marker is that
 * audit's timestamp, so running kj audit resets the counter. kj check shows it.
 */
import { existsSync } from "node:fs";
import { runCommand } from "../utils/process.js";
import { getAuditHistoryDbPath, getLatestPreviousRun, openAuditHistoryDb } from "../audit/audit-history.js";

export const DEFAULT_EVERY_CARDS = 10;
export const DEFAULT_EVERY_COMMITS = 60;
const CARD_REF = /\b[A-Z]{2,5}-(?:TSK|BUG)-\d{4}\b/g;

/**
 * The last audit that finished with a score, or null; never creates the
 * database to find out. A run without a score swept nothing, so it is no marker.
 */
export function readLatestAudit(projectDir) {
  if (!existsSync(getAuditHistoryDbPath(projectDir))) return null;
  const db = openAuditHistoryDb(projectDir);
  try { return getLatestPreviousRun(db); } finally { db.close(); }
}

export async function auditCycle({ projectDir = process.cwd(), config = {}, run = runCommand, latestAudit = readLatestAudit } = {}) {
  const everyCards = config?.audit_cycle?.every_cards ?? DEFAULT_EVERY_CARDS;
  const everyCommits = config?.audit_cycle?.every_commits ?? DEFAULT_EVERY_COMMITS;
  const last = latestAudit(projectDir);
  if (!last) return { due: true, line: "⚠ audit due: no audit recorded yet: run kj audit" };
  // A work commit is a non-merge one: a merge brings no work of its own, and the
  // commits it brings in are already in this log (it walks every parent), so
  // counting merges too would double each PR in a merge workflow.
  const res = await run("git", ["-C", projectDir, "log", `--since=${last.timestamp}`, "--no-merges", "--format=%s"]);
  if (res.exitCode !== 0) return { due: false, line: `⚠ audit cycle not checked: git log failed (${(res.stderr || "").trim()})` };
  const lines = res.stdout.split("\n").filter(Boolean);
  const cards = new Set(lines.flatMap((s) => s.match(CARD_REF) ?? [])).size;
  const commits = lines.length;
  const due = cards >= everyCards || commits >= everyCommits;
  const counter = `${cards}/${everyCards} cards, ${commits}/${everyCommits} commits since the last audit (${last.timestamp.slice(0, 10)})`;
  return { due, cards, commits, line: due ? `⚠ audit due: ${counter}: run kj audit` : `audit cycle: ${counter}` };
}
