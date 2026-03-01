import { createAgent } from "./agents/index.js";
import {
  addCheckpoint,
  createSession,
  loadSession,
  markSessionStatus,
  pauseSession,
  resumeSessionWithAnswer,
  saveSession
} from "./session-store.js";
import { computeBaseRef, generateDiff } from "./review/diff-generator.js";
import { buildCoderPrompt } from "./prompts/coder.js";
import { buildReviewerPrompt } from "./prompts/reviewer.js";
import { resolveRole } from "./config.js";
import { RepeatDetector, getRepeatThreshold } from "./repeat-detector.js";
import { emitProgress, makeEvent } from "./utils/events.js";
import { BudgetTracker, extractUsageMetrics } from "./utils/budget.js";
import {
  commitMessageFromTask,
  prepareGitAutomation,
  finalizeGitAutomation
} from "./git/automation.js";
import { resolveRoleMdPath, loadFirstExisting } from "./roles/base-role.js";
import { resolveReviewProfile } from "./review/profiles.js";
import { TesterRole } from "./roles/tester-role.js";
import { SecurityRole } from "./roles/security-role.js";
import { CoderRole } from "./roles/coder-role.js";
import { invokeSolomon } from "./orchestrator/solomon-escalation.js";
import { runTriageStage, runResearcherStage, runPlannerStage } from "./orchestrator/pre-loop-stages.js";
import { runCoderStage, runRefactorerStage, runTddCheckStage, runSonarStage, runReviewerStage } from "./orchestrator/iteration-stages.js";



export async function runFlow({ task, config, logger, flags = {}, emitter = null, askQuestion = null }) {
  const plannerRole = resolveRole(config, "planner");
  const coderRole = resolveRole(config, "coder");
  const reviewerRole = resolveRole(config, "reviewer");
  const refactorerRole = resolveRole(config, "refactorer");
  let plannerEnabled = Boolean(config.pipeline?.planner?.enabled);
  let refactorerEnabled = Boolean(config.pipeline?.refactorer?.enabled);
  let researcherEnabled = Boolean(config.pipeline?.researcher?.enabled);
  let testerEnabled = Boolean(config.pipeline?.tester?.enabled);
  let securityEnabled = Boolean(config.pipeline?.security?.enabled);
  let reviewerEnabled = config.pipeline?.reviewer?.enabled !== false;
  const triageEnabled = Boolean(config.pipeline?.triage?.enabled);

  // --- Dry-run: return summary without executing anything ---
  if (flags.dryRun) {
    const projectDir = config.projectDir || process.cwd();
    const { rules: reviewRules } = await resolveReviewProfile({ mode: config.review_mode, projectDir });
    const coderRules = await loadFirstExisting(resolveRoleMdPath("coder", projectDir));
    const coderPrompt = buildCoderPrompt({ task, coderRules, methodology: config.development?.methodology, serenaEnabled: Boolean(config.serena?.enabled) });
    const reviewerPrompt = buildReviewerPrompt({ task, diff: "(dry-run: no diff)", reviewRules, mode: config.review_mode, serenaEnabled: Boolean(config.serena?.enabled) });

    const summary = {
      dry_run: true,
      task,
      roles: {
        planner: plannerRole,
        coder: coderRole,
        reviewer: reviewerRole,
        refactorer: refactorerRole
      },
      pipeline: {
        triage_enabled: triageEnabled,
        planner_enabled: plannerEnabled,
        refactorer_enabled: refactorerEnabled,
        sonar_enabled: Boolean(config.sonarqube?.enabled),
        reviewer_enabled: reviewerEnabled,
        researcher_enabled: researcherEnabled,
        tester_enabled: testerEnabled,
        security_enabled: securityEnabled,
        solomon_enabled: Boolean(config.pipeline?.solomon?.enabled)
      },
      limits: {
        max_iterations: config.max_iterations,
        max_iteration_minutes: config.session?.max_iteration_minutes,
        max_total_minutes: config.session?.max_total_minutes,
        max_sonar_retries: config.session?.max_sonar_retries,
        max_reviewer_retries: config.session?.max_reviewer_retries,
        max_tester_retries: config.session?.max_tester_retries,
        max_security_retries: config.session?.max_security_retries
      },
      prompts: {
        coder: coderPrompt,
        reviewer: reviewerPrompt
      },
      git: config.git
    };

    emitProgress(
      emitter,
      makeEvent("dry-run:summary", { sessionId: null, iteration: 0, stage: "dry-run", startedAt: Date.now() }, {
        message: "Dry-run complete — no changes made",
        detail: summary
      })
    );

    return summary;
  }

  const repeatDetector = new RepeatDetector({ threshold: getRepeatThreshold(config) });
  const coderRoleInstance = new CoderRole({ config, logger, emitter, createAgentFn: createAgent });
  const startedAt = Date.now();
  const eventBase = { sessionId: null, iteration: 0, stage: null, startedAt };
  const budgetTracker = new BudgetTracker({ pricing: config?.budget?.pricing });
  const budgetLimit = Number(config?.max_budget_usd);
  const hasBudgetLimit = Number.isFinite(budgetLimit) && budgetLimit >= 0;
  const warnThresholdPct = Number(config?.budget?.warn_threshold_pct ?? 80);

  function budgetSummary() {
    const s = budgetTracker.summary();
    s.trace = budgetTracker.trace();
    return s;
  }

  let stageCounter = 0;
  function trackBudget({ role, provider, model, result, duration_ms }) {
    const metrics = extractUsageMetrics(result, model);
    budgetTracker.record({ role, provider, ...metrics, duration_ms, stage_index: stageCounter++ });

    if (!hasBudgetLimit) return;
    const totalCost = budgetTracker.total().cost_usd;
    const pctUsed = budgetLimit === 0 ? 100 : (totalCost / budgetLimit) * 100;
    const status = totalCost > budgetLimit ? "fail" : pctUsed >= warnThresholdPct ? "paused" : "ok";
    emitProgress(
      emitter,
      makeEvent("budget:update", { ...eventBase, stage: role }, {
        status,
        message: `Budget: $${totalCost.toFixed(2)} / $${budgetLimit.toFixed(2)}`,
        detail: {
          ...budgetSummary(),
          max_budget_usd: budgetLimit,
          warn_threshold_pct: warnThresholdPct,
          pct_used: Number(pctUsed.toFixed(2)),
          remaining_usd: budgetTracker.remaining(budgetLimit)
        }
      })
    );
  }

  const baseRef = await computeBaseRef({ baseBranch: config.base_branch, baseRef: flags.baseRef || null });
  const session = await createSession({
    task,
    config_snapshot: config,
    base_ref: baseRef,
    session_start_sha: baseRef,
    last_reviewer_feedback: null,
    repeated_issue_count: 0,
    sonar_retry_count: 0,
    reviewer_retry_count: 0,
    last_sonar_issue_signature: null,
    sonar_repeat_count: 0,
    last_reviewer_issue_signature: null,
    reviewer_repeat_count: 0
  });

  eventBase.sessionId = session.id;

  emitProgress(
    emitter,
    makeEvent("session:start", eventBase, {
      message: "Session started",
      detail: {
        task,
        coder: coderRole.provider,
        reviewer: reviewerRole.provider,
        maxIterations: config.max_iterations
      }
    })
  );

  // Accumulate stage results for final summary
  const stageResults = {};
  const sonarState = { issuesInitial: null, issuesFinal: null };

  if (triageEnabled) {
    const triageResult = await runTriageStage({ config, logger, emitter, eventBase, session, coderRole, trackBudget });
    if (triageResult.roleOverrides.plannerEnabled !== undefined) plannerEnabled = triageResult.roleOverrides.plannerEnabled;
    if (triageResult.roleOverrides.researcherEnabled !== undefined) researcherEnabled = triageResult.roleOverrides.researcherEnabled;
    if (triageResult.roleOverrides.refactorerEnabled !== undefined) refactorerEnabled = triageResult.roleOverrides.refactorerEnabled;
    if (triageResult.roleOverrides.reviewerEnabled !== undefined) reviewerEnabled = triageResult.roleOverrides.reviewerEnabled;
    if (triageResult.roleOverrides.testerEnabled !== undefined) testerEnabled = triageResult.roleOverrides.testerEnabled;
    if (triageResult.roleOverrides.securityEnabled !== undefined) securityEnabled = triageResult.roleOverrides.securityEnabled;
    stageResults.triage = triageResult.stageResult;
  }

  if (flags.enablePlanner !== undefined) plannerEnabled = Boolean(flags.enablePlanner);
  if (flags.enableResearcher !== undefined) researcherEnabled = Boolean(flags.enableResearcher);
  if (flags.enableRefactorer !== undefined) refactorerEnabled = Boolean(flags.enableRefactorer);
  if (flags.enableReviewer !== undefined) reviewerEnabled = Boolean(flags.enableReviewer);
  if (flags.enableTester !== undefined) testerEnabled = Boolean(flags.enableTester);
  if (flags.enableSecurity !== undefined) securityEnabled = Boolean(flags.enableSecurity);

  // --- Researcher (pre-planning) ---
  let researchContext = null;
  if (researcherEnabled) {
    const researcherResult = await runResearcherStage({ config, logger, emitter, eventBase, session, coderRole, trackBudget });
    researchContext = researcherResult.researchContext;
    stageResults.researcher = researcherResult.stageResult;
  }

  // --- Planner ---
  let plannedTask = task;
  if (plannerEnabled) {
    const plannerResult = await runPlannerStage({ config, logger, emitter, eventBase, session, plannerRole, researchContext, trackBudget });
    plannedTask = plannerResult.plannedTask;
    stageResults.planner = plannerResult.stageResult;
  }

  const gitCtx = await prepareGitAutomation({ config, task, logger, session });

  const projectDir = config.projectDir || process.cwd();
  const { rules: reviewRules } = await resolveReviewProfile({ mode: config.review_mode, projectDir });
  await coderRoleInstance.init();

  for (let i = 1; i <= config.max_iterations; i += 1) {
    const elapsedMinutes = (Date.now() - startedAt) / 60000;
    if (elapsedMinutes > config.session.max_total_minutes) {
      await markSessionStatus(session, "failed");
      emitProgress(
        emitter,
        makeEvent("session:end", { ...eventBase, iteration: i, stage: "timeout" }, {
          status: "fail",
          message: "Session timed out",
          detail: { approved: false, reason: "timeout", budget: budgetSummary() }
        })
      );
      throw new Error("Session timed out");
    }

    if (budgetTracker.isOverBudget(config?.max_budget_usd)) {
      await markSessionStatus(session, "failed");
      const totalCost = budgetTracker.total().cost_usd;
      const message = `Budget exceeded: $${totalCost.toFixed(2)} > $${budgetLimit.toFixed(2)}`;
      emitProgress(
        emitter,
        makeEvent("session:end", { ...eventBase, iteration: i, stage: "budget" }, {
          status: "fail",
          message,
          detail: { approved: false, reason: "budget_exceeded", budget: budgetSummary(), max_budget_usd: budgetLimit }
        })
      );
      throw new Error(message);
    }

    eventBase.iteration = i;
    const iterStart = Date.now();
    logger.setContext({ iteration: i, stage: "iteration" });

    emitProgress(
      emitter,
      makeEvent("iteration:start", { ...eventBase, stage: "iteration" }, {
        message: `Iteration ${i}/${config.max_iterations}`,
        detail: { iteration: i, maxIterations: config.max_iterations }
      })
    );

    logger.info(`Iteration ${i}/${config.max_iterations}`);

    // --- Coder ---
    await runCoderStage({ coderRoleInstance, coderRole, config, logger, emitter, eventBase, session, plannedTask, trackBudget, iteration: i });

    // --- Refactorer ---
    if (refactorerEnabled) {
      await runRefactorerStage({ refactorerRole, config, logger, emitter, eventBase, session, plannedTask, trackBudget, iteration: i });
    }

    // --- TDD Policy ---
    const tddResult = await runTddCheckStage({ config, logger, emitter, eventBase, session, trackBudget, iteration: i, askQuestion });
    if (tddResult.action === "pause") {
      return tddResult.result;
    }
    if (tddResult.action === "continue") {
      continue;
    }

    // --- SonarQube ---
    if (config.sonarqube.enabled) {
      const sonarResult = await runSonarStage({
        config, logger, emitter, eventBase, session, trackBudget, iteration: i,
        repeatDetector, budgetSummary, sonarState,
        askQuestion, task
      });
      if (sonarResult.action === "stalled" || sonarResult.action === "pause") {
        return sonarResult.result;
      }
      if (sonarResult.action === "continue") {
        continue;
      }
      if (sonarResult.stageResult) {
        stageResults.sonar = sonarResult.stageResult;
      }
    }

    // --- Reviewer ---
    let review = {
      approved: true,
      blocking_issues: [],
      non_blocking_suggestions: [],
      summary: "Reviewer disabled by pipeline",
      confidence: 1
    };
    if (reviewerEnabled) {
      const reviewerResult = await runReviewerStage({
        reviewerRole, config, logger, emitter, eventBase, session, trackBudget,
        iteration: i, reviewRules, task, repeatDetector, budgetSummary
      });
      review = reviewerResult.review;
      if (reviewerResult.stalled) {
        return reviewerResult.stalledResult;
      }
    }

    // --- Iteration end ---
    const iterDuration = Date.now() - iterStart;
    emitProgress(
      emitter,
      makeEvent("iteration:end", { ...eventBase, stage: "iteration" }, {
        message: `Iteration ${i} completed`,
        detail: { duration: iterDuration }
      })
    );

    if (review.approved) {
      session.reviewer_retry_count = 0;

      // --- Post-loop stages: Tester → Security ---
      const postLoopDiff = await generateDiff({ baseRef: session.session_start_sha });

      // --- Tester ---
      if (testerEnabled) {
        logger.setContext({ iteration: i, stage: "tester" });
        emitProgress(
          emitter,
          makeEvent("tester:start", { ...eventBase, stage: "tester" }, {
            message: "Tester evaluating test quality"
          })
        );

        const tester = new TesterRole({ config, logger, emitter });
        await tester.init({ task, iteration: i });
        const testerStart = Date.now();
        const testerOutput = await tester.run({ task, diff: postLoopDiff });
        trackBudget({
          role: "tester",
          provider: config?.roles?.tester?.provider || coderRole.provider,
          model: config?.roles?.tester?.model || coderRole.model,
          result: testerOutput,
          duration_ms: Date.now() - testerStart
        });

        await addCheckpoint(session, { stage: "tester", iteration: i, ok: testerOutput.ok });

        emitProgress(
          emitter,
          makeEvent("tester:end", { ...eventBase, stage: "tester" }, {
            status: testerOutput.ok ? "ok" : "fail",
            message: testerOutput.ok ? "Tester passed" : `Tester: ${testerOutput.summary}`
          })
        );

        if (!testerOutput.ok) {
          const maxTesterRetries = config.session?.max_tester_retries ?? 1;
          session.tester_retry_count = (session.tester_retry_count || 0) + 1;
          await saveSession(session);

          if (session.tester_retry_count >= maxTesterRetries) {
            const solomonResult = await invokeSolomon({
              config, logger, emitter, eventBase, stage: "tester", askQuestion, session, iteration: i,
              conflict: {
                stage: "tester",
                task,
                diff: postLoopDiff,
                iterationCount: session.tester_retry_count,
                maxIterations: maxTesterRetries,
                history: [{ agent: "tester", feedback: testerOutput.summary }]
              }
            });

            if (solomonResult.action === "pause") {
              return { paused: true, sessionId: session.id, question: solomonResult.question, context: "tester_fail_fast" };
            }
            if (solomonResult.action === "subtask") {
              return { paused: true, sessionId: session.id, subtask: solomonResult.subtask, context: "tester_subtask" };
            }
            // continue = Solomon approved, proceed to next stage
          } else {
            session.last_reviewer_feedback = `Tester feedback: ${testerOutput.summary}`;
            await saveSession(session);
            continue;
          }
        } else {
          session.tester_retry_count = 0;
          stageResults.tester = { ok: true, summary: testerOutput.summary || "All tests passed" };
        }
      }

      // --- Security ---
      if (securityEnabled) {
        logger.setContext({ iteration: i, stage: "security" });
        emitProgress(
          emitter,
          makeEvent("security:start", { ...eventBase, stage: "security" }, {
            message: "Security auditing code"
          })
        );

        const security = new SecurityRole({ config, logger, emitter });
        await security.init({ task, iteration: i });
        const securityStart = Date.now();
        const securityOutput = await security.run({ task, diff: postLoopDiff });
        trackBudget({
          role: "security",
          provider: config?.roles?.security?.provider || coderRole.provider,
          model: config?.roles?.security?.model || coderRole.model,
          result: securityOutput,
          duration_ms: Date.now() - securityStart
        });

        await addCheckpoint(session, { stage: "security", iteration: i, ok: securityOutput.ok });

        emitProgress(
          emitter,
          makeEvent("security:end", { ...eventBase, stage: "security" }, {
            status: securityOutput.ok ? "ok" : "fail",
            message: securityOutput.ok ? "Security audit passed" : `Security: ${securityOutput.summary}`
          })
        );

        if (!securityOutput.ok) {
          const maxSecurityRetries = config.session?.max_security_retries ?? 1;
          session.security_retry_count = (session.security_retry_count || 0) + 1;
          await saveSession(session);

          if (session.security_retry_count >= maxSecurityRetries) {
            const solomonResult = await invokeSolomon({
              config, logger, emitter, eventBase, stage: "security", askQuestion, session, iteration: i,
              conflict: {
                stage: "security",
                task,
                diff: postLoopDiff,
                iterationCount: session.security_retry_count,
                maxIterations: maxSecurityRetries,
                history: [{ agent: "security", feedback: securityOutput.summary }]
              }
            });

            if (solomonResult.action === "pause") {
              return { paused: true, sessionId: session.id, question: solomonResult.question, context: "security_fail_fast" };
            }
            if (solomonResult.action === "subtask") {
              return { paused: true, sessionId: session.id, subtask: solomonResult.subtask, context: "security_subtask" };
            }
            // continue = Solomon approved, proceed
          } else {
            session.last_reviewer_feedback = `Security feedback: ${securityOutput.summary}`;
            await saveSession(session);
            continue;
          }
        } else {
          session.security_retry_count = 0;
          stageResults.security = { ok: true, summary: securityOutput.summary || "No vulnerabilities found" };
        }
      }

      // --- All post-loop checks passed → finalize ---
      const gitResult = await finalizeGitAutomation({ config, gitCtx, task, logger, session });
      if (stageResults.planner?.ok) {
        stageResults.planner.completedSteps = [...(stageResults.planner.steps || [])];
      }
      session.budget = budgetSummary();
      await markSessionStatus(session, "approved");
      emitProgress(
        emitter,
        makeEvent("session:end", { ...eventBase, stage: "done" }, {
          message: "Session approved",
          detail: { approved: true, iterations: i, stages: stageResults, git: gitResult, budget: budgetSummary() }
        })
      );
      return { approved: true, sessionId: session.id, review, git: gitResult };
    }

    session.last_reviewer_feedback = review.blocking_issues
      .map((x) => `${x.id || "ISSUE"}: ${x.description || "Missing description"}`)
      .join("\n");
    session.reviewer_retry_count = (session.reviewer_retry_count || 0) + 1;
    await saveSession(session);

    const maxReviewerRetries = config.session.max_reviewer_retries ?? config.session.fail_fast_repeats;
    if (session.reviewer_retry_count >= maxReviewerRetries) {
      emitProgress(
        emitter,
        makeEvent("solomon:escalate", { ...eventBase, stage: "reviewer" }, {
          message: `Reviewer sub-loop limit reached (${session.reviewer_retry_count}/${maxReviewerRetries})`,
          detail: { subloop: "reviewer", retryCount: session.reviewer_retry_count, limit: maxReviewerRetries }
        })
      );

      const solomonResult = await invokeSolomon({
        config, logger, emitter, eventBase, stage: "reviewer", askQuestion, session, iteration: i,
        conflict: {
          stage: "reviewer",
          task,
          iterationCount: session.reviewer_retry_count,
          maxIterations: maxReviewerRetries,
          history: [{ agent: "reviewer", feedback: session.last_reviewer_feedback }]
        }
      });

      if (solomonResult.action === "pause") {
        return { paused: true, sessionId: session.id, question: solomonResult.question, context: "reviewer_fail_fast" };
      }
      if (solomonResult.action === "continue") {
        if (solomonResult.humanGuidance) {
          session.last_reviewer_feedback += `\nUser guidance: ${solomonResult.humanGuidance}`;
        }
        session.reviewer_retry_count = 0;
        await saveSession(session);
        continue;
      }
      if (solomonResult.action === "subtask") {
        return { paused: true, sessionId: session.id, subtask: solomonResult.subtask, context: "reviewer_subtask" };
      }
    }
  }

  session.budget = budgetSummary();
  await markSessionStatus(session, "failed");
  emitProgress(
    emitter,
    makeEvent("session:end", { ...eventBase, stage: "done" }, {
      status: "fail",
      message: "Max iterations reached",
      detail: { approved: false, reason: "max_iterations", iterations: config.max_iterations, stages: stageResults, budget: budgetSummary() }
    })
  );
  return { approved: false, sessionId: session.id, reason: "max_iterations" };
}

export async function resumeFlow({ sessionId, answer, config, logger, flags = {}, emitter = null, askQuestion = null }) {
  const session = answer
    ? await resumeSessionWithAnswer(sessionId, answer)
    : await loadSession(sessionId);

  if (session.status === "paused" && !answer) {
    logger.info(`Session ${sessionId} is paused. Provide --answer to resume.`);
    return session;
  }

  if (session.status !== "running") {
    logger.info(`Session ${sessionId} has status ${session.status}`);
    return session;
  }

  // Session was paused and now resumed with answer - re-run the flow
  const task = session.task;
  const sessionConfig = config || session.config_snapshot;
  if (!sessionConfig) {
    throw new Error("No config available to resume session");
  }

  logger.info(`Resuming session ${sessionId} with answer: ${answer}`);

  // Inject the answer as additional feedback for the coder
  if (session.paused_state?.context?.lastFeedback) {
    session.last_reviewer_feedback = `Previous feedback: ${session.paused_state.context.lastFeedback}\nUser guidance: ${answer}`;
  }
  session.repeated_issue_count = 0;
  session.sonar_retry_count = 0;
  session.reviewer_retry_count = 0;
  session.tester_retry_count = 0;
  session.security_retry_count = 0;
  session.last_sonar_issue_signature = null;
  session.sonar_repeat_count = 0;
  session.last_reviewer_issue_signature = null;
  session.reviewer_repeat_count = 0;
  await saveSession(session);

  // Re-run the flow with the existing session context
  return runFlow({ task, config: sessionConfig, logger, flags, emitter, askQuestion });
}
