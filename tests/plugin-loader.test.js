import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";

describe("plugin loader", () => {
  let tmpDir;
  let loadPlugins;
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "kj-plugin-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  async function writePlugin(dir, name, content) {
    const pluginDir = path.join(dir, ".karajan", "plugins");
    await fs.mkdir(pluginDir, { recursive: true });
    const filePath = path.join(pluginDir, `${name}.js`);
    await fs.writeFile(filePath, content, "utf8");
    return filePath;
  }

  it("loads plugin from project .karajan/plugins/", async () => {
    await writePlugin(tmpDir, "my-agent", `
      export function register({ registerAgent }) {
        class FakeAgent {
          async runTask() { return { ok: true, output: "", error: "", exitCode: 0 }; }
          async reviewTask() { return { ok: true, output: "", error: "", exitCode: 0 }; }
        }
        registerAgent("fake-test-agent", FakeAgent, { bin: "fake" });
        return { name: "my-agent" };
      }
    `);

    const { loadPlugins: lp } = await import("../src/plugins/loader.js");
    const result = await lp({ projectDir: tmpDir, logger });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("my-agent");
  });

  it("skips files without register() export", async () => {
    await writePlugin(tmpDir, "no-register", `export const foo = "bar";`);

    const { loadPlugins: lp } = await import("../src/plugins/loader.js");
    const result = await lp({ projectDir: tmpDir, logger });

    expect(result).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("no register()"));
  });

  it("handles plugin load errors gracefully", async () => {
    await writePlugin(tmpDir, "broken", `throw new Error("broken plugin");`);

    const { loadPlugins: lp } = await import("../src/plugins/loader.js");
    const result = await lp({ projectDir: tmpDir, logger });

    expect(result).toHaveLength(0);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("failed to load"));
  });

  it("returns empty array when no plugin directories exist", async () => {
    const { loadPlugins: lp } = await import("../src/plugins/loader.js");
    const result = await lp({ projectDir: path.join(tmpDir, "nonexistent"), logger });

    expect(result).toEqual([]);
  });

  it("skips non-js files", async () => {
    const pluginDir = path.join(tmpDir, ".karajan", "plugins");
    await fs.mkdir(pluginDir, { recursive: true });
    await fs.writeFile(path.join(pluginDir, "readme.txt"), "not a plugin", "utf8");
    await fs.writeFile(path.join(pluginDir, "data.json"), "{}", "utf8");

    const { loadPlugins: lp } = await import("../src/plugins/loader.js");
    const result = await lp({ projectDir: tmpDir, logger });

    expect(result).toHaveLength(0);
  });

  it("uses filename as plugin name when register returns no name", async () => {
    await writePlugin(tmpDir, "unnamed-plugin", `
      export function register() {
        return {};
      }
    `);

    const { loadPlugins: lp } = await import("../src/plugins/loader.js");
    const result = await lp({ projectDir: tmpDir, logger });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("unnamed-plugin");
  });

  it("provides registerAgent in the plugin API", async () => {
    let apiReceived = null;
    await writePlugin(tmpDir, "api-check", `
      export function register(api) {
        globalThis.__kjPluginApiCheck = api;
        return { name: "api-check" };
      }
    `);

    const { loadPlugins: lp } = await import("../src/plugins/loader.js");
    await lp({ projectDir: tmpDir, logger });

    const api = globalThis.__kjPluginApiCheck;
    expect(typeof api.registerAgent).toBe("function");
    delete globalThis.__kjPluginApiCheck;
  });
});
