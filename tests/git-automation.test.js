import { describe, expect, it } from "vitest";
import { commitMessageFromTask, buildPrBody } from "../src/git/automation.js";

describe("commitMessageFromTask", () => {
  it("generates feat: prefix with truncated task", () => {
    const msg = commitMessageFromTask("Add login feature");
    expect(msg).toBe("feat: Add login feature");
  });

  it("truncates task to 72 chars", () => {
    const longTask = "A".repeat(100);
    const msg = commitMessageFromTask(longTask);
    expect(msg).toBe(`feat: ${"A".repeat(72)}`);
  });

  it("collapses whitespace", () => {
    const msg = commitMessageFromTask("Fix   the\n  bug\t here");
    expect(msg).toBe("feat: Fix the bug here");
  });

  it("uses fallback for empty task", () => {
    expect(commitMessageFromTask("")).toBe("feat: karajan update");
    expect(commitMessageFromTask(null)).toBe("feat: karajan update");
    expect(commitMessageFromTask(undefined)).toBe("feat: karajan update");
  });
});

describe("buildPrBody", () => {
  it("returns basic body when no stageResults", () => {
    const body = buildPrBody({ task: "Fix bug" });
    expect(body).toContain("Created by Karajan Code.");
    expect(body).not.toContain("## Approach");
    expect(body).not.toContain("## Pending subtasks");
  });

  it("includes approach and steps from planner", () => {
    const body = buildPrBody({
      task: "Add feature",
      stageResults: {
        planner: {
          ok: true,
          approach: "Use factory pattern to create widgets",
          steps: ["Create BaseWidget class", "Add unit tests", "Integrate into orchestrator"]
        }
      }
    });

    expect(body).toContain("## Approach");
    expect(body).toContain("Use factory pattern");
    expect(body).toContain("## Steps");
    expect(body).toContain("1. Create BaseWidget class");
    expect(body).toContain("2. Add unit tests");
    expect(body).toContain("3. Integrate into orchestrator");
  });

  it("includes pending subtasks when triage recommended decomposition", () => {
    const body = buildPrBody({
      task: "Refactor auth system",
      stageResults: {
        triage: {
          shouldDecompose: true,
          subtasks: [
            "Extract auth module into separate service",
            "Update API endpoints to use new auth service",
            "Add integration tests for auth flow"
          ]
        }
      }
    });

    expect(body).toContain("## Pending subtasks");
    expect(body).toContain("- [ ] Update API endpoints");
    expect(body).toContain("- [ ] Add integration tests");
    // First subtask is being worked on, so not listed as pending
    expect(body).not.toContain("- [ ] Extract auth module");
  });

  it("does not include pending subtasks when shouldDecompose is false", () => {
    const body = buildPrBody({
      task: "Fix typo",
      stageResults: {
        triage: {
          shouldDecompose: false,
          subtasks: []
        }
      }
    });

    expect(body).not.toContain("## Pending subtasks");
  });

  it("combines planner approach and decomposition subtasks", () => {
    const body = buildPrBody({
      task: "Big refactor",
      stageResults: {
        planner: {
          ok: true,
          approach: "Extract module first",
          steps: ["Create module", "Add tests"]
        },
        triage: {
          shouldDecompose: true,
          subtasks: ["Extract module", "Update consumers", "Add E2E tests"]
        }
      }
    });

    expect(body).toContain("## Approach");
    expect(body).toContain("## Steps");
    expect(body).toContain("## Pending subtasks");
    expect(body).toContain("- [ ] Update consumers");
    expect(body).toContain("- [ ] Add E2E tests");
  });

  it("handles single subtask without pending section", () => {
    const body = buildPrBody({
      task: "Small task",
      stageResults: {
        triage: {
          shouldDecompose: true,
          subtasks: ["Only one subtask"]
        }
      }
    });

    // Only 1 subtask = the current one, no pending
    expect(body).not.toContain("## Pending subtasks");
  });
});
