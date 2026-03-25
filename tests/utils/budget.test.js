import { describe, expect, it } from "vitest";
import { extractUsageMetrics, estimateTokens, BudgetTracker } from "../../src/utils/budget.js";

describe("estimateTokens", () => {
  it("estimates ~4 chars per token", () => {
    const result = estimateTokens(400, 800);
    expect(result.tokens_in).toBe(100);
    expect(result.tokens_out).toBe(200);
    expect(result.estimated).toBe(true);
  });

  it("handles zero lengths", () => {
    const result = estimateTokens(0, 0);
    expect(result.tokens_in).toBe(0);
    expect(result.tokens_out).toBe(0);
  });

  it("handles null/undefined lengths", () => {
    const result = estimateTokens(null, undefined);
    expect(result.tokens_in).toBe(0);
    expect(result.tokens_out).toBe(0);
  });
});

describe("extractUsageMetrics", () => {
  it("extracts real token data from result fields", () => {
    const result = { tokens_in: 1000, tokens_out: 2000, cost_usd: 0.05, model: "claude" };
    const metrics = extractUsageMetrics(result);
    expect(metrics.tokens_in).toBe(1000);
    expect(metrics.tokens_out).toBe(2000);
    expect(metrics.cost_usd).toBe(0.05);
    expect(metrics.model).toBe("claude");
    expect(metrics.estimated).toBe(false);
  });

  it("extracts from nested usage object", () => {
    const result = { usage: { input_tokens: 500, output_tokens: 800 } };
    const metrics = extractUsageMetrics(result, "sonnet");
    expect(metrics.tokens_in).toBe(500);
    expect(metrics.tokens_out).toBe(800);
    expect(metrics.model).toBe("sonnet");
  });

  it("estimates from promptSize when no real data is available", () => {
    const result = { promptSize: 4000, output: "a".repeat(800) };
    const metrics = extractUsageMetrics(result);
    expect(metrics.tokens_in).toBe(1000);
    expect(metrics.tokens_out).toBe(200);
    expect(metrics.estimated).toBe(true);
  });

  describe("fallback estimation from output text", () => {
    it("estimates from output text when no real data and no promptSize", () => {
      const result = { output: "a".repeat(2000) };
      const metrics = extractUsageMetrics(result);
      expect(metrics.tokens_in).toBe(0);
      expect(metrics.tokens_out).toBe(500);
      expect(metrics.estimated).toBe(true);
    });

    it("estimates from error text when no real data", () => {
      const result = { error: "b".repeat(400) };
      const metrics = extractUsageMetrics(result);
      expect(metrics.tokens_in).toBe(0);
      expect(metrics.tokens_out).toBe(100);
      expect(metrics.estimated).toBe(true);
    });

    it("estimates from summary text when no output or error", () => {
      const result = { summary: "c".repeat(1200) };
      const metrics = extractUsageMetrics(result);
      expect(metrics.tokens_in).toBe(0);
      expect(metrics.tokens_out).toBe(300);
      expect(metrics.estimated).toBe(true);
    });

    it("does NOT estimate when there is no text at all", () => {
      const result = {};
      const metrics = extractUsageMetrics(result);
      expect(metrics.tokens_in).toBe(0);
      expect(metrics.tokens_out).toBe(0);
      expect(metrics.estimated).toBe(false);
    });

    it("does NOT estimate when real tokens are available", () => {
      const result = { tokens_in: 100, tokens_out: 200, output: "a".repeat(10000) };
      const metrics = extractUsageMetrics(result);
      expect(metrics.tokens_in).toBe(100);
      expect(metrics.tokens_out).toBe(200);
      expect(metrics.estimated).toBe(false);
    });

    it("does NOT estimate when explicit cost is available", () => {
      const result = { cost_usd: 0.10, output: "a".repeat(10000) };
      const metrics = extractUsageMetrics(result);
      expect(metrics.tokens_in).toBe(0);
      expect(metrics.tokens_out).toBe(0);
      expect(metrics.estimated).toBe(false);
    });

    it("prefers output over error for estimation", () => {
      const result = { output: "a".repeat(800), error: "b".repeat(400) };
      const metrics = extractUsageMetrics(result);
      // output is used because it's checked first in the || chain
      expect(metrics.tokens_out).toBe(200);
      expect(metrics.estimated).toBe(true);
    });
  });

  it("real agent data takes priority over estimation", () => {
    // Simulates a Claude result with real usage data
    const result = {
      tokens_in: 3000,
      tokens_out: 4000,
      cost_usd: 0.117,
      model: "claude-opus-4-6[1m]",
      output: "a".repeat(50000)  // large output that would give different estimate
    };
    const metrics = extractUsageMetrics(result);
    expect(metrics.tokens_in).toBe(3000);
    expect(metrics.tokens_out).toBe(4000);
    expect(metrics.cost_usd).toBe(0.117);
    expect(metrics.estimated).toBe(false);
  });
});

describe("BudgetTracker with estimated data", () => {
  it("marks entries as estimated when estimation is used", () => {
    const tracker = new BudgetTracker();
    const metrics = extractUsageMetrics({ output: "a".repeat(400) });
    tracker.record({ role: "coder", provider: "claude", ...metrics });

    expect(tracker.entries[0].estimated).toBe(true);
    expect(tracker.summary().includes_estimates).toBe(true);
  });

  it("hasUsageData returns true when estimation provides tokens", () => {
    const tracker = new BudgetTracker();
    const metrics = extractUsageMetrics({ output: "a".repeat(400) });
    tracker.record({ role: "coder", provider: "claude", ...metrics });

    expect(tracker.hasUsageData()).toBe(true);
  });
});
