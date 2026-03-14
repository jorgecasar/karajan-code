/**
 * Automatic cleanup of expired sessions.
 * Removes session directories older than session.expiry_days (default: 30).
 */

import fs from "node:fs/promises";
import path from "node:path";
import { getSessionRoot } from "./utils/paths.js";

const DEFAULT_EXPIRY_DAYS = 30;

async function tryRemoveOrphan({ sessionDir, dirName, cutoff, removed, errors, logger }) {
  const stat = await fs.stat(sessionDir).catch(() => null);
  if (!stat || stat.mtimeMs >= cutoff) return;
  try {
    await fs.rm(sessionDir, { recursive: true, force: true });
    removed.push(dirName);
    logger?.debug?.(`Orphan session dir removed: ${dirName}`);
  } catch (rmErr) {
    errors.push({ session: dirName, error: rmErr.message });
  }
}

async function tryCleanupSession({ sessionDir, dirName, cutoff, removed, errors, logger }) {
  const sessionFile = path.join(sessionDir, "session.json");
  try {
    const raw = await fs.readFile(sessionFile, "utf8");
    const session = JSON.parse(raw);
    const updatedAt = new Date(session.updated_at || session.created_at).getTime();
    if (updatedAt < cutoff) {
      await fs.rm(sessionDir, { recursive: true, force: true });
      removed.push(dirName);
      logger?.debug?.(`Session expired and removed: ${dirName}`);
    }
  } catch {
    await tryRemoveOrphan({ sessionDir, dirName, cutoff, removed, errors, logger });
  }
}

export async function cleanupExpiredSessions({ config, logger } = {}) {
  const expiryDays = config?.session?.expiry_days ?? DEFAULT_EXPIRY_DAYS;
  if (expiryDays <= 0) return { removed: 0, errors: [] };

  const sessionRoot = getSessionRoot();
  const cutoff = Date.now() - expiryDays * 24 * 60 * 60 * 1000;

  let entries;
  try {
    entries = await fs.readdir(sessionRoot, { withFileTypes: true });
  } catch {
    return { removed: 0, errors: [] };
  }

  const dirs = entries.filter((e) => e.isDirectory() && e.name.startsWith("s_"));
  const removed = [];
  const errors = [];

  for (const dir of dirs) {
    const sessionDir = path.join(sessionRoot, dir.name);
    await tryCleanupSession({ sessionDir, dirName: dir.name, cutoff, removed, errors, logger });
  }

  if (removed.length > 0) {
    logger?.info?.(`Cleaned up ${removed.length} expired session(s)`);
  }

  return { removed: removed.length, errors };
}
