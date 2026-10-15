// KJC-TSK-1042: Sonar's TODO-tag rule (S1135) matches the word regardless of
// case, so a Spanish comment like «todo el fichero» is reported as a pending
// task. Only the uppercase TODO tag counts; the word «todo» is not one.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { filterFalsePositives } from "../../src/audit/issue-filter.js";

let dir;
beforeEach(() => { dir = mkdtempSync(path.join(tmpdir(), "todo-word-")); });
afterEach(() => { rmSync(dir, { recursive: true, force: true }); });

const issueOn = (text, rule = "javascript:S1135") => {
  writeFileSync(path.join(dir, "a.js"), `const x = 1;\n${text}\n`);
  return { tool: "sonar", rule, component: "proj:a.js", line: 2 };
};

describe("S1135 and the Spanish word «todo»", () => {
  it.each([
    "// recorre todo el fichero",
    "// Todo lo que entra se valida",
    "# se borra todo",
  ])("%s is the word, not a tag: suppressed with its reason", (text) => {
    const { kept, suppressed } = filterFalsePositives([issueOn(text)], { projectRoot: dir });
    expect(kept).toHaveLength(0);
    expect(suppressed[0]._suppressedBy.reason).toMatch(/todo/i);
  });

  it("an uppercase TODO tag stays a finding, even next to the word", () => {
    const { kept } = filterFalsePositives([issueOn("// TODO: revisar todo el bloque")], { projectRoot: dir });
    expect(kept).toHaveLength(1);
  });

  it("applies to S1135 of any language, and to no other rule", () => {
    expect(filterFalsePositives([issueOn("// todo el fichero", "typescript:S1135")], { projectRoot: dir }).kept).toHaveLength(0);
    expect(filterFalsePositives([issueOn("// todo el fichero", "javascript:S1134")], { projectRoot: dir }).kept).toHaveLength(1);
  });

  it("a line that cannot be read keeps the finding: never suppressed blind", () => {
    const issue = { tool: "sonar", rule: "javascript:S1135", component: "proj:missing.js", line: 2 };
    expect(filterFalsePositives([issue], { projectRoot: dir }).kept).toHaveLength(1);
  });
});
