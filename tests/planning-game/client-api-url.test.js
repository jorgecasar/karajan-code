import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchCard } from "../../src/planning-game/client.js";

// KJC-BUG-0322 (#2076): the client only read PG_API_URL and otherwise used
// localhost, so a config with planning_game.api_url failed at init. Order:
// PG_API_URL > planning_game.api_url > localhost; a network error names the URL.
describe("Planning Game client API URL", () => {
  const saved = process.env.PG_API_URL;
  const ok = { ok: true, json: async () => ({ card: { cardId: "C-1" } }) };
  beforeEach(() => { delete process.env.PG_API_URL; global.fetch = vi.fn(async () => ok); });
  afterEach(() => { if (saved === undefined) delete process.env.PG_API_URL; else process.env.PG_API_URL = saved; });

  const calledUrl = () => global.fetch.mock.calls[0][0];

  it("uses the configured api_url", async () => {
    await fetchCard({ projectId: "P", cardId: "C-1", apiUrl: "https://pg.example.test/api" });
    expect(calledUrl()).toBe("https://pg.example.test/api/projects/P/cards/C-1");
  });

  it("PG_API_URL wins over the config, and localhost is the last resort", async () => {
    process.env.PG_API_URL = "https://env.example.test/api";
    await fetchCard({ projectId: "P", cardId: "C-1", apiUrl: "https://pg.example.test/api" });
    expect(calledUrl()).toMatch(/^https:\/\/env\.example\.test\/api\//);
    delete process.env.PG_API_URL;
    await fetchCard({ projectId: "P", cardId: "C-1" });
    expect(global.fetch.mock.calls[1][0]).toMatch(/^http:\/\/localhost:3000\/api\//);
  });

  it("a network error names the URL it tried", async () => {
    global.fetch = vi.fn(async () => { throw new Error("fetch failed"); });
    await expect(fetchCard({ projectId: "P", cardId: "C-1", apiUrl: "https://pg.example.test/api", timeoutMs: 50 }))
      .rejects.toThrow(/https:\/\/pg\.example\.test\/api\/projects\/P\/cards\/C-1/);
  }, 15_000);

  it("the URL in the error never carries credentials or a query token", async () => {
    global.fetch = vi.fn(async () => { throw new Error("fetch failed"); });
    const err = await fetchCard({ projectId: "P", cardId: "C-1", apiUrl: "https://user:s3cret@pg.example.test/api?token=abc", timeoutMs: 50 }).catch((e) => e);
    expect(err.message).toContain("https://pg.example.test/api");
    expect(err.message).not.toMatch(/s3cret|user:|token=abc/);
  }, 15_000);
});
