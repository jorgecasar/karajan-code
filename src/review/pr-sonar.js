/**
 * KJC-TSK-1078: Sonar on a third-party PR, when SonarQube is reachable. The
 * own-work pre-gate scans the PR's files and only issues on the lines the PR
 * adds can fail the check; without Sonar the check says "not available" and
 * passes (decision of the user: Sonar if available, never demanded).
 */
import { addedLinesByFile, issueFile, runSonarPregate } from "./sonar-pregate.js";

export async function sonarCheck({ diff, config, projectDir = process.cwd(), pregate = runSonarPregate }) {
  const touchedLines = addedLinesByFile(diff);
  let res;
  try {
    res = await pregate({ config, stagedFiles: [...touchedLines.keys()], touchedLines, projectDir });
  } catch (err) {
    res = { available: false, reason: err.message };
  }
  if (!res.available) return { id: "sonar", ok: true, detail: `not available: ${res.reason}` };
  const blocking = res.blocking ?? [];
  return blocking.length
    ? { id: "sonar", ok: false, detail: blocking.map((i) => `${issueFile(i)}:${i.line} ${i.rule} ${i.severity}`).join("; ") }
    : { id: "sonar", ok: true, detail: `no blocking Sonar issue on the added lines (${(res.advisory ?? []).length} advisory)` };
}
