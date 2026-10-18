// KJC-BUG-0376: kj harden seeded a JavaScript-only eslint.config.js into a TypeScript
// root. Once ESLint 9 applied it, every .ts/.tsx file failed with "Parsing error".
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { ESLint } from "eslint";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { installConfigs } from "../../src/harden/config-engine.js";

let dir;
const pkg = (devDependencies) => writeFileSync(join(dir, "package.json"), JSON.stringify({ devDependencies }));
const config = () => readFileSync(join(dir, "eslint.config.js"), "utf8");
const eslintOf = ({ configs }) => configs.find((r) => r.file === "eslint.config.js");

beforeEach(() => { dir = mkdtempSync(join(tmpdir(), "kj-eslint-ts-")); });
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("seeded eslint.config.js in a TypeScript root", () => {
  it("parses TypeScript with @typescript-eslint/parser, and is valid JavaScript itself", async () => {
    pkg({ eslint: "^9", typescript: "^5", "@typescript-eslint/parser": "^8" });
    installConfigs({ projectDir: dir, language: "typescript" });
    expect(config()).toContain('import tsParser from "@typescript-eslint/parser";');
    expect(config()).toMatch(/languageOptions: \{ parser: tsParser,/);
    const [result] = await new ESLint({ overrideConfigFile: true, cwd: dir }).lintText(config(), { filePath: join(dir, "check.mjs") });
    expect(result.messages.filter((m) => m.fatal)).toEqual([]);
  });

  it("is not seeded without the parser, and kj says what to install", () => {
    pkg({ eslint: "^9", typescript: "^5" });
    const results = installConfigs({ projectDir: dir, language: "typescript" });
    expect(existsSync(join(dir, "eslint.config.js"))).toBe(false);
    expect(eslintOf(results)).toMatchObject({ action: "omitted" });
    expect(eslintOf(results).note).toMatch(/npm i -D @typescript-eslint\/parser/);
  });

  it("does not turn an existing JavaScript block into one the project cannot load", () => {
    pkg({ eslint: "^9" });
    installConfigs({ projectDir: dir, language: "javascript" });
    const before = config();
    pkg({ eslint: "^9", typescript: "^5" });
    const results = installConfigs({ projectDir: dir, language: "typescript" });
    expect(config()).toBe(before);
    expect(eslintOf(results)).toMatchObject({ action: "omitted" });
  });

  it("leaves a JavaScript root's config as it was", () => {
    pkg({ eslint: "^9" });
    installConfigs({ projectDir: dir, language: "javascript" });
    expect(config()).not.toContain("tsParser");
  });
});
