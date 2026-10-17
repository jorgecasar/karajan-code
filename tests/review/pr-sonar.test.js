// KJC-TSK-1078: a third-party PR gets Sonar's new issues on the lines it adds
// when SonarQube is reachable; without it the check says "not available".
import { describe, it, expect, vi } from "vitest";
import { sonarCheck } from "../../src/review/pr-sonar.js";

const DIFF = "diff --git a/src/a.js b/src/a.js\n--- a/src/a.js\n+++ b/src/a.js\n@@ -0,0 +1,2 @@\n+a\n+b\n";

describe("sonarCheck", () => {
  it("scans the PR's files with the lines it adds and lists the blocking issues", async () => {
    const pregate = vi.fn().mockResolvedValue({ available: true, blocking: [{ component: "proj:src/a.js", line: 2, rule: "js:S1", severity: "CRITICAL" }], advisory: [] });
    const res = await sonarCheck({ diff: DIFF, config: {}, projectDir: "/clones/pr-42", pregate });
    expect(pregate).toHaveBeenCalledWith(expect.objectContaining({ stagedFiles: ["src/a.js"], projectDir: "/clones/pr-42" }));
    expect([...pregate.mock.calls[0][0].touchedLines.get("src/a.js")]).toEqual([1, 2]);
    expect(res).toMatchObject({ id: "sonar", ok: false, detail: expect.stringMatching(/src\/a\.js:2.*js:S1/) });
  });

  it("passes with no blocking issue, and says when Sonar is not available", async () => {
    expect((await sonarCheck({ diff: DIFF, config: {}, pregate: async () => ({ available: true, blocking: [], advisory: [] }) })).ok).toBe(true);
    const off = await sonarCheck({ diff: DIFF, config: {}, pregate: async () => ({ available: false, reason: "no SonarQube at localhost:9000" }) });
    expect(off).toMatchObject({ id: "sonar", ok: true, detail: expect.stringMatching(/not available.*localhost:9000/) });
  });
});
