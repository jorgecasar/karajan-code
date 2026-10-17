// KJC-TSK-1075 (#2227): a reviewer agent reviews someone else's PR with kj's
// reviewer, the target repo's rules and the provider it picks, and gets one
// JSON document back. No own-work gate applies, and no verdict is stored, so
// this mode can never unlock a commit of one's own (ADR 0015).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runOneShotReview } from "../../src/review/one-shot-review.js";
import { loadVerdict, diffHash } from "../../src/review/verdict-store.js";
import { thirdPartyReview, thirdPartyReviewCommand } from "../../src/review/third-party-review.js";

const DIFF = "diff --git a/x.js b/x.js\n+const ok = true;\n";
const output = (approved) => JSON.stringify({
  approved, summary: "s", confidence: 0.8, non_blocking_suggestions: ["n"],
  blocking_issues: approved ? [] : [{ file: "x.js", line: 1, severity: "high", description: "d", suggested_fix: "f" }],
});

let dir;
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "kj-3p-")); });
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe("runOneShotReview for a third-party PR", () => {
  it("can run the host's own provider and leaves no verdict behind", async () => {
    const agent = { reviewTask: vi.fn().mockResolvedValue({ ok: true, output: output(true) }) };
    const record = await runOneShotReview({
      diff: DIFF, config: {}, projectDir: dir, hostAgent: "claude",
      reviewerOverride: "claude", persist: false, createAgentFn: () => agent,
    });
    expect(record).toMatchObject({ verdict: "approved", reviewer: "claude" });
    expect(await loadVerdict(dir, diffHash(DIFF))).toBeFalsy();
  });
});

describe("thirdPartyReview", () => {
  it("reviews base...head with the chosen provider and returns findings as JSON data", async () => {
    const run = vi.fn().mockResolvedValue({ verdict: "rejected", reviewer: "claude", summary: "s", issues: JSON.parse(output(false)).blocking_issues, suggestions: ["n"] });
    const res = await thirdPartyReview({
      range: "main...pr", config: { roles: { reviewer: { provider: "claude" } } }, projectDir: dir, logger: { info() {} },
      gitDiff: async () => DIFF, run,
      // KJC-TSK-1076: the PR-requirement checks travel in the same document.
      requirements: async ({ range }) => [{ id: "size", ok: false, detail: `over the limit in ${range}` }],
      // KJC-TSK-1077: the security checks read the same diff.
      security: async ({ diff }) => [{ id: "secrets", ok: true, detail: `scanned ${diff.length} chars` }],
    });
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ diff: DIFF, persist: false, reviewerOverride: "claude" }));
    expect(res).toMatchObject({
      mode: "third-party", range: "main...pr", reviewer: "claude",
      verdict: { approved: false, summary: "s" },
      findings: [{ file: "x.js", line: 1, severity: "high", description: "d", suggested_fix: "f" }],
      suggestions: ["n"], checks: [{ id: "size", ok: false, detail: "over the limit in main...pr" }, { id: "secrets", ok: true, detail: `scanned ${DIFF.length} chars` }],
    });
  });
});

describe("thirdPartyReviewCommand", () => {
  const sink = () => { const chunks = []; return { write: (c) => chunks.push(c), text: () => chunks.join("") }; };

  it("prints exactly one JSON document and exits 0 even when the PR has blocking findings", async () => {
    const out = sink();
    const code = await thirdPartyReviewCommand({
      flags: { range: "main...pr", json: true }, config: {}, out, err: sink(),
      review: async () => ({ verdict: { approved: false }, findings: [{ file: "x.js" }] }),
    });
    expect(code).toBe(0);
    expect(JSON.parse(out.text())).toMatchObject({ verdict: { approved: false } });
  });

  it("needs --range, and a kj failure is a JSON error with a non-zero code", async () => {
    const out = sink();
    expect(await thirdPartyReviewCommand({ flags: { json: true }, config: {}, out, err: sink() })).toBe(1);
    expect(JSON.parse(out.text()).error).toMatch(/--range/);
    const out2 = sink();
    const code = await thirdPartyReviewCommand({
      flags: { range: "a...b", json: true }, config: {}, out: out2, err: sink(),
      review: async () => { throw new Error("nothing to review"); },
    });
    expect(code).toBe(1);
    expect(JSON.parse(out2.text()).error).toMatch(/nothing to review/);
  });
});
