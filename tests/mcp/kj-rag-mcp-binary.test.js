import { describe, it, expect } from "vitest";
import { spawn } from "node:child_process";
import path from "node:path";

const BIN = path.resolve(process.cwd(), "bin/kj-rag-mcp.js");

// KJC-BUG-0319: the binary loads kj's modules before it answers; under the
// full parallel suite that took more than the old 4 s and the test failed
// while passing alone. The bound is a hang detector, not a speed check.
const RESPONSE_TIMEOUT_MS = 60_000;

function send(child, msg) {
  return new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error("timeout")), RESPONSE_TIMEOUT_MS);
    const onData = (chunk) => {
      buf += chunk.toString();
      const nl = buf.indexOf("\n");
      if (nl !== -1) {
        const line = buf.slice(0, nl);
        child.stdout.off("data", onData);
        clearTimeout(timer);
        try { resolve(JSON.parse(line)); } catch (e) { reject(e); }
      }
    };
    child.stdout.on("data", onData);
    child.stdin.write(JSON.stringify(msg) + "\n");
  });
}

describe("kj-rag-mcp standalone binary", () => {
  it("lists exactly the two RAG tools and nothing else", async () => {
    const child = spawn("node", [BIN], { stdio: ["pipe", "pipe", "pipe"] });
    try {
      const res = await send(child, { jsonrpc: "2.0", method: "tools/list", id: 1 });
      const names = res?.result?.tools?.map(t => t.name).sort();
      expect(names).toEqual(["kj_rag_index", "kj_rag_query"]);
    } finally {
      child.kill();
    }
  });

  it("declares text as required parameter for kj_rag_query", async () => {
    const child = spawn("node", [BIN], { stdio: ["pipe", "pipe", "pipe"] });
    try {
      const res = await send(child, { jsonrpc: "2.0", method: "tools/list", id: 2 });
      const query = res.result.tools.find(t => t.name === "kj_rag_query");
      expect(query.inputSchema.required).toContain("text");
    } finally {
      child.kill();
    }
  });
});
