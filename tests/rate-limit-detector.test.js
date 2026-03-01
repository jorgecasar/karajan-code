import { describe, expect, it } from "vitest";
import { detectRateLimit } from "../src/utils/rate-limit-detector.js";

describe("detectRateLimit", () => {
  describe("Claude CLI rate limit patterns", () => {
    it("detects Claude usage limit message", () => {
      const result = detectRateLimit({
        stderr: "You've exceeded your usage limit. Please wait until 3:00 PM to continue.",
        stdout: ""
      });
      expect(result.isRateLimit).toBe(true);
      expect(result.agent).toBe("claude");
    });

    it("detects Claude token cap message", () => {
      const result = detectRateLimit({
        stderr: "",
        stdout: "Rate limit reached. Try again in 2 hours."
      });
      expect(result.isRateLimit).toBe(true);
    });

    it("detects Claude plan limit message", () => {
      const result = detectRateLimit({
        stderr: "You have reached your plan's usage limit for this period.",
        stdout: ""
      });
      expect(result.isRateLimit).toBe(true);
    });

    it("detects Claude Pro limit message", () => {
      const result = detectRateLimit({
        stderr: "Claude Pro usage limit exceeded. Resets at 2026-03-01T15:00:00Z.",
        stdout: ""
      });
      expect(result.isRateLimit).toBe(true);
    });
  });

  describe("Codex CLI rate limit patterns", () => {
    it("detects Codex rate limit message", () => {
      const result = detectRateLimit({
        stderr: "Rate limit exceeded. Please try again later.",
        stdout: ""
      });
      expect(result.isRateLimit).toBe(true);
    });

    it("detects OpenAI quota exceeded", () => {
      const result = detectRateLimit({
        stderr: "Error: You exceeded your current quota, please check your plan and billing details.",
        stdout: ""
      });
      expect(result.isRateLimit).toBe(true);
    });
  });

  describe("Gemini CLI rate limit patterns", () => {
    it("detects Gemini rate limit from stderr", () => {
      const result = detectRateLimit({
        stderr: "Resource exhausted: quota exceeded for the model.",
        stdout: ""
      });
      expect(result.isRateLimit).toBe(true);
    });

    it("detects Gemini 429 error", () => {
      const result = detectRateLimit({
        stderr: "Error 429: Too many requests. Please retry after a moment.",
        stdout: ""
      });
      expect(result.isRateLimit).toBe(true);
    });
  });

  describe("Aider rate limit patterns", () => {
    it("detects Aider rate limit message", () => {
      const result = detectRateLimit({
        stderr: "Rate limit error from provider. Waiting to retry...",
        stdout: ""
      });
      expect(result.isRateLimit).toBe(true);
    });

    it("detects Aider token limit message", () => {
      const result = detectRateLimit({
        stderr: "",
        stdout: "Token limit reached for the current session."
      });
      expect(result.isRateLimit).toBe(true);
    });
  });

  describe("generic rate limit patterns", () => {
    it("detects HTTP 429 status code mention", () => {
      const result = detectRateLimit({
        stderr: "HTTP error: 429 Too Many Requests",
        stdout: ""
      });
      expect(result.isRateLimit).toBe(true);
    });

    it("detects throttled/throttling messages", () => {
      const result = detectRateLimit({
        stderr: "Request throttled. Please wait before retrying.",
        stdout: ""
      });
      expect(result.isRateLimit).toBe(true);
    });
  });

  describe("non-rate-limit errors", () => {
    it("returns false for regular errors", () => {
      const result = detectRateLimit({
        stderr: "Error: file not found",
        stdout: ""
      });
      expect(result.isRateLimit).toBe(false);
    });

    it("returns false for syntax errors", () => {
      const result = detectRateLimit({
        stderr: "SyntaxError: Unexpected token",
        stdout: ""
      });
      expect(result.isRateLimit).toBe(false);
    });

    it("returns false for empty output", () => {
      const result = detectRateLimit({ stderr: "", stdout: "" });
      expect(result.isRateLimit).toBe(false);
    });

    it("returns false for timeout errors", () => {
      const result = detectRateLimit({
        stderr: "Command timed out after 300000ms",
        stdout: ""
      });
      expect(result.isRateLimit).toBe(false);
    });

    it("returns false for permission errors", () => {
      const result = detectRateLimit({
        stderr: "Error: EACCES: permission denied",
        stdout: ""
      });
      expect(result.isRateLimit).toBe(false);
    });
  });

  describe("return value structure", () => {
    it("returns message with context when rate limit detected", () => {
      const result = detectRateLimit({
        stderr: "Rate limit exceeded. Try again in 5 minutes.",
        stdout: ""
      });
      expect(result.isRateLimit).toBe(true);
      expect(result.message).toBeTruthy();
      expect(typeof result.message).toBe("string");
    });

    it("returns empty message when no rate limit", () => {
      const result = detectRateLimit({
        stderr: "Some other error",
        stdout: ""
      });
      expect(result.isRateLimit).toBe(false);
      expect(result.message).toBe("");
    });
  });
});
