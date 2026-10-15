// KJC-TSK-1047 (TEAM-A): in a team on one repo, starting a card reserves it, so
// two people never work the same card without knowing. Releasing it is explicit.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { huCommand } from "../../src/commands/hu.js";

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "kj-hu-claim-"));
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => { vi.restoreAllMocks(); fs.rmSync(dir, { recursive: true, force: true }); });

const hu = (action, args, { who, flags = {} } = {}) => huCommand({ config: { projectDir: dir }, action, args, flags: { json: true, ...flags }, deps: { who } });
const card = async () => (await hu("list", [])).find((h) => h.short_id === "T-1");

describe("kj hu move reserves the card", () => {
  beforeEach(async () => { await hu("add", ["Shared work"], { flags: { id: "T-1" } }); });

  it("moving to running records who and since when", async () => {
    await hu("move", ["T-1", "running"], { who: "ana" });
    expect(await card()).toMatchObject({ status: "running", claimed_by: "ana" });
    expect(Date.parse((await card()).claimed_at)).not.toBeNaN();
  });

  it("someone else cannot move a running card reserved by another person, and is told who and since when", async () => {
    await hu("move", ["T-1", "running"], { who: "ana" });
    await expect(hu("move", ["T-1", "done"], { who: "luis" })).rejects.toThrow(/T-1 is reserved by ana since .*--release/);
    expect(await card()).toMatchObject({ status: "running", claimed_by: "ana" });
  });

  it("a caller kj cannot identify is not the one who reserved it, and starting a card unidentified says it is not reserved", async () => {
    await hu("move", ["T-1", "running"], { who: "ana" });
    await expect(hu("move", ["T-1", "done"], { who: null })).rejects.toThrow(/reserved by ana/);
    await hu("move", ["T-1", "pending"], { who: "ana" });
    await hu("move", ["T-1", "running"], { who: null });
    expect(console.warn).toHaveBeenCalledWith(expect.stringMatching(/T-1 is not reserved.*kj identity set/));
    expect(await card()).toMatchObject({ status: "running", claimed_by: null });
  });

  it("--release is the explicit act: the card moves and the reservation passes to who releases it", async () => {
    await hu("move", ["T-1", "running"], { who: "ana" });
    await hu("move", ["T-1", "running"], { who: "luis", flags: { release: true } });
    expect(await card()).toMatchObject({ status: "running", claimed_by: "luis" });
  });

  it("a running card started without an identity is reserved once kj knows who moves it again", async () => {
    await hu("move", ["T-1", "running"], { who: null });
    await hu("move", ["T-1", "running"], { who: "ana" });
    expect(await card()).toMatchObject({ status: "running", claimed_by: "ana" });
  });

  it("releasing it to another status leaves on record who released it", async () => {
    await hu("move", ["T-1", "running"], { who: "ana" });
    await hu("move", ["T-1", "done"], { who: "luis", flags: { release: true } });
    expect(await card()).toMatchObject({ status: "done", claimed_by: "luis" });
  });

  it("the same person moves it freely, and once out of running anyone can take it", async () => {
    await hu("move", ["T-1", "running"], { who: "ana" });
    await hu("move", ["T-1", "pending"], { who: "ana" });
    await hu("move", ["T-1", "running"], { who: "luis" });
    expect(await card()).toMatchObject({ status: "running", claimed_by: "luis" });
  });
});
