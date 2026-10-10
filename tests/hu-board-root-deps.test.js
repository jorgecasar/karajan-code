// KJC-BUG-0310: the HU Board ships inside the root package (its src and public go in
// "files"), so a global install resolves its imports from the ROOT's dependencies.
// ws, @xterm/xterm and node-pty were only in packages/hu-board/package.json: on a
// global install the board did not start.
import { readFileSync } from "node:fs";

import { expect, it } from "vitest";

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const root = read("../package.json");
const board = read("../packages/hu-board/package.json");

it("every dependency of the HU Board is declared by the root package", () => {
  const declared = { ...root.dependencies, ...root.optionalDependencies };
  const missing = Object.keys(board.dependencies).filter((dep) => !declared[dep]);
  expect(missing, "add them to the root package.json (native ones as optionalDependencies)").toEqual([]);
});
