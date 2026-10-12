// KJC-TSK-1027 (QS-A2): a staged change that regenerates package-lock.json.
// The whole lockfile went into the reviewer's prompt, and Solomon's prompt
// blew the argument limit (KJC-BUG-0347).
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { makeScenarioProject } from "./helpers/scenario-project.js";

const LOCK_PACKAGES = 20_000;
let p;
let fixtureDir;
let review;
let lockBytes;

beforeAll(() => {
  p = makeScenarioProject();
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "kj-scn-fixture-"));
  const packages = Object.fromEntries(Array.from({ length: LOCK_PACKAGES }, (_, i) => [
    `node_modules/pkg-${i}`, { version: "1.0.0", resolved: `https://registry.npmjs.org/pkg-${i}/-/pkg-${i}-1.0.0.tgz`, integrity: "sha512-AAAA" },
  ]));
  const lock = `${JSON.stringify({ name: "scn", lockfileVersion: 3, packages }, null, 2)}\n`;
  lockBytes = lock.length;
  fs.writeFileSync(path.join(p.dir, "package-lock.json"), lock);
  // A dependency update: no source change, so the review needs no SonarQube.
  const pkgPath = path.join(p.dir, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  pkg.dependencies = { "pkg-0": "^1.0.0" };
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  p.git("add", "package-lock.json", "package.json");
  review = p.kjFake(fixtureDir, "review", "--staged", "--reviewer", "fake", "chore: add pkg-0");
}, 300_000);
afterAll(() => {
  p?.cleanup();
  if (fixtureDir) fs.rmSync(fixtureDir, { recursive: true, force: true });
});

describe("scenario: kj review --staged with a regenerated lockfile", () => {
  it("records a verdict", () => {
    expect(review.status, `${review.stdout}\n${review.stderr}`.slice(-1500)).toBe(0);
  });

  it("the reviewer's prompt summarizes the lockfile instead of carrying it (0347)", () => {
    const calls = fs.readFileSync(path.join(fixtureDir, "fake-calls.log"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const reviewer = calls.find((c) => c.role === "reviewer");
    expect(reviewer).toBeDefined();
    expect(reviewer.promptLength).toBeLessThan(lockBytes / 10);
  });
});
