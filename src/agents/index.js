import { ClaudeAgent } from "./claude-agent.js";
import { CodexAgent } from "./codex-agent.js";
import { GeminiAgent } from "./gemini-agent.js";
import { AiderAgent } from "./aider-agent.js";

const agentRegistry = new Map();

export function registerAgent(name, AgentClass, meta = {}) {
  if (!name || typeof name !== "string") {
    throw new Error("Agent name must be a non-empty string");
  }
  agentRegistry.set(name, { AgentClass, meta });
}

export function getAvailableAgents() {
  return [...agentRegistry.entries()].map(([name, { AgentClass, meta }]) => ({
    name,
    AgentClass,
    ...meta,
  }));
}

export function createAgent(agentName, config, logger) {
  const entry = agentRegistry.get(agentName);
  if (!entry) {
    throw new Error(`Unsupported agent: ${agentName}`);
  }
  return new entry.AgentClass(agentName, config, logger);
}

// Auto-register built-in agents
registerAgent("claude", ClaudeAgent);
registerAgent("codex", CodexAgent);
registerAgent("gemini", GeminiAgent);
registerAgent("aider", AiderAgent);
