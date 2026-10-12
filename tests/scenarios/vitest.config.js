// KJC-TSK-1022 (QS-A): the scenario battery runs apart from the unit suite (real
// git, the real harness, kj as a subprocess): npm run test:scenarios, and it is
// required green before a release.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // *.scenario.js, not *.test.js: the unit suite never picks them up.
    include: ["tests/scenarios/**/*.scenario.js"],
    testTimeout: 300_000,
    hookTimeout: 300_000,
    pool: "forks",
    fileParallelism: false,
  },
});
