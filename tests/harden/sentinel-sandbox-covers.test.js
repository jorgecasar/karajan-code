// KJC-TSK-1114 (plan KJC-TSK-1081, ADR 0014/0015): a Sentinel guard that reads
// Bash text steps aside only where the host sandbox already denies its paths.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { sandboxCovers } from "../../src/harden/sentinel/sentinel-bash-write.mjs";

let root;
beforeEach(() => { root = fs.mkdtempSync(path.join(os.tmpdir(), "kj-sbx-")); fs.mkdirSync(path.join(root, ".claude")); });
afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

const write = (file, sandbox) => fs.writeFileSync(path.join(root, ".claude", file), JSON.stringify({ sandbox }));
const ON = { enabled: true, allowUnsandboxedCommands: false, filesystem: { denyWrite: ["./.karajan/harness", ".karajan/hooks", "kj.config.yml"] } };

describe("sandboxCovers", () => {
  it("covers paths that are, or hang from, a denyWrite entry of an enabled sandbox", () => {
    write("settings.local.json", ON);
    expect(sandboxCovers(root, [".karajan/harness", ".karajan/hooks/pre-commit", "kj.config.yml"])).toBe(true);
  });

  it("does not cover a path missing from denyWrite", () => {
    write("settings.local.json", ON);
    expect(sandboxCovers(root, [".karajan/harness", ".ragignore"])).toBe(false);
    expect(sandboxCovers(root, ["kj.config.yml.bak"])).toBe(false);
  });

  it("does not cover when the sandbox is off or can be bypassed", () => {
    write("settings.local.json", { ...ON, enabled: false });
    expect(sandboxCovers(root, ["kj.config.yml"])).toBe(false);
    write("settings.local.json", { ...ON, allowUnsandboxedCommands: true });
    expect(sandboxCovers(root, ["kj.config.yml"])).toBe(false);
    write("settings.local.json", { enabled: true, filesystem: ON.filesystem });
    expect(sandboxCovers(root, ["kj.config.yml"])).toBe(false);
  });

  it("reads settings.json when there is no local file, and the local one wins", () => {
    write("settings.json", ON);
    expect(sandboxCovers(root, ["kj.config.yml"])).toBe(true);
    write("settings.local.json", { ...ON, enabled: false });
    expect(sandboxCovers(root, ["kj.config.yml"])).toBe(false);
  });

  it("does not cover with no settings or unreadable ones: the guard stays", () => {
    expect(sandboxCovers(root, ["kj.config.yml"])).toBe(false);
    fs.writeFileSync(path.join(root, ".claude", "settings.local.json"), "{ not json");
    expect(sandboxCovers(root, ["kj.config.yml"])).toBe(false);
  });
});
