/**
 * @typedef {Object} RoleConfig
 * @property {string|null} provider - AI provider name (e.g., "claude", "gemini")
 * @property {string|null} model - Specific model name
 */

/**
 * @typedef {Object} Session
 * @property {string} id - Unique session ID
 * @property {string} status - Current status (running, paused, completed, failed)
 * @property {string} created_at - ISO timestamp
 * @property {string} updated_at - ISO timestamp
 * @property {Array<Object>} checkpoints - List of session checkpoints
 * @property {Object} [paused_state] - State captured when session is paused
 */

/**
 * @typedef {Object} KarajanConfig
 * @property {string} coder - Default coder provider
 * @property {string} reviewer - Default reviewer provider
 * @property {Object<string, RoleConfig>} roles - Mapping of roles to providers/models
 * @property {Object} pipeline - Pipeline enabling/disabling flags
 * @property {string} review_mode - Mode for code review (standard, strict, etc.)
 * @property {number} max_iterations - Maximum number of coder-reviewer loops
 * @property {Object} development - Development methodology settings (TDD, etc.)
 * @property {Object} [sonarqube] - SonarQube configuration
 * @property {Object} git - Git automation settings
 * @property {Object} output - CLI output and logging settings
 * @property {Object} budget - Budget tracking and limits
 */

/**
 * Shared context object for pipeline execution.
 * Replaces destructured parameter objects across orchestrator functions.
 */
export class PipelineContext {
  /**
   * @param {Object} params
   * @param {KarajanConfig} params.config
   * @param {Session} params.session
   * @param {Object} params.logger - Logger instance
   * @param {import("node:events").EventEmitter} params.emitter - Event emitter for progress
   * @param {string} params.task - The task description
   * @param {Object} [params.flags] - CLI flags overrides
   */
  constructor({ config, session, logger, emitter, task, flags = {} }) {
    /** @type {KarajanConfig} */
    this.config = config;
    /** @type {Session} */
    this.session = session;
    /** @type {Object} */
    this.logger = logger;
    /** @type {import("node:events").EventEmitter} */
    this.emitter = emitter;
    /** @type {string} */
    this.task = task;
    /** @type {Object} */
    this.flags = flags;

    // Pipeline state (set during execution)
    /** @type {Object} */
    this.eventBase = {};
    /** @type {Object<string, boolean>} */
    this.pipelineFlags = {};
    /** @type {boolean|null} */
    this.trackBudget = null;
    /** @type {Object|null} */
    this.budgetTracker = null;
    /** @type {number|null} */
    this.budgetLimit = null;
    /** @type {Object|null} */
    this.budgetSummary = null;
    /** @type {Function|null} */
    this.askQuestion = null;
    /** @type {string|null} */
    this.reviewRules = null;
    /** @type {Object|null} */
    this.repeatDetector = null;
    /** @type {Object} */
    this.sonarState = { issuesInitial: null, issuesFinal: null };
    /** @type {Object<string, Object>} */
    this.stageResults = {};
    /** @type {Object} */
    this.gitCtx = {};
    /** @type {number} */
    this.iteration = 0;

    // Roles (initialized during setup)
    /** @type {RoleConfig|null} */
    this.coderRole = null;
    /** @type {RoleConfig|null} */
    this.reviewerRole = null;
    /** @type {RoleConfig|null} */
    this.refactorerRole = null;
    /** @type {Object|null} */
    this.coderRoleInstance = null;

    // Planning Game context
    /** @type {string|null} */
    this.pgTaskId = null;
    /** @type {string|null} */
    this.pgProject = null;
    /** @type {Object|null} */
    this.pgCard = null;

    // Product context (loaded from .karajan/context.md or product-vision.md)
    /** @type {string|null} */
    this.productContext = null;

    // Domain context (synthesized by Domain Curator from ~/.karajan/domains/ and .karajan/domains/)
    /** @type {string|null} */
    this.domainContext = null;

    // Planned task (may differ from original task after planner)
    /** @type {string|null} */
    this.plannedTask = null;

    // Karajan Brain runtime context (feedback queue, verification tracker, compression stats)
    this.brainCtx = null;

    // Timing
    /** @type {number|null} */
    this.startedAt = null;
  }
}
