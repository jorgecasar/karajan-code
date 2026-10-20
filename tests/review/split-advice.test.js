// KJC-TSK-1101 (#2263): a large third-party PR gets advice on how to split it,
// grouped by the project's real structure, never by the first two directories.
import { describe, it, expect } from "vitest";
import { splitAdvice } from "../../src/review/split-advice.js";

const java = (pkg, name, lines, root = "src/main/java") => ({ file: `${root}/com/hoop/qa/${pkg}/${name}`, changed: lines });

describe("splitAdvice", () => {
  it("groups a Java project by package under the common prefix, tests and resources apart, in layer order", () => {
    const files = [
      java("api", "BookingClient.java", 120), java("api", "AuthClient.java", 80),
      java("model", "Booking.java", 60), java("model", "User.java", 40),
      java("pages", "LoginPage.java", 150), java("flows", "BookingFlow.java", 130),
      java("utils", "Waits.java", 30),
      java("tests", "BookingTest.java", 200, "src/test/java"),
      { file: "src/main/resources/config.properties", changed: 10 },
      { file: "pom.xml", changed: 15 },
    ];
    const advice = splitAdvice(files, { limit: 400 });
    expect(advice.why).toMatch(/review/i);
    expect(advice.chunks.map((c) => c.name)).toEqual(["config", "resources", "model", "utils", "api", "pages", "flows", "tests"]);
    expect(advice.chunks.find((c) => c.name === "api")).toMatchObject({ lines: 200, files: [files[0].file, files[1].file] });
    for (const chunk of advice.chunks) expect(chunk.purpose).toBeTruthy();
  });

  it("groups a JS/TS project by the folder under src/, with tests apart", () => {
    const files = [
      { file: "src/components/Button.tsx", changed: 50 }, { file: "src/services/api.ts", changed: 70 },
      { file: "src/components/Button.test.tsx", changed: 40 }, { file: "tests/e2e/login.spec.ts", changed: 30 },
    ];
    expect(splitAdvice(files, { limit: 100 }).chunks.map((c) => c.name)).toEqual(["services", "components", "tests"]);
  });

  it("splits a group that is still too large by its next level", () => {
    const files = ["a", "b", "c"].flatMap((sub) => [java(`pages/${sub}`, "One.java", 90), java(`pages/${sub}`, "Two.java", 90)]);
    const names = splitAdvice(files, { limit: 200 }).chunks.map((c) => c.name);
    expect(names).toEqual(["pages/a", "pages/b", "pages/c"]);
  });
});
