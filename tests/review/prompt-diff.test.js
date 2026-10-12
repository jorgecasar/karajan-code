import { describe, it, expect } from "vitest";
import { summarizeGeneratedFiles } from "../../src/review/prompt-diff.js";

// KJC-BUG-0347 (#2101): a 4800-line package-lock.json went whole into the review
// prompt: the reviewer lost the 1-line package.json hunk and rejected twice, and
// Solomon's prompt hit E2BIG. A generated file enters the prompt as one summary
// line; the verdict still binds to the full diff (this is only what the model reads).
const section = (file, added, removed) => [
  `diff --git a/${file} b/${file}`,
  "index 111..222 100644",
  `--- a/${file}`,
  `+++ b/${file}`,
  "@@ -1,1 +1,1 @@",
  ...Array.from({ length: added }, (_, i) => `+added ${i}`),
  ...Array.from({ length: removed }, (_, i) => `-removed ${i}`),
].join("\n");

describe("summarizeGeneratedFiles", () => {
  it("replaces a lockfile section with a summary and keeps code sections whole", () => {
    const diff = [section("package.json", 1, 1), section("package-lock.json", 4800, 3), section("src/a.js", 2, 0)].join("\n");
    const out = summarizeGeneratedFiles(diff);
    expect(out).toContain("+added 0"); // package.json and src/a.js intact
    expect(out).toContain("diff --git a/src/a.js b/src/a.js");
    expect(out).toContain("package-lock.json: generated file, +4800 -3 lines, contents left out of this prompt");
    expect(out).not.toContain("+added 4799");
    expect(out.length).toBeLessThan(diff.length / 10);
  });

  it("leaves a diff with no generated file exactly as it was", () => {
    const diff = [section("src/a.js", 3, 1), section("README.md", 2, 0)].join("\n");
    expect(summarizeGeneratedFiles(diff)).toBe(diff);
  });
});
