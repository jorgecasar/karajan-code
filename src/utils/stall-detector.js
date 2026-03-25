/**
 * Stall detector for agent execution.
 *
 * Wraps an onOutput callback to track activity and emit heartbeat / stall
 * warnings when an agent stops producing output for too long.
 *
 * Usage:
 *   const detector = createStallDetector({ onOutput, emitter, eventBase, stage, provider, stallTimeoutMs });
 *   // pass detector.onOutput to the agent
 *   // when done: detector.stop();
 */

import { emitProgress, makeEvent } from "./events.js";

const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;   // heartbeat every 30s
const DEFAULT_STALL_TIMEOUT_MS      = 120_000;  // warn after 2min silence
const DEFAULT_CRITICAL_TIMEOUT_MS   = 300_000;  // critical after 5min silence
const DEFAULT_STALL_REPEAT_MS       = 60_000;   // repeat stall notices every 60s

export function createStallDetector({
  onOutput,
  emitter,
  eventBase,
  stage,
  provider,
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
  stallTimeoutMs      = DEFAULT_STALL_TIMEOUT_MS,
  criticalTimeoutMs   = DEFAULT_CRITICAL_TIMEOUT_MS,
  stallRepeatMs       = DEFAULT_STALL_REPEAT_MS,
  maxSilenceMs        = null,
  onMaxSilence        = null
}) {
  let lastActivityAt = Date.now();
  let lineCount = 0;
  let bytesReceived = 0;
  let heartbeatTimer = null;
  const startedAt = Date.now();
  let lastStallWarnAt = 0;
  let lastCriticalWarnAt = 0;
  let maxSilenceTriggered = false;

  function emitHeartbeat() {
    const now = Date.now();
    const silenceMs = now - lastActivityAt;
    const elapsedMs = now - startedAt;
    const shouldWarn = silenceMs >= stallTimeoutMs;
    const shouldCritical = silenceMs >= criticalTimeoutMs;
    const repeatWindow = Math.max(1000, Number(stallRepeatMs) || DEFAULT_STALL_REPEAT_MS);

    if (shouldCritical && (now - lastCriticalWarnAt >= repeatWindow)) {
      lastCriticalWarnAt = now;
      emitProgress(emitter, makeEvent("agent:stall", { ...eventBase, stage }, {
        status: "critical",
        message: `[${stage}] Agent ${provider} unresponsive for ${Math.round(silenceMs / 1000)}s — may be hung`,
        detail: {
          provider,
          silenceMs,
          elapsedMs,
          lineCount,
          bytesReceived,
          severity: "critical"
        }
      }));
    } else if (shouldWarn && (now - lastStallWarnAt >= repeatWindow)) {
      lastStallWarnAt = now;
      emitProgress(emitter, makeEvent("agent:stall", { ...eventBase, stage }, {
        status: "warning",
        message: `[${stage}] Agent ${provider} silent for ${Math.round(silenceMs / 1000)}s — still waiting`,
        detail: {
          provider,
          silenceMs,
          elapsedMs,
          lineCount,
          bytesReceived,
          severity: "warning"
        }
      }));
    }

    emitProgress(emitter, makeEvent("agent:heartbeat", { ...eventBase, stage }, {
      message: silenceMs < stallTimeoutMs
        ? `[${stage}] Agent ${provider} active — ${lineCount} lines, ${Math.round(elapsedMs / 1000)}s elapsed`
        : `[${stage}] Agent ${provider} waiting — silent ${Math.round(silenceMs / 1000)}s, ${Math.round(elapsedMs / 1000)}s elapsed`,
      detail: {
        provider,
        elapsedMs,
        silenceMs,
        lineCount,
        bytesReceived,
        status: silenceMs < stallTimeoutMs ? "active" : "waiting"
      }
    }));

    const hardLimit = Number(maxSilenceMs);
    if (!maxSilenceTriggered && Number.isFinite(hardLimit) && hardLimit > 0 && silenceMs >= hardLimit) {
      maxSilenceTriggered = true;
      emitProgress(emitter, makeEvent("agent:stall", { ...eventBase, stage }, {
        status: "fail",
        message: `[${stage}] Agent ${provider} exceeded max silence (${Math.round(hardLimit / 1000)}s)`,
        detail: {
          provider,
          silenceMs,
          elapsedMs,
          lineCount,
          bytesReceived,
          severity: "fatal",
          maxSilenceMs: hardLimit
        }
      }));
      if (typeof onMaxSilence === "function") {
        onMaxSilence({
          provider,
          stage,
          silenceMs,
          elapsedMs,
          lineCount,
          bytesReceived,
          maxSilenceMs: hardLimit
        });
      }
    }
  }

  // Start periodic heartbeat
  heartbeatTimer = setInterval(emitHeartbeat, heartbeatIntervalMs);

  function wrappedOnOutput(data) {
    lastActivityAt = Date.now();
    lineCount++;
    bytesReceived += data.line?.length || 0;

    // Forward to the original callback
    if (onOutput) {
      onOutput(data);
    }
  }

  function stop() {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
      heartbeatTimer = null;
    }
  }

  function stats() {
    return {
      lineCount,
      bytesReceived,
      elapsedMs: Date.now() - startedAt,
      lastActivityMs: Date.now() - lastActivityAt
    };
  }

  return {
    onOutput: wrappedOnOutput,
    stop,
    stats
  };
}
