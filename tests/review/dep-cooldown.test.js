// KJC-TSK-0722 (step 1): supply-chain campaigns are caught in their first hours;
// a dependency published minutes ago is the riskiest one to take. kj review says so.
import { describe, it, expect, vi } from "vitest";
import { lockfileChanges, cooldownAdvisories, formatCooldown } from "../../src/review/dep-cooldown.js";

const LOCK_DIFF = [
  "diff --git a/package-lock.json b/package-lock.json",
  "--- a/package-lock.json",
  "+++ b/package-lock.json",
  "@@ -10,6 +10,14 @@",
  "     \"node_modules/old-pkg\": {",
  "-      \"version\": \"1.0.0\",",
  "+      \"version\": \"1.0.1\",",
  "+    \"node_modules/fresh-pkg\": {",
  "+      \"version\": \"2.3.4\",",
  "+      \"resolved\": \"https://registry.npmjs.org/fresh-pkg/-/fresh-pkg-2.3.4.tgz\",",
  "+    \"node_modules/@scope/nested/node_modules/inner\": {",
  "+      \"version\": \"0.1.0\",",
  "diff --git a/src/a.js b/src/a.js",
  "+  \"node_modules/not-a-lockfile\": {",
  "+    \"version\": \"9.9.9\",",
].join("\n");

describe("lockfileChanges", () => {
  it("reads the packages a package-lock.json diff adds or moves, nested ones by their own name", () => {
    expect(lockfileChanges(LOCK_DIFF)).toEqual([
      { name: "old-pkg", version: "1.0.1" },
      { name: "fresh-pkg", version: "2.3.4" },
      { name: "inner", version: "0.1.0" },
    ]);
  });
});

describe("formatCooldown", () => {
  it("one warning per young or unverified package, and a note for the reviewer only with young ones", () => {
    const r = formatCooldown({ young: [{ name: "fresh-pkg", version: "2.3.4", hours: 9 }], unverified: [{ name: "x", version: "1.0.0", reason: "ENOTFOUND" }] });
    expect(r.lines).toEqual([
      "⚠ supply-chain cooldown: fresh-pkg@2.3.4 was published 9 h ago (under 72 h): campaigns are caught in their first hours",
      "⚠ supply-chain cooldown: x@1.0.0 unverified (ENOTFOUND)",
    ]);
    expect(r.note).toMatch(/fresh-pkg@2\.3\.4 \(9 h\)/);
    expect(formatCooldown({ young: [], unverified: [] })).toEqual({ lines: [], note: "" });
  });
});

describe("cooldownAdvisories", () => {
  const now = Date.parse("2026-10-16T12:00:00Z");
  const npmTimes = { "old-pkg": "2026-01-01T00:00:00Z", "fresh-pkg": "2026-10-16T03:00:00Z", inner: "2026-10-14T12:00:00Z" };
  const run = vi.fn(async (cmd, args) => {
    const [name, version] = args[1].split(/@(?=[^@]*$)/);
    return { exitCode: 0, stdout: JSON.stringify({ [version]: npmTimes[name] }) };
  });

  it("names the ones younger than the threshold, with their age", async () => {
    const r = await cooldownAdvisories(LOCK_DIFF, { run, now, thresholdHours: 72 });
    expect(r.young).toEqual([{ name: "fresh-pkg", version: "2.3.4", hours: 9 }, { name: "inner", version: "0.1.0", hours: 48 }]);
    expect(r.unverified).toEqual([]);
    expect(run).toHaveBeenCalledWith("npm", ["view", "fresh-pkg@2.3.4", "time", "--json"]);
  });

  it("without the registry it never crashes: the package is listed as unverified, with the reason", async () => {
    const r = await cooldownAdvisories(LOCK_DIFF, { run: async () => ({ exitCode: 1, stdout: "", stderr: "ENOTFOUND registry.npmjs.org" }), now });
    expect(r.young).toEqual([]);
    expect(r.unverified[0]).toMatchObject({ name: "old-pkg", reason: expect.stringMatching(/ENOTFOUND/) });
  });

  it("no lockfile change, nothing to ask", async () => {
    const quiet = vi.fn();
    expect(await cooldownAdvisories("diff --git a/x.js b/x.js\n+const a = 1;\n", { run: quiet, now })).toEqual({ young: [], unverified: [] });
    expect(quiet).not.toHaveBeenCalled();
  });
});
