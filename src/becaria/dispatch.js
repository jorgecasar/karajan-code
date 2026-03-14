/**
 * BecarIA dispatch client — sends repository_dispatch events via gh CLI
 * so the BecarIA Gateway can publish comments and reviews on PRs.
 *
 * Event types are configurable via becaria config:
 *   - comment_event (default: "becaria-comment")
 *   - review_event  (default: "becaria-review")
 *
 * Only active when becaria.enabled: true.
 */

import { runCommand } from "../utils/process.js";

export const VALID_AGENTS = [
  "Coder",
  "Reviewer",
  "Solomon",
  "Sonar",
  "Tester",
  "Security",
  "Planner"
];

const VALID_REVIEW_EVENTS = ["APPROVE", "REQUEST_CHANGES"];

function validateCommon({ repo, prNumber }) {
  if (!repo) throw new Error("repo is required (e.g. 'owner/repo')");
  if (!prNumber) throw new Error("prNumber is required (positive integer)");
}

function validateAgent(agent) {
  if (!VALID_AGENTS.includes(agent)) {
    throw new Error(
      `Invalid agent "${agent}". Must be one of: ${VALID_AGENTS.join(", ")}`
    );
  }
}

async function sendDispatch(repo, payload) {
  const res = await runCommand(
    "gh",
    ["api", `repos/${repo}/dispatches`, "--method", "POST", "--input", "-"],
    { input: JSON.stringify(payload) }
  );

  if (res.exitCode === 127) {
    throw new Error(
      "gh CLI not found. Install GitHub CLI: https://cli.github.com/"
    );
  }

  if (res.exitCode !== 0) {
    throw new Error(
      `Dispatch failed (exit ${res.exitCode}): ${res.stderr || res.stdout}`
    );
  }
}

/**
 * Send a comment event so the gateway posts a PR comment.
 * @param {object} opts
 * @param {object} [opts.becariaConfig] - becaria config section (optional)
 */
export async function dispatchComment({ repo, prNumber, agent, body, becariaConfig }) {
  validateCommon({ repo, prNumber });
  validateAgent(agent);
  if (!body) throw new Error("body is required (comment text)");

  const prefix = becariaConfig?.comment_prefix === false ? "" : `[${agent}] `;
  const eventType = becariaConfig?.comment_event || "becaria-comment";

  await sendDispatch(repo, {
    event_type: eventType,
    client_payload: { pr_number: prNumber, agent, body: `${prefix}${body}` }
  });
}

/**
 * Send a review event so the gateway submits a formal PR review.
 * @param {object} opts
 * @param {object} [opts.becariaConfig] - becaria config section (optional)
 */
export async function dispatchReview({ repo, prNumber, event, body, agent, becariaConfig }) {
  validateCommon({ repo, prNumber });
  validateAgent(agent);
  if (!VALID_REVIEW_EVENTS.includes(event)) {
    throw new Error(
      `event must be one of: ${VALID_REVIEW_EVENTS.join(", ")} (got "${event}")`
    );
  }
  if (!body) throw new Error("body is required (review text)");

  const eventType = becariaConfig?.review_event || "becaria-review";

  await sendDispatch(repo, {
    event_type: eventType,
    client_payload: { pr_number: prNumber, event, body, agent }
  });
}
