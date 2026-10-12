// KJC-BUG-0350: the scanner resolved its token with the sync resolver, which
// never reads <karajan home>/sonar.token (KJC-BUG-0266 fixed only the async
// one), so a valid persisted token read as "Unable to resolve Sonar token".
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveSonarTokenWithFallback } from "../../src/sonar/scanner.js";

const saved = {};
let home;

beforeEach(() => {
  for (const k of ["KARAJAN_HOME", "KJ_SONAR_TOKEN", "SONAR_TOKEN"]) saved[k] = process.env[k];
  home = fs.mkdtempSync(path.join(os.tmpdir(), "kj-sonar-home-"));
  process.env.KARAJAN_HOME = home;
  delete process.env.KJ_SONAR_TOKEN;
  delete process.env.SONAR_TOKEN;
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  fs.rmSync(home, { recursive: true, force: true });
});

describe("scanner token resolution", () => {
  it("uses the token the bootstrap persisted in the karajan home", async () => {
    fs.writeFileSync(path.join(home, "sonar.token"), "squ_persisted\n", { mode: 0o600 });
    expect(await resolveSonarTokenWithFallback({}, "http://127.0.0.1:1")).toBe("squ_persisted");
  });

  it("an explicit env token still wins over the file", async () => {
    fs.writeFileSync(path.join(home, "sonar.token"), "squ_persisted\n", { mode: 0o600 });
    process.env.KJ_SONAR_TOKEN = "squ_env";
    expect(await resolveSonarTokenWithFallback({}, "http://127.0.0.1:1")).toBe("squ_env");
  });
});
