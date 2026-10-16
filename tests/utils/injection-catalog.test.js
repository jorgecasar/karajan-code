// KJC-TSK-0703: the prompt-injection patterns live in a versioned data catalog
// that other family products (karajan-radar, in Python) can read without the
// JavaScript engine. The guard consumes it; its behaviour does not change.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { assertPortable, loadInjectionCatalog } from "../../src/utils/injection-guard.js";

const raw = JSON.parse(readFileSync(new URL("../../src/utils/injection-patterns.json", import.meta.url), "utf8"));

describe("injection catalog", () => {
  it("declares its version and, per pattern, id, type, expression, severity and why", () => {
    expect(raw.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(Number.isInteger(raw.max_comment_block)).toBe(true);
    const ids = raw.patterns.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of raw.patterns) {
      expect(p).toMatchObject({ id: expect.any(String), type: expect.stringMatching(/^(directive|unicode|comment_block)$/), expression: expect.any(String), severity: expect.stringMatching(/^(low|medium|high)$/), why: expect.any(String) });
      expect(p.why.length).toBeGreaterThan(10);
    }
  });

  it("carries every pattern the guard had (17 directives, 7 invisible ranges, 5 comment blocks)", () => {
    const byType = Object.groupBy(raw.patterns, (p) => p.type);
    expect([byType.directive.length, byType.unicode.length, byType.comment_block.length]).toEqual([17, 7, 5]);
  });

  it("every shipped expression is portable and compiles", () => {
    for (const p of raw.patterns) expect(() => assertPortable(p)).not.toThrow();
    expect(loadInjectionCatalog().directive).toHaveLength(17);
  });

  it("rejects what Python's re cannot read, naming the pattern", () => {
    const base = { id: "x", type: "directive", severity: "high", why: "a test pattern here" };
    expect(() => assertPortable({ ...base, expression: "[\\u{E0000}-\\u{E007F}]", flags: "u" })).toThrow(/x: .*\\u\{/);
    expect(() => assertPortable({ ...base, expression: "\\p{L}+", flags: "u" })).toThrow(/\\p\{/);
    expect(() => assertPortable({ ...base, expression: "(?<word>approved)" })).toThrow(/named group/);
    expect(() => assertPortable({ ...base, expression: "approved", flags: "gi" })).toThrow(/flag "g"/);
    expect(() => assertPortable({ ...base, expression: "(?<=a)b|(?<!c)d" })).not.toThrow();
  });
});
