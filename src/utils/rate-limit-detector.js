/**
 * Detects rate limit / usage cap messages from CLI agent output.
 * Returns { isRateLimit, agent, message } where agent is the best guess
 * of which CLI triggered it (or "unknown").
 */

const RATE_LIMIT_PATTERNS = [
  // Claude CLI
  { pattern: /usage limit/i, agent: "claude" },
  { pattern: /plan's usage limit/i, agent: "claude" },
  { pattern: /Claude Pro usage limit/i, agent: "claude" },

  // OpenAI / Codex CLI
  { pattern: /exceeded your current quota/i, agent: "codex" },

  // Gemini CLI
  { pattern: /resource exhausted/i, agent: "gemini" },
  { pattern: /quota exceeded/i, agent: "gemini" },

  // Generic (match any agent)
  { pattern: /rate limit/i, agent: "unknown" },
  { pattern: /token limit reached/i, agent: "unknown" },
  { pattern: /\b429\b/, agent: "unknown" },
  { pattern: /too many requests/i, agent: "unknown" },
  { pattern: /throttl/i, agent: "unknown" },
];

export function detectRateLimit({ stderr = "", stdout = "" }) {
  const combined = `${stderr}\n${stdout}`;

  for (const { pattern, agent } of RATE_LIMIT_PATTERNS) {
    if (pattern.test(combined)) {
      const matchedLine = combined.split("\n").find((l) => pattern.test(l)) || combined.trim();
      return {
        isRateLimit: true,
        agent,
        message: matchedLine.trim()
      };
    }
  }

  return { isRateLimit: false, agent: "", message: "" };
}
