/**
 * KJC-BUG-0348 (#2115): ranking alone decides what a query returns, and in a
 * large index a freshly indexed file (an .astro page) never made the top hits,
 * neither by its path nor by its text: the rag-first gate kept blocking it.
 * A query that NAMES an indexed file returns that file first, deterministically.
 */
import { isAbsolute, relative } from "node:path";

// A path-like token: segments joined by "/" ending in a file extension.
const PATH_TOKEN = /[\w@.-]+(?:\/[\w@.-]+)*\.[A-Za-z0-9]+/g;

const parseMetadata = (raw) => {
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
};

/** @returns {object[]} the first chunk of each indexed file of `project` the text names */
export function pathNamedHits(db, text, { project, projectDir }) {
  const tokens = [...new Set(String(text || "").match(PATH_TOKEN) ?? [])];
  if (!project || tokens.length === 0) return [];
  const sources = db.prepare("SELECT DISTINCT source FROM chunks WHERE project_slug = ?").all(project).map((r) => r.source);
  const named = sources.filter((source) => {
    const rel = (isAbsolute(source) ? relative(projectDir, source) : source).split("\\").join("/");
    return tokens.some((t) => rel === t || rel.endsWith(`/${t}`));
  });
  const first = db.prepare("SELECT id, source, kind, text, metadata, project_slug FROM chunks WHERE project_slug = ? AND source = ? ORDER BY id LIMIT 1");
  return named.map((source) => {
    const row = first.get(project, source);
    return { ...row, metadata: parseMetadata(row.metadata), distance: 0, score: 0, matchedBy: "path" };
  });
}

/** The named files first, then the ranked hits, never the same chunk twice, at most topK. */
export function withPathNamedHits(named, ranked, topK) {
  const ids = new Set(named.map((h) => h.id));
  return [...named, ...ranked.filter((h) => !ids.has(h.id))].slice(0, topK);
}
