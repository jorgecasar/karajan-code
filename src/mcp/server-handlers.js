/**
 * MCP server handler logic.
 * Extracted from server.js for testability.
 */

import { EventEmitter } from "node:events";
import fs from "node:fs/promises";
import { runKjCommand } from "./run-kj.js";
import { normalizePlanArgs } from "./tool-arg-normalizers.js";
import { buildProgressHandler, buildProgressNotifier } from "./progress.js";
import { runFlow, resumeFlow } from "../orchestrator.js";
import { loadConfig, applyRunOverrides, validateConfig, resolveRole } from "../config.js";
import { createLogger } from "../utils/logger.js";
import { assertAgentsAvailable } from "../agents/availability.js";
import { createAgent } from "../agents/index.js";
import { buildPlannerPrompt } from "../prompts/planner.js";
import { buildCoderPrompt } from "../prompts/coder.js";
import { buildReviewerPrompt } from "../prompts/reviewer.js";
import { parseMaybeJsonString } from "../review/parser.js";
import { computeBaseRef, generateDiff } from "../review/diff-generator.js";
import { resolveReviewProfile } from "../review/profiles.js";

export function asObject(value) {
  if (value && typeof value === "object") return value;
  return {};
}

export function responseText(payload) {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }]
  };
}

export function failPayload(message, details = {}) {
  return {
    ok: false,
    error: message,
    ...details
  };
}

export function classifyError(error) {
  const msg = error?.message || String(error);
  const lower = msg.toLowerCase();

  if (lower.includes("sonar") && (lower.includes("connect") || lower.includes("econnrefused") || lower.includes("not available") || lower.includes("not running"))) {
    return {
      category: "sonar_unavailable",
      suggestion: "SonarQube is not reachable. Try: kj_init to set up SonarQube, or run 'docker start sonarqube' if already installed. Use --no-sonar to skip SonarQube."
    };
  }

  if (lower.includes("401") || lower.includes("unauthorized") || lower.includes("invalid token")) {
    return {
      category: "auth_error",
      suggestion: "Authentication failed. Regenerate the SonarQube token and update it via kj_init or in ~/.karajan/kj.config.yml under sonarqube.token."
    };
  }

  if (lower.includes("config") && (lower.includes("missing") || lower.includes("not found") || lower.includes("invalid"))) {
    return {
      category: "config_error",
      suggestion: "Configuration issue detected. Run kj_doctor to diagnose, or kj_init to create a fresh config."
    };
  }

  if (lower.includes("missing provider") || lower.includes("not found") && (lower.includes("claude") || lower.includes("codex") || lower.includes("gemini") || lower.includes("aider"))) {
    return {
      category: "agent_missing",
      suggestion: "Required agent CLI not found. Run kj_doctor to check which agents are installed and get installation instructions."
    };
  }

  if (lower.includes("timed out") || lower.includes("timeout")) {
    return {
      category: "timeout",
      suggestion: "The agent did not complete in time. Try: (1) increase --max-iteration-minutes (default: 5), (2) split the task into smaller pieces, (3) use kj_code for single-agent tasks. If a SonarQube scan timed out, check Docker health."
    };
  }

  if (lower.includes("not a git repository")) {
    return {
      category: "git_error",
      suggestion: "Current directory is not a git repository. Navigate to your project root or initialize git with 'git init'."
    };
  }

  return { category: "unknown", suggestion: null };
}

export function enrichedFailPayload(error, toolName) {
  const msg = error?.message || String(error);
  const { category, suggestion } = classifyError(error);
  const payload = {
    ok: false,
    error: msg,
    tool: toolName,
    category
  };
  if (suggestion) payload.suggestion = suggestion;
  return payload;
}

export async function buildConfig(options, commandName = "run") {
  const { config } = await loadConfig();
  const merged = applyRunOverrides(config, options || {});
  validateConfig(merged, commandName);
  return merged;
}

export function buildAskQuestion(server) {
  return async (question) => {
    try {
      const result = await server.elicitInput({
        message: question,
        requestedSchema: {
          type: "object",
          properties: {
            answer: { type: "string", description: "Your response" }
          },
          required: ["answer"]
        }
      });
      return result.action === "accept" ? result.content?.answer || null : null;
    } catch {
      return null;
    }
  };
}

export async function handleRunDirect(a, server, extra) {
  const config = await buildConfig(a);
  const logger = createLogger(config.output.log_level, "mcp");

  const requiredProviders = [
    resolveRole(config, "coder").provider,
    config.reviewer_options?.fallback_reviewer
  ];
  if (config.pipeline?.reviewer?.enabled !== false) {
    requiredProviders.push(resolveRole(config, "reviewer").provider);
  }
  if (config.pipeline?.triage?.enabled) requiredProviders.push(resolveRole(config, "triage").provider);
  if (config.pipeline?.planner?.enabled) requiredProviders.push(resolveRole(config, "planner").provider);
  if (config.pipeline?.refactorer?.enabled) requiredProviders.push(resolveRole(config, "refactorer").provider);
  if (config.pipeline?.researcher?.enabled) requiredProviders.push(resolveRole(config, "researcher").provider);
  if (config.pipeline?.tester?.enabled) requiredProviders.push(resolveRole(config, "tester").provider);
  if (config.pipeline?.security?.enabled) requiredProviders.push(resolveRole(config, "security").provider);
  await assertAgentsAvailable(requiredProviders);

  const emitter = new EventEmitter();
  emitter.on("progress", buildProgressHandler(server));
  const progressNotifier = buildProgressNotifier(extra);
  if (progressNotifier) emitter.on("progress", progressNotifier);

  const askQuestion = buildAskQuestion(server);
  const pgTaskId = a.pgTask || null;
  const pgProject = a.pgProject || config.planning_game?.project_id || null;
  const result = await runFlow({ task: a.task, config, logger, flags: a, emitter, askQuestion, pgTaskId, pgProject });
  return { ok: !result.paused && (result.approved !== false), ...result };
}

export async function handleResumeDirect(a, server, extra) {
  const config = await buildConfig(a);
  const logger = createLogger(config.output.log_level, "mcp");

  const emitter = new EventEmitter();
  emitter.on("progress", buildProgressHandler(server));
  const progressNotifier = buildProgressNotifier(extra);
  if (progressNotifier) emitter.on("progress", progressNotifier);

  const askQuestion = buildAskQuestion(server);
  const result = await resumeFlow({
    sessionId: a.sessionId,
    answer: a.answer || null,
    config,
    logger,
    flags: a,
    emitter,
    askQuestion
  });
  return { ok: true, ...result };
}

export async function handlePlanDirect(a, server, extra) {
  const options = normalizePlanArgs(a);
  const config = await buildConfig(options, "plan");
  const logger = createLogger(config.output.log_level, "mcp");

  const plannerRole = resolveRole(config, "planner");
  await assertAgentsAvailable([plannerRole.provider]);

  const planner = createAgent(plannerRole.provider, config, logger);
  const prompt = buildPlannerPrompt({ task: a.task, context: a.context });
  const result = await planner.runTask({ prompt, role: "planner" });

  if (!result.ok) {
    throw new Error(result.error || result.output || "Planner failed");
  }

  const parsed = parseMaybeJsonString(result.output);
  return { ok: true, plan: parsed || result.output, raw: result.output };
}

export async function handleCodeDirect(a, server, extra) {
  const config = await buildConfig(a, "code");
  const logger = createLogger(config.output.log_level, "mcp");

  const coderRole = resolveRole(config, "coder");
  await assertAgentsAvailable([coderRole.provider]);

  const coder = createAgent(coderRole.provider, config, logger);
  let coderRules = null;
  if (config.coder_rules) {
    try {
      coderRules = await fs.readFile(config.coder_rules, "utf8");
    } catch { /* no coder rules file */ }
  }
  const prompt = buildCoderPrompt({ task: a.task, coderRules, methodology: config.development?.methodology || "tdd" });
  const result = await coder.runTask({ prompt, role: "coder" });

  if (!result.ok) {
    throw new Error(result.error || result.output || `Coder failed (exit ${result.exitCode})`);
  }

  return { ok: true, output: result.output, exitCode: result.exitCode };
}

export async function handleReviewDirect(a, server, extra) {
  const config = await buildConfig(a, "review");
  const logger = createLogger(config.output.log_level, "mcp");

  const reviewerRole = resolveRole(config, "reviewer");
  await assertAgentsAvailable([reviewerRole.provider, config.reviewer_options?.fallback_reviewer]);

  const reviewer = createAgent(reviewerRole.provider, config, logger);
  const resolvedBase = await computeBaseRef({ baseBranch: config.base_branch, baseRef: a.baseRef });
  const diff = await generateDiff({ baseRef: resolvedBase });
  const { rules } = await resolveReviewProfile({ mode: config.review_mode, projectDir: process.cwd() });

  const prompt = buildReviewerPrompt({ task: a.task, diff, reviewRules: rules, mode: config.review_mode });
  const result = await reviewer.reviewTask({ prompt, role: "reviewer" });

  if (!result.ok) {
    throw new Error(result.error || result.output || `Reviewer failed (exit ${result.exitCode})`);
  }

  const parsed = parseMaybeJsonString(result.output);
  return { ok: true, review: parsed || result.output, raw: result.output };
}

export async function handleToolCall(name, args, server, extra) {
  const a = asObject(args);

  if (name === "kj_init") {
    return runKjCommand({ command: "init", options: a });
  }

  if (name === "kj_doctor") {
    return runKjCommand({ command: "doctor", options: a });
  }

  if (name === "kj_config") {
    return runKjCommand({
      command: "config",
      commandArgs: a.json ? ["--json"] : [],
      options: a
    });
  }

  if (name === "kj_scan") {
    return runKjCommand({ command: "scan", options: a });
  }

  if (name === "kj_roles") {
    const action = a.action || "list";
    const commandArgs = [action];
    if (action === "show" && a.roleName) commandArgs.push(a.roleName);
    return runKjCommand({
      command: "roles",
      commandArgs,
      options: a
    });
  }

  if (name === "kj_report") {
    const commandArgs = [];
    if (a.list) commandArgs.push("--list");
    if (a.sessionId) commandArgs.push("--session-id", String(a.sessionId));
    if (a.format) commandArgs.push("--format", String(a.format));
    if (a.trace) commandArgs.push("--trace");
    if (a.currency) commandArgs.push("--currency", String(a.currency));
    if (a.pgTask) commandArgs.push("--pg-task", String(a.pgTask));
    return runKjCommand({
      command: "report",
      commandArgs,
      options: a
    });
  }

  if (name === "kj_resume") {
    if (!a.sessionId) {
      return failPayload("Missing required field: sessionId");
    }
    return handleResumeDirect(a, server, extra);
  }

  if (name === "kj_run") {
    if (!a.task) {
      return failPayload("Missing required field: task");
    }
    return handleRunDirect(a, server, extra);
  }

  if (name === "kj_code") {
    if (!a.task) {
      return failPayload("Missing required field: task");
    }
    return handleCodeDirect(a, server, extra);
  }

  if (name === "kj_review") {
    if (!a.task) {
      return failPayload("Missing required field: task");
    }
    return handleReviewDirect(a, server, extra);
  }

  if (name === "kj_plan") {
    if (!a.task) {
      return failPayload("Missing required field: task");
    }
    return handlePlanDirect(a, server, extra);
  }

  return failPayload(`Unknown tool: ${name}`);
}
