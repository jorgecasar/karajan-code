import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createStallDetector } from "../src/utils/stall-detector.js";
import { EventEmitter } from "node:events";

function makeEventBase() {
  return { sessionId: "s-1", iteration: 0, startedAt: Date.now() };
}

describe("createStallDetector", () => {
  let emitter;
  let events;

  beforeEach(() => {
    vi.useFakeTimers();
    emitter = new EventEmitter();
    events = [];
    emitter.on("progress", (e) => events.push(e));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("forwards output to the original onOutput callback", () => {
    const received = [];
    const onOutput = (data) => received.push(data);
    const detector = createStallDetector({
      onOutput, emitter, eventBase: makeEventBase(), stage: "planner", provider: "claude"
    });

    detector.onOutput({ stream: "stdout", line: "hello" });
    detector.onOutput({ stream: "stdout", line: "world" });
    detector.stop();

    expect(received).toHaveLength(2);
    expect(received[0].line).toBe("hello");
    expect(received[1].line).toBe("world");
  });

  it("works without an onOutput callback", () => {
    const detector = createStallDetector({
      onOutput: null, emitter, eventBase: makeEventBase(), stage: "planner", provider: "claude"
    });

    expect(() => detector.onOutput({ stream: "stdout", line: "test" })).not.toThrow();
    detector.stop();
  });

  it("emits heartbeat after interval when agent is active", () => {
    const detector = createStallDetector({
      onOutput: null, emitter, eventBase: makeEventBase(), stage: "coder", provider: "claude",
      heartbeatIntervalMs: 1000, stallTimeoutMs: 5000, criticalTimeoutMs: 10000
    });

    // Simulate activity
    detector.onOutput({ stream: "stdout", line: "working..." });
    vi.advanceTimersByTime(1000);

    const heartbeats = events.filter(e => e.type === "agent:heartbeat");
    expect(heartbeats.length).toBeGreaterThanOrEqual(1);
    expect(heartbeats[0].detail.provider).toBe("claude");
    expect(heartbeats[0].detail.lineCount).toBe(1);

    detector.stop();
  });

  it("emits stall warning after stallTimeoutMs of silence", () => {
    const detector = createStallDetector({
      onOutput: null, emitter, eventBase: makeEventBase(), stage: "planner", provider: "gemini",
      heartbeatIntervalMs: 1000, stallTimeoutMs: 3000, criticalTimeoutMs: 10000
    });

    // No activity, advance past stall timeout
    vi.advanceTimersByTime(4000);

    const stalls = events.filter(e => e.type === "agent:stall");
    expect(stalls.length).toBeGreaterThanOrEqual(1);
    expect(stalls[0].status).toBe("warning");
    expect(stalls[0].detail.severity).toBe("warning");
    expect(stalls[0].detail.provider).toBe("gemini");

    detector.stop();
  });

  it("emits critical stall after criticalTimeoutMs of silence", () => {
    const detector = createStallDetector({
      onOutput: null, emitter, eventBase: makeEventBase(), stage: "researcher", provider: "claude",
      heartbeatIntervalMs: 1000, stallTimeoutMs: 2000, criticalTimeoutMs: 5000
    });

    vi.advanceTimersByTime(6000);

    const stalls = events.filter(e => e.type === "agent:stall");
    const critical = stalls.filter(e => e.detail.severity === "critical");
    expect(critical.length).toBeGreaterThanOrEqual(1);
    expect(critical[0].message).toContain("unresponsive");

    detector.stop();
  });

  it("resets stall warnings when activity resumes", () => {
    const detector = createStallDetector({
      onOutput: null, emitter, eventBase: makeEventBase(), stage: "coder", provider: "claude",
      heartbeatIntervalMs: 1000, stallTimeoutMs: 3000, criticalTimeoutMs: 10000
    });

    // Silence long enough to trigger warning
    vi.advanceTimersByTime(4000);
    const warningsBefore = events.filter(e => e.type === "agent:stall").length;
    expect(warningsBefore).toBeGreaterThanOrEqual(1);

    // Resume activity
    detector.onOutput({ stream: "stdout", line: "back!" });
    events.length = 0;

    // Next heartbeat should be normal
    vi.advanceTimersByTime(1000);
    const heartbeats = events.filter(e => e.type === "agent:heartbeat");
    expect(heartbeats.length).toBeGreaterThanOrEqual(1);

    detector.stop();
  });

  it("stop() clears the interval timer", () => {
    const detector = createStallDetector({
      onOutput: null, emitter, eventBase: makeEventBase(), stage: "planner", provider: "claude",
      heartbeatIntervalMs: 1000
    });

    detector.stop();
    events.length = 0;

    vi.advanceTimersByTime(5000);
    expect(events).toHaveLength(0);
  });

  it("stats() returns current metrics", () => {
    const detector = createStallDetector({
      onOutput: null, emitter, eventBase: makeEventBase(), stage: "coder", provider: "claude"
    });

    detector.onOutput({ stream: "stdout", line: "line1" });
    detector.onOutput({ stream: "stdout", line: "line two" });

    const s = detector.stats();
    expect(s.lineCount).toBe(2);
    expect(s.bytesReceived).toBe(5 + 8); // "line1" + "line two"
    expect(s.elapsedMs).toBeGreaterThanOrEqual(0);

    detector.stop();
  });

  it("tracks bytes correctly", () => {
    const detector = createStallDetector({
      onOutput: null, emitter, eventBase: makeEventBase(), stage: "coder", provider: "claude"
    });

    detector.onOutput({ stream: "stdout", line: "abc" });
    detector.onOutput({ stream: "stderr", line: "de" });

    expect(detector.stats().bytesReceived).toBe(5);
    detector.stop();
  });
});
