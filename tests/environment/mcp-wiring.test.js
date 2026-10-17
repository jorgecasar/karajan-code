// KJC-TSK-0711 — RAG as a NATIVE tool: env install wires kj-rag-mcp into the
// project's .mcp.json so agents query the RAG because it is their cheapest
// path, not because a text line asked them to.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installProjectMcp } from "../../src/environment/mcp-wiring.js";

let dir;
const mcpPath = () => path.join(dir, ".mcp.json");
const read = () => JSON.parse(fs.readFileSync(mcpPath(), "utf8"));

beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), "kj-mcpwire-")); });
afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("installProjectMcp", () => {
  it("creates .mcp.json with the kj-rag server when absent", () => {
    const res = installProjectMcp({ projectDir: dir, logger: { info() {}, warn() {} } });
    expect(res.wired).toBe(true);
    expect(read().mcpServers["kj-rag"].command).toBe("kj-rag-mcp");
  });

  it("preserves existing servers and is idempotent", () => {
    fs.writeFileSync(mcpPath(), JSON.stringify({ mcpServers: { mine: { command: "my-server" } } }));
    installProjectMcp({ projectDir: dir, logger: { info() {}, warn() {} } });
    installProjectMcp({ projectDir: dir, logger: { info() {}, warn() {} } });
    const cfg = read();
    expect(cfg.mcpServers.mine.command).toBe("my-server");
    expect(Object.keys(cfg.mcpServers).filter((k) => JSON.stringify(cfg.mcpServers[k]).includes("kj-rag-mcp"))).toHaveLength(1);
  });

  it("a user entry already pointing at kj-rag-mcp counts as wired — no duplicate key added", () => {
    fs.writeFileSync(mcpPath(), JSON.stringify({ mcpServers: { "my-kj": { command: "kj-rag-mcp" } } }));
    const res = installProjectMcp({ projectDir: dir, logger: { info() {}, warn() {} } });
    expect(res.wired).toBe(true);
    expect(read().mcpServers["kj-rag"]).toBeUndefined();
  });

  it("invalid JSON is left untouched (preserve, never clobber)", () => {
    fs.writeFileSync(mcpPath(), "{ not json");
    const res = installProjectMcp({ projectDir: dir, logger: { info() {}, warn() {} } });
    expect(res.wired).toBe(false);
    expect(fs.readFileSync(mcpPath(), "utf8")).toBe("{ not json");
  });
});

// KJC-TSK-1067: qmd answers questions about the project's documents (docs,
// notes, ADRs, plans) with fewer tokens and a source. kj init already installs
// it and registers the collections; env install now puts it in the agent's toolbox.
describe("installProjectMcp wires qmd", () => {
  const quiet = { info() {}, warn() {} };
  it("with qmd installed and not wired anywhere, adds it to the project as qmd mcp", () => {
    const res = installProjectMcp({ projectDir: dir, logger: quiet, qmd: { installed: () => true, wiredGlobally: () => false } });
    expect(read().mcpServers.qmd).toEqual({ command: "qmd", args: ["mcp"] });
    expect(res.qmd).toBe("added");
  });

  it("never twice: not when the user already has it globally or in the project, nor without qmd", () => {
    installProjectMcp({ projectDir: dir, logger: quiet, qmd: { installed: () => true, wiredGlobally: () => true } });
    expect(read().mcpServers.qmd).toBeUndefined();
    installProjectMcp({ projectDir: dir, logger: quiet, qmd: { installed: () => false, wiredGlobally: () => false } });
    expect(read().mcpServers.qmd).toBeUndefined();
    fs.writeFileSync(mcpPath(), JSON.stringify({ mcpServers: { docs: { command: "/usr/bin/qmd", args: ["mcp"] } } }));
    const res = installProjectMcp({ projectDir: dir, logger: quiet, qmd: { installed: () => true, wiredGlobally: () => false } });
    expect(Object.keys(read().mcpServers)).toEqual(["docs", "kj-rag"]);
    expect(res.qmd).toBe("present");
  });
});
