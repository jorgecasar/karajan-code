// KJC-TSK-1028 (QS-A3): no version ships without the scenario battery green,
// and every PR runs it in CI.
import { readFileSync } from "node:fs";
import { describe, it, expect, vi } from "vitest";
import { parse as parseYaml } from "yaml";
import { scenarioBatteryCheck } from "../../src/checks/release-check.js";

const withScenarios = { name: "p", version: "1.0.0", scripts: { "test:scenarios": "vitest run" } };

describe("scenarioBatteryCheck", () => {
  it("a project without a test:scenarios script gets no check", async () => {
    const run = vi.fn();
    expect(await scenarioBatteryCheck("/p", { name: "p", scripts: { test: "vitest" } }, run)).toBeNull();
    expect(run).not.toHaveBeenCalled();
  });

  it("runs npm run test:scenarios in the project and passes on exit 0", async () => {
    const run = vi.fn().mockResolvedValue({ exitCode: 0 });
    const check = await scenarioBatteryCheck("/p", withScenarios, run);
    expect(run).toHaveBeenCalledWith("npm", ["run", "test:scenarios"], { cwd: "/p" });
    expect(check).toMatchObject({ name: "scenarios", ok: true });
  });

  it("a red battery is a red check", async () => {
    const check = await scenarioBatteryCheck("/p", withScenarios, vi.fn().mockResolvedValue({ exitCode: 1 }));
    expect(check).toMatchObject({ name: "scenarios", ok: false, detail: expect.stringMatching(/exited 1/) });
  });

  it("a battery that cannot run is red, never skipped", async () => {
    const check = await scenarioBatteryCheck("/p", withScenarios, vi.fn().mockRejectedValue(new Error("spawn npm ENOENT")));
    expect(check).toMatchObject({ name: "scenarios", ok: false, detail: expect.stringMatching(/ENOENT/) });
  });
});

describe("CI", () => {
  it("runs the battery on every PR", () => {
    const ci = parseYaml(readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8"));
    expect(ci.jobs.test.steps.some((step) => step.run === "npm run test:scenarios")).toBe(true);
  });
});
