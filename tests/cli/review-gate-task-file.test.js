// KJC-BUG-0349: with --staged the gate got only the positional task, so the
// evidence a session passed with --task-file never reached the reviewer.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Command } from "commander";

const gate = vi.fn();
vi.mock("../../src/commands/review-gate.js", () => ({ reviewGateCommand: gate, solomonCommand: vi.fn() }));
vi.mock("../../src/cli/_shared.js", () => ({
  withConfig: (_v, _name, _flags, fn) => fn({ config: { projectDir: dir }, logger: { warn: vi.fn() } }),
}));

let dir;
const runReview = async (...args) => {
  const { registerPipeline } = await import("../../src/cli/register-pipeline.js");
  const program = new Command().exitOverride();
  registerPipeline(program, { pkgVersion: "0.0.0-test" });
  await program.parseAsync(["node", "kj", "review", ...args]);
  return gate.mock.calls.at(-1)[0].flags.task;
};

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "kj-review-tf-"));
  fs.writeFileSync(path.join(dir, "evidence.md"), "on.schedule accepts timezone (IANA)\n");
  gate.mockReset();
});
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("kj review --staged --task-file", () => {
  it("hands the file's content to the gate as the task", async () => {
    expect(await runReview("--staged", "--task-file", path.join(dir, "evidence.md"))).toBe("on.schedule accepts timezone (IANA)");
  });

  it("keeps the positional task when no file is given", async () => {
    expect(await runReview("--staged", "fix the cron")).toBe("fix the cron");
  });

  it("works with no task at all, as before", async () => {
    expect(await runReview("--staged")).toBeUndefined();
  });
});
