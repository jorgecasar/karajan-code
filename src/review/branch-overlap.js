/**
 * KJC-TSK-1052 (TEAM-F): a team on one repo collides in the merge when two
 * branches change the same files. kj warns at review time: the remote branches
 * still in progress (commits outside origin/<base>, active in the last days)
 * whose changes share files with what the commit stages. A warning, never a block.
 */
import { runCommand } from "../utils/process.js";

const MAX_AGE_DAYS = 14;
const MAX_BRANCHES = 20;

/**
 * @returns {Promise<{branch: string, author: string, files: string[]}[]>}
 */
export async function branchOverlaps({ projectDir, stagedFiles, base = "main", now = Date.now(), run = runCommand }) {
  const git = async (args) => {
    const res = await run("git", ["-C", projectDir, ...args]);
    return res.exitCode === 0 ? res.stdout.trim() : null;
  };
  const baseRef = `origin/${base}`;
  if (stagedFiles.length === 0 || (await git(["rev-parse", "--verify", "--quiet", baseRef])) === null) return [];
  const current = await git(["rev-parse", "--abbrev-ref", "HEAD"]);
  const refs = (await git(["for-each-ref", "--sort=-committerdate", "--format=%(refname:short)|%(committerdate:unix)|%(authorname)", "refs/remotes/origin"])) ?? "";
  const staged = new Set(stagedFiles);
  const candidates = refs.split("\n").filter(Boolean)
    .map((line) => { const [branch, when, author] = line.split("|"); return { branch, when: Number(when) * 1000, author }; })
    .filter((r) => r.branch !== baseRef && r.branch !== "origin/HEAD" && r.branch !== `origin/${current}`)
    .filter((r) => now - r.when < MAX_AGE_DAYS * 86_400_000)
    .slice(0, MAX_BRANCHES);
  const overlaps = [];
  for (const { branch, author } of candidates) {
    if (Number(await git(["rev-list", "--count", `${baseRef}..${branch}`])) === 0) continue;
    const files = ((await git(["diff", "--name-only", `${baseRef}...${branch}`])) ?? "").split("\n").filter((f) => staged.has(f));
    if (files.length > 0) overlaps.push({ branch, author, files });
  }
  return overlaps;
}

/** The kj review warning, one line per branch. */
export const formatOverlaps = (overlaps) => overlaps.map((o) => `⚠ ${o.branch} (${o.author}) also changes ${o.files.join(", ")}: coordinate before the merge collides`);
