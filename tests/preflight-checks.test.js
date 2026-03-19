import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/utils/agent-detect.js", () => ({
  checkBinary: vi.fn()
}));

vi.mock("../src/sonar/manager.js", () => ({
  isSonarReachable: vi.fn(),
  sonarUp: vi.fn()
}));

vi.mock("../src/utils/process.js", () => ({
  runCommand: vi.fn()
}));

vi.mock("../src/agents/resolve-bin.js", () => ({
  resolveBin: vi.fn((name) => `/usr/bin/${name}`)
}));

describe("preflight-checks", () => {
  let runPreflightChecks;
  let checkBinary, isSonarReachable, sonarUp, runCommand;
  let logger, emitter, eventBase;
  const emittedEvents = [];

  beforeEach(async () => {
    vi.resetAllMocks();
    delete process.env.KJ_SONAR_TOKEN;
    delete process.env.SONAR_TOKEN;
    delete process.env.KJ_SONAR_ADMIN_USER;
    delete process.env.KJ_SONAR_ADMIN_PASSWORD;

    emittedEvents.length = 0;

    checkBinary = (await import("../src/utils/agent-detect.js")).checkBinary;
    isSonarReachable = (await import("../src/sonar/manager.js")).isSonarReachable;
    sonarUp = (await import("../src/sonar/manager.js")).sonarUp;
    runCommand = (await import("../src/utils/process.js")).runCommand;

    checkBinary.mockResolvedValue({ ok: true, version: "v1.0.0", path: "/usr/bin/docker" });
    isSonarReachable.mockResolvedValue(true);
    sonarUp.mockResolvedValue({ exitCode: 0, stdout: "OK", stderr: "" });
    runCommand.mockResolvedValue({ exitCode: 0, stdout: '{"valid":true}', stderr: "" });

    logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    emitter = { emit: vi.fn((_event, data) => emittedEvents.push(data)) };
    eventBase = { sessionId: "test-session", iteration: 0, stage: null, startedAt: Date.now() };

    const mod = await import("../src/orchestrator/preflight-checks.js");
    runPreflightChecks = mod.runPreflightChecks;
  });

  function makeConfig(overrides = {}) {
    return {
      sonarqube: { enabled: true, host: "http://localhost:9000", ...overrides.sonarqube },
      roles: { security: { provider: "claude" }, coder: { provider: "claude" }, ...overrides.roles },
      coder: "claude",
      ...overrides,
    };
  }

  it("skips all checks when sonar and security are both disabled", async () => {
    const config = makeConfig({ sonarqube: { enabled: false } });
    const result = await runPreflightChecks({
      config, logger, emitter, eventBase,
      resolvedPolicies: { sonar: false },
      securityEnabled: false,
    });
    expect(result.ok).toBe(true);
    expect(result.checks).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("disables sonar when Docker is not available", async () => {
    checkBinary.mockResolvedValue({ ok: false, version: "", path: "docker" });
    const result = await runPreflightChecks({
      config: makeConfig(), logger, emitter, eventBase,
      resolvedPolicies: { sonar: true },
      securityEnabled: false,
    });
    expect(result.ok).toBe(true);
    expect(result.configOverrides.sonarDisabled).toBe(true);
    expect(result.warnings).toContainEqual(expect.stringContaining("Docker"));
  });

  it("auto-starts SonarQube when not reachable", async () => {
    isSonarReachable.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    sonarUp.mockResolvedValue({ exitCode: 0, stdout: "started", stderr: "" });
    runCommand.mockImplementation((_cmd, args) => {
      if (args?.some?.(a => typeof a === "string" && a.includes("user_tokens/generate"))) {
        return Promise.resolve({ exitCode: 0, stdout: JSON.stringify({ token: "generated-token" }), stderr: "" });
      }
      return Promise.resolve({ exitCode: 0, stdout: JSON.stringify({ valid: true }), stderr: "" });
    });
    const result = await runPreflightChecks({
      config: makeConfig(), logger, emitter, eventBase,
      resolvedPolicies: { sonar: true },
      securityEnabled: false,
    });
    expect(result.ok).toBe(true);
    expect(result.configOverrides.sonarDisabled).toBeUndefined();
    expect(result.remediations).toContainEqual(expect.stringContaining("auto-started"));
  });

  it("disables sonar when SonarQube not reachable and auto-start fails", async () => {
    isSonarReachable.mockResolvedValue(false);
    sonarUp.mockResolvedValue({ exitCode: 1, stdout: "", stderr: "failed" });
    const result = await runPreflightChecks({
      config: makeConfig(), logger, emitter, eventBase,
      resolvedPolicies: { sonar: true },
      securityEnabled: false,
    });
    expect(result.configOverrides.sonarDisabled).toBe(true);
  });

  it("disables sonar when auth fails", async () => {
    runCommand.mockResolvedValue({ exitCode: 0, stdout: JSON.stringify({ valid: false }), stderr: "" });
    const result = await runPreflightChecks({
      config: makeConfig(), logger, emitter, eventBase,
      resolvedPolicies: { sonar: true },
      securityEnabled: false,
    });
    expect(result.configOverrides.sonarDisabled).toBe(true);
  });

  it("caches sonar token in KJ_SONAR_TOKEN when generated", async () => {
    runCommand.mockImplementation((_cmd, args) => {
      if (args?.some?.(a => typeof a === "string" && a.includes("user_tokens/generate"))) {
        return Promise.resolve({ exitCode: 0, stdout: JSON.stringify({ token: "my-token" }), stderr: "" });
      }
      return Promise.resolve({ exitCode: 0, stdout: JSON.stringify({ valid: true }), stderr: "" });
    });
    const result = await runPreflightChecks({
      config: makeConfig(), logger, emitter, eventBase,
      resolvedPolicies: { sonar: true },
      securityEnabled: false,
    });
    expect(process.env.KJ_SONAR_TOKEN).toBe("my-token");
    expect(result.remediations).toContainEqual(expect.stringContaining("token resolved"));
  });

  it("disables security when agent binary not found", async () => {
    checkBinary.mockImplementation((name) => {
      if (name === "docker") return Promise.resolve({ ok: true, version: "v24.0", path: "/usr/bin/docker" });
      return Promise.resolve({ ok: false, version: "", path: name });
    });
    const result = await runPreflightChecks({
      config: makeConfig({ sonarqube: { enabled: false } }), logger, emitter, eventBase,
      resolvedPolicies: { sonar: false },
      securityEnabled: true,
    });
    expect(result.configOverrides.securityDisabled).toBe(true);
  });

  it("returns ok with no warnings when everything passes", async () => {
    runCommand.mockImplementation((_cmd, args) => {
      if (args?.some?.(a => typeof a === "string" && a.includes("user_tokens/generate"))) {
        return Promise.resolve({ exitCode: 0, stdout: JSON.stringify({ token: "tok" }), stderr: "" });
      }
      return Promise.resolve({ exitCode: 0, stdout: JSON.stringify({ valid: true }), stderr: "" });
    });
    const result = await runPreflightChecks({
      config: makeConfig(), logger, emitter, eventBase,
      resolvedPolicies: { sonar: true },
      securityEnabled: true,
    });
    expect(result.ok).toBe(true);
    expect(result.warnings).toHaveLength(0);
    expect(result.checks.length).toBeGreaterThanOrEqual(3);
  });

  it("emits preflight:start, preflight:check, and preflight:end events", async () => {
    runCommand.mockImplementation((_cmd, args) => {
      if (args?.some?.(a => typeof a === "string" && a.includes("user_tokens/generate"))) {
        return Promise.resolve({ exitCode: 0, stdout: JSON.stringify({ token: "tok" }), stderr: "" });
      }
      return Promise.resolve({ exitCode: 0, stdout: JSON.stringify({ valid: true }), stderr: "" });
    });
    await runPreflightChecks({
      config: makeConfig(), logger, emitter, eventBase,
      resolvedPolicies: { sonar: true },
      securityEnabled: true,
    });
    const eventTypes = emittedEvents.map((e) => e.type);
    expect(eventTypes).toContain("preflight:start");
    expect(eventTypes).toContain("preflight:check");
    expect(eventTypes).toContain("preflight:end");
  });

  it("skips Docker check for external SonarQube", async () => {
    checkBinary.mockResolvedValue({ ok: false, version: "", path: "docker" });
    runCommand.mockImplementation((_cmd, args) => {
      if (args?.some?.(a => typeof a === "string" && a.includes("user_tokens/generate"))) {
        return Promise.resolve({ exitCode: 0, stdout: JSON.stringify({ token: "tok" }), stderr: "" });
      }
      return Promise.resolve({ exitCode: 0, stdout: JSON.stringify({ valid: true }), stderr: "" });
    });
    const config = makeConfig({ sonarqube: { enabled: true, external: true, host: "http://sonar.example.com" } });
    const result = await runPreflightChecks({
      config, logger, emitter, eventBase,
      resolvedPolicies: { sonar: true },
      securityEnabled: false,
    });
    const dockerCheck = result.checks.find((c) => c.name === "docker");
    expect(dockerCheck).toBeUndefined();
    expect(result.configOverrides.sonarDisabled).toBeUndefined();
  });

  it("handles sonarUp throwing an exception gracefully", async () => {
    isSonarReachable.mockResolvedValue(false);
    sonarUp.mockRejectedValue(new Error("compose file missing"));
    const result = await runPreflightChecks({
      config: makeConfig(), logger, emitter, eventBase,
      resolvedPolicies: { sonar: true },
      securityEnabled: false,
    });
    expect(result.ok).toBe(true);
    expect(result.configOverrides.sonarDisabled).toBe(true);
  });
});
