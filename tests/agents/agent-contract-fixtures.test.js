// QS-B (KJC-TSK-1039): each adapter is tested against what its CLI REALLY emits.
// The fixtures are recorded from the real CLIs by scripts/record-agent-fixtures.mjs
// (with the user's hooks, the way a session meets them) and replayed here through
// the same path kj review uses. A fake answer only proves what we think a CLI says.
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { describe, it, expect } from "vitest";
import { createAgent } from "../../src/agents/index.js";
import { buildEnvironment } from "../../src/infrastructure/environment.js";
import { parseReviewVerdict } from "../../src/review/parser.js";

const FIXTURES = new URL("./fixtures/", import.meta.url);
const logger = { info() {}, warn() {}, error() {}, debug() {} };
// Every recording: tests/agents/fixtures/<cli>/review*.json → "<cli>/<file>".
const recorded = existsSync(FIXTURES)
  ? readdirSync(FIXTURES).flatMap((cli) => readdirSync(new URL(`${cli}/`, FIXTURES)).filter((f) => /^review.*\.json$/.test(f)).map((f) => `${cli}/${f}`))
  : [];

describe("agent contract fixtures", () => {
  it("the recordings include claude with and without hooks, and codex", () => {
    expect(recorded).toEqual(expect.arrayContaining(["claude/review.json", "claude/review-hooks.json", "codex/review.json"]));
  });

  describe.each(recorded.map((path) => [path]))("%s", (path) => {
    const cli = path.split("/")[0];
    const fixture = JSON.parse(readFileSync(new URL(path, FIXTURES), "utf8"));
    const runner = { run: async () => ({ exitCode: fixture.exitCode, stdout: fixture.stdout, stderr: fixture.stderr }) };

    it(`kj reads the review verdict from the real ${cli} answer (${fixture.version})`, async () => {
      const agent = createAgent(cli, {}, logger, buildEnvironment({ runner }));
      const result = await agent.reviewTask({ prompt: "recorded", role: "reviewer" });
      expect(result.ok).toBe(true);
      expect(typeof parseReviewVerdict(result.output)?.approved).toBe("boolean");
    });
  });
});
