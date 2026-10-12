import { describe, it, expect, vi } from "vitest";

// KJC-BUG-0339 (#2099): kj audit --security listed SonarQube issues of other
// projects on the same server: the query's projectKeys filter is ignored by
// current SonarQube, which then answers with every project's issues. The query
// names the project in `components` and the answer is filtered by its key too.
const curlCalls = [];
vi.mock("../../src/utils/process.js", () => ({
  runCommand: vi.fn(async (_bin, args) => {
    curlCalls.push(args.at(-1));
    const issues = [
      { key: "1", project: "mine", component: "mine:src/a.js", rule: "s1", severity: "MAJOR" },
      { key: "2", project: "other-repo", component: "other-repo:src/secret/path.js", rule: "s2", severity: "CRITICAL" },
      { key: "3", component: "mine:src/b.js", rule: "s3", severity: "MINOR" },
    ];
    return { exitCode: 0, stdout: `${JSON.stringify({ issues })}\n200`, stderr: "" };
  }),
}));
vi.mock("../../src/sonar/project-key.js", () => ({
  resolveSonarProjectKey: vi.fn(async () => "mine"),
  canResolveSonarProjectKey: vi.fn(async () => true),
}));

const { getOpenIssues } = await import("../../src/sonar/api.js");

describe("getOpenIssues keeps to the current project", () => {
  it("asks for the project's components and drops issues of any other project", async () => {
    const r = await getOpenIssues({ projectDir: "/p", sonarqube: { host: "http://sonar.test", token: "t" } });
    expect(curlCalls.at(-1)).toContain("components=mine");
    expect(r.issues.map((i) => i.key)).toEqual(["1", "3"]);
    expect(r.total).toBe(2);
  });

  it("a project key with colons (Maven-style) keeps its components without a project field", async () => {
    const { resolveSonarProjectKey } = await import("../../src/sonar/project-key.js");
    const { runCommand } = await import("../../src/utils/process.js");
    resolveSonarProjectKey.mockResolvedValueOnce("org.acme:app");
    runCommand.mockResolvedValueOnce({
      exitCode: 0, stderr: "",
      stdout: `${JSON.stringify({ issues: [{ key: "a", component: "org.acme:app:src/A.java" }, { key: "b", component: "org.acme:other:src/B.java" }] })}\n200`,
    });
    const r = await getOpenIssues({ projectDir: "/p", sonarqube: { host: "http://sonar.test", token: "t" } });
    expect(r.issues.map((i) => i.key)).toEqual(["a"]);
  });
});
