// KJC-TSK-0838 — `kj doctor` treats Sonar switched off as a DEFECT, not a
// preference: Sonar is mandatory for code (ADR 2026-09-13); the commit gate
// rejects code diffs without a sonar proof, so a disabled config only hurts.
import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("../../src/sonar/manager.js", () => ({ isSonarReachable: vi.fn() }));
vi.mock("../../src/sonar/api.js", () => ({ getProjectQualityProfiles: vi.fn() }));
import { isSonarReachable } from "../../src/sonar/manager.js";
import { getProjectQualityProfiles } from "../../src/sonar/api.js";
import { getSonarChecks } from "../../src/checks/sonar.js";

// KJC-TSK-1051 (TEAM-E): a team SonarQube (sonarqube.external) is not started
// locally, and the project must run on the team's quality profile.
describe("checks/sonar — the team's SonarQube", () => {
  beforeEach(() => { isSonarReachable.mockReset(); getProjectQualityProfiles.mockReset(); });
  const team = (extra = {}) => ({ sonarqube: { enabled: true, external: true, host: "https://sonar.team.example", ...extra } });

  it("an external one that does not answer is the team's server: no advice to start Docker", async () => {
    isSonarReachable.mockResolvedValue(false);
    const r = await getSonarChecks()[0].detect({ config: team() });
    expect(r.ok).toBe(false);
    expect(r.fix).toMatch(/team's SonarQube at https:\/\/sonar\.team\.example/);
    expect(r.fix).not.toMatch(/kj sonar start|docker/i);
  });

  it("with the team profile declared, the project on that profile is ok", async () => {
    isSonarReachable.mockResolvedValue(true);
    getProjectQualityProfiles.mockResolvedValue(["Team JS"]);
    const r = await getSonarChecks()[0].detect({ config: team({ quality_profile: "Team JS" }) });
    expect(r).toMatchObject({ ok: true });
    expect(r.detail).toMatch(/profile Team JS/);
  });

  it("the project on another profile is a warning naming both", async () => {
    isSonarReachable.mockResolvedValue(true);
    getProjectQualityProfiles.mockResolvedValue(["Sonar way"]);
    const r = await getSonarChecks()[0].detect({ config: team({ quality_profile: "Team JS" }) });
    expect(r).toMatchObject({ ok: false, severity: "warn" });
    expect(r.detail).toMatch(/Sonar way.*Team JS/);
  });

  it("a profile that cannot be read is said, never passed as ok", async () => {
    isSonarReachable.mockResolvedValue(true);
    getProjectQualityProfiles.mockRejectedValue(new Error("HTTP 403"));
    const r = await getSonarChecks()[0].detect({ config: team({ quality_profile: "Team JS" }) });
    expect(r).toMatchObject({ ok: false, severity: "warn" });
    expect(r.detail).toMatch(/HTTP 403/);
  });
});

describe("checks/sonar — KJC-TSK-0838", () => {
  beforeEach(() => isSonarReachable.mockReset());

  it("sonarqube.enabled: false is a failing check that names the rule and the fix", async () => {
    const [check] = getSonarChecks();
    const r = await check.detect({ config: { sonarqube: { enabled: false } } });
    expect(r.ok).toBe(false);
    expect(r.severity).toBe("fail");
    expect(r.detail).toMatch(/mandatory for code/);
    expect(r.fix).toMatch(/sonarqube\.enabled: true/);
    expect(isSonarReachable).not.toHaveBeenCalled();
  });

  it("review_gate.sonar: false fails the same way", async () => {
    const [check] = getSonarChecks();
    const r = await check.detect({ config: { review_gate: { sonar: false } } });
    expect(r.ok).toBe(false);
    expect(r.fix).toMatch(/review_gate\.sonar/);
  });

  it("enabled and reachable is ok", async () => {
    isSonarReachable.mockResolvedValue(true);
    const [check] = getSonarChecks();
    const r = await check.detect({ config: { sonarqube: { enabled: true } } });
    expect(r.ok).toBe(true);
    expect(r.detail).toMatch(/Reachable/);
  });
});
