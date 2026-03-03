import { TriageRole } from "../roles/triage-role.js";
import { ResearcherRole } from "../roles/researcher-role.js";
import { PlannerRole } from "../roles/planner-role.js";
import { createAgent } from "../agents/index.js";
import { addCheckpoint, markSessionStatus } from "../session-store.js";
import { emitProgress, makeEvent } from "../utils/events.js";
import { parsePlannerOutput } from "../prompts/planner.js";
import { selectModelsForRoles } from "../utils/model-selector.js";
import { createStallDetector } from "../utils/stall-detector.js";

export async function runTriageStage({ config, logger, emitter, eventBase, session, coderRole, trackBudget }) {
  logger.setContext({ iteration: 0, stage: "triage" });
  emitProgress(
    emitter,
    makeEvent("triage:start", { ...eventBase, stage: "triage" }, {
      message: "Triage classifying task complexity"
    })
  );

  const triageProvider = config?.roles?.triage?.provider || coderRole.provider;
  const triageOnOutput = ({ stream, line }) => {
    emitProgress(emitter, makeEvent("agent:output", { ...eventBase, stage: "triage" }, {
      message: line,
      detail: { stream, agent: triageProvider }
    }));
  };
  const triageStall = createStallDetector({
    onOutput: triageOnOutput, emitter, eventBase, stage: "triage", provider: triageProvider
  });

  const triage = new TriageRole({ config, logger, emitter });
  await triage.init({ task: session.task, sessionId: session.id, iteration: 0 });
  const triageStart = Date.now();
  let triageOutput;
  try {
    triageOutput = await triage.run({ task: session.task, onOutput: triageStall.onOutput });
  } finally {
    triageStall.stop();
  }
  trackBudget({
    role: "triage",
    provider: config?.roles?.triage?.provider || coderRole.provider,
    model: config?.roles?.triage?.model || coderRole.model,
    result: triageOutput,
    duration_ms: Date.now() - triageStart
  });

  await addCheckpoint(session, {
    stage: "triage",
    iteration: 0,
    ok: triageOutput.ok,
    provider: config?.roles?.triage?.provider || coderRole.provider,
    model: config?.roles?.triage?.model || coderRole.model || null
  });

  const recommendedRoles = new Set(triageOutput.result?.roles || []);
  const roleOverrides = {};
  if (triageOutput.ok) {
    roleOverrides.plannerEnabled = recommendedRoles.has("planner");
    roleOverrides.researcherEnabled = recommendedRoles.has("researcher");
    roleOverrides.refactorerEnabled = recommendedRoles.has("refactorer");
    roleOverrides.reviewerEnabled = recommendedRoles.has("reviewer");
    roleOverrides.testerEnabled = recommendedRoles.has("tester");
    roleOverrides.securityEnabled = recommendedRoles.has("security");
  }

  const shouldDecompose = triageOutput.result?.shouldDecompose || false;
  const subtasks = triageOutput.result?.subtasks || [];

  const stageResult = {
    ok: triageOutput.ok,
    level: triageOutput.result?.level || null,
    roles: Array.from(recommendedRoles),
    reasoning: triageOutput.result?.reasoning || null,
    shouldDecompose,
    subtasks
  };

  let modelSelection = null;
  if (triageOutput.ok && config?.model_selection?.enabled) {
    const level = triageOutput.result?.level;
    if (level) {
      const { modelOverrides, reasoning } = selectModelsForRoles({ level, config });
      for (const [role, model] of Object.entries(modelOverrides)) {
        if (config.roles?.[role] && !config.roles[role].model) {
          config.roles[role].model = model;
        }
      }
      modelSelection = { modelOverrides, reasoning };
      emitProgress(
        emitter,
        makeEvent("model-selection:applied", { ...eventBase, stage: "triage" }, {
          message: "Smart model selection applied",
          detail: modelSelection
        })
      );
    }
  }

  if (modelSelection) {
    stageResult.modelSelection = modelSelection;
  }

  if (shouldDecompose && subtasks.length > 0) {
    emitProgress(
      emitter,
      makeEvent("triage:decompose", { ...eventBase, stage: "triage" }, {
        message: `Task decomposition recommended: ${subtasks.length} subtask${subtasks.length === 1 ? "" : "s"}`,
        detail: { shouldDecompose, subtasks }
      })
    );
  }

  emitProgress(
    emitter,
    makeEvent("triage:end", { ...eventBase, stage: "triage" }, {
      status: triageOutput.ok ? "ok" : "fail",
      message: triageOutput.ok ? "Triage completed" : `Triage failed: ${triageOutput.summary}`,
      detail: stageResult
    })
  );

  return { roleOverrides, stageResult };
}

export async function runResearcherStage({ config, logger, emitter, eventBase, session, coderRole, trackBudget }) {
  logger.setContext({ iteration: 0, stage: "researcher" });
  emitProgress(
    emitter,
    makeEvent("researcher:start", { ...eventBase, stage: "researcher" }, {
      message: "Researcher investigating codebase"
    })
  );

  const researcherProvider = config?.roles?.researcher?.provider || coderRole.provider;
  const researcherOnOutput = ({ stream, line }) => {
    emitProgress(emitter, makeEvent("agent:output", { ...eventBase, stage: "researcher" }, {
      message: line,
      detail: { stream, agent: researcherProvider }
    }));
  };
  const researcherStall = createStallDetector({
    onOutput: researcherOnOutput, emitter, eventBase, stage: "researcher", provider: researcherProvider
  });

  const researcher = new ResearcherRole({ config, logger, emitter });
  await researcher.init({ task: session.task });
  const researchStart = Date.now();
  let researchOutput;
  try {
    researchOutput = await researcher.run({ task: session.task, onOutput: researcherStall.onOutput });
  } finally {
    researcherStall.stop();
  }
  trackBudget({
    role: "researcher",
    provider: config?.roles?.researcher?.provider || coderRole.provider,
    model: config?.roles?.researcher?.model || coderRole.model,
    result: researchOutput,
    duration_ms: Date.now() - researchStart
  });

  await addCheckpoint(session, {
    stage: "researcher",
    iteration: 0,
    ok: researchOutput.ok,
    provider: config?.roles?.researcher?.provider || coderRole.provider,
    model: config?.roles?.researcher?.model || coderRole.model || null
  });

  emitProgress(
    emitter,
    makeEvent("researcher:end", { ...eventBase, stage: "researcher" }, {
      status: researchOutput.ok ? "ok" : "fail",
      message: researchOutput.ok ? "Research completed" : `Research failed: ${researchOutput.summary}`
    })
  );

  const stageResult = { ok: researchOutput.ok, summary: researchOutput.summary || null };
  const researchContext = researchOutput.ok ? researchOutput.result : null;

  return { researchContext, stageResult };
}

export async function runPlannerStage({ config, logger, emitter, eventBase, session, plannerRole, researchContext, triageDecomposition = null, trackBudget }) {
  const task = session.task;
  logger.setContext({ iteration: 0, stage: "planner" });
  emitProgress(
    emitter,
    makeEvent("planner:start", { ...eventBase, stage: "planner" }, {
      message: `Planner (${plannerRole.provider}) running`,
      detail: { planner: plannerRole.provider }
    })
  );

  const plannerOnOutput = ({ stream, line }) => {
    emitProgress(emitter, makeEvent("agent:output", { ...eventBase, stage: "planner" }, {
      message: line,
      detail: { stream, agent: plannerRole.provider }
    }));
  };
  const plannerStall = createStallDetector({
    onOutput: plannerOnOutput, emitter, eventBase, stage: "planner", provider: plannerRole.provider
  });

  const planRole = new PlannerRole({ config, logger, emitter, createAgentFn: createAgent });
  planRole.context = { task, research: researchContext, triageDecomposition };
  await planRole.init();
  const plannerStart = Date.now();
  let planResult;
  try {
    planResult = await planRole.execute({ task, onOutput: plannerStall.onOutput });
  } finally {
    plannerStall.stop();
  }
  trackBudget({ role: "planner", provider: plannerRole.provider, model: plannerRole.model, result: planResult.result, duration_ms: Date.now() - plannerStart });
  await addCheckpoint(session, {
    stage: "planner",
    iteration: 0,
    ok: planResult.ok,
    provider: plannerRole.provider,
    model: plannerRole.model || null
  });

  if (!planResult.ok) {
    await markSessionStatus(session, "failed");
    const details = planResult.result?.error || planResult.summary || "unknown error";
    emitProgress(
      emitter,
      makeEvent("planner:end", { ...eventBase, stage: "planner" }, {
        status: "fail",
        message: `Planner failed: ${details}`
      })
    );
    throw new Error(`Planner failed: ${details}`);
  }

  const planOutput = planResult.result?.plan || "";
  const plannedTask = planOutput ? `${task}\n\nExecution plan:\n${planOutput}` : task;
  const parsedPlan = parsePlannerOutput(planOutput);
  const stageResult = {
    ok: true,
    title: parsedPlan?.title || null,
    approach: parsedPlan?.approach || null,
    steps: parsedPlan?.steps || [],
    completedSteps: []
  };

  emitProgress(
    emitter,
    makeEvent("planner:end", { ...eventBase, stage: "planner" }, {
      message: "Planner completed"
    })
  );

  return { plannedTask, stageResult };
}
