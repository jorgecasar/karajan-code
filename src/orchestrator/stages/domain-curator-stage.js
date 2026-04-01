/**
 * Domain Curator stage logic.
 * Runs the Domain Curator role to discover and synthesize domain knowledge.
 * Slots after Triage and before Researcher/Architect/Planner.
 */

import { DomainCuratorRole } from "../../roles/domain-curator-role.js";
import { emitProgress, makeEvent } from "../../utils/events.js";

/**
 * @param {Object} params
 * @param {Object} params.config
 * @param {Object} params.logger
 * @param {Object} params.emitter
 * @param {Object} params.eventBase
 * @param {Object} params.session
 * @param {Function} params.trackBudget
 * @param {string[]} params.domainHints — from triage
 * @param {Function & {interactive: boolean}} [params.askQuestion]
 * @returns {Promise<{domainContext: string|null, stageResult: Object}>}
 */
export async function runDomainCuratorStage({ config, logger, emitter, eventBase, session, trackBudget, domainHints = [], askQuestion = null }) {
  logger.setContext?.({ iteration: 0, stage: "domain-curator" });

  emitProgress(
    emitter,
    makeEvent("domain-curator:start", { ...eventBase, stage: "domain-curator" }, {
      message: "Domain Curator discovering domain knowledge",
      detail: { domainHints, interactive: Boolean(askQuestion?.interactive) }
    })
  );

  const start = Date.now();
  const curator = new DomainCuratorRole({ config, logger });

  let curatorOutput;
  try {
    curatorOutput = await curator.execute({
      task: session.task,
      domainHints,
      askQuestion,
      projectDir: config.projectDir || null
    });
  } catch (err) {
    logger.warn(`Domain Curator threw: ${err.message}`);
    curatorOutput = {
      ok: true,
      result: { selectedDomains: [], domainContext: null, domainsFound: 0, domainsUsed: 0, source: "error" },
      summary: `Domain Curator error: ${err.message}`
    };
  }

  trackBudget({
    role: "domain-curator",
    provider: "local",
    model: null,
    result: curatorOutput,
    duration_ms: Date.now() - start
  });

  const domainContext = curatorOutput.result?.domainContext || null;

  const stageResult = {
    ok: curatorOutput.ok,
    domainsFound: curatorOutput.result?.domainsFound || 0,
    domainsUsed: curatorOutput.result?.domainsUsed || 0,
    selectedDomains: curatorOutput.result?.selectedDomains || [],
    source: curatorOutput.result?.source || "none",
    hasDomainContext: Boolean(domainContext)
  };

  emitProgress(
    emitter,
    makeEvent("domain-curator:done", { ...eventBase, stage: "domain-curator" }, {
      status: "ok",
      message: curatorOutput.summary,
      detail: stageResult
    })
  );

  return { domainContext, stageResult };
}
