/**
 * Per-repo harden scope, persisted in package.json `kj.harden` so a repo with
 * sub-tools (e.g. a python wrapper) excludes them once instead of on every
 * invocation (KJC-TSK-0564). KJC-BUG-0370: kj harden and kj check read it from
 * here, so check never asks for configs harden was told to leave out.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function readHardenConfig(projectDir) {
  const pkgPath = join(projectDir, "package.json");
  if (!existsSync(pkgPath)) return {};
  try {
    return JSON.parse(readFileSync(pkgPath, "utf8")).kj?.harden ?? {};
  } catch {
    return {};
  }
}
