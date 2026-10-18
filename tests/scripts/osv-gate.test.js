// KJC-TSK-1097: the CI gate fails on any advisory scored 9 or more (critical) and
// names it; anything it cannot read fails too, never a silent pass.
import { describe, it, expect } from "vitest";
import { readFile } from "node:fs/promises";
import yaml from "js-yaml";
import { criticalAdvisories, gateReport } from "../../scripts/osv-gate.mjs";

const report = (groups) => ({ results: [{ source: { path: "/repo/packages/x/pnpm-lock.yaml" }, packages: [{
  package: { name: "next", version: "14.2.35" },
  vulnerabilities: groups.flatMap((g) => g.ids.map((id) => ({ id }))),
  groups,
}] }] });

describe("osv-gate", () => {
  it("keeps only advisories scored 9 or more, one line per package and advisory", () => {
    const raw = report([{ ids: ["GHSA-crit"], max_severity: "9.5" }, { ids: ["GHSA-high"], max_severity: "7.5" }]);
    expect(criticalAdvisories(raw, "/repo")).toEqual(["packages/x/pnpm-lock.yaml: next@14.2.35 GHSA-crit (9.5)"]);
  });

  it("passes a clean report and fails a critical one, saying what it found", () => {
    expect(gateReport(JSON.stringify(report([])), "/repo")).toEqual({ ok: true, message: "osv-gate: no critical advisories" });
    const red = gateReport(JSON.stringify(report([{ ids: ["GHSA-crit"], max_severity: "9.0" }])), "/repo");
    expect(red.ok).toBe(false);
    expect(red.message).toMatch(/1 critical advisor[\s\S]*next@14\.2\.35 GHSA-crit/);
  });

  it("runs in CI on every PR to main, with a checksum-pinned scanner", async () => {
    const wf = yaml.load(await readFile(new URL("../../.github/workflows/osv.yml", import.meta.url), "utf8"));
    expect(wf.on.pull_request.branches).toEqual(["main"]);
    const steps = wf.jobs.osv.steps.map((s) => s.run ?? "").join("\n");
    expect(steps).toMatch(/sha256sum -c/);
    expect(steps).toMatch(/node scripts\/osv-gate\.mjs osv\.json/);
    expect(wf.env.OSV_SHA256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fails when the scanner output cannot be read", () => {
    for (const text of ["", "Scanning dir .", "{}"]) {
      const r = gateReport(text, "/repo");
      expect(r.ok, text).toBe(false);
      expect(r.message, text).toMatch(/could not read/);
    }
  });
});
