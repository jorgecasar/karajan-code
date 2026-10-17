// KJC-TSK-1086: the Steward's block, also at commit. With method_gates.steward:
// block, a sweep that found vulnerable-deps or main-ci broken stops kj review,
// as it stops starting to edit in the Sentinel.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { stewardBlocking } from "../../src/steward/gate.js";

let dir;
const report = (invariants) => {
  fs.mkdirSync(path.join(dir, ".karajan", "steward"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".karajan", "steward", "report.json"), JSON.stringify({ sweptAt: "2026-10-18T00:00:00Z", invariants }));
};
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "kj-steward-gate-")); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("stewardBlocking", () => {
  const block = { method_gates: { steward: "block" } };

  it("names the broken hard invariants when the project adopted block", () => {
    report([{ id: "main-ci", verdict: "broken", evidence: "red for 3 days", remedy: "fix main" }, { id: "dead-code", verdict: "broken" }]);
    const res = stewardBlocking({ projectDir: dir, config: block });
    expect(res.hard.map((r) => r.id)).toEqual(["main-ci"]);
    expect(res.reason).toMatch(/main-ci: red for 3 days -> fix main/);
  });

  it("does not block in inform mode or with only soft or unknown invariants", () => {
    report([{ id: "vulnerable-deps", verdict: "broken" }]);
    expect(stewardBlocking({ projectDir: dir, config: { method_gates: { steward: "inform" } } })).toBeNull();
    expect(stewardBlocking({ projectDir: dir, config: {} })).toBeNull();
    report([{ id: "dead-code", verdict: "broken" }, { id: "main-ci", verdict: "unknown" }]);
    expect(stewardBlocking({ projectDir: dir, config: block })).toBeNull();
  });

  it("a missing or unreadable report under block is no silent pass", () => {
    expect(stewardBlocking({ projectDir: dir, config: block }).reason).toMatch(/cannot read .*report\.json.*block stands/);
    expect(stewardBlocking({ projectDir: dir, config: {} })).toBeNull();
    fs.mkdirSync(path.join(dir, ".karajan", "steward"), { recursive: true });
    fs.writeFileSync(path.join(dir, ".karajan", "steward", "report.json"), "{ not json");
    expect(stewardBlocking({ projectDir: dir, config: block }).reason).toMatch(/cannot read .*report\.json.*block stands/);
    fs.writeFileSync(path.join(dir, ".karajan", "steward", "report.json"), JSON.stringify({ sweptAt: "x", invariants: "oops" }));
    expect(stewardBlocking({ projectDir: dir, config: block }).reason).toMatch(/no invariants list.*block stands/);
  });
});
