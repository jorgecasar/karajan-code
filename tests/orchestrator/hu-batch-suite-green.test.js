// KJC-BUG-0328 (#2088): a plan HU was APPROVED on its own acceptance tests while
// the project's suite (npm test) was red. Before approving a code HU, the batch
// runs the project's test command, and a red suite goes back to the coder.
import { beforeEach, describe, expect, it, vi } from "vitest";

const runCoderStageMock = vi.fn(async () => ({ ok: true }));
const suiteGreenMock = vi.fn();
const acceptanceMock = vi.fn(async () => ({ allPassed: true, summary: "ok", results: [] }));

vi.mock("../../src/orchestrator/hu-sub-pipeline.js", () => ({
  needsSubPipeline: () => true,
  runHuSubPipeline: vi.fn(async ({ runIterationFn }) => {
    const story = { id: "hu_p_001", task_type: "sw", status: "certified", certified: { title: "T" }, acceptance_tests: ["test -f x"] };
    const res = await runIterationFn("do x", story, {});
    return { approved: res.approved, results: [res], blockedIds: [] };
  }),
}));
vi.mock("../../src/orchestrator/stages/coder-stage.js", () => ({ runCoderStage: (...a) => runCoderStageMock(...a) }));
vi.mock("../../src/orchestrator/stages/sonar-stage.js", () => ({ runSonarStage: vi.fn() }));
vi.mock("../../src/orchestrator/stages/suite-green-stage.js", async (orig) => ({
  ...(await orig()), runSuiteGreenStage: (...a) => suiteGreenMock(...a),
}));
vi.mock("../../src/orchestrator/drivers/iteration-loop.js", () => ({ runIterationLoop: vi.fn() }));
vi.mock("../../src/orchestrator/drivers/post-loop.js", () => ({ writeHistoryRecord: vi.fn() }));
vi.mock("../../src/git/hu-snapshot.js", () => ({ createHuSnapshot: vi.fn(async () => ({ ok: false, error: "skip" })) }));
vi.mock("../../src/git/hu-automation.js", () => ({
  prepareHuBranch: vi.fn(async () => "feat/b"), finalizeHuCommit: vi.fn(async () => ({ committed: true })), collectGitWarnings: () => [],
}));
vi.mock("../../src/guards/policy-resolver.js", () => ({
  effectiveTaskType: () => "sw",
  applyPolicies: () => ({ reviewer: false, tdd: true, sonar: false, testsRequired: true }),
}));
vi.mock("../../src/plan/adr-loader.js", () => ({ loadActiveAdrs: vi.fn(async () => []) }));
vi.mock("../../src/hu/acceptance-runner.js", () => ({ runAcceptanceTests: (...a) => acceptanceMock(...a), buildDiagnosticPrompt: vi.fn(() => "") }));

const { runHuBatch } = await import("../../src/orchestrator/drivers/run-hu-batch.js");

const ctx = (development) => ({
  config: { projectDir: "/proj", hu_max_iterations: 3, development, sonarqube: { enabled: false }, policies: {}, git: { auto_commit: true } },
  pipelineFlags: { reviewerEnabled: true, testerEnabled: true },
  session: { id: "s_1", last_reviewer_feedback: null },
  brainCtx: { enabled: false },
  stageResults: { huReviewer: { certified: 1, total: 1, planId: null, review: null } },
  eventBase: { sessionId: "s_1", iteration: 0, stage: null, startedAt: 1 },
  coderRoleInstance: {}, coderRole: { provider: "claude" }, trackBudget: vi.fn(), budgetTracker: null, plannedTask: "do x",
});
const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), setContext: vi.fn() };

describe("HU batch: the project's suite is green before an HU is approved", () => {
  beforeEach(() => vi.clearAllMocks());

  it("a red suite goes back to the coder, and the HU is approved once it is green", async () => {
    suiteGreenMock.mockResolvedValueOnce({ action: "continue", result: { ran: true, ok: false } })
      .mockResolvedValueOnce({ action: "ok", result: { ran: true, ok: true } });
    const { result } = await runHuBatch({ ctx: ctx({ methodology: "tdd" }), task: "t", askQuestion: vi.fn(), emitter: { emit: vi.fn() }, logger });
    expect(result.approved).toBe(true);
    expect(runCoderStageMock).toHaveBeenCalledTimes(2);
    expect(suiteGreenMock).toHaveBeenCalledTimes(2);
    expect(acceptanceMock).toHaveBeenCalledTimes(1); // only once the suite is green
  });

  it("require_green_suite: false skips it, as in the iteration loop", async () => {
    await runHuBatch({ ctx: ctx({ methodology: "tdd", require_green_suite: false }), task: "t", askQuestion: vi.fn(), emitter: { emit: vi.fn() }, logger });
    expect(suiteGreenMock).not.toHaveBeenCalled();
  });
});
