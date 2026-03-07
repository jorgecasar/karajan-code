import { describe, expect, it } from "vitest";
import { buildTriagePrompt, ROLE_DESCRIPTIONS } from "../src/prompts/triage.js";

describe("prompts/triage buildTriagePrompt", () => {
  it("includes the task in the prompt", () => {
    const prompt = buildTriagePrompt({ task: "Fix login bug in auth module" });
    expect(prompt).toContain("Fix login bug in auth module");
  });

  it("includes all role descriptions", () => {
    const prompt = buildTriagePrompt({ task: "Add feature" });
    for (const { role, description } of ROLE_DESCRIPTIONS) {
      expect(prompt).toContain(role);
      expect(prompt).toContain(description);
    }
  });

  it("includes decision guidelines for each role", () => {
    const prompt = buildTriagePrompt({ task: "Refactor API" });
    expect(prompt).toContain("planner");
    expect(prompt).toContain("researcher");
    expect(prompt).toContain("tester");
    expect(prompt).toContain("security");
    expect(prompt).toContain("refactorer");
    expect(prompt).toContain("reviewer");
  });

  it("requests JSON output with expected schema fields", () => {
    const prompt = buildTriagePrompt({ task: "Some task" });
    expect(prompt).toContain("JSON");
    expect(prompt).toContain("level");
    expect(prompt).toContain("roles");
    expect(prompt).toContain("reasoning");
    expect(prompt).toContain("shouldDecompose");
    expect(prompt).toContain("subtasks");
  });

  it("includes instructions when provided", () => {
    const prompt = buildTriagePrompt({
      task: "Add caching",
      instructions: "Always prefer Redis for caching"
    });
    expect(prompt).toContain("Always prefer Redis for caching");
  });

  it("works without optional instructions", () => {
    const prompt = buildTriagePrompt({ task: "Simple fix" });
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(100);
  });

  it("accepts custom availableRoles", () => {
    const customRoles = [
      { role: "custom", description: "A custom role for testing" }
    ];
    const prompt = buildTriagePrompt({ task: "Test", availableRoles: customRoles });
    expect(prompt).toContain("custom");
    expect(prompt).toContain("A custom role for testing");
  });

  it("uses default ROLE_DESCRIPTIONS when availableRoles is not provided", () => {
    const prompt = buildTriagePrompt({ task: "Test" });
    expect(prompt).toContain("Generates an implementation plan");
    expect(prompt).toContain("Investigates the codebase");
  });

  it("includes subagent preamble", () => {
    const prompt = buildTriagePrompt({ task: "Test" });
    expect(prompt).toContain("Karajan sub-agent");
    expect(prompt).toContain("Do NOT use any MCP tools");
  });

  it("mentions that coder is always active", () => {
    const prompt = buildTriagePrompt({ task: "Test" });
    expect(prompt).toContain("coder is ALWAYS active");
  });
});

describe("ROLE_DESCRIPTIONS", () => {
  it("exports an array of role objects", () => {
    expect(Array.isArray(ROLE_DESCRIPTIONS)).toBe(true);
    expect(ROLE_DESCRIPTIONS.length).toBeGreaterThan(0);
  });

  it("each entry has role and description fields", () => {
    for (const entry of ROLE_DESCRIPTIONS) {
      expect(typeof entry.role).toBe("string");
      expect(typeof entry.description).toBe("string");
      expect(entry.role.length).toBeGreaterThan(0);
      expect(entry.description.length).toBeGreaterThan(0);
    }
  });

  it("includes planner, researcher, tester, security, refactorer, reviewer", () => {
    const roles = ROLE_DESCRIPTIONS.map((r) => r.role);
    expect(roles).toContain("planner");
    expect(roles).toContain("researcher");
    expect(roles).toContain("tester");
    expect(roles).toContain("security");
    expect(roles).toContain("refactorer");
    expect(roles).toContain("reviewer");
  });
});
