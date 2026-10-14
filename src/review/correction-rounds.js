/**
 * KJC-TSK-1017: a rejection followed by an approval is the method working: the
 * second AI exists to catch what the first one misses, by how models work, not
 * because the coder did it badly. kj names it a review correction with its
 * round count, never a coder error.
 */
import fs from "node:fs/promises";
import path from "node:path";
import { runCommand } from "../utils/process.js";

export const correctionNote = (rounds) => (rounds > 0
  ? `review correction: ${rounds} round(s) before this approval, the cross-AI method working`
  : "");

/** Rejections on the branch since its last approval, the current record aside. */
export function rejectionsBeforeApproval(records, { branch, hash }) {
  const mine = records
    .filter((r) => r.branch === branch && r.diffHash !== hash)
    .toSorted((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
  let rounds = 0;
  for (const r of mine) rounds = r.verdict === "approved" ? 0 : rounds + 1;
  return rounds;
}

export async function branchOf(projectDir, run = runCommand) {
  const res = await run("git", ["-C", projectDir, "rev-parse", "--abbrev-ref", "HEAD"]);
  return res.exitCode === 0 ? res.stdout.trim() : null;
}

export async function reviewCorrectionRounds(projectDir, record) {
  if (!record?.branch) return 0;
  const dir = path.join(projectDir, ".karajan", "reviews");
  const names = await fs.readdir(dir).catch(() => []);
  const records = [];
  for (const name of names.filter((n) => n.endsWith(".json"))) {
    // A report, not a gate: an unreadable verdict file is left out of the count.
    try { records.push(JSON.parse(await fs.readFile(path.join(dir, name), "utf8"))); } catch { /* see above */ }
  }
  return rejectionsBeforeApproval(records, { branch: record.branch, hash: record.diffHash });
}
