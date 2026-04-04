import { ANSI } from "./formatters.js";

export function printSessionStages(stages) {
  if (!stages) return;
  if (stages.researcher?.summary) {
    console.log(`  ${ANSI.dim}\ud83d\udd2c Research: ${stages.researcher.summary}${ANSI.reset}`);
  }
  printSessionPlanner(stages.planner);
  if (stages.tester?.summary) {
    console.log(`  ${ANSI.dim}\ud83e\uddea Tester: ${stages.tester.summary}${ANSI.reset}`);
  }
  if (stages.security?.summary) {
    console.log(`  ${ANSI.dim}\ud83d\udd12 Security: ${stages.security.summary}${ANSI.reset}`);
  }
  printSessionSonar(stages.sonar);
}

export function printSessionPlanner(planner) {
  if (!planner?.title && !planner?.approach && !planner?.completedSteps?.length) return;
  const planParts = [];
  if (planner.title) planParts.push(planner.title);
  if (planner.approach) planParts.push(`approach: ${planner.approach}`);
  console.log(`  ${ANSI.dim}\ud83d\uddfa Plan: ${planParts.join(" | ")}${ANSI.reset}`);
  for (const step of planner.completedSteps || []) {
    console.log(`  ${ANSI.dim}   \u2713 ${step}${ANSI.reset}`);
  }
}

export function printSessionSonar(sonar) {
  if (!sonar) return;
  const gateLabel = sonar.gateStatus === "OK" ? ANSI.green : ANSI.red;
  console.log(`  ${ANSI.dim}\ud83d\udd0d Sonar: ${gateLabel}${sonar.gateStatus}${ANSI.reset}${ANSI.dim} (${sonar.openIssues ?? 0} issues)${ANSI.reset}`);
  if (typeof sonar.issuesInitial === "number" || typeof sonar.issuesResolved === "number") {
    const issuesInitial = sonar.issuesInitial ?? sonar.openIssues ?? 0;
    const issuesFinal = sonar.issuesFinal ?? sonar.openIssues ?? 0;
    const issuesResolved = sonar.issuesResolved ?? Math.max(issuesInitial - issuesFinal, 0);
    console.log(`  ${ANSI.dim}\ud83d\udee0 Issues: ${issuesInitial} detected, ${issuesFinal} open, ${issuesResolved} resolved${ANSI.reset}`);
  }
}

export function printSessionGit(git) {
  if (!git?.branch) return;
  const parts = [`branch: ${git.branch}`];
  if (git.committed) parts.push("committed");
  if (git.pushed) parts.push("pushed");
  if (git.pr || git.prUrl) parts.push(`PR: ${git.pr || git.prUrl}`);
  console.log(`  ${ANSI.dim}\ud83d\udcce Git: ${parts.join(", ")}${ANSI.reset}`);
  if (Array.isArray(git.commits) && git.commits.length > 0) {
    console.log(`  ${ANSI.dim}\ud83e\uddfe Commits:${ANSI.reset}`);
    for (const commit of git.commits) {
      const shortHash = (commit.hash || "").slice(0, 7) || "unknown";
      const message = commit.message || "";
      console.log(`  ${ANSI.dim}   - ${shortHash} ${message}${ANSI.reset}`);
    }
  }
}

export function isBudgetUnavailable(budget) {
  return budget.usage_available === false ||
    (budget.total_tokens === 0 && budget.total_cost_usd === 0 && Object.keys(budget.breakdown_by_role || {}).length > 0);
}

export function printSessionRtkSavings(rtkSavings) {
  if (!rtkSavings || !rtkSavings.callCount) return;
  const tokens = rtkSavings.estimatedTokensSaved ?? 0;
  const ratio = rtkSavings.savedPct ?? 0;
  const commands = rtkSavings.callCount ?? 0;
  console.log(`  ${ANSI.dim}\u26a1 RTK: saved ~${tokens} tokens (${ratio}% compression, ${commands} commands)${ANSI.reset}`);
}

export function printSessionProxyStats(proxyStats) {
  if (!proxyStats || !proxyStats.requests) return;
  const reqs = proxyStats.requests;
  const bytesIn = proxyStats.bytes_in ?? 0;
  const bytesOut = proxyStats.bytes_out ?? 0;
  const totalBytes = bytesIn + bytesOut;
  const estTokens = Math.round(totalBytes / 4); // ~4 bytes per token
  console.log(`  ${ANSI.dim}\ud83d\udee1\ufe0f Proxy: ${reqs} requests, ~${estTokens} tokens proxied (${(totalBytes / 1024).toFixed(0)}KB transferred)${ANSI.reset}`);
}

export function printSessionBudget(budget) {
  if (!budget) return;
  if (isBudgetUnavailable(budget)) {
    console.log(`  ${ANSI.dim}\ud83d\udcb0 Budget: N/A (provider does not report usage)${ANSI.reset}`);
    return;
  }
  const estPrefix = budget.includes_estimates ? "~" : "";
  const estNote = budget.includes_estimates ? " (includes estimates)" : "";
  console.log(`  ${ANSI.dim}\ud83d\udcb0 Total tokens: ${estPrefix}${budget.total_tokens ?? 0}${estNote}${ANSI.reset}`);
  console.log(`  ${ANSI.dim}\ud83d\udcb0 Total cost: ${estPrefix}$${Number(budget.total_cost_usd || 0).toFixed(2)}${ANSI.reset}`);
  for (const [role, metrics] of Object.entries(budget.breakdown_by_role || {})) {
    console.log(
      `  ${ANSI.dim}   - ${role}: ${estPrefix}${metrics.total_tokens ?? 0} tokens, ${estPrefix}$${Number(metrics.total_cost_usd || 0).toFixed(2)}${ANSI.reset}`
    );
  }
}
