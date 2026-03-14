import { describe, it, expect, vi, beforeEach } from "vitest";
import { createArchitectADRs } from "../src/planning-game/architect-adrs.js";

describe("createArchitectADRs", () => {
  describe("PG-linked creation", () => {
    let mockClient;

    beforeEach(() => {
      mockClient = {
        createAdr: vi.fn().mockResolvedValue({ adrId: "ADR-001" })
      };
    });

    it("creates one ADR per tradeoff via client", async () => {
      const result = await createArchitectADRs({
        tradeoffs: ["Use REST over GraphQL for simplicity", "SQLite over Postgres for portability"],
        pgTaskId: "KJC-TSK-0042",
        pgProject: "KJC",
        taskTitle: "Implement user API",
        mcpClient: mockClient
      });

      expect(mockClient.createAdr).toHaveBeenCalledTimes(2);
      expect(result.created).toBe(2);
      expect(result.adrs).toHaveLength(2);
    });

    it("passes correct ADR fields to client", async () => {
      await createArchitectADRs({
        tradeoffs: ["Use REST over GraphQL for simplicity"],
        pgTaskId: "KJC-TSK-0042",
        pgProject: "KJC",
        taskTitle: "Implement user API",
        mcpClient: mockClient
      });

      const call = mockClient.createAdr.mock.calls[0][0];
      expect(call.projectId).toBe("KJC");
      expect(call.adr.title).toBe("Use REST over GraphQL for simplicity");
      expect(call.adr.status).toBe("accepted");
      expect(call.adr.context).toContain("Implement user API");
      expect(call.adr.decision).toBe("Use REST over GraphQL for simplicity");
    });

    it("continues if one ADR creation fails", async () => {
      mockClient.createAdr
        .mockRejectedValueOnce(new Error("API error"))
        .mockResolvedValueOnce({ adrId: "ADR-002" });

      const result = await createArchitectADRs({
        tradeoffs: ["Tradeoff A", "Tradeoff B"],
        pgTaskId: "KJC-TSK-0042",
        pgProject: "KJC",
        taskTitle: "Some task",
        mcpClient: mockClient
      });

      expect(mockClient.createAdr).toHaveBeenCalledTimes(2);
      expect(result.created).toBe(1);
      expect(result.adrs).toHaveLength(1);
    });
  });

  describe("no-PG suggestion mode", () => {
    it("returns suggestions without calling client when no pgTaskId", async () => {
      const result = await createArchitectADRs({
        tradeoffs: ["Use caching for performance"],
        pgTaskId: null,
        pgProject: null,
        taskTitle: "Optimize queries",
        mcpClient: null
      });

      expect(result.created).toBe(0);
      expect(result.adrs).toHaveLength(1);
      expect(result.adrs[0].title).toBe("Use caching for performance");
      expect(result.adrs[0].status).toBe("accepted");
      expect(result.adrs[0].suggestion).toBe(true);
    });

    it("returns suggestions when no pgProject", async () => {
      const result = await createArchitectADRs({
        tradeoffs: ["Tradeoff X"],
        pgTaskId: "KJC-TSK-0042",
        pgProject: null,
        taskTitle: "Task Y",
        mcpClient: null
      });

      expect(result.created).toBe(0);
      expect(result.adrs).toHaveLength(1);
      expect(result.adrs[0].suggestion).toBe(true);
    });
  });

  describe("empty tradeoffs", () => {
    it("returns empty result for empty array", async () => {
      const result = await createArchitectADRs({
        tradeoffs: [],
        pgTaskId: "KJC-TSK-0042",
        pgProject: "KJC",
        taskTitle: "Some task",
        mcpClient: {}
      });

      expect(result.created).toBe(0);
      expect(result.adrs).toEqual([]);
    });

    it("returns empty result for undefined tradeoffs", async () => {
      const result = await createArchitectADRs({
        tradeoffs: undefined,
        pgTaskId: "KJC-TSK-0042",
        pgProject: "KJC",
        taskTitle: "Some task",
        mcpClient: {}
      });

      expect(result.created).toBe(0);
      expect(result.adrs).toEqual([]);
    });

    it("returns empty result for null tradeoffs", async () => {
      const result = await createArchitectADRs({
        tradeoffs: null,
        pgTaskId: "KJC-TSK-0042",
        pgProject: "KJC",
        taskTitle: "Some task",
        mcpClient: {}
      });

      expect(result.created).toBe(0);
      expect(result.adrs).toEqual([]);
    });
  });
});
