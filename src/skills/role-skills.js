/**
 * KJC-TSK-1065: the skills kj picks for a role and a task reach the prompt.
 * Before, the addyosmani catalog was resolved and only written to the journal.
 * Order: the project's own skills (.agent/skills and friends), then the local
 * catalog by TASK (a UI task gets frontend-ui-engineering) and by ROLE, up to
 * MAX_SKILLS; the rest are named, never silently lost. The maintainer's
 * choices (2026-10-17): local catalog + project skills, 3 per role.
 */
import { loadAvailableSkills, filterSkillsForRole } from "./skill-loader.js";
import { listAvailableSlugs, loadSkillsBySlugs } from "./addyosmani-catalog.js";
import { resolveAddyosmaniSlugs } from "./addyosmani-role-map.js";

export const MAX_SKILLS = 3;

const defaultDeps = {
  loadLocal: async (projectDir, role) => {
    const all = projectDir ? await loadAvailableSkills(projectDir) : [];
    return role === "coder" ? all : filterSkillsForRole(all, role);
  },
  listCatalog: () => listAvailableSlugs(),
  loadCatalog: (slugs) => loadSkillsBySlugs(slugs),
};

/** @returns {Promise<{skills: Array<{name: string, content: string, path?: string, catalog?: true}>, dropped: string[]}>} */
export async function roleSkills({ role, task, projectDir, max = MAX_SKILLS, deps = defaultDeps }) {
  const local = await deps.loadLocal(projectDir, role);
  const available = new Set(await deps.listCatalog());
  const ordered = [...new Set([...resolveAddyosmaniSlugs({ task }), ...resolveAddyosmaniSlugs({ role })])].filter((s) => available.has(s));
  const room = Math.max(0, max - local.length);
  const catalog = (await deps.loadCatalog(ordered.slice(0, room))).map((s) => ({ name: s.name, content: s.content, path: s.path, catalog: true }));
  const dropped = [...local.slice(max).map((s) => s.name), ...ordered.slice(room)];
  return { skills: [...local.slice(0, max), ...catalog], dropped };
}

/**
 * The prompt section. For claude, the project's skills are native to its
 * runtime, but a catalog skill is not: it is named with the path to read.
 * Other providers get the content inline.
 */
export function buildRoleSkillSection({ skills, dropped }, { provider } = {}) {
  if (skills.length === 0) return "";
  const lines = ["## Domain Skills", ""];
  if (["claude", "anthropic"].includes(String(provider).toLowerCase())) {
    const native = skills.filter((s) => !s.catalog).map((s) => s.name);
    if (native.length) lines.push(`Skills available natively via your Agent Skills capability: ${native.join(", ")}.`);
    const toRead = skills.filter((s) => s.catalog);
    if (toRead.length) lines.push("Read these skills before you start, and follow them:", ...toRead.map((s) => `- ${s.name}: read ${s.path}`));
  } else {
    lines.push("The following domain-specific knowledge is available for this task:", ...skills.map((s) => `### ${s.name}\n${s.content}`));
  }
  if (dropped.length) lines.push("", `Left out (limit ${MAX_SKILLS}): ${dropped.join(", ")}`);
  return lines.join("\n");
}
