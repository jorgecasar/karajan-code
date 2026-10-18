/**
 * sandbox — kj harden turns the host's Bash sandbox on (KJC-TSK-1087, ADR 0015).
 *
 * Claude Code sandboxes Bash with bubblewrap on Linux and seatbelt on macOS. With
 * allowUnsandboxedCommands off, a sandbox that cannot start leaves the session with
 * no Bash at all (pilot KJC-TSK-1083: Ubuntu 24.04 restricts user namespaces until
 * bwrap has an AppArmor profile). So the probe runs first, on this machine.
 */
import { existsSync, readFileSync } from "node:fs";
import { delimiter, join } from "node:path";
import { spawnSync } from "node:child_process";

const USERNS_SYSCTL = "/proc/sys/kernel/apparmor_restrict_unprivileged_userns";

const whichOnPath = (bin) => (process.env.PATH ?? "").split(delimiter).map((d) => join(d, bin)).find((p) => existsSync(p)) ?? null;
const runSync = (bin, args) => spawnSync(bin, args, { encoding: "utf8", timeout: 10_000 });

const missing = (tool, pkg) => ({ ok: false, reason: `${tool} is not installed`, remedy: `install ${pkg} (apt install ${pkg}, dnf install ${pkg})` });

function userNamespacesRestricted(readFile) {
  try { return readFile(USERNS_SYSCTL).trim() === "1"; } catch { return false; }
}

function probeLinux({ which, run, readFile }) {
  const bwrap = which("bwrap");
  if (!bwrap) return missing("bubblewrap (bwrap)", "bubblewrap");
  if (!which("socat")) return missing("socat", "socat");
  // The same namespaces Claude Code's sandbox asks for: user and network.
  const res = run(bwrap, ["--ro-bind", "/", "/", "--dev", "/dev", "--unshare-user", "--unshare-net", "true"]);
  if (res.status === 0) return { ok: true };
  if (userNamespacesRestricted(readFile)) {
    return {
      ok: false,
      reason: "AppArmor restricts unprivileged user namespaces and bwrap has no profile",
      remedy: "add /etc/apparmor.d/bwrap allowing userns for /usr/bin/bwrap, then load it with apparmor_parser -r (your user does this)",
    };
  }
  const detail = String(res.stderr ?? "").trim() || "exit " + res.status;
  return { ok: false, reason: `bwrap cannot create its namespaces: ${detail}`, remedy: "fix bwrap on this machine, then run kj harden again" };
}

/**
 * Can the host sandbox start on this machine? Never throws.
 * @returns {{ok: true} | {ok: false, reason: string, remedy?: string}}
 */
export function probeSandbox({ platform = process.platform, which = whichOnPath, run = runSync, readFile = (p) => readFileSync(p, "utf8"), exists = existsSync } = {}) {
  if (platform === "linux") return probeLinux({ which, run, readFile });
  if (platform === "darwin") {
    if (!exists("/usr/bin/sandbox-exec")) return { ok: false, reason: "sandbox-exec is missing from /usr/bin" };
    const res = run("/usr/bin/sandbox-exec", ["-p", "(version 1)(allow default)", "/usr/bin/true"]);
    const detail = String(res.stderr ?? "").trim() || "exit " + res.status;
    return res.status === 0 ? { ok: true } : { ok: false, reason: `sandbox-exec cannot start a sandbox: ${detail}` };
  }
  return { ok: false, reason: `the host sandbox does not run on ${platform}` };
}
