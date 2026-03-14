/**
 * MCP progress notification helpers.
 * Extracted from server.js for testability and reuse.
 */

export const PROGRESS_STAGES = [
  "session:start",
  "iteration:start",
  "triage:start",
  "triage:end",
  "researcher:start",
  "researcher:end",
  "planner:start",
  "planner:end",
  "coder:start",
  "coder:end",
  "refactorer:start",
  "refactorer:end",
  "tdd:result",
  "sonar:start",
  "sonar:end",
  "reviewer:start",
  "reviewer:end",
  "iteration:end",
  "solomon:escalate",
  "question",
  "session:end",
  "dry-run:summary",
  "pipeline:tracker",
  "agent:heartbeat",
  "agent:stall"
];

const PIPELINE_ORDER = [
  "triage", "researcher", "planner", "coder", "refactorer", "sonar", "reviewer", "tester", "security", "commiter"
];

export function buildPipelineTracker(config, emitter) {
  const pipeline = config.pipeline || {};

  const stages = PIPELINE_ORDER
    .filter(name => {
      if (name === "coder") return true;
      if (name === "reviewer") return pipeline.reviewer?.enabled !== false;
      if (name === "sonar") return pipeline.sonar?.enabled || config.sonarqube?.enabled;
      return pipeline[name]?.enabled;
    })
    .map(name => ({ name, status: "pending", summary: undefined }));

  const findStage = (name) => stages.find(s => s.name === name);

  const emitTracker = () => {
    emitter.emit("progress", {
      type: "pipeline:tracker",
      detail: { stages: stages.map(s => ({ ...s })) }
    });
  };

  emitter.on("progress", (event) => {
    const match = /^(\w+):(start|end)$/.exec(event.type ?? "");
    if (!match) return;

    const [, name, phase] = match;
    const stage = findStage(name);
    if (!stage) return;

    if (phase === "start") {
      stage.status = "running";
      stage.summary = event.detail?.[name] || stage.summary;
    } else {
      stage.status = event.status === "fail" ? "failed" : "done";
      stage.summary = event.detail?.summary || event.detail?.gateStatus || stage.summary;
    }

    emitTracker();
  });

  return { stages };
}

export function sendTrackerLog(server, stageName, status, summary) {
  try {
    server.sendLoggingMessage({
      level: "info",
      logger: "karajan",
      data: {
        type: "pipeline:tracker",
        detail: {
          stages: [{ name: stageName, status, summary: summary || undefined }]
        }
      }
    });
  } catch {
    // best-effort
  }
}

function resolveLogLevel(event) {
  if (event.type === "agent:output") return "debug";
  if (event.type === "agent:heartbeat") return "debug";
  if (event.type === "agent:stall") return "warning";
  if (event.status === "fail") return "error";
  return "info";
}

export function buildProgressHandler(server) {
  return (event) => {
    try {
      server.sendLoggingMessage({
        level: resolveLogLevel(event),
        logger: "karajan",
        data: event
      });
    } catch {
      // best-effort: if logging fails, continue
    }
  };
}

export function buildProgressNotifier(extra) {
  const progressToken = extra?._meta?.progressToken;
  if (progressToken === undefined) return null;

  const total = PROGRESS_STAGES.length;
  return (event) => {
    const idx = PROGRESS_STAGES.indexOf(event.type);
    if (idx < 0) return;

    const iteration = event.iteration || event.detail?.iteration;
    const baseMessage = event.message || event.type;
    const message = iteration
      ? `[${event.iteration}] ${baseMessage}`
      : baseMessage;

    try {
      extra.sendNotification({
        method: "notifications/progress",
        params: {
          progressToken,
          progress: idx + 1,
          total,
          message
        }
      });
    } catch {
      // best-effort
    }
  };
}
