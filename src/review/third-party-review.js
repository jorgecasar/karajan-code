/**
 * KJC-TSK-1075 (#2227): review someone else's PR. kj's reviewer, the target
 * repo's rules (.karajan) and the provider the agent picks run over
 * base...head; no own-work gate applies (card, tests, policy, session RAG) and
 * no verdict is stored, so this mode never unlocks a commit (ADR 0015). The
 * own-work gate, reviewGateCommand, stays untouched.
 */
import { runCommand } from "../utils/process.js";
import { resolveRole } from "../config/role-resolver.js";
import { runOneShotReview } from "./one-shot-review.js";
import { prRequirementChecks } from "./pr-requirements.js";

const gitDiffOf = async (projectDir, range) => {
  const res = await runCommand("git", ["diff", range], { cwd: projectDir });
  if (res.exitCode !== 0) throw new Error(`git diff ${range} failed: ${(res.stderr || "").trim()}`);
  return res.stdout;
};

const finding = (i) => ({
  file: i.file ?? null, line: i.line ?? null, severity: i.severity ?? null,
  description: i.description ?? "", suggested_fix: i.suggested_fix ?? null,
});

/** The review as data: verdict, findings, suggestions and the PR-requirement checks. */
export async function thirdPartyReview({ range, config, projectDir, logger, task = null, gitDiff = gitDiffOf, run = runOneShotReview, requirements = prRequirementChecks }) {
  const diff = await gitDiff(projectDir, range);
  // KJC-TSK-1076: the PR's requirements, with no tokens; they never stop the review.
  const checks = await requirements({ range, projectDir, config });
  const record = await run({
    diff, task, config, logger, projectDir,
    reviewerOverride: resolveRole(config, "reviewer").provider || null,
    persist: false,
  });
  return {
    mode: "third-party",
    range,
    reviewer: record.reviewer,
    verdict: { approved: record.verdict === "approved", summary: record.summary ?? "" },
    findings: (record.issues ?? []).map(finding),
    suggestions: record.suggestions ?? [],
    checks,
  };
}

/**
 * The CLI side: stdout carries exactly one JSON document, logs go to stderr.
 * Exit 0 whatever the PR's verdict (the agent decides what to post); non-zero
 * only when kj itself fails.
 */
export async function thirdPartyReviewCommand({ flags, config, out = process.stdout, err = process.stderr, review = thirdPartyReview }) {
  const print = (doc) => out.write(`${JSON.stringify(doc)}\n`);
  if (!flags.range) {
    print({ error: "--third-party reviews a range: pass --range <base>...<head>" });
    return 1;
  }
  const log = (msg) => err.write(`${msg}\n`);
  const logger = { info: log, warn: log, error: log, debug: () => {} };
  try {
    print(await review({ range: flags.range, config, projectDir: config.projectDir || process.cwd(), logger, task: flags.task ?? null }));
    return 0;
  } catch (e) {
    print({ error: e.message });
    return 1;
  }
}
