import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";

// KJC-BUG-0234: a git the tests launch must not start a background gc or
// maintenance, which kept writing into a temp repo while the teardown removed it
// (ENOTEMPTY on .git/objects).
describe("git launched by the suite", () => {
  it("has auto gc and auto maintenance off", () => {
    const read = (key) => execFileSync("git", ["config", "--get", key], { encoding: "utf8" }).trim();
    expect(read("gc.auto")).toBe("0");
    expect(read("maintenance.auto")).toBe("false");
  });
});
