#!/usr/bin/env node
/**
 * osv-gate (KJC-TSK-1097): CI fails on any advisory osv-scanner scores 9 or more
 * (critical), naming the lockfile, package, version and advisory. Output it cannot
 * read fails too: a scanner that broke is not a clean scan.
 *
 * Usage: osv-scanner --format=json -r . > osv.json; node scripts/osv-gate.mjs osv.json
 */
import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { fileURLToPath } from "node:url";
import { parseOsvOutput } from "../src/audit/osv-findings.js";

const CRITICAL = 9;

/** One line per critical package and advisory, paths relative to the repo root. */
export function criticalAdvisories(raw, root) {
  const lines = parseOsvOutput(raw).vulnerabilities
    .filter((v) => v.score !== null && v.score >= CRITICAL)
    .map((v) => `${relative(root, v.source)}: ${v.package}@${v.version} ${v.id} (${v.score})`);
  return [...new Set(lines)];
}

/** The gate's verdict for the scanner's raw output. */
export function gateReport(text, root) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = null;
  }
  if (!Array.isArray(raw?.results)) return { ok: false, message: "osv-gate: could not read the osv-scanner output (no results list)" };
  const found = criticalAdvisories(raw, root);
  if (found.length === 0) return { ok: true, message: "osv-gate: no critical advisories" };
  const details = found.map((line) => "- " + line).join("\n");
  return { ok: false, message: `osv-gate: ${found.length} critical advisory(ies):\n${details}` };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) throw new Error("osv-gate: pass the osv-scanner JSON file");
  const { ok, message } = gateReport(readFileSync(file, "utf8"), process.cwd());
  console.log(message);
  process.exitCode = ok ? 0 : 1;
}
