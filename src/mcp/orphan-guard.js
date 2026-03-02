import { readFileSync } from "node:fs";
import { watch } from "node:fs";

const DEFAULT_INTERVAL_MS = 5000;

export function setupOrphanGuard({ intervalMs = DEFAULT_INTERVAL_MS, exitFn = () => process.exit(0) } = {}) {
  const parentPid = process.ppid;

  const timer = setInterval(() => {
    try {
      process.kill(parentPid, 0);
    } catch {
      clearInterval(timer);
      exitFn();
    }
  }, intervalMs);
  timer.unref();

  process.stdin.on("end", exitFn);
  process.stdin.on("close", exitFn);
  process.on("SIGHUP", exitFn);

  return { timer, parentPid };
}

export function setupVersionWatcher({ pkgPath, currentVersion, exitFn = () => process.exit(0) } = {}) {
  if (!pkgPath) return null;

  function checkVersion() {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
      if (pkg.version !== currentVersion) {
        exitFn();
        return true;
      }
    } catch { /* ignore read errors */ }
    return false;
  }

  let watcher = null;
  try {
    watcher = watch(pkgPath, { persistent: false }, () => {
      checkVersion();
    });
  } catch { /* ignore watch errors */ }

  return { watcher, checkVersion };
}
