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
// The reason each recorded failure gave, as the CLI wrote it.
const FAILURE_REASONS = {
  "gemini/review.json": /IneligibleTierError/,
  "opencode/review.json": /Unable to connect/,
};

// Every recording: tests/agents/fixtures/<cli>/<kind>*.json → "<cli>/<file>".
const recordingsOf = (kind) => (existsSync(FIXTURES)
  ? readdirSync(FIXTURES).flatMap((cli) => readdirSync(new URL(`${cli}/`, FIXTURES)).filter((f) => new RegExp(`^${kind}.*\\.json$`).test(f)).map((f) => `${cli}/${f}`))
  : []);
const recorded = recordingsOf("review");

// KJC-TSK-1044: what each coder (runTask) really answers to "reply with exactly kj-contract-ok".
describe("coder contract fixtures", () => {
  const tasks = recordingsOf("task");

  it("the recordings cover the coder of claude and codex", () => {
    expect(tasks).toEqual(expect.arrayContaining(["claude/task.json", "codex/task.json"]));
  });

  describe.each(tasks.map((p) => [p]))("%s", (p) => {
    const fixture = JSON.parse(readFileSync(new URL(p, FIXTURES), "utf8"));
    const runner = { run: async () => ({ exitCode: fixture.exitCode, stdout: fixture.stdout, stderr: fixture.stderr }) };
    const run = () => createAgent(p.split("/")[0], {}, logger, buildEnvironment({ runner })).runTask({ prompt: "recorded", role: "coder" });

    it(`kj gets the coder's final text from the real answer (${fixture.version})`, async () => {
      const result = await run();
      if (fixture.exitCode === 0) {
        expect(result.ok).toBe(true);
        expect(String(result.output).trim()).toMatch(/^kj-contract-ok$/m);
      } else {
        expect(result.ok).toBe(false);
        expect(result.error).toMatch(FAILURE_REASONS[p]);
      }
    });
  });
});

describe("agent contract fixtures", () => {
  it("the recordings cover claude with and without hooks, codex, copilot, agy, gemini and opencode", () => {
    expect(recorded).toEqual(expect.arrayContaining([
      "claude/review.json", "claude/review-hooks.json", "codex/review.json",
      "copilot/review.json", "agy/review.json", "gemini/review.json", "opencode/review.json",
    ]));
  });

  describe.each(recorded.map((path) => [path]))("%s", (path) => {
    const cli = path.split("/")[0];
    const fixture = JSON.parse(readFileSync(new URL(path, FIXTURES), "utf8"));
    const runner = { run: async () => ({ exitCode: fixture.exitCode, stdout: fixture.stdout, stderr: fixture.stderr }) };

    const review = () => createAgent(cli, {}, logger, buildEnvironment({ runner })).reviewTask({ prompt: "recorded", role: "reviewer" });

    if (fixture.exitCode === 0) {
      it(`kj reads the review verdict from the real ${cli} answer (${fixture.version})`, async () => {
        const result = await review();
        expect(result.ok).toBe(true);
        expect(typeof parseReviewVerdict(result.output)?.approved).toBe("boolean");
      });
    } else {
      // KJC-BUG-0358: a real failure must reach kj WITH the CLI's own reason, never as "no output".
      it(`kj reports the real ${cli} failure with its reason (${fixture.version})`, async () => {
        const result = await review();
        expect(result.ok).toBe(false);
        expect(FAILURE_REASONS[path], `declare the recorded reason of ${path} in FAILURE_REASONS`).toBeInstanceOf(RegExp);
        expect(result.error).toMatch(FAILURE_REASONS[path]);
      });
    }
  });
});
