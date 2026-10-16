// KJC-TSK-1052 (TEAM-F): in a team on one repo, kj warns when another branch in
// progress changes the same files the commit stages, before the merge collides.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { branchOverlaps } from "../../src/review/branch-overlap.js";

let dir;
const git = (args, env = {}) => execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", env: { ...process.env, ...env } }).trim();
const write = (rel, text) => { fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true }); fs.writeFileSync(path.join(dir, rel), text); };
const commitOn = (branch, rel, env = {}) => {
  git(["checkout", "-q", "-B", branch, "main"]);
  write(rel, `${branch}\n`);
  git(["add", rel]);
  git(["-c", "user.name=Ana", "-c", "user.email=a@a", "commit", "-qm", `work on ${rel}`], env);
  git(["update-ref", `refs/remotes/origin/${branch}`, "HEAD"]);
  git(["checkout", "-q", "main"]);
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "kj-overlap-"));
  git(["init", "-q", "-b", "main"]);
  write("src/a.js", "a\n"); write("src/b.js", "b\n");
  git(["add", "."]); git(["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "base"]);
  git(["update-ref", "refs/remotes/origin/main", "HEAD"]);
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("branchOverlaps", () => {
  it("names the other branch in progress, its author and the files in common", async () => {
    commitOn("feat/other", "src/a.js");
    commitOn("feat/unrelated", "src/b.js");
    expect(await branchOverlaps({ projectDir: dir, stagedFiles: ["src/a.js", "src/c.js"] })).toEqual([
      { branch: "origin/feat/other", author: "Ana", files: ["src/a.js"] },
    ]);
  });

  it("a branch already merged, or older than 14 days, is not in progress", async () => {
    commitOn("feat/old", "src/a.js", { GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z", GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z" });
    commitOn("feat/merged", "src/a.js");
    git(["update-ref", "refs/remotes/origin/main", "refs/remotes/origin/feat/merged"]);
    expect(await branchOverlaps({ projectDir: dir, stagedFiles: ["src/a.js"] })).toEqual([]);
  });

  it("the branch being committed on is not someone else's", async () => {
    commitOn("feat/mine", "src/a.js");
    git(["checkout", "-q", "feat/mine"]);
    expect(await branchOverlaps({ projectDir: dir, stagedFiles: ["src/a.js"] })).toEqual([]);
  });

  it("without a remote base there is nothing to compare against", async () => {
    git(["update-ref", "-d", "refs/remotes/origin/main"]);
    expect(await branchOverlaps({ projectDir: dir, stagedFiles: ["src/a.js"] })).toEqual([]);
  });
});
