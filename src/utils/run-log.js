/**
 * File-based run logger.
 *
 * Writes progress events to a known file so that external tools
 * (tail -f, kj_status, another Claude process) can monitor what
 * Karajan is doing in real time.
 *
 * Log location: <projectDir>/.kj/run.log  (overwritten each run)
 */

import fs from "node:fs";
import path from "node:path";

const LOG_FILENAME = "run.log";

function resolveLogDir(baseDir) {
  return path.join(baseDir || process.cwd(), ".kj");
}

function resolveLogPath(baseDir) {
  return path.join(resolveLogDir(baseDir), LOG_FILENAME);
}

function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch { /* already exists */ }
}

function formatLine(event) {
  const ts = new Date().toISOString().slice(11, 23);
  const stage = event.stage || event.detail?.stage || "";
  const type = event.type || "info";
  const msg = event.message || "";
  const extra = [];

  if (event.detail?.provider) extra.push(`agent=${event.detail.provider}`);
  if (event.detail?.lineCount !== undefined) extra.push(`lines=${event.detail.lineCount}`);
  if (event.detail?.elapsedMs !== undefined) extra.push(`elapsed=${Math.round(event.detail.elapsedMs / 1000)}s`);
  if (event.detail?.silenceMs !== undefined) extra.push(`silence=${Math.round(event.detail.silenceMs / 1000)}s`);
  if (event.detail?.severity) extra.push(`severity=${event.detail.severity}`);
  if (event.detail?.stream) extra.push(`stream=${event.detail.stream}`);

  const extraStr = extra.length ? ` (${extra.join(", ")})` : "";
  return `${ts} [${type}] ${stage ? `[${stage}] ` : ""}${msg}${extraStr}`;
}

export function createRunLog(projectDir) {
  const logPath = resolveLogPath(projectDir);
  const logDir = resolveLogDir(projectDir);
  ensureDir(logDir);

  // Truncate/create the log file
  fs.writeFileSync(logPath, `--- Karajan run started at ${new Date().toISOString()} ---\n`);

  let fd = null;
  try {
    fd = fs.openSync(logPath, "a");
  } catch {
    // If we can't open for append, use writeFile fallback
  }

  function write(line) {
    try {
      if (fd !== null) {
        fs.writeSync(fd, line + "\n");
      } else {
        fs.appendFileSync(logPath, line + "\n");
      }
    } catch { /* best-effort */ }
  }

  function logEvent(event) {
    write(formatLine(event));
  }

  function logText(text) {
    const ts = new Date().toISOString().slice(11, 23);
    write(`${ts} ${text}`);
  }

  function close() {
    try {
      if (fd !== null) {
        fs.closeSync(fd);
        fd = null;
      }
    } catch { /* best-effort */ }
  }

  return {
    logEvent,
    logText,
    close,
    get path() { return logPath; }
  };
}

/**
 * Read the current run log contents.
 * Returns the last N lines (default 50).
 */
export function readRunLog(maxLines = 50, projectDir) {
  const logPath = resolveLogPath(projectDir);
  try {
    const content = fs.readFileSync(logPath, "utf8");
    const lines = content.split("\n").filter(Boolean);
    const total = lines.length;
    const shown = lines.slice(-maxLines);
    return {
      ok: true,
      path: logPath,
      totalLines: total,
      lines: shown,
      summary: shown.join("\n")
    };
  } catch (err) {
    return {
      ok: false,
      path: logPath,
      error: err.code === "ENOENT"
        ? "No active run log found. Start a run with kj_run first."
        : `Failed to read log: ${err.message}`
    };
  }
}
