#!/usr/bin/env node
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { tools } from "./tools.js";
import { handleToolCall, responseText, enrichedFailPayload } from "./server-handlers.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PKG_PATH = path.resolve(MODULE_DIR, "../../package.json");

function readVersion() {
  return JSON.parse(readFileSync(PKG_PATH, "utf8")).version;
}

const LOADED_VERSION = readVersion();

const server = new Server(
  {
    name: "karajan-mcp",
    version: LOADED_VERSION
  },
  {
    capabilities: {
      tools: {},
      logging: {},
      elicitation: {}
    }
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
  // Auto-exit if package version changed (stale process)
  if (readVersion() !== LOADED_VERSION) process.exit(0);

  const name = request.params?.name;
  const args = request.params?.arguments || {};

  try {
    const result = await handleToolCall(name, args, server, extra);
    return responseText(result);
  } catch (error) {
    return responseText(enrichedFailPayload(error, name));
  }
});

// --- Orphan process protection + version watcher ---
import { setupOrphanGuard, setupVersionWatcher } from "./orphan-guard.js";
setupOrphanGuard();
setupVersionWatcher({ pkgPath: PKG_PATH, currentVersion: LOADED_VERSION });

const transport = new StdioServerTransport();
await server.connect(transport);
