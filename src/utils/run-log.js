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
  if (event.detail?.cooldownUntil) extra.push(`until=${event.detail.cooldownUntil}`);
  if (event.detail?.retryCount !== undefined) extra.push(`retry=${event.detail.retryCount}/${event.detail.maxRetries || "?"}`);
  if (event.detail?.remainingMs !== undefined) extra.push(`remaining=${Math.round(event.detail.remainingMs / 1000)}s`);

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
 * Parse the run log to extract current status information.
 */
function parseRunStatus(lines) {
  const status = {
    currentStage: null,
    currentAgent: null,
    startedAt: null,
    isRunning: false,
    lastEvent: null,
    iteration: null,
    errors: []
  };

  for (const line of lines) {
    // Detect run start
    if (line.includes("[kj_run] started") || line.includes("[kj_code] started") || line.includes("[kj_plan] started")) {
      status.isRunning = true;
      const tool = line.includes("kj_run") ? "kj_run" : line.includes("kj_code") ? "kj_code" : "kj_plan";
      status.currentStage = tool;
      const tsMatch = line.match(/^(\d{2}:\d{2}:\d{2}\.\d{3})/);
      if (tsMatch) status.startedAt = tsMatch[1];
    }

    // Detect run finish
    if (line.includes("[kj_run] finished") || line.includes("[kj_code] finished") || line.includes("[kj_plan] finished") || line.includes("finished")) {
      if (line.includes("[kj_run]") || line.includes("[kj_code]") || line.includes("[kj_plan]")) {
        status.isRunning = false;
      }
    }

    // Detect stage transitions
    const stageStart = line.match(/\[(\w+):start\]/);
    if (stageStart) {
      status.currentStage = stageStart[1];
    }
    const stageDone = line.match(/\[(\w+):done\]|\[(\w+)\] finished/);
    if (stageDone) {
      const doneName = stageDone[1] || stageDone[2];
      if (doneName === status.currentStage) status.currentStage = "idle";
    }

    // Detect agent
    const agentMatch = line.match(/agent=(\w+)/);
    if (agentMatch) status.currentAgent = agentMatch[1];

    // Detect iteration
    const iterMatch = line.match(/[Ii]teration\s+(\d+)/);
    if (iterMatch) status.iteration = parseInt(iterMatch[1], 10);

    // Detect errors
    if (line.match(/\[.*:fail\]|\[.*error\]/i) || line.includes("ERROR")) {
      status.errors.push(line.trim());
    }

    // Detect standby
    if (line.includes("[standby]") || line.includes("standby")) {
      status.currentStage = "standby";
    }

    status.lastEvent = line.trim();
  }

  // Keep only last 3 errors
  if (status.errors.length > 3) status.errors = status.errors.slice(-3);

  return status;
}

/**
 * Read the current run log contents.
 * Returns the last N lines (default 50) plus a parsed status summary.
 */
export function readRunLog(maxLines = 50, projectDir) {
  const logPath = resolveLogPath(projectDir);
  try {
    const content = fs.readFileSync(logPath, "utf8");
    const lines = content.split("\n").filter(Boolean);
    const total = lines.length;
    const shown = lines.slice(-maxLines);
    const status = parseRunStatus(lines);
    return {
      ok: true,
      path: logPath,
      totalLines: total,
      status,
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
