import { describe, expect, it } from "vitest";
import { MockAgent } from "./fixtures/mock-agent.js";
import { BaseAgent } from "../src/agents/base-agent.js";

describe("MockAgent", () => {
  it("extends BaseAgent", () => {
    const agent = new MockAgent();
    expect(agent).toBeInstanceOf(BaseAgent);
  });

  it("returns configured runTask result", async () => {
    const agent = new MockAgent({ runTaskResult: { ok: true, output: "done" } });
    const result = await agent.runTask({ prompt: "test" });
    expect(result).toEqual({ ok: true, output: "done" });
  });

  it("returns configured reviewTask result", async () => {
    const agent = new MockAgent({ reviewTaskResult: { ok: true, output: '{"approved":true}' } });
    const result = await agent.reviewTask({ prompt: "test" });
    expect(result).toEqual({ ok: true, output: '{"approved":true}' });
  });

  it("records runTask calls", async () => {
    const agent = new MockAgent();
    await agent.runTask({ prompt: "a" });
    await agent.runTask({ prompt: "b" });
    expect(agent.runTaskCalls).toHaveLength(2);
    expect(agent.runTaskCalls[0]).toEqual({ prompt: "a" });
  });

  it("records reviewTask calls", async () => {
    const agent = new MockAgent();
    await agent.reviewTask({ prompt: "x" });
    expect(agent.reviewTaskCalls).toHaveLength(1);
  });

  it("supports function results for dynamic responses", async () => {
    const agent = new MockAgent({
      runTaskResult: (_task, callNum) =>
        callNum === 1
          ? { ok: false, output: "fail" }
          : { ok: true, output: "pass" },
    });
    const r1 = await agent.runTask({ prompt: "first" });
    const r2 = await agent.runTask({ prompt: "second" });
    expect(r1.ok).toBe(false);
    expect(r2.ok).toBe(true);
  });

  it("uses default name and config", () => {
    const agent = new MockAgent();
    expect(agent.name).toBe("mock");
    expect(agent.config.session.max_iteration_minutes).toBe(5);
  });

  it("accepts custom name and config", () => {
    const agent = new MockAgent({ name: "test-agent", config: { custom: true } });
    expect(agent.name).toBe("test-agent");
    expect(agent.config.custom).toBe(true);
  });
});
