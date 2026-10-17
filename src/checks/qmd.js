/**
 * QMD availability check. Manual strategy — installation
 * depends on the host platform and is handled by getInstallCommand().
 *
 * QMD (Quick Markdown Search) provides semantic search over the
 * user's wiki / docs / notes collections. Karajan ships it as a
 * default integration (mirror of Squeezr): kj init installs it,
 * kj doctor reports its presence.
 */

import { runCommand } from "../utils/process.js";
import { getInstallCommand } from "../utils/os-detect.js";
import { withDocLink } from "../utils/doc-links.js";
import { STRATEGY } from "./types.js";

function createQmdCheck() {
  return {
    name: "qmd",
    label: "QMD",
    strategy: STRATEGY.MANUAL,
    async detect() {
      try {
        const res = await runCommand("qmd", ["--version"]);
        if (res.exitCode === 0) {
          // KJC-TSK-1067: say what it is for, not only that it is there.
          return { ok: true, severity: "info", detail: `${res.stdout.trim()} — answers about the project's docs, notes, ADRs and plans from the documents, with fewer tokens (kj env install wires its MCP)` };
        }
      } catch { /* not installed */ }
      const installCmd = getInstallCommand("qmd");
      return {
        ok: false,
        severity: "warn",
        detail: "Not found — qmd answers questions about the project's docs, notes, ADRs and plans from the documents, with fewer tokens and a source",
        fix: withDocLink(`Install: ${installCmd}`, "qmd_install"),
      };
    },
  };
}

export function getQmdChecks() {
  return [createQmdCheck()];
}
