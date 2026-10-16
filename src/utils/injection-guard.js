/**
 * Prompt-injection guard for AI-reviewed diffs and PR content.
 *
 * Scans text for patterns commonly used to hijack LLM instructions:
 * directive overrides, role reassignment, invisible Unicode, and
 * suspiciously large comment blocks that could hide payloads.
 *
 * @module utils/injection-guard
 */

import { readFileSync } from "node:fs";

/**
 * KJC-TSK-0703: the patterns live in injection-patterns.json, the family's
 * versioned catalog (karajan-radar reads it from Python). Only constructs both
 * JavaScript RegExp and Python re understand are accepted.
 */
const NON_PORTABLE = [
  [/\\u\{/, "\\u{...} escapes (put the literal character in the JSON instead)"],
  [/\\[pP]\{/, "\\p{...} property escapes"],
  [/\(\?<(?![=!])/, "a named group (Python spells it (?P<name>)"],
  [/\\k</, "a named backreference"],
];
const PORTABLE_FLAGS = new Set(["i", "m", "s", "u"]);

/** Throws, naming the pattern, when an entry would not work outside JavaScript. */
export function assertPortable({ id, expression, flags = "" }) {
  for (const flag of flags) {
    if (!PORTABLE_FLAGS.has(flag)) throw new Error(`${id}: flag "${flag}" is not portable (only i, m, s, u)`);
  }
  for (const [construct, what] of NON_PORTABLE) {
    if (construct.test(expression)) throw new Error(`${id}: ${what} is not portable: ${expression}`);
  }
  return new RegExp(expression, flags);
}

/** The catalog compiled per type; a missing or broken catalog fails loudly, never scans empty. */
export function loadInjectionCatalog(url = new URL("./injection-patterns.json", import.meta.url)) {
  const catalog = JSON.parse(readFileSync(url, "utf8"));
  const compiled = { directive: [], unicode: [], comment_block: [], maxCommentBlock: catalog.max_comment_block, version: catalog.version };
  for (const entry of catalog.patterns) {
    const re = assertPortable(entry);
    // Comment blocks are walked match by match: the global flag is the engine's, not the catalog's.
    compiled[entry.type].push(entry.type === "comment_block" ? new RegExp(re.source, `${re.flags}g`) : re);
  }
  return compiled;
}

const CATALOG = loadInjectionCatalog();
const DIRECTIVE_PATTERNS = CATALOG.directive;
const UNICODE_PATTERNS = CATALOG.unicode;
const MAX_COMMENT_BLOCK = CATALOG.maxCommentBlock;
const COMMENT_BLOCK_RE = CATALOG.comment_block;

/**
 * @typedef {Object} InjectionFinding
 * @property {"directive"|"unicode"|"comment_block"} type
 * @property {string} pattern  - short label of what matched
 * @property {string} snippet  - excerpt of the offending text (max 120 chars)
 * @property {number} [line]   - approximate line number (1-based)
 */

/**
 * @typedef {Object} GuardResult
 * @property {boolean} clean        - true if no threats detected
 * @property {InjectionFinding[]} findings
 * @property {string} summary       - human-readable one-liner
 */

/**
 * Scan a text (diff, PR description, comment) for prompt-injection signals.
 *
 * @param {string} text - content to scan
 * @param {Object} [opts]
 * @param {number} [opts.maxCommentBlock=2000] - flag comment blocks larger than this
 * @returns {GuardResult}
 */
export function scanForInjection(text, opts = {}) {
  if (!text || typeof text !== "string") {
    return { clean: true, findings: [], summary: "Nothing to scan" };
  }

  const maxBlock = opts.maxCommentBlock ?? MAX_COMMENT_BLOCK;
  /** @type {InjectionFinding[]} */
  const findings = [];

  // 1. Directive patterns
  for (const re of DIRECTIVE_PATTERNS) {
    const match = re.exec(text);
    if (match) {
      findings.push({
        type: "directive",
        pattern: re.source.slice(0, 60),
        snippet: excerpt(text, match.index),
        line: lineAt(text, match.index),
      });
    }
  }

  // 2. Invisible Unicode
  for (const re of UNICODE_PATTERNS) {
    const match = re.exec(text);
    if (match) {
      const charCode = match[0].codePointAt(0).toString(16).toUpperCase();
      findings.push({
        type: "unicode",
        pattern: `U+${charCode}`,
        snippet: excerpt(text, match.index),
        line: lineAt(text, match.index),
      });
    }
  }

  // 3. Oversized comment blocks
  for (const re of COMMENT_BLOCK_RE) {
    let m;
    while ((m = re.exec(text)) !== null) {
      if (proseLength(m[0]) > maxBlock) {
        findings.push({
          type: "comment_block",
          pattern: `block ${m[0].length} chars (max ${maxBlock})`,
          snippet: excerpt(text, m.index),
          line: lineAt(text, m.index),
        });
      }
    }
  }

  const clean = findings.length === 0;
  const summary = clean
    ? "No injection patterns detected"
    : `${findings.length} potential injection(s): ${[...new Set(findings.map((f) => f.type))].join(", ")}`;

  return { clean, findings, summary };
}

/**
 * Scan a git diff, focusing only on added lines (lines starting with +).
 * Removed lines cannot inject into the AI prompt.
 *
 * @param {string} diff - unified diff content
 * @param {Object} [opts]
 * @returns {GuardResult}
 */
export function scanDiff(diff, opts = {}) {
  if (!diff) return { clean: true, findings: [], summary: "Empty diff" };

  // Split diff into per-file chunks to avoid false positives from
  // concatenated added-lines across unrelated files.
  const files = diff.split(/^diff --git /m).filter(Boolean);

  const allFindings = [];
  for (const fileChunk of files) {
    const addedLines = fileChunk
      .split("\n")
      .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
      .map((l) => l.slice(1))
      .join("\n");

    if (!addedLines) continue;
    const result = scanForInjection(addedLines, opts);
    if (!result.clean) allFindings.push(...result.findings);
  }

  const clean = allFindings.length === 0;
  return {
    clean,
    findings: allFindings,
    summary: clean ? "No injection patterns detected" : `${allFindings.length} injection pattern(s) detected across diff`
  };
}

// --- Helpers ---

/**
 * KJC-TSK-0743: the size of a comment block that counts against the limit. In a
 * JSDoc block (`/**`), tag lines (`* @typedef`, `* @property`...) are structure,
 * not prose: they are left out unless a single one runs past 300 chars. Any
 * instruction inside a tag line is still caught by the directive patterns.
 */
const JSDOC_TAG_LINE = /^\s*\*\s*@[A-Za-z]+/;
const MAX_TAG_LINE = 300;
function proseLength(block) {
  if (!block.startsWith("/**")) return block.length;
  return block
    .split("\n")
    .filter((line) => !(JSDOC_TAG_LINE.test(line) && line.length <= MAX_TAG_LINE))
    .join("\n").length;
}

function excerpt(text, index) {
  const start = Math.max(0, index - 20);
  const end = Math.min(text.length, index + 100);
  return text.slice(start, end).replaceAll(/\n/g, "\\n").slice(0, 120);
}

function lineAt(text, index) {
  return text.slice(0, index).split("\n").length;
}
