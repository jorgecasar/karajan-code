import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";
import { ROLE_EVENTS } from "../src/roles/base-role.js";

const mockRunTask = vi.fn();
const mockCreateAgent = vi.fn(() => ({ runTask: mockRunTask }));

const { ArchitectRole } = await import("../src/roles/architect-role.js");

const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), setContext: vi.fn() };

const sampleArchitectOutput = JSON.stringify({
  verdict: "ready",
  architecture: {
    type: "layered",
    layers: ["presentation", "business", "data"],
    patterns: ["repository", "factory"],
    dataModel: { entities: ["User", "Session"] },
    apiContracts: ["POST /auth/login", "GET /auth/me"],
    dependencies: ["bcrypt", "jsonwebtoken"],
    tradeoffs: ["JWT vs session cookies"]
  },
  questions: [],
  summary: "Well-defined auth architecture"
});

describe("ArchitectRole", () => {
  let emitter;
  const config = {
    roles: { architect: { provider: "claude", model: null }, coder: { provider: "claude" } },
    development: {}
  };

  beforeEach(() => {
    vi.resetAllMocks();
    emitter = new EventEmitter();

    mockRunTask.mockResolvedValue({
      ok: true,
      output: sampleArchitectOutput,
      error: "",
      exitCode: 0
    });
  });

  it("extends BaseRole and has name 'architect'", () => {
    const role = new ArchitectRole({ config, logger, createAgentFn: mockCreateAgent });
    expect(role.name).toBe("architect");
  });

  it("requires init() before run()", async () => {
    const role = new ArchitectRole({ config, logger, createAgentFn: mockCreateAgent });
    await expect(role.run("task")).rejects.toThrow("init() must be called before run()");
  });

  it("creates agent and calls runTask on execute", async () => {
    const role = new ArchitectRole({ config, logger, createAgentFn: mockCreateAgent });
    await role.init({});
    const output = await role.run("Design auth system");

    expect(mockCreateAgent).toHaveBeenCalledWith("claude", config, logger);
    expect(mockRunTask).toHaveBeenCalled();
    expect(output.ok).toBe(true);
  });

  it("passes task in prompt to agent", async () => {
    const role = new ArchitectRole({ config, logger, createAgentFn: mockCreateAgent });
    await role.init({});
    await role.run("Design auth system");

    const callArgs = mockRunTask.mock.calls[0][0];
    expect(callArgs.prompt).toContain("Design auth system");
    expect(callArgs.role).toBe("architect");
  });

  it("accepts string input as task shorthand", async () => {
    const role = new ArchitectRole({ config, logger, createAgentFn: mockCreateAgent });
    await role.init({});
    const output = await role.run("Design microservices");

    expect(output.ok).toBe(true);
    const callArgs = mockRunTask.mock.calls[0][0];
    expect(callArgs.prompt).toContain("Design microservices");
  });

  it("accepts object input with task field", async () => {
    const role = new ArchitectRole({ config, logger, createAgentFn: mockCreateAgent });
    await role.init({});
    const output = await role.run({ task: "Design API layer" });

    expect(output.ok).toBe(true);
    const callArgs = mockRunTask.mock.calls[0][0];
    expect(callArgs.prompt).toContain("Design API layer");
  });

  it("uses task from context when not provided in input", async () => {
    const role = new ArchitectRole({ config, logger, createAgentFn: mockCreateAgent });
    await role.init({ task: "Context task" });
    await role.run({});

    const callArgs = mockRunTask.mock.calls[0][0];
    expect(callArgs.prompt).toContain("Context task");
  });

  it("passes researchContext to prompt builder", async () => {
    const role = new ArchitectRole({ config, logger, createAgentFn: mockCreateAgent });
    await role.init({});
    await role.run({ task: "Design auth", researchContext: "Files: src/auth.js, src/session.js" });

    const callArgs = mockRunTask.mock.calls[0][0];
    expect(callArgs.prompt).toContain("Files: src/auth.js");
  });

  it("parses JSON output into structured result", async () => {
    const role = new ArchitectRole({ config, logger, createAgentFn: mockCreateAgent });
    await role.init({});
    const output = await role.run("Design auth");

    expect(output.result.verdict).toBe("ready");
    expect(output.result.architecture.type).toBe("layered");
    expect(output.result.architecture.layers).toEqual(["presentation", "business", "data"]);
    expect(output.result.architecture.patterns).toEqual(["repository", "factory"]);
    expect(output.result.architecture.dataModel.entities).toEqual(["User", "Session"]);
    expect(output.result.architecture.apiContracts).toEqual(["POST /auth/login", "GET /auth/me"]);
    expect(output.result.architecture.dependencies).toEqual(["bcrypt", "jsonwebtoken"]);
    expect(output.result.architecture.tradeoffs).toEqual(["JWT vs session cookies"]);
    expect(output.result.questions).toEqual([]);
  });

  it("handles JSON embedded in markdown code blocks", async () => {
    mockRunTask.mockResolvedValue({
      ok: true,
      output: `Here is the architecture:\n\`\`\`json\n${sampleArchitectOutput}\n\`\`\`\nDone.`,
      error: "",
      exitCode: 0
    });

    const role = new ArchitectRole({ config, logger, createAgentFn: mockCreateAgent });
    await role.init({});
    const output = await role.run("Task");

    expect(output.ok).toBe(true);
    expect(output.result.architecture.type).toBe("layered");
  });

  it("returns ok=true with empty architecture when JSON parse fails", async () => {
    mockRunTask.mockResolvedValue({
      ok: true,
      output: "No JSON here, just plain text about architecture.",
      error: "",
      exitCode: 0
    });

    const role = new ArchitectRole({ config, logger, createAgentFn: mockCreateAgent });
    await role.init({});
    const output = await role.run("Task");

    expect(output.ok).toBe(true);
    expect(output.result.raw).toContain("plain text");
    expect(output.result.architecture.layers).toEqual([]);
  });

  it("returns ok=false when agent fails", async () => {
    mockRunTask.mockResolvedValue({
      ok: false,
      output: "",
      error: "Agent timed out",
      exitCode: 1
    });

    const role = new ArchitectRole({ config, logger, createAgentFn: mockCreateAgent });
    await role.init({});
    const output = await role.run("Task");

    expect(output.ok).toBe(false);
    expect(output.result.error).toContain("Agent timed out");
    expect(output.summary).toContain("failed");
  });

  it("includes provider in result", async () => {
    const role = new ArchitectRole({ config, logger, createAgentFn: mockCreateAgent });
    await role.init({});
    const output = await role.run("Task");

    expect(output.result.provider).toBe("claude");
  });

  it("emits role:start and role:end events", async () => {
    const events = [];
    emitter.on(ROLE_EVENTS.START, (e) => events.push({ type: "start", ...e }));
    emitter.on(ROLE_EVENTS.END, (e) => events.push({ type: "end", ...e }));

    const role = new ArchitectRole({ config, logger, emitter, createAgentFn: mockCreateAgent });
    await role.init({ iteration: 1 });
    await role.run("Task");

    expect(events).toHaveLength(2);
    expect(events[0].type).toBe("start");
    expect(events[0].role).toBe("architect");
    expect(events[1].type).toBe("end");
  });

  it("emits role:error when agent throws", async () => {
    mockRunTask.mockRejectedValue(new Error("Binary not found"));

    const events = [];
    emitter.on(ROLE_EVENTS.ERROR, (e) => events.push(e));

    const role = new ArchitectRole({ config, logger, emitter, createAgentFn: mockCreateAgent });
    await role.init({});
    await expect(role.run("Task")).rejects.toThrow("Binary not found");

    expect(events).toHaveLength(1);
    expect(events[0].error).toContain("Binary not found");
  });

  it("report() returns structured architect report", async () => {
    const role = new ArchitectRole({ config, logger, createAgentFn: mockCreateAgent });
    await role.init({});
    await role.run("Design system");

    const report = role.report();
    expect(report.role).toBe("architect");
    expect(report.ok).toBe(true);
    expect(report.summary).toBeTruthy();
    expect(report.timestamp).toBeTruthy();
  });

  it("resolves provider from config.roles.architect.provider", async () => {
    const customConfig = {
      roles: { architect: { provider: "codex" } },
      development: {}
    };

    const role = new ArchitectRole({ config: customConfig, logger, createAgentFn: mockCreateAgent });
    await role.init({});
    await role.run("Task");

    expect(mockCreateAgent).toHaveBeenCalledWith("codex", customConfig, logger);
  });

  it("falls back to coder provider when architect provider is null", async () => {
    const fallbackConfig = {
      roles: { architect: { provider: null }, coder: { provider: "gemini" } },
      development: {}
    };

    const role = new ArchitectRole({ config: fallbackConfig, logger, createAgentFn: mockCreateAgent });
    await role.init({});
    await role.run("Task");

    expect(mockCreateAgent).toHaveBeenCalledWith("gemini", fallbackConfig, logger);
  });

  it("defaults to 'claude' when no provider configured", async () => {
    const minConfig = { roles: {}, development: {} };

    const role = new ArchitectRole({ config: minConfig, logger, createAgentFn: mockCreateAgent });
    await role.init({});
    await role.run("Task");

    expect(mockCreateAgent).toHaveBeenCalledWith("claude", minConfig, logger);
  });

  it("works without emitter", async () => {
    const role = new ArchitectRole({ config, logger, createAgentFn: mockCreateAgent });
    await role.init({});
    const output = await role.run("Task");

    expect(output.ok).toBe(true);
  });

  it("generates meaningful summary from parsed output", async () => {
    const role = new ArchitectRole({ config, logger, createAgentFn: mockCreateAgent });
    await role.init({});
    const output = await role.run("Task");

    expect(output.summary).toContain("layered");
    expect(output.summary).toContain("3 layers");
    expect(output.summary).toContain("2 patterns");
  });

  it("generates summary with questions count when needs_clarification", async () => {
    mockRunTask.mockResolvedValue({
      ok: true,
      output: JSON.stringify({
        verdict: "needs_clarification",
        architecture: { type: "tbd", layers: [], patterns: [], dataModel: { entities: [] }, apiContracts: [], dependencies: [], tradeoffs: [] },
        questions: ["Which DB?", "Which auth provider?", "REST or GraphQL?"],
        summary: "Needs decisions"
      }),
      error: "",
      exitCode: 0
    });

    const role = new ArchitectRole({ config, logger, createAgentFn: mockCreateAgent });
    await role.init({});
    const output = await role.run("Task");

    expect(output.summary).toContain("3 question");
  });

  it("passes onOutput callback to agent", async () => {
    const onOutput = vi.fn();
    const role = new ArchitectRole({ config, logger, createAgentFn: mockCreateAgent });
    await role.init({});
    await role.run({ task: "x", onOutput });

    const runArgs = mockRunTask.mock.calls[0][0];
    expect(runArgs.onOutput).toBe(onOutput);
  });

  it("forwards usage from agent result", async () => {
    mockRunTask.mockResolvedValue({
      ok: true,
      output: sampleArchitectOutput,
      usage: { input_tokens: 200, output_tokens: 100 }
    });

    const role = new ArchitectRole({ config, logger, createAgentFn: mockCreateAgent });
    await role.init({});
    const output = await role.run("Task");

    expect(output.usage).toEqual({ input_tokens: 200, output_tokens: 100 });
  });
});
