// KJC-TSK-0702 (MR-E step 1): karajan-core's setHuOutcome keeps a fixed set of
// fields; the measured ones are kept on kj's side, in the plan, for kj report.
import { describe, it, expect } from "vitest";
import { keepRoutingMetrics } from "../../src/hu/routing-metrics.js";

describe("keepRoutingMetrics", () => {
  it("copies what was measured onto the HU's saved outcome, leaving the rest as it was", () => {
    const plan = { hus: [{ id: "h1", outcome: { status: "done", summary: "ok" } }] };
    const outcome = { status: "done", cost_usd: 0.42, tokens_in: 3100, tokens_out: 790, cached_tokens: 1000, coder: { provider: "claude", model: "claude-opus-5-5" }, reviewer_rejections: 1, branch: "x" };
    expect(keepRoutingMetrics(plan, "h1", outcome)).toBe(true);
    expect(plan.hus[0].outcome).toEqual({ status: "done", summary: "ok", cost_usd: 0.42, tokens_in: 3100, tokens_out: 790, cached_tokens: 1000, coder: { provider: "claude", model: "claude-opus-5-5" }, reviewer_rejections: 1 });
  });

  it("unmeasured fields stay out instead of being written as null", () => {
    const plan = { hus: [{ id: "h1", outcome: { status: "failed" } }] };
    keepRoutingMetrics(plan, "h1", { status: "failed", cost_usd: null, coder: null, reviewer_rejections: 2 });
    expect(plan.hus[0].outcome).toEqual({ status: "failed", reviewer_rejections: 2 });
  });

  it("an HU without a saved outcome is left alone", () => {
    const plan = { hus: [{ id: "h1" }] };
    expect(keepRoutingMetrics(plan, "h1", { tokens_out: 1 })).toBe(false);
    expect(plan.hus[0]).toEqual({ id: "h1" });
  });
});
