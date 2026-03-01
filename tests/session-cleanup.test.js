import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";

let testSessionRoot;

vi.mock("../src/utils/paths.js", () => ({
  getKarajanHome: vi.fn(() => path.dirname(testSessionRoot)),
  getSessionRoot: vi.fn(() => testSessionRoot)
}));

describe("session-cleanup", () => {
  let tmpDir;
  const logger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

  beforeEach(async () => {
    vi.resetAllMocks();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "kj-session-cleanup-"));
    testSessionRoot = path.join(tmpDir, "sessions");
    await fs.mkdir(testSessionRoot, { recursive: true });

    const { getSessionRoot } = await import("../src/utils/paths.js");
    getSessionRoot.mockReturnValue(testSessionRoot);
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function createFakeSession(name, daysOld, status = "completed") {
    const dir = path.join(testSessionRoot, name);
    await fs.mkdir(dir, { recursive: true });
    const date = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000).toISOString();
    const session = { id: name, created_at: date, updated_at: date, status };
    await fs.writeFile(path.join(dir, "session.json"), JSON.stringify(session), "utf8");
    return dir;
  }

  it("removes sessions older than expiry_days", async () => {
    await createFakeSession("s_old-session", 45);
    await createFakeSession("s_recent-session", 5);

    const { cleanupExpiredSessions } = await import("../src/session-cleanup.js");
    const result = await cleanupExpiredSessions({
      config: { session: { expiry_days: 30 } },
      logger
    });

    expect(result.removed).toBe(1);
    const remaining = await fs.readdir(testSessionRoot);
    expect(remaining).toEqual(["s_recent-session"]);
  });

  it("keeps sessions within expiry period", async () => {
    await createFakeSession("s_fresh", 1);
    await createFakeSession("s_recent", 15);

    const { cleanupExpiredSessions } = await import("../src/session-cleanup.js");
    const result = await cleanupExpiredSessions({
      config: { session: { expiry_days: 30 } },
      logger
    });

    expect(result.removed).toBe(0);
    const remaining = await fs.readdir(testSessionRoot);
    expect(remaining).toHaveLength(2);
  });

  it("uses default 30 days when config is not set", async () => {
    await createFakeSession("s_old", 35);
    await createFakeSession("s_new", 10);

    const { cleanupExpiredSessions } = await import("../src/session-cleanup.js");
    const result = await cleanupExpiredSessions({ logger });

    expect(result.removed).toBe(1);
  });

  it("does nothing when expiry_days is 0 (disabled)", async () => {
    await createFakeSession("s_ancient", 365);

    const { cleanupExpiredSessions } = await import("../src/session-cleanup.js");
    const result = await cleanupExpiredSessions({
      config: { session: { expiry_days: 0 } },
      logger
    });

    expect(result.removed).toBe(0);
  });

  it("handles missing sessions directory gracefully", async () => {
    await fs.rm(testSessionRoot, { recursive: true });

    const { cleanupExpiredSessions } = await import("../src/session-cleanup.js");
    const result = await cleanupExpiredSessions({ logger });

    expect(result.removed).toBe(0);
    expect(result.errors).toEqual([]);
  });

  it("removes orphan dirs without valid session.json based on mtime", async () => {
    const dir = path.join(testSessionRoot, "s_orphan");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "partial.txt"), "incomplete", "utf8");

    const oldTime = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    await fs.utimes(dir, oldTime, oldTime);

    const { cleanupExpiredSessions } = await import("../src/session-cleanup.js");
    const result = await cleanupExpiredSessions({
      config: { session: { expiry_days: 30 } },
      logger
    });

    expect(result.removed).toBe(1);
  });

  it("ignores non-session directories (not starting with s_)", async () => {
    const dir = path.join(testSessionRoot, "not-a-session");
    await fs.mkdir(dir, { recursive: true });

    const { cleanupExpiredSessions } = await import("../src/session-cleanup.js");
    const result = await cleanupExpiredSessions({
      config: { session: { expiry_days: 1 } },
      logger
    });

    expect(result.removed).toBe(0);
    const remaining = await fs.readdir(testSessionRoot);
    expect(remaining).toContain("not-a-session");
  });

  it("logs info when sessions are cleaned up", async () => {
    await createFakeSession("s_expired1", 40);
    await createFakeSession("s_expired2", 50);

    const { cleanupExpiredSessions } = await import("../src/session-cleanup.js");
    await cleanupExpiredSessions({
      config: { session: { expiry_days: 30 } },
      logger
    });

    expect(logger.info).toHaveBeenCalledWith(expect.stringContaining("2 expired session"));
  });
});
