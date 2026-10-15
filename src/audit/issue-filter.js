// Generalised deterministic false-positive filter for kj audit collectors.
//
// Originally introduced as `src/sonar/issue-filter.js` in v2.16.0 (KJC-TSK-0416)
// for Sonar findings. Generalised here so every collector (sonar, knip, madge,
// osv, semgrep, …) can reuse the same two mechanisms:
//
//   1. Static rules: { tool, rule, filePattern, reason }. Match by tool name
//      + rule id + path pattern. Catalogue below + extensible per project via
//      config.audit.false_positives. Legacy `config.sonar.false_positives` is
//      honoured for backwards compatibility.
//   2. Inline ignore: `// karajan-audit-ignore: <tool>:<ruleId>` on the issue
//      line or the previous one. Legacy `// karajan-sonar-ignore: <ruleId>`
//      keeps working when the issue's tool is "sonar".
//   3. Sonar only: S1135 on the Spanish word «todo» (not an uppercase TODO
//      tag) is suppressed by reading the issue's line (KJC-TSK-1042).
//
// Issues filtered out are kept in the `suppressed` list with `_suppressedBy`
// metadata for auditability — no silent dropping.

import fs from "node:fs";
import { escapeRegExp } from "../utils/escape-regexp.js";

export const DEFAULT_FALSE_POSITIVES = [
  {
    tool: "sonar",
    rule: "javascript:S2699",
    filePattern: /tests\/architecture\//,
    reason: "Structural tests assert via expect(offenders, msg).toEqual([]) — Sonar misses the custom-message form",
  },
  // Knip — v2.17 audit/dead-exports collector.
  {
    tool: "knip",
    rule: "unused-files",
    filePattern: /(?:^|\/)tests\/fixtures\//,
    reason: "Test fixtures are loaded by file path at runtime, not statically imported — knip can't see them",
  },
  {
    tool: "knip",
    rule: "unused-files",
    filePattern: /(?:^|\/)examples\//,
    reason: "Example projects are user-facing entry points, not consumed by the parent project's source",
  },
  {
    tool: "knip",
    rule: "unused-exports",
    filePattern: /(?:^|\/)(?:index|main)\.(?:js|ts|mjs|cjs|jsx|tsx)$/,
    reason: "Barrel re-exports in index.{js,ts} are legitimate public API surface even when no in-tree caller uses them",
  },
  // Madge — v2.17 audit/circular-deps collector.
  {
    tool: "madge",
    rule: "circular-import",
    filePattern: /node_modules\//,
    reason: "Cycles inside node_modules are upstream's problem, not ours — defensive default since madge excludes node_modules by config",
  },
];

/**
 * KJC-TSK-1042: Sonar's TODO-tag rule (S1135, every language) matches the word
 * regardless of case, so a Spanish comment like «todo el fichero» is reported
 * as a pending task. Only the uppercase TODO tag counts. Returns the reason to
 * suppress, or null; a line that cannot be read keeps the finding.
 */
export function spanishTodoWord(issue, absPath) {
  if (!/:S1135$/.test(issue.rule ?? "") || !issue.line || !fs.existsSync(absPath)) return null;
  const text = fs.readFileSync(absPath, "utf8").split("\n")[issue.line - 1] ?? "";
  if (!/\btodo\b/i.test(text) || /\bTODO\b/.test(text)) return null;
  return "the Spanish word «todo», not an uppercase TODO tag";
}

export function hasInlineIgnore(filePath, line, ruleId, tool = "sonar") {
  if (!filePath || !line || !ruleId) return false;
  if (!fs.existsSync(filePath)) return false;
  try {
    const lines = fs.readFileSync(filePath, "utf8").split("\n");
    const idx = line - 1;
    const candidates = [lines[idx], lines[idx - 1]].filter(Boolean);
    const escapedRule = escapeRegExp(ruleId);
    const escapedTool = escapeRegExp(tool);
    // New generalised marker + legacy sonar-only marker.
    const reAudit = new RegExp(`karajan-audit-ignore\\s*:\\s*${escapedTool}:${escapedRule}\\b`);
    const reLegacy = tool === "sonar"
      ? new RegExp(`karajan-sonar-ignore\\s*:\\s*${escapedRule}\\b`)
      : null;
    return candidates.some((l) => reAudit.test(l) || (reLegacy && reLegacy.test(l)));
  } catch {
    return false;
  }
}

/**
 * Filter a list of normalised audit findings into kept + suppressed.
 *
 * @param {object[]} issues  Each issue must carry { tool, rule, component|path, line? }.
 *                           `tool` defaults to "sonar" for backwards compat.
 * @param {object} [opts]
 * @param {object[]} [opts.extraRules]   Rules from config.audit.false_positives
 *                                       (or legacy config.sonar.false_positives).
 * @param {string} [opts.projectRoot]    Used to resolve component → absolute path.
 * @returns {{ kept: object[], suppressed: object[] }}
 */
export function filterFalsePositives(issues, opts = {}) {
  if (!Array.isArray(issues)) return { kept: [], suppressed: [] };
  const rules = [...DEFAULT_FALSE_POSITIVES, ...(opts.extraRules || [])].map((r) => ({
    tool: r.tool || "sonar",
    rule: r.rule,
    filePattern: r.filePattern instanceof RegExp ? r.filePattern : new RegExp(String(r.filePattern || ".*")),
    reason: r.reason,
  }));
  const projectRoot = opts.projectRoot || process.cwd();
  const kept = [];
  const suppressed = [];

  for (const issue of issues) {
    const tool = issue.tool || "sonar";
    const path = componentToPath(issue.component) || issue.path || "";
    let matched = null;

    // 1. Static rules.
    for (const rule of rules) {
      if (rule.tool === tool && issue.rule === rule.rule && rule.filePattern.test(path)) {
        matched = { tool, rule: rule.rule, path, reason: rule.reason };
        break;
      }
    }

    // 2. Inline ignore, then the Spanish word «todo» (only if no static rule matched).
    if (!matched && issue.rule && issue.line && path) {
      const absPath = path.startsWith("/") ? path : `${projectRoot}/${path}`;
      if (hasInlineIgnore(absPath, issue.line, issue.rule, tool)) {
        matched = { tool, rule: issue.rule, path, reason: "inline `// karajan-audit-ignore`" };
      } else if (tool === "sonar") {
        const reason = spanishTodoWord(issue, absPath);
        if (reason) matched = { tool, rule: issue.rule, path, reason };
      }
    }

    if (matched) {
      suppressed.push({ ...issue, _suppressedBy: matched });
    } else {
      kept.push(issue);
    }
  }
  return { kept, suppressed };
}

function componentToPath(component) {
  if (typeof component !== "string") return "";
  const colonIdx = component.indexOf(":");
  return colonIdx >= 0 ? component.slice(colonIdx + 1) : component;
}
