// KJC-TSK-1036 (owner's decision, 14-oct): kj retires the lanes it created when
// they are provably abandoned (clean tree, no commits beyond the base, no live
// process inside), also from an agent session; anything else is listed, never touched.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { worktreeCommand } from "../../src/commands/worktree.js";

let dir;
const git = (...args) => execFileSync("git", ["-C", dir, ...args]).toString();
const noProcesses = { processes: { cwds: new Set(), unseen: 0 } };
const prune = (flags = {}, deps = noProcesses) => worktreeCommand({ config: { projectDir: dir }, action: "prune", args: [], flags, deps });
const lane = async (slug) => (await worktreeCommand({ config: { projectDir: dir }, action: "start", args: [slug], flags: {} })).path;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "kj-wtprune-"));
  git("init", "-q", "-b", "main");
  git("config", "user.email", "t@t"); git("config", "user.name", "t");
  fs.writeFileSync(path.join(dir, "a.js"), "x\n");
  git("add", "a.js"); git("commit", "-qm", "base");
});
afterEach(() => { fs.rmSync(dir, { recursive: true, force: true }); });

describe("kj worktree prune", () => {
  it("retires an abandoned lane and its branch", async () => {
    const p = await lane("old");
    const r = await prune();
    expect(r.removed.map((l) => l.slug)).toEqual(["old"]);
    expect(fs.existsSync(p)).toBe(false);
    expect(git("branch", "--list", "feat/old").trim()).toBe("");
  });

  it("keeps a lane with uncommitted changes, commits of its own, or a live process, saying why", async () => {
    const dirty = await lane("dirty");
    fs.writeFileSync(path.join(dirty, "b.js"), "wip\n");
    const ahead = await lane("ahead");
    fs.writeFileSync(path.join(ahead, "c.js"), "work\n");
    execFileSync("git", ["-C", ahead, "add", "c.js"]);
    execFileSync("git", ["-C", ahead, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "work"]);
    const busy = await lane("busy");
    const r = await prune({}, { processes: { cwds: new Set([busy]), unseen: 0 } });
    expect(r.removed).toEqual([]);
    const why = Object.fromEntries(r.kept.map((l) => [l.slug, l.reasons.join("; ")]));
    expect(why.dirty).toMatch(/uncommitted/);
    expect(why.ahead).toMatch(/1 commit/);
    expect(why.busy).toMatch(/process/);
    for (const p of [dirty, ahead, busy]) expect(fs.existsSync(p)).toBe(true);
  });

  it("an ignored .env keeps the lane; ignored node_modules does not", async () => {
    fs.writeFileSync(path.join(dir, ".gitignore"), ".env\nnode_modules/\n");
    git("add", ".gitignore"); git("commit", "-qm", "ignore");
    const nm = await lane("nm");
    fs.mkdirSync(path.join(nm, "node_modules"), { recursive: true });
    fs.writeFileSync(path.join(nm, "node_modules", "x.js"), "x\n");
    const env = await lane("env");
    fs.writeFileSync(path.join(env, ".env"), "SECRET=1\n");
    const r = await prune();
    expect(r.removed.map((l) => l.slug)).toEqual(["nm"]);
    expect(r.kept[0].reasons.join()).toMatch(/not regenerable \(\.env\)/);
  });

  it("a detached lane with commits of its own is kept", async () => {
    const p = await lane("det");
    execFileSync("git", ["-C", p, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-q", "--allow-empty", "-m", "own"]);
    execFileSync("git", ["-C", p, "checkout", "-q", "--detach"]);
    expect((await prune()).kept.map((l) => [l.slug, l.reasons.join()])).toEqual([["det", "1 commit(s) not in main"]]);
  });

  it("without a way to see processes nothing is provably abandoned", async () => {
    const p = await lane("unknown");
    const r = await prune({}, { processes: null });
    expect(r.removed).toEqual([]);
    expect(r.kept[0].reasons.join(" ")).toMatch(/cannot check/);
    expect(fs.existsSync(p)).toBe(true);
  });

  it("with processes that cannot be inspected, only a lane idle for 24 h is abandoned", async () => {
    await lane("fresh");
    const hidden = { cwds: new Set(), unseen: 2 };
    expect((await prune({}, { processes: hidden })).kept[0].reasons.join()).toMatch(/cannot be inspected/);
    expect((await prune({}, { processes: hidden, now: Date.now() + 25 * 3_600_000 })).removed.map((l) => l.slug)).toEqual(["fresh"]);
  });

  it("--dry-run lists what it would retire and touches nothing", async () => {
    const p = await lane("old");
    const r = await prune({ dryRun: true });
    expect(r.wouldRemove.map((l) => l.slug)).toEqual(["old"]);
    expect(fs.existsSync(p)).toBe(true);
  });
});
