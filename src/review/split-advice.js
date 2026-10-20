/**
 * split-advice (KJC-TSK-1101, #2263): how to split a large third-party PR. Zero
 * tokens and reproducible: files are grouped by the project's real structure (the
 * Java/Kotlin package under the common prefix, the folder under src/ in JS/TS,
 * tests and resources apart), a group still too large is split by its next level,
 * and chunks are ordered by layer so each one builds on the ones before it. It is
 * advice: it never counts as a finding and never changes the verdict.
 */

const LAYERS = [
  { rank: 0, names: ["config"], purpose: "build and project configuration" },
  { rank: 1, names: ["resources"], purpose: "configuration and data files the code reads" },
  { rank: 2, names: ["model", "models", "domain", "entity", "entities", "dto", "types"], purpose: "the data types the rest builds on" },
  { rank: 3, names: ["utils", "util", "common", "helpers", "core", "support", "shared"], purpose: "shared helpers used by the layers above" },
  { rank: 4, names: ["api", "client", "clients", "services", "service", "repository", "data"], purpose: "access to services and APIs" },
  { rank: 5, names: ["pages", "page", "components", "ui", "views", "screens"], purpose: "what the user sees: pages and components" },
  { rank: 6, names: ["flows", "flow", "steps", "scenarios", "features", "workflows"], purpose: "flows that combine pages and services" },
  { rank: 8, names: ["tests"], purpose: "the tests that exercise the chunks above" },
];
const OTHER_RANK = 7;

const isTest = (f) => /(^|\/)src\/test\/|(^|\/)(tests?|__tests__|e2e|spec)\/|\.(test|spec)\.[a-z]+$/.test(f);
const dirsOf = (path) => path.split("/").slice(0, -1);

function commonPrefix(lists) {
  if (lists.length === 0) return [];
  let n = Math.min(...lists.map((l) => l.length));
  for (let i = 0; i < n; i++) if (!lists.every((l) => l[i] === lists[0][i])) n = i;
  return lists[0].slice(0, n);
}

/** The structural path of each file: the segments that tell its responsibility. */
function keysOf(files) {
  // KJC-BUG-0383: main and test source sets alike; a Maven PR can live wholly under src/test/java.
  const javaMain = /(^|\/)src\/(?:main|test)\/(java|kotlin)\/(.+)$/;
  const javaDirs = files.map((f) => javaMain.exec(f.file)).filter(Boolean).map((m) => dirsOf(m[3]));
  // The root package (com/acme/app), never a layer: a PR that only touches pages/ keeps "pages".
  const common = commonPrefix(javaDirs);
  const layerAt = common.findIndex((seg) => layerOf(seg));
  const prefix = layerAt === -1 ? common : common.slice(0, layerAt);
  return files.map(({ file }) => {
    if (/(^|\/)src\/(main|test)\/resources\//.test(file)) return ["resources"];
    const java = javaMain.exec(file);
    if (java) {
      const rest = dirsOf(java[3]).slice(prefix.length);
      return rest.length > 0 ? rest : ["main"];
    }
    if (isTest(file)) return ["tests"];
    const src = /(^|\/)src\/(.+)$/.exec(file);
    if (src && dirsOf(src[2]).length > 0) return dirsOf(src[2]);
    const dirs = dirsOf(file);
    return dirs.length === 0 || dirs[0].startsWith(".") ? ["config"] : dirs;
  });
}

function group(entries, depth) {
  const groups = new Map();
  for (const e of entries) {
    const name = e.key.slice(0, depth).join("/");
    groups.set(name, [...(groups.get(name) ?? []), e]);
  }
  return [...groups].map(([name, items]) => ({ name, items, lines: items.reduce((n, i) => n + i.changed, 0), depth }));
}

// KJC-BUG-0383: a chunk holding more than this share of the files is split one level down.
const MAX_FILE_SHARE = 0.6;

/** Groups by the first segment, then splits any group over `limit` or the file share by its next level. */
function chunksOf(entries, limit) {
  const out = [];
  const pending = group(entries, 1);
  while (pending.length > 0) {
    const g = pending.shift();
    const deeper = g.items.some((i) => i.key.length > g.depth);
    const tooBig = g.lines > limit || g.items.length > entries.length * MAX_FILE_SHARE;
    // Going down only helps when it really splits the group: past a lone subpackage, keep going.
    let depth = g.depth + 1;
    let sub = tooBig && deeper ? group(g.items, depth) : [];
    while (sub.length === 1 && g.items.some((i) => i.key.length > depth)) sub = group(g.items, ++depth);
    if (sub.length > 1) pending.push(...sub);
    else out.push(g);
  }
  return out;
}

const layerOf = (name) => LAYERS.find((l) => l.names.includes(name.split("/")[0])) ?? null;

/**
 * @param {{file: string, changed: number}[]} files the PR's files and changed lines
 * @param {{limit: number}} opts the size one chunk should stay under
 */
export function splitAdvice(files, { limit }) {
  const keys = keysOf(files);
  const entries = files.map((f, i) => ({ ...f, key: keys[i] }));
  const total = files.reduce((n, f) => n + f.changed, 0);
  const chunks = chunksOf(entries, limit)
    .map((g) => ({ ...g, rank: layerOf(g.name)?.rank ?? OTHER_RANK }))
    .sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name))
    .map((g, i) => ({
      order: i + 1,
      name: g.name,
      purpose: layerOf(g.name)?.purpose ?? `changes under ${g.name}`,
      files: g.items.map((e) => e.file),
      lines: g.lines,
    }));
  return {
    why: `This PR changes ${files.length} files and ${total} lines. Past a few hundred lines a reviewer misses more and the review takes longer; PRs with one purpose each get a better review and merge sooner.`,
    order: "Each chunk builds on the ones before it (configuration, data types, helpers, services, pages, flows, tests), so it can compile and pass its tests on its own.",
    chunks,
  };
}
