import { describe, expect, it, beforeEach } from "vitest";
import {
  isPreflightAcked,
  ackPreflight,
  getSessionOverrides,
  resetPreflight
} from "../src/mcp/preflight.js";

describe("preflight state manager", () => {
  beforeEach(() => {
    resetPreflight();
  });

  it("isPreflightAcked returns false initially", () => {
    expect(isPreflightAcked()).toBe(false);
  });

  it("after ackPreflight(), returns true", () => {
    ackPreflight();
    expect(isPreflightAcked()).toBe(true);
  });

  it("ackPreflight with overrides stores them", () => {
    ackPreflight({ coder: "gemini", reviewer: "claude" });
    expect(isPreflightAcked()).toBe(true);
    expect(getSessionOverrides()).toEqual({ coder: "gemini", reviewer: "claude" });
  });

  it("getSessionOverrides returns stored overrides", () => {
    ackPreflight({ enableTester: true, security: "claude" });
    const ovr = getSessionOverrides();
    expect(ovr).toEqual({ enableTester: true, security: "claude" });
    // Verify it returns a copy, not the original
    ovr.extra = "should not leak";
    expect(getSessionOverrides()).not.toHaveProperty("extra");
  });

  it("resetPreflight clears everything", () => {
    ackPreflight({ coder: "gemini" });
    expect(isPreflightAcked()).toBe(true);
    expect(getSessionOverrides()).toEqual({ coder: "gemini" });

    resetPreflight();
    expect(isPreflightAcked()).toBe(false);
    expect(getSessionOverrides()).toEqual({});
  });
});
