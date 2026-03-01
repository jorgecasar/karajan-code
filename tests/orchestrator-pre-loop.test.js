import { beforeEach, describe, expect, it, vi } from "vitest";

const triageRunMock = vi.fn();
const researcherRunMock = vi.fn();

vi.mock("../src/roles/triage-role.js", () => ({
  TriageRole: class {
    async init() {}
    async run() {
      return triageRunMock();
    }
  }
}));

vi.mock("../src/roles/researcher-role.js", () => ({
  ResearcherRole: class {
    async init() {}
    async run() {
      return researcherRunMock();
    }
  }
}));

vi.mock("../src/roles/planner-role.js", () => {
  const executeMock = vi.fn();
  return {
    PlannerRole: class {
      context = {};
      async init() {}
      async execute(task) {
        return executeMock(task);
      }
    },
    __executeMock: executeMock
  };
});

vi.mock("../src/agents/index.js", () => ({
  createAgent: vi.fn()
}));

vi.mock("../src/session-store.js", () => ({
  addCheckpoint: vi.fn(async () => {}),
  markSessionStatus: vi.fn(async () => {})
}));

vi.mock("../src/utils/events.js", () => ({
  emitProgress: vi.fn(),
  makeEvent: vi.fn((type, base, payload) => ({ type, ...base, ...payload }))
}));

vi.mock("../src/prompts/planner.js", () => ({
  parsePlannerOutput: vi.fn((output) => ({ title: "Plan", approach: "Approach", steps: ["Step 1"] }))
}));

describe("pre-loop-stages", () => {
  const logger = {
    debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
    setContext: vi.fn(), resetContext: vi.fn()
  };
  const emitter = { emit: vi.fn() };
  const eventBase = { sessionId: "s1", iteration: 0, stage: null, startedAt: Date.now() };
  const coderRole = { provider: "codex", model: "codex-mini" };
  const trackBudget = vi.fn();

  let runTriageStage, runResearcherStage, runPlannerStage;

  beforeEach(async () => {
    vi.resetAllMocks();
    triageRunMock.mockResolvedValue({
      ok: true,
      result: { level: "medium", roles: ["reviewer", "tester"], reasoning: "Moderate" },
      usage: { tokens_in: 100, tokens_out: 80 }
    });
    researcherRunMock.mockResolvedValue({
      ok: true,
      summary: "Found relevant files",
      result: { files: ["a.js"] }
    });

    ({ runTriageStage, runResearcherStage, runPlannerStage } = await import("../src/orchestrator/pre-loop-stages.js"));
  });

  describe("runTriageStage", () => {
    it("returns role overrides from triage classification", async () => {
      const session = { id: "s1", task: "test task", checkpoints: [] };
      const result = await runTriageStage({ config: {}, logger, emitter, eventBase, session, coderRole, trackBudget });

      expect(result.roleOverrides.reviewerEnabled).toBe(true);
      expect(result.roleOverrides.testerEnabled).toBe(true);
      expect(result.roleOverrides.plannerEnabled).toBe(false);
      expect(result.roleOverrides.securityEnabled).toBe(false);
      expect(result.stageResult.level).toBe("medium");
      expect(result.stageResult.ok).toBe(true);
    });

    it("tracks budget for triage", async () => {
      const session = { id: "s1", task: "t", checkpoints: [] };
      await runTriageStage({ config: {}, logger, emitter, eventBase, session, coderRole, trackBudget });

      expect(trackBudget).toHaveBeenCalledWith(expect.objectContaining({ role: "triage" }));
    });

    it("returns empty overrides when triage fails", async () => {
      triageRunMock.mockResolvedValueOnce({
        ok: false,
        result: {},
        summary: "Triage error"
      });
      const session = { id: "s1", task: "t", checkpoints: [] };
      const result = await runTriageStage({ config: {}, logger, emitter, eventBase, session, coderRole, trackBudget });

      expect(result.roleOverrides).toEqual({});
      expect(result.stageResult.ok).toBe(false);
    });
  });

  describe("runResearcherStage", () => {
    it("returns research context when successful", async () => {
      const session = { id: "s1", task: "research task", checkpoints: [] };
      const result = await runResearcherStage({ config: {}, logger, emitter, eventBase, session, coderRole, trackBudget });

      expect(result.researchContext).toEqual({ files: ["a.js"] });
      expect(result.stageResult.ok).toBe(true);
    });

    it("returns null context when researcher fails", async () => {
      researcherRunMock.mockResolvedValueOnce({
        ok: false,
        summary: "Research failed",
        result: null
      });
      const session = { id: "s1", task: "t", checkpoints: [] };
      const result = await runResearcherStage({ config: {}, logger, emitter, eventBase, session, coderRole, trackBudget });

      expect(result.researchContext).toBeNull();
      expect(result.stageResult.ok).toBe(false);
    });

    it("tracks budget for researcher", async () => {
      const session = { id: "s1", task: "t", checkpoints: [] };
      await runResearcherStage({ config: {}, logger, emitter, eventBase, session, coderRole, trackBudget });

      expect(trackBudget).toHaveBeenCalledWith(expect.objectContaining({ role: "researcher" }));
    });
  });

  describe("runPlannerStage", () => {
    it("returns planned task with execution plan appended", async () => {
      const { __executeMock } = await import("../src/roles/planner-role.js");
      __executeMock.mockResolvedValue({
        ok: true,
        result: { plan: "1. Do something\n2. Do more" }
      });

      const session = { id: "s1", task: "build feature", checkpoints: [] };
      const plannerRole = { provider: "claude", model: "claude-sonnet" };
      const result = await runPlannerStage({
        config: {}, logger, emitter, eventBase, session,
        plannerRole, researchContext: null, trackBudget
      });

      expect(result.plannedTask).toContain("build feature");
      expect(result.plannedTask).toContain("Execution plan:");
      expect(result.stageResult.ok).toBe(true);
      expect(result.stageResult.title).toBe("Plan");
    });

    it("throws when planner fails", async () => {
      const { __executeMock } = await import("../src/roles/planner-role.js");
      __executeMock.mockResolvedValue({
        ok: false,
        result: { error: "LLM timeout" },
        summary: "timeout"
      });

      const session = { id: "s1", task: "t", checkpoints: [] };
      const plannerRole = { provider: "claude", model: null };

      await expect(
        runPlannerStage({ config: {}, logger, emitter, eventBase, session, plannerRole, researchContext: null, trackBudget })
      ).rejects.toThrow("Planner failed: LLM timeout");
    });

    it("returns original task when plan output is empty", async () => {
      const { __executeMock } = await import("../src/roles/planner-role.js");
      __executeMock.mockResolvedValue({
        ok: true,
        result: { plan: "" }
      });

      const session = { id: "s1", task: "simple task", checkpoints: [] };
      const plannerRole = { provider: "claude", model: null };
      const result = await runPlannerStage({
        config: {}, logger, emitter, eventBase, session,
        plannerRole, researchContext: null, trackBudget
      });

      expect(result.plannedTask).toBe("simple task");
    });

    it("tracks budget for planner", async () => {
      const { __executeMock } = await import("../src/roles/planner-role.js");
      __executeMock.mockResolvedValue({ ok: true, result: { plan: "step1" } });

      const session = { id: "s1", task: "t", checkpoints: [] };
      const plannerRole = { provider: "claude", model: "model" };
      await runPlannerStage({ config: {}, logger, emitter, eventBase, session, plannerRole, researchContext: null, trackBudget });

      expect(trackBudget).toHaveBeenCalledWith(expect.objectContaining({ role: "planner", provider: "claude" }));
    });
  });
});
