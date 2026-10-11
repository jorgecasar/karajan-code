import { describe, it, expect } from "vitest";
import { adoptPreLoopConfig } from "../../src/orchestrator/drivers/init-context.js";

// KJC-BUG-0324 (#2077): the coder was built before the pre-loop with the run's
// first config, so what the pre-loop resolves (the Domain Curator's domain
// context, the methodology) never reached its prompt, in plan runs or any other.
describe("adoptPreLoopConfig", () => {
  it("the run and the coder both take the config the pre-loop resolved", () => {
    const first = { projectDir: "/p", development: { methodology: "tdd" } };
    const resolved = { ...first, domainContext: "### dental\nFDI numbering", development: { methodology: "standard" } };
    const ctx = { config: first, coderRoleInstance: { config: first } };
    adoptPreLoopConfig(ctx, resolved);
    expect(ctx.config).toBe(resolved);
    expect(ctx.coderRoleInstance.config.domainContext).toBe("### dental\nFDI numbering");
    expect(ctx.coderRoleInstance.config.development.methodology).toBe("standard");
  });
});
