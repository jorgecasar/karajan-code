// KJC-TSK-1040 (QS-C): a weekly job records what the real claude CLI answers
// and replays the agent contract test against it. It only informs: never on a
// pull request, never red for a missing secret, findings in one tracking issue.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import yaml from "js-yaml";

const raw = readFileSync(new URL("../.github/workflows/real-cli-weekly.yml", import.meta.url), "utf8");
const wf = yaml.load(raw);
const steps = wf.jobs.contract.steps;
const step = (name) => steps.find((s) => s.name === name);

describe("real-cli weekly workflow", () => {
  it("runs weekly or by hand, never on a pull request or push", () => {
    expect(Object.keys(wf.on).toSorted()).toEqual(["schedule", "workflow_dispatch"]);
    expect(wf.on.schedule[0].cron).toMatch(/^\d+ \d+ \* \* [0-6]$/);
  });

  it("without the secret it says so and stops green", () => {
    const check = step("Check the API key");
    expect(check.run).toMatch(/ANTHROPIC_API_KEY/);
    expect(check.run).toMatch(/::notice::/);
    expect(step("Record the real claude answers").if).toMatch(/steps\.key\.outputs\.present == 'true'/);
  });

  it("records review and task answers through kj's own adapter, then replays the contract test", () => {
    expect(step("Record the real claude answers").run).toMatch(/record-agent-fixtures\.mjs claude[\s\S]*record-agent-fixtures\.mjs claude --task/);
    expect(step("Replay the agent contract").run).toMatch(/tests\/agents\/agent-contract-fixtures\.test\.js/);
  });

  it("reports in one tracking issue with the CLI version, and pins every action by sha", () => {
    expect(step("Upsert tracking issue").with.script).toMatch(/real-cli-weekly/);
    expect(step("Upsert tracking issue").with.script).toMatch(/version/);
    for (const s of steps.filter((x) => x.uses)) expect(s.uses).toMatch(/@[0-9a-f]{40}/);
    expect(wf.permissions).toEqual({ contents: "read", issues: "write" });
  });
});
