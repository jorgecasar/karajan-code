// KJC-BUG-0348 (#2115): in a large index a freshly indexed .astro page never
// ranked in the top hits, neither by its path nor by its text, so the
// rag-first gate kept blocking it. A query that names an indexed file now
// returns that file first.
import { describe, it, expect, beforeEach } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { pathNamedHits, withPathNamedHits } from "../../src/rag/path-hits.js";

const DIR = "/work/app";
let db;

beforeEach(() => {
  db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE chunks (id INTEGER PRIMARY KEY, source TEXT, kind TEXT, text TEXT, metadata TEXT, project_slug TEXT)");
  const add = db.prepare("INSERT INTO chunks (source, kind, text, metadata, project_slug) VALUES (?, 'code', ?, '{}', ?)");
  add.run(`${DIR}/src/pages/radar.astro`, "<h1>Competitor radar</h1>", "app");
  add.run(`${DIR}/src/pages/radar.astro`, "<ul>threats</ul>", "app");
  add.run(`${DIR}/src/util.js`, "export const sum", "app");
  add.run("/elsewhere/src/pages/radar.astro", "another project", "other");
});

describe("pathNamedHits", () => {
  it("returns the first chunk of a file the query names by its path", () => {
    const hits = pathNamedHits(db, "what does src/pages/radar.astro render", { project: "app", projectDir: DIR });
    expect(hits.map((h) => [h.source, h.text])).toEqual([[`${DIR}/src/pages/radar.astro`, "<h1>Competitor radar</h1>"]]);
    expect(hits[0].metadata).toEqual({});
  });

  it("matches a bare file name too", () => {
    expect(pathNamedHits(db, "radar.astro", { project: "app", projectDir: DIR }).map((h) => h.source)).toEqual([`${DIR}/src/pages/radar.astro`]);
  });

  it("returns nothing for prose without an indexed path, or for another project", () => {
    expect(pathNamedHits(db, "how is the radar rendered", { project: "app", projectDir: DIR })).toEqual([]);
    expect(pathNamedHits(db, "src/missing.astro", { project: "app", projectDir: DIR })).toEqual([]);
    expect(pathNamedHits(db, "src/pages/radar.astro", { project: "nope", projectDir: DIR })).toEqual([]);
  });

  it("does not match a file whose name only ends the same way", () => {
    expect(pathNamedHits(db, "dar.astro", { project: "app", projectDir: DIR })).toEqual([]);
  });
});

describe("withPathNamedHits", () => {
  it("puts the named files first and keeps the ranked hits without repeating a chunk", () => {
    const named = [{ id: 1, source: "a" }];
    const ranked = [{ id: 3, source: "b" }, { id: 1, source: "a" }, { id: 2, source: "a" }];
    expect(withPathNamedHits(named, ranked, 5).map((h) => h.id)).toEqual([1, 3, 2]);
  });

  it("never returns more than topK hits", () => {
    const ranked = [{ id: 3, source: "b" }, { id: 4, source: "c" }];
    expect(withPathNamedHits([{ id: 1, source: "a" }], ranked, 2).map((h) => h.id)).toEqual([1, 3]);
  });
});
