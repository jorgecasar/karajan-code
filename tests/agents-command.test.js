import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../src/config.js", () => ({
  loadConfig: vi.fn(),
  writeConfig: vi.fn(),
  getConfigPath: vi.fn(() => "/home/user/.karajan/kj.config.yml"),
  resolveRole: vi.fn((config, role) => {
    const roles = config?.roles || {};
    return {
      provider: roles[role]?.provider || "claude",
      model: roles[role]?.model || null
    };
  })
}));

vi.mock("../src/utils/agent-detect.js", () => ({
  checkBinary: vi.fn(async () => ({ ok: false })),
  KNOWN_AGENTS: [
    { name: "claude", install: "npm i -g @anthropic-ai/claude-code" },
    { name: "codex", install: "npm i -g @openai/codex" },
    { name: "gemini", install: "npm i -g @anthropic-ai/gemini" },
    { name: "aider", install: "pip install aider-chat" }
  ]
}));

vi.mock("../src/mcp/preflight.js", () => ({
  setSessionOverride: vi.fn(),
  getSessionOverrides: vi.fn(() => ({})),
  isPreflightAcked: vi.fn(() => false),
  ackPreflight: vi.fn(),
  resetPreflight: vi.fn()
}));

const { listAgents, setAgent } = await import("../src/commands/agents.js");
const { loadConfig, writeConfig, getConfigPath } = await import("../src/config.js");
const { setSessionOverride } = await import("../src/mcp/preflight.js");

describe("agents command", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("listAgents", () => {
    it("lists all assignable roles with their providers", () => {
      const config = {
        roles: {
          coder: { provider: "claude", model: "opus" },
          reviewer: { provider: "codex", model: null }
        }
      };
      const agents = listAgents(config);

      expect(agents.length).toBe(9);
      expect(agents.find((a) => a.role === "coder").provider).toBe("claude");
      expect(agents.find((a) => a.role === "reviewer").provider).toBe("codex");
    });

    it("shows - for roles without explicit provider", () => {
      const config = { roles: {} };
      // resolveRole mock returns "claude" by default
      const agents = listAgents(config);
      expect(agents.every((a) => a.provider)).toBe(true);
    });
  });

  describe("setAgent", () => {
    it("updates role provider in config and writes to disk with global=true", async () => {
      loadConfig.mockResolvedValue({
        config: { roles: { coder: { provider: "claude" } } }
      });
      writeConfig.mockResolvedValue(undefined);

      const result = await setAgent("coder", "gemini", { global: true });

      expect(result.role).toBe("coder");
      expect(result.provider).toBe("gemini");
      expect(result.scope).toBe("global");
      expect(writeConfig).toHaveBeenCalledWith(
        "/home/user/.karajan/kj.config.yml",
        expect.objectContaining({
          roles: expect.objectContaining({
            coder: expect.objectContaining({ provider: "gemini" })
          })
        })
      );
    });

    it("stores in session only with global=false (default)", async () => {
      const result = await setAgent("coder", "gemini");

      expect(result.role).toBe("coder");
      expect(result.provider).toBe("gemini");
      expect(result.scope).toBe("session");
      expect(writeConfig).not.toHaveBeenCalled();
      expect(setSessionOverride).toHaveBeenCalledWith("coder", "gemini");
    });

    it("throws for unknown role", async () => {
      await expect(setAgent("unknown", "claude")).rejects.toThrow("Unknown role");
    });

    it("throws for unknown provider not found as binary", async () => {
      await expect(setAgent("coder", "nonexistent")).rejects.toThrow("not found");
    });

    it("creates role entry if it does not exist with global=true", async () => {
      loadConfig.mockResolvedValue({
        config: { roles: {} }
      });
      writeConfig.mockResolvedValue(undefined);

      const result = await setAgent("planner", "codex", { global: true });

      expect(result.provider).toBe("codex");
      expect(result.scope).toBe("global");
      expect(writeConfig).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          roles: expect.objectContaining({
            planner: { provider: "codex" }
          })
        })
      );
    });
  });

  describe("listAgents with session overrides", () => {
    it("shows session override with scope=session", () => {
      const config = {
        roles: {
          coder: { provider: "claude", model: "opus" }
        }
      };
      const agents = listAgents(config, { coder: "gemini" });
      const coder = agents.find((a) => a.role === "coder");

      expect(coder.provider).toBe("gemini");
      expect(coder.scope).toBe("session");
    });

    it("shows scope=config when no session override exists", () => {
      const config = {
        roles: {
          coder: { provider: "claude", model: "opus" }
        }
      };
      const agents = listAgents(config);
      const coder = agents.find((a) => a.role === "coder");

      expect(coder.provider).toBe("claude");
      expect(coder.scope).toBe("global");
    });
  });
});
