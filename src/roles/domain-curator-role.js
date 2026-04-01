/**
 * Domain Curator role.
 * Discovers, proposes and synthesizes domain knowledge for the pipeline.
 * Operates deterministically (loader + registry + synthesizer) — no LLM call needed
 * unless the user wants to generate domain knowledge from scratch.
 */

import { loadDomains } from "../domains/domain-loader.js";
import { DomainRegistry } from "../domains/domain-registry.js";
import { synthesizeDomainContext } from "../domains/domain-synthesizer.js";

export class DomainCuratorRole {
  constructor({ config, logger }) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Execute domain curation.
   * @param {Object} input
   * @param {string} input.task — the task description
   * @param {string[]} input.domainHints — keywords from triage
   * @param {Function & {interactive: boolean}} [input.askQuestion] — interactive question function
   * @param {string} [input.projectDir] — project root
   * @returns {Promise<{ok: boolean, result: Object, summary: string}>}
   */
  async execute({ task, domainHints = [], askQuestion = null, projectDir = null }) {
    // 1. Load domains from filesystem
    const fileDomains = await loadDomains(projectDir);

    // 2. Search registry for additional matches
    let registryDomains = [];
    if (domainHints.length > 0) {
      try {
        const registry = await DomainRegistry.load();
        registryDomains = registry.search(domainHints);
      } catch {
        this.logger.warn("Domain Curator: failed to load registry, continuing with file domains only");
      }
    }

    // 3. Deduplicate (file domains take precedence over registry entries)
    const allDomains = deduplicateDomains(fileDomains, registryDomains);

    // 4. No domains found
    if (allDomains.length === 0) {
      if (askQuestion?.interactive) {
        const answer = await askQuestion({
          message: "No domain knowledge found for this task.\nDo you have domain documents to provide, or should the pipeline continue without domain context?",
          type: "confirm"
        });
        // For now, just log. Future: support document ingestion.
        if (answer === true) {
          this.logger.info("Domain Curator: user indicated domain documents available — future feature");
        }
      } else {
        this.logger.warn("Domain Curator: no domain knowledge found, continuing without domain context");
      }

      return {
        ok: true,
        result: {
          selectedDomains: [],
          domainContext: null,
          domainsFound: 0,
          domainsUsed: 0,
          source: "none"
        },
        summary: "Domain Curator: no domains found"
      };
    }

    // 5. Propose selection to user (if interactive) or use all
    let selectedDomains;

    if (askQuestion?.interactive && allDomains.length > 1) {
      const options = allDomains.map(d => ({
        id: d.name,
        label: `${d.name} (v${d.version || "?"}) — ${d.description || "no description"}`,
        default: true
      }));

      const selected = await askQuestion({
        message: `Found ${allDomains.length} domain knowledge package(s):`,
        type: "multi-select",
        options,
        defaults: allDomains.map(d => d.name)
      });

      if (Array.isArray(selected) && selected.length > 0) {
        const selectedSet = new Set(selected);
        selectedDomains = allDomains.filter(d => selectedSet.has(d.name));
      } else {
        selectedDomains = allDomains; // fallback to all
      }
    } else {
      // Single domain or non-interactive: use all
      selectedDomains = allDomains;
    }

    // 6. Synthesize context
    const domainContext = synthesizeDomainContext({
      task,
      domainHints,
      selectedDomains
    });

    const source = selectedDomains.some(d => d.origin === "project") ? "project+user" : "user";

    return {
      ok: true,
      result: {
        selectedDomains: selectedDomains.map(d => d.name),
        domainContext: domainContext || null,
        domainsFound: allDomains.length,
        domainsUsed: selectedDomains.length,
        source
      },
      summary: `Domain Curator: ${selectedDomains.length}/${allDomains.length} domain(s) selected`
    };
  }
}

/**
 * Deduplicate domains — file domains override registry entries by name.
 */
function deduplicateDomains(fileDomains, registryDomains) {
  const byName = new Map();

  // Registry entries first (lower priority)
  for (const rd of registryDomains) {
    if (rd.name) byName.set(rd.name, rd);
  }

  // File domains override
  for (const fd of fileDomains) {
    if (fd.name) byName.set(fd.name, fd);
  }

  return Array.from(byName.values());
}
