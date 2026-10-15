// KJC-BUG-0359 (#2158): the coder receives each Sonar issue, capped and counted.
import { describe, it, expect } from "vitest";
import { formatIssuesForCoder } from "../../src/orchestrator/stages/sonar-stage.js";

const issue = (n) => ({ severity: "MAJOR", rule: "javascript:S1481", file: `proj:src/f${n}.js`, line: n, message: `Remove unused variable ${n}` });

describe("formatIssuesForCoder", () => {
  it("no issues adds nothing", () => {
    expect(formatIssuesForCoder([])).toBe("");
    expect(formatIssuesForCoder(undefined)).toBe("");
  });

  it("past 25 issues the rest is counted, never dropped in silence", () => {
    const text = formatIssuesForCoder(Array.from({ length: 30 }, (_, i) => issue(i + 1)));
    expect(text).toMatch(/- \[MAJOR\] javascript:S1481 src\/f1\.js:1 Remove unused variable 1/);
    expect(text).toMatch(/src\/f25\.js:25/);
    expect(text).not.toMatch(/src\/f26\.js/);
    expect(text).toMatch(/…and 5 more/);
  });
});
