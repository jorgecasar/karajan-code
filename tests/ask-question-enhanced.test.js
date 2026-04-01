import { describe, it, expect, vi, beforeEach } from "vitest";

// We test buildAskQuestion and parseStructuredResponse directly.
// No need to mock fs here — shared-helpers.js doesn't use it for askQuestion.

const { buildAskQuestion, parseStructuredResponse } = await import("../src/mcp/shared-helpers.js");

function createMockServer({ hasElicitation = true, elicitResult = null } = {}) {
  const server = {
    getClientCapabilities: vi.fn(() => hasElicitation ? { elicitation: { form: {} } } : {}),
    elicitInput: vi.fn(async () => elicitResult || { action: "accept", content: { answer: "test" } })
  };
  return server;
}

describe("buildAskQuestion", () => {
  describe(".interactive property", () => {
    it("is true when host supports elicitation", () => {
      const server = createMockServer({ hasElicitation: true });
      const askQuestion = buildAskQuestion(server);

      expect(askQuestion.interactive).toBe(true);
    });

    it("is false when host does not support elicitation", () => {
      const server = createMockServer({ hasElicitation: false });
      const askQuestion = buildAskQuestion(server);

      expect(askQuestion.interactive).toBe(false);
    });

    it("is false when getClientCapabilities is not available", () => {
      const server = { elicitInput: vi.fn() };
      const askQuestion = buildAskQuestion(server);

      expect(askQuestion.interactive).toBe(false);
    });

    it("is false when getClientCapabilities returns undefined", () => {
      const server = {
        getClientCapabilities: vi.fn(() => undefined),
        elicitInput: vi.fn()
      };
      const askQuestion = buildAskQuestion(server);

      expect(askQuestion.interactive).toBe(false);
    });
  });

  describe("plain string questions (backward compatible)", () => {
    it("sends string question via elicitInput and returns answer", async () => {
      const server = createMockServer({
        hasElicitation: true,
        elicitResult: { action: "accept", content: { answer: "continue" } }
      });
      const askQuestion = buildAskQuestion(server);

      const result = await askQuestion("What should I do?");

      expect(result).toBe("continue");
      expect(server.elicitInput).toHaveBeenCalledTimes(1);
    });

    it("returns null when user cancels", async () => {
      const server = createMockServer({
        hasElicitation: true,
        elicitResult: { action: "cancel" }
      });
      const askQuestion = buildAskQuestion(server);

      const result = await askQuestion("Continue?");

      expect(result).toBeNull();
    });

    it("returns null without calling elicitInput when not interactive", async () => {
      const server = createMockServer({ hasElicitation: false });
      const askQuestion = buildAskQuestion(server);

      const result = await askQuestion("Continue?");

      expect(result).toBeNull();
      expect(server.elicitInput).not.toHaveBeenCalled();
    });

    it("returns null on elicitInput exception", async () => {
      const server = createMockServer({ hasElicitation: true });
      server.elicitInput.mockRejectedValue(new Error("network error"));
      const askQuestion = buildAskQuestion(server);

      const result = await askQuestion("Continue?");

      expect(result).toBeNull();
    });
  });

  describe("structured questions", () => {
    it("formats multi-select question with numbered options", async () => {
      const server = createMockServer({
        hasElicitation: true,
        elicitResult: { action: "accept", content: { answer: "1,2" } }
      });
      const askQuestion = buildAskQuestion(server);

      const result = await askQuestion({
        message: "Select domains:",
        type: "multi-select",
        options: [
          { id: "dental", label: "Dental Clinical v1.0" },
          { id: "logistics", label: "Logistics v2.0" },
          { id: "finance", label: "Finance v1.0" }
        ]
      });

      // Should return the selected option ids
      expect(result).toEqual(["dental", "logistics"]);
    });

    it("handles 'all' response for multi-select", async () => {
      const server = createMockServer({
        hasElicitation: true,
        elicitResult: { action: "accept", content: { answer: "all" } }
      });
      const askQuestion = buildAskQuestion(server);

      const result = await askQuestion({
        message: "Select:",
        type: "multi-select",
        options: [
          { id: "a", label: "A" },
          { id: "b", label: "B" }
        ]
      });

      expect(result).toEqual(["a", "b"]);
    });

    it("handles 'none' response for multi-select", async () => {
      const server = createMockServer({
        hasElicitation: true,
        elicitResult: { action: "accept", content: { answer: "none" } }
      });
      const askQuestion = buildAskQuestion(server);

      const result = await askQuestion({
        message: "Select:",
        type: "multi-select",
        options: [{ id: "a", label: "A" }]
      });

      expect(result).toEqual([]);
    });

    it("formats confirm question and parses yes/no", async () => {
      const server = createMockServer({
        hasElicitation: true,
        elicitResult: { action: "accept", content: { answer: "yes" } }
      });
      const askQuestion = buildAskQuestion(server);

      const result = await askQuestion({
        message: "Generate base domain knowledge?",
        type: "confirm"
      });

      expect(result).toBe(true);
    });

    it("parses 'no' for confirm question", async () => {
      const server = createMockServer({
        hasElicitation: true,
        elicitResult: { action: "accept", content: { answer: "no" } }
      });
      const askQuestion = buildAskQuestion(server);

      const result = await askQuestion({
        message: "Continue?",
        type: "confirm"
      });

      expect(result).toBe(false);
    });

    it("formats select question and returns single id", async () => {
      const server = createMockServer({
        hasElicitation: true,
        elicitResult: { action: "accept", content: { answer: "2" } }
      });
      const askQuestion = buildAskQuestion(server);

      const result = await askQuestion({
        message: "Choose:",
        type: "select",
        options: [
          { id: "opt-a", label: "Option A" },
          { id: "opt-b", label: "Option B" }
        ]
      });

      expect(result).toBe("opt-b");
    });

    it("returns defaults when not interactive", async () => {
      const server = createMockServer({ hasElicitation: false });
      const askQuestion = buildAskQuestion(server);

      const result = await askQuestion({
        message: "Select:",
        type: "multi-select",
        options: [
          { id: "a", label: "A", default: true },
          { id: "b", label: "B", default: false },
          { id: "c", label: "C", default: true }
        ],
        defaults: ["a", "c"]
      });

      expect(result).toEqual(["a", "c"]);
    });

    it("returns null defaults for text type when not interactive", async () => {
      const server = createMockServer({ hasElicitation: false });
      const askQuestion = buildAskQuestion(server);

      const result = await askQuestion({
        message: "Provide path:",
        type: "text"
      });

      expect(result).toBeNull();
    });
  });
});

describe("parseStructuredResponse", () => {
  it("parses comma-separated numbers for multi-select", () => {
    const options = [
      { id: "a", label: "A" },
      { id: "b", label: "B" },
      { id: "c", label: "C" }
    ];

    expect(parseStructuredResponse("1,3", "multi-select", options)).toEqual(["a", "c"]);
    expect(parseStructuredResponse("2", "multi-select", options)).toEqual(["b"]);
  });

  it("handles 'all' and 'none' keywords", () => {
    const options = [{ id: "a", label: "A" }, { id: "b", label: "B" }];

    expect(parseStructuredResponse("all", "multi-select", options)).toEqual(["a", "b"]);
    expect(parseStructuredResponse("none", "multi-select", options)).toEqual([]);
  });

  it("parses yes/no/si for confirm type", () => {
    expect(parseStructuredResponse("yes", "confirm")).toBe(true);
    expect(parseStructuredResponse("y", "confirm")).toBe(true);
    expect(parseStructuredResponse("si", "confirm")).toBe(true);
    expect(parseStructuredResponse("sí", "confirm")).toBe(true);
    expect(parseStructuredResponse("no", "confirm")).toBe(false);
    expect(parseStructuredResponse("n", "confirm")).toBe(false);
  });

  it("parses single number for select type", () => {
    const options = [{ id: "opt-a", label: "A" }, { id: "opt-b", label: "B" }];

    expect(parseStructuredResponse("1", "select", options)).toBe("opt-a");
    expect(parseStructuredResponse("2", "select", options)).toBe("opt-b");
  });

  it("returns raw text for text type", () => {
    expect(parseStructuredResponse("some path here", "text")).toBe("some path here");
  });

  it("handles whitespace in responses", () => {
    const options = [{ id: "a", label: "A" }, { id: "b", label: "B" }];
    expect(parseStructuredResponse(" 1 , 2 ", "multi-select", options)).toEqual(["a", "b"]);
  });
});
