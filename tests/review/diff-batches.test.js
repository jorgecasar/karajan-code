// KJC-BUG-0378 (#2263): a large PR was reviewed only up to the reviewer's clip.
// The diff is split by file and grouped into batches that fit, and what does not
// fit is counted, so the review can say what it covered.
import { describe, it, expect } from "vitest";
import { batchDiff, splitByFile } from "../../src/review/diff-batches.js";

const fileDiff = (name, changed) => [
  `diff --git a/${name} b/${name}`, `--- a/${name}`, `+++ b/${name}`, "@@ -1,1 +1,1 @@",
  ...Array.from({ length: changed }, (_, i) => `+line ${i}`),
].join("\n");

describe("splitByFile", () => {
  it("cuts the diff at each file and counts its changed lines", () => {
    const parts = splitByFile(`${fileDiff("a.js", 2)}\n${fileDiff("b.js", 3)}`);
    expect(parts.map((p) => [p.file, p.changed])).toEqual([["a.js", 2], ["b.js", 3]]);
    expect(parts[1].text.startsWith("diff --git a/b.js")).toBe(true);
  });
});

describe("batchDiff", () => {
  it("packs whole files into batches under the limit, in order", () => {
    const diff = [fileDiff("a.js", 3), fileDiff("b.js", 3), fileDiff("c.js", 3)].join("\n");
    const { batches, coverage } = batchDiff(diff, { limit: fileDiff("a.js", 3).length * 2 + 2, maxBatches: 5 });
    expect(batches.map((b) => b.files)).toEqual([["a.js", "b.js"], ["c.js"]]);
    expect(coverage).toEqual({ files: { reviewed: 3, total: 3 }, lines: { reviewed: 9, total: 9 }, truncated: false, unreviewed: [] });
  });

  it("leaves out a file larger than the limit, and files past the batch cap, and says which", () => {
    const small = fileDiff("a.js", 2);
    const diff = [small, fileDiff("huge.js", 500), fileDiff("b.js", 2), fileDiff("c.js", 2)].join("\n");
    const { batches, coverage } = batchDiff(diff, { limit: small.length + 1, maxBatches: 2 });
    expect(batches.map((b) => b.files)).toEqual([["a.js"], ["b.js"]]);
    expect(coverage).toMatchObject({ files: { reviewed: 2, total: 4 }, lines: { reviewed: 4, total: 506 }, truncated: true, unreviewed: ["huge.js", "c.js"] });
  });
});
