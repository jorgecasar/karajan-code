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

export function createStallDetector({
  onOutput,
  emitter,
  eventBase,
  stage,
  provider,
  heartbeatIntervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS,
  stallTimeoutMs      = DEFAULT_STALL_TIMEOUT_MS,
  criticalTimeoutMs   = DEFAULT_CRITICAL_TIMEOUT_MS
}) {
  let lastActivityAt = Date.now();
  let lineCount = 0;
  let bytesReceived = 0;
  let stallWarned = false;
  let criticalWarned = false;
  let heartbeatTimer = null;
  const startedAt = Date.now();

  function emitHeartbeat() {
    const now = Date.now();
    const silenceMs = now - lastActivityAt;
    const elapsedMs = now - startedAt;

    if (silenceMs >= criticalTimeoutMs && !criticalWarned) {
      criticalWarned = true;
      emitProgress(emitter, makeEvent("agent:stall", { ...eventBase, stage }, {
        status: "critical",
        message: `Agent ${provider} unresponsive for ${Math.round(silenceMs / 1000)}s — may be hung`,
        detail: {
          provider,
          silenceMs,
          elapsedMs,
          lineCount,
          bytesReceived,
          severity: "critical"
        }
      }));
    } else if (silenceMs >= stallTimeoutMs && !stallWarned) {
      stallWarned = true;
      emitProgress(emitter, makeEvent("agent:stall", { ...eventBase, stage }, {
        status: "warning",
        message: `Agent ${provider} silent for ${Math.round(silenceMs / 1000)}s — still waiting`,
        detail: {
          provider,
          silenceMs,
          elapsedMs,
          lineCount,
          bytesReceived,
          severity: "warning"
        }
      }));
    } else if (silenceMs < stallTimeoutMs) {
      // Reset warning flags when activity resumes
      stallWarned = false;
      criticalWarned = false;

      emitProgress(emitter, makeEvent("agent:heartbeat", { ...eventBase, stage }, {
        message: `Agent ${provider} active — ${lineCount} lines, ${Math.round(elapsedMs / 1000)}s elapsed`,
        detail: {
          provider,
          elapsedMs,
          lineCount,
          bytesReceived
        }
      }));
    }
  }

  // Start periodic heartbeat
  heartbeatTimer = setInterval(emitHeartbeat, heartbeatIntervalMs);

  function wrappedOnOutput(data) {
    lastActivityAt = Date.now();
    lineCount++;
    bytesReceived += data.line?.length || 0;

    // Reset stall flags on new activity
    stallWarned = false;
    criticalWarned = false;

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
