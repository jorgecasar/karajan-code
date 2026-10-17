// KJC-BUG-0369 (#2196): codex blocked on.schedule + timezone three times,
// claiming GitHub Actions does not support it; it does. A claim that a
// platform lacks a feature the diff uses is not proof: it never blocks alone.
import { describe, it, expect } from "vitest";
import { buildReviewerPrompt } from "../src/prompts/reviewer.js";

describe("reviewer prompt: claims about what a platform supports", () => {
  it("tells the reviewer such a claim is a suggestion unless the diff or task shows it fails", async () => {
    const prompt = await buildReviewerPrompt({ task: "t", diff: "+x", reviewRules: "r", mode: "standard" });
    expect(prompt).toMatch(/does not support/i);
    expect(prompt).toMatch(/non_blocking_suggestions/);
    expect(prompt).toMatch(/training data may predate/i);
  });
});
