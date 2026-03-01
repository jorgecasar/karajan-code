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
