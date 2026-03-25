import { describe, expect, it } from "vitest";
import { BaseAgent } from "../../src/agents/base-agent.js";

describe("BaseAgent", () => {
  describe("isModelNotSupportedError", () => {
    const agent = new BaseAgent("test", {}, null);

    const positivePatterns = [
      "The 'o4-mini' model is not supported when using Codex with a ChatGPT account.",
      "The 'o3' model is not supported when using Codex with a ChatGPT account.",
      "Error: model \"haiku\" is not available for your account",
      "model does not exist: gpt-99",
      "unsupported model: o4-mini",
      "invalid model specified",
      "error: model_not_found"
    ];

    for (const msg of positivePatterns) {
      it(`detects: "${msg.slice(0, 60)}..."`, () => {
        expect(agent.isModelNotSupportedError({ error: msg })).toBe(true);
      });
    }

    it("detects pattern in stderr field", () => {
      expect(agent.isModelNotSupportedError({ stderr: "model is not supported" })).toBe(true);
    });

    it("detects pattern in output field", () => {
      expect(agent.isModelNotSupportedError({ output: "unsupported model" })).toBe(true);
    });

    const negativePatterns = [
      "connection timeout",
      "rate limit exceeded",
      "command failed",
      "permission denied",
      ""
    ];

    for (const msg of negativePatterns) {
      it(`ignores: "${msg || "(empty)"}"`, () => {
        expect(agent.isModelNotSupportedError({ error: msg })).toBe(false);
      });
    }

    it("handles null/undefined result gracefully", () => {
      expect(agent.isModelNotSupportedError(null)).toBe(false);
      expect(agent.isModelNotSupportedError(undefined)).toBe(false);
      expect(agent.isModelNotSupportedError({})).toBe(false);
    });
  });
});
