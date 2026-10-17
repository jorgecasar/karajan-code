// KJC-BUG-0367: with the skills catalog cloned under .karajan/agent-skills, the
// local suite ran the catalog's eval fixtures and went red; .karajan/ is kj's
// runtime, never this repo's tests.
import { describe, it, expect } from "vitest";
import config from "../../vitest.config.js";

describe("vitest excludes", () => {
  it("leaves out kj's runtime directory .karajan/", () => {
    expect(config.test.exclude).toContain(".karajan/**");
  });
});
