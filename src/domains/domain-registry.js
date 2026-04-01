/**
 * Local domain registry.
 * Tracks installed domains in ~/.karajan/domain-registry.json.
 * Provides search and filtering by tags/hints.
 * Interface prepared for future remote registry extension.
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { getKarajanHome } from "../utils/paths.js";

const REGISTRY_FILE = "domain-registry.json";
const SCHEMA_VERSION = 1;

/**
 * @typedef {Object} RegistryEntry
 * @property {string} name
 * @property {string} [description]
 * @property {string} version
 * @property {string} source — "local" (future: "remote")
 * @property {string} installedAt — ISO timestamp
 * @property {string} filePath — absolute path to DOMAIN.md
 * @property {string[]} tags
 */

export class DomainRegistry {
  /**
   * @param {Record<string, RegistryEntry>} domains
   */
  constructor(domains = {}) {
    this._domains = domains;
  }

  /**
   * Load registry from disk. Creates empty registry if file is missing or corrupt.
   * @returns {Promise<DomainRegistry>}
   */
  static async load() {
    const filePath = join(getKarajanHome(), REGISTRY_FILE);
    try {
      const raw = await readFile(filePath, "utf-8");
      const data = JSON.parse(raw);
      if (data?.schemaVersion === SCHEMA_VERSION && data.domains) {
        return new DomainRegistry(data.domains);
      }
    } catch { /* file missing, corrupt, or wrong schema */ }
    return new DomainRegistry();
  }

  /**
   * Persist registry to disk.
   */
  async save() {
    const home = getKarajanHome();
    await mkdir(home, { recursive: true });
    const filePath = join(home, REGISTRY_FILE);
    const data = {
      schemaVersion: SCHEMA_VERSION,
      domains: this._domains
    };
    await writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  }

  /**
   * Register or update a domain in the registry.
   * @param {{name: string, version?: string, tags?: string[], filePath?: string, description?: string}} domainFile
   */
  register(domainFile) {
    this._domains[domainFile.name] = {
      name: domainFile.name,
      description: domainFile.description || "",
      version: domainFile.version || "0.0.0",
      source: "local",
      installedAt: new Date().toISOString(),
      filePath: domainFile.filePath || "",
      tags: domainFile.tags || []
    };
  }

  /**
   * List domains, optionally filtered by tags and/or free-text query.
   * @param {{tags?: string[], query?: string}} [filters]
   * @returns {RegistryEntry[]}
   */
  list(filters = {}) {
    let entries = Object.values(this._domains);

    if (filters.tags?.length) {
      const tagSet = new Set(filters.tags.map(t => t.toLowerCase()));
      entries = entries.filter(e =>
        e.tags?.some(t => tagSet.has(t.toLowerCase()))
      );
    }

    if (filters.query) {
      const q = filters.query.toLowerCase();
      entries = entries.filter(e =>
        (e.name || "").toLowerCase().includes(q) ||
        (e.description || "").toLowerCase().includes(q)
      );
    }

    return entries;
  }

  /**
   * Search domains by triage hints.
   * Matches hints against tags, name and description.
   * Returns results ranked by number of matching hints.
   * @param {string[]} hints — keywords from triage domainHints
   * @returns {RegistryEntry[]}
   */
  search(hints) {
    if (!hints?.length) return [];

    const lowerHints = hints.map(h => h.toLowerCase());
    const entries = Object.values(this._domains);
    const scored = [];

    for (const entry of entries) {
      const searchable = [
        entry.name || "",
        entry.description || "",
        ...(entry.tags || [])
      ].join(" ").toLowerCase();

      let score = 0;
      for (const hint of lowerHints) {
        if (searchable.includes(hint)) score++;
      }

      if (score > 0) {
        scored.push({ entry, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.map(s => s.entry);
  }
}
