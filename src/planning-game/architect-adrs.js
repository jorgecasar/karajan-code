/**
 * Automatic ADR generation from architect tradeoffs.
 * Creates ADRs in Planning Game when PG is linked, or returns suggestions otherwise.
 */

function buildAdr({ tradeoff, taskTitle }) {
  return {
    title: tradeoff,
    status: "accepted",
    context: `Architecture decision for task: ${taskTitle}`,
    decision: tradeoff
  };
}

export async function createArchitectADRs({ tradeoffs, pgTaskId, pgProject, taskTitle, mcpClient }) {
  if (!tradeoffs?.length) {
    return { created: 0, adrs: [] };
  }

  const hasPg = Boolean(pgTaskId && pgProject && mcpClient);

  if (!hasPg) {
    const adrs = tradeoffs.map(tradeoff => ({
      ...buildAdr({ tradeoff, taskTitle }),
      suggestion: true
    }));
    return { created: 0, adrs };
  }

  const adrs = [];
  let created = 0;

  for (const tradeoff of tradeoffs) {
    const adr = buildAdr({ tradeoff, taskTitle });
    try {
      await mcpClient.createAdr({ projectId: pgProject, adr });
      adrs.push(adr);
      created++;
    } catch {
      // Log warning but don't block pipeline for a single ADR failure
    }
  }

  return { created, adrs };
}
