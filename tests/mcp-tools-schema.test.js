import { describe, expect, it } from "vitest";
import { tools } from "../src/mcp/tools.js";

describe("MCP tools schema", () => {
  it("keeps legacy coder aliases in kj_plan input schema", () => {
    const planTool = tools.find((tool) => tool.name === "kj_plan");

    expect(planTool).toBeDefined();
    expect(planTool.inputSchema?.properties?.coder?.type).toBe("string");
    expect(planTool.inputSchema?.properties?.coderModel?.type).toBe("string");
  });

  it("exposes taskType as optional enum in kj_run schema", () => {
    const runTool = tools.find((tool) => tool.name === "kj_run");

    expect(runTool).toBeDefined();
    const prop = runTool.inputSchema?.properties?.taskType;
    expect(prop).toBeDefined();
    expect(prop.type).toBe("string");
    expect(prop.enum).toEqual(["sw", "infra", "doc", "add-tests", "refactor"]);
    // taskType should NOT be required
    expect(runTool.inputSchema?.required || []).not.toContain("taskType");
  });

  it("exposes sessionId and format fields for kj_report", () => {
    const reportTool = tools.find((tool) => tool.name === "kj_report");

    expect(reportTool).toBeDefined();
    expect(reportTool.inputSchema?.properties?.sessionId?.type).toBe("string");
    expect(reportTool.inputSchema?.properties?.format?.enum).toEqual(["text", "json"]);
  });
});
