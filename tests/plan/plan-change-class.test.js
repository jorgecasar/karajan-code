// KJC-TSK-1061 (SPD-A2): the planner asks each step that changes code already
// written for its change_class and criterion (REWORK reasoned as the greenfield
// alternative winning), and kj plan generate carries them onto the HU.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { mkdtempSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createNoopLoggerWithContext } from "../_fixtures/loggers.js";

vi.mock("../../src/agents/index.js", () => ({ createAgent: vi.fn() }));
vi.mock("../../src/agents/availability.js", () => ({ assertAgentsAvailable: vi.fn() }));
vi.mock("../../src/config.js", () => ({ resolveRole: vi.fn(() => ({ provider: "claude" })) }));

const planned = JSON.stringify({
  approach: "harden, then regenerate",
  steps: [
    { id: "H", description: "[PARSER] Kill the parser's surviving mutants", change_class: "extend", change_criterion: "adds tests only", hardens: "src/parser.js", acceptance_tests: [{ type: "shell", content: "t" }] },
    { id: "R", description: "[PARSER] Regenerate the parser", change_class: "rework", change_criterion: " greenfield wins: one pass, no regex soup ", dependencies: ["H"], acceptance_tests: [{ type: "shell", content: "t" }] },
    { id: "N", description: "[UI] New page", change_class: 7, acceptance_tests: [{ type: "shell", content: "t" }] },
  ],
});

let home;
beforeEach(async () => {
  home = mkdtempSync(join(tmpdir(), "kj-change-class-"));
  process.env.KJ_HOME = home;
  const agents = await import("../../src/agents/index.js");
  agents.createAgent.mockReturnValue({ runTask: vi.fn().mockResolvedValue({ ok: true, output: planned, exitCode: 0 }) });
});
afterEach(() => { rmSync(home, { recursive: true, force: true }); delete process.env.KJ_HOME; });

const onlyPlan = () => {
  const root = join(home, "plans");
  const dir = join(root, readdirSync(root)[0]);
  return JSON.parse(readFileSync(join(dir, readdirSync(dir).find((f) => f.startsWith("plan-"))), "utf8"));
};

describe("planner change classification", () => {
  it("the prompt asks for change_class, change_criterion and hardens, tied to the alternatives clause", async () => {
    const { buildPlannerPrompt } = await vi.importActual("../../src/prompts/planner.js");
    const prompt = buildPlannerPrompt({ task: "regenerate the parser" });
    expect(prompt).toMatch(/"change_class": "<extend \| rework \| rebuild/);
    expect(prompt).toMatch(/greenfield alternative/);
    expect(prompt).toMatch(/kj plan license/);
    expect(prompt).toMatch(/"hardens"/);
  });

  it("kj plan generate carries the classification onto each HU, trimmed; a non-string is dropped", async () => {
    const { planGenerateCommand } = await import("../../src/commands/plan/generate.js");
    await planGenerateCommand({
      task: "regenerate the parser",
      config: { roles: { planner: { provider: "claude" } }, session: { max_iteration_minutes: 10 }, projectDir: home },
      logger: createNoopLoggerWithContext(), json: true,
      flags: { yes: true, interactive: false, "no-tests-synth": true, "no-plan-review": true, preflightHu: false },
    });
    const [h, r, n] = onlyPlan().hus;
    expect(h).toMatchObject({ change_class: "extend", change_criterion: "adds tests only", hardens: "src/parser.js" });
    expect(r).toMatchObject({ change_class: "rework", change_criterion: "greenfield wins: one pass, no regex soup", blocked_by: [h.id] });
    expect("change_class" in n).toBe(false);
  });
});
