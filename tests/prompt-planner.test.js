import { describe, expect, it } from "vitest";
import { buildPlannerPrompt } from "../src/prompts/planner.js";

describe("prompts/planner buildPlannerPrompt", () => {
  it("includes the task in the prompt", () => {
    const prompt = buildPlannerPrompt({ task: "Add user authentication" });
    expect(prompt).toContain("Add user authentication");
  });

  it("requests JSON output with required fields", () => {
    const prompt = buildPlannerPrompt({ task: "Refactor DB layer" });
    expect(prompt).toContain("approach");
    expect(prompt).toContain("steps");
    expect(prompt).toContain("risks");
    expect(prompt).toContain("outOfScope");
  });

  it("includes context when provided", () => {
    const prompt = buildPlannerPrompt({
      task: "Add caching",
      context: "We use Redis in production"
    });
    expect(prompt).toContain("Redis");
  });

  it("works without optional context", () => {
    const prompt = buildPlannerPrompt({ task: "Simple fix" });
    expect(typeof prompt).toBe("string");
    expect(prompt.length).toBeGreaterThan(50);
  });

  it("requests each step to be a single commit", () => {
    const prompt = buildPlannerPrompt({ task: "Big refactor" });
    expect(prompt.toLowerCase()).toContain("commit");
  });

  it("asks for structured JSON format", () => {
    const prompt = buildPlannerPrompt({ task: "Add feature" });
    expect(prompt).toContain("JSON");
  });

  it("includes architecture context section when architectContext is provided", () => {
    const architectContext = {
      architecture: {
        type: "layered",
        layers: ["API", "Service", "Repository"],
        patterns: ["Factory", "Observer"],
        dataModel: { entities: ["User", "Order"] },
        apiContracts: ["POST /users", "GET /orders"],
        tradeoffs: ["Simplicity over flexibility"]
      },
      summary: "Layered architecture with factory pattern"
    };
    const prompt = buildPlannerPrompt({ task: "Add feature", architectContext });
    expect(prompt).toContain("Architecture Context");
    expect(prompt).toContain("layered");
    expect(prompt).toContain("API, Service, Repository");
    expect(prompt).toContain("Factory, Observer");
    expect(prompt).toContain("User, Order");
    expect(prompt).toContain("POST /users");
    expect(prompt).toContain("Simplicity over flexibility");
    expect(prompt).toContain("Layered architecture with factory pattern");
  });

  it("omits architecture context section when architectContext is not provided", () => {
    const prompt = buildPlannerPrompt({ task: "Simple fix" });
    expect(prompt).not.toContain("Architecture Context");
  });

  it("handles partial architectContext gracefully", () => {
    const architectContext = {
      architecture: { type: "monolith", layers: [], patterns: [] },
      summary: "Simple monolith"
    };
    const prompt = buildPlannerPrompt({ task: "Fix bug", architectContext });
    expect(prompt).toContain("Architecture Context");
    expect(prompt).toContain("monolith");
    expect(prompt).toContain("Simple monolith");
    expect(prompt).not.toContain("Layers:");
    expect(prompt).not.toContain("Patterns:");
  });
});
