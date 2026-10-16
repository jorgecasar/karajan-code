// KJC-TSK-0719 (SPD-C): the audit is also due by work cycles, every N cards
// closed or M commits since the last recorded audit, with the counter in view.
// The marker is the last audit's timestamp: running kj audit resets the count.
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { auditCycle, readLatestAudit, DEFAULT_EVERY_CARDS, DEFAULT_EVERY_COMMITS } from "../../src/checks/audit-cycle.js";
import { openAuditHistoryDb } from "../../src/audit/audit-history.js";

const subjects = (n, refs) => Array.from({ length: n }, (_, i) => `feat: change ${i} ${refs[i % refs.length]}`).join("\n");
const gitLog = (stdout) => vi.fn(async () => ({ exitCode: 0, stdout }));
const last = { timestamp: "2026-10-01T00:00:00.000Z" };

describe("auditCycle", () => {
  it("under both thresholds: not due, the counter in view", async () => {
    const run = gitLog(subjects(5, ["KJC-TSK-0001", "KJC-BUG-0002"]));
    const c = await auditCycle({ projectDir: "/p", config: {}, run, latestAudit: () => last });
    expect(c).toMatchObject({ due: false, cards: 2, commits: 5 });
    expect(c.line).toMatch(/audit cycle: 2\/10 cards, 5\/60 commits since the last audit \(2026-10-01\)/);
    expect(run).toHaveBeenCalledWith("git", ["-C", "/p", "log", "--since=2026-10-01T00:00:00.000Z", "--no-merges", "--format=%s"]);
  });

  it("N distinct cards closed is due, whatever the commits", async () => {
    const refs = Array.from({ length: 3 }, (_, i) => `KJC-TSK-010${i}`);
    const c = await auditCycle({ projectDir: "/p", config: { audit_cycle: { every_cards: 3, every_commits: 60 } }, run: gitLog(subjects(3, refs)), latestAudit: () => last });
    expect(c.due).toBe(true);
    expect(c.line).toMatch(/⚠ audit due: 3\/3 cards, 3\/60 commits .*run kj audit/);
  });

  it("M commits is due too, even with few cards", async () => {
    const c = await auditCycle({ projectDir: "/p", config: { audit_cycle: { every_cards: 10, every_commits: 4 } }, run: gitLog(subjects(4, ["KJC-TSK-0001"])), latestAudit: () => last });
    expect(c).toMatchObject({ due: true, cards: 1, commits: 4 });
  });

  it("no audit recorded yet: due, said so", async () => {
    const c = await auditCycle({ projectDir: "/p", config: {}, run: vi.fn(), latestAudit: () => null });
    expect(c).toMatchObject({ due: true });
    expect(c.line).toMatch(/no audit recorded yet: run kj audit/);
  });

  it("the marker is the last audit WITH a score; a scoreless run swept nothing; no database is never created", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kj-audit-cycle-"));
    try {
      expect(readLatestAudit(dir)).toBeNull();
      expect(fs.existsSync(path.join(dir, ".karajan"))).toBe(false);
      const db = openAuditHistoryDb(dir);
      db.prepare("INSERT INTO audits (run_id, timestamp, score) VALUES (?, ?, ?)").run("a", "2026-10-01T00:00:00.000Z", 80);
      db.prepare("INSERT INTO audits (run_id, timestamp, score) VALUES (?, ?, ?)").run("b", "2026-10-05T00:00:00.000Z", null);
      db.close();
      expect(readLatestAudit(dir)).toMatchObject({ run_id: "a" });
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it("the shipped defaults carry the thresholds the check falls back to", async () => {
    const { DEFAULTS } = await import("../../src/config/defaults.js");
    expect(DEFAULTS.audit_cycle).toEqual({ every_cards: DEFAULT_EVERY_CARDS, every_commits: DEFAULT_EVERY_COMMITS });
  });

  it("the schema keeps a valid override and refuses a nonsense one", async () => {
    const { safeParseConfig } = await import("../../src/config/schema.js");
    const ok = safeParseConfig({ audit_cycle: { every_cards: 4, every_commits: 30 } });
    expect(ok.success).toBe(true);
    expect(ok.data.audit_cycle).toEqual({ every_cards: 4, every_commits: 30 });
    expect(safeParseConfig({ audit_cycle: { every_cards: 0 } }).success).toBe(false);
  });

  it("git failing is said, never a silent pass", async () => {
    const c = await auditCycle({ projectDir: "/p", config: {}, run: async () => ({ exitCode: 128, stdout: "", stderr: "not a repo" }), latestAudit: () => last });
    expect(c).toMatchObject({ due: false });
    expect(c.line).toMatch(/audit cycle not checked: git log failed \(not a repo\)/);
  });
});
