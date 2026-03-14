export function parsePlannerOutput(output) {
  const text = String(output || "").trim();
  if (!text) return null;

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let title = null;
  let approach = null;
  const steps = [];

  for (const line of lines) {
    if (!title) {
      const titleMatch = line.match(/^title\s*:\s*(.+)$/i);
      if (titleMatch) {
        title = titleMatch[1].trim();
        continue;
      }
    }

    if (!approach) {
      const approachMatch = line.match(/^(approach|strategy)\s*:\s*(.+)$/i);
      if (approachMatch) {
        approach = approachMatch[2].trim();
        continue;
      }
    }

    const numberedStep = line.match(/^\d+[).:-]\s*(.+)$/);
    if (numberedStep) {
      steps.push(numberedStep[1].trim());
      continue;
    }

    const bulletStep = line.match(/^[-*]\s+(.+)$/);
    if (bulletStep) {
      steps.push(bulletStep[1].trim());
      continue;
    }
  }

  if (!title) {
    const firstFreeLine = lines.find((line) => !/^(approach|strategy)\s*:/i.test(line) && !/^\d+[).:-]\s*/.test(line));
    title = firstFreeLine || null;
  }

  return { title, approach, steps };
}

function formatArchitectContext(architectContext) {
  if (!architectContext) return null;
  const arch = architectContext.architecture || {};
  const lines = ["## Architecture Context"];

  if (arch.type) lines.push(`**Type:** ${arch.type}`);
  if (arch.layers?.length) lines.push(`**Layers:** ${arch.layers.join(", ")}`);
  if (arch.patterns?.length) lines.push(`**Patterns:** ${arch.patterns.join(", ")}`);
  if (arch.dataModel?.entities?.length) lines.push(`**Data model entities:** ${arch.dataModel.entities.join(", ")}`);
  if (arch.apiContracts?.length) lines.push(`**API contracts:** ${arch.apiContracts.join(", ")}`);
  if (arch.tradeoffs?.length) lines.push(`**Tradeoffs:** ${arch.tradeoffs.join(", ")}`);
  if (architectContext.summary) lines.push(`**Summary:** ${architectContext.summary}`);

  return lines.length > 1 ? lines.join("\n") : null;
}

export function buildPlannerPrompt({ task, context, architectContext }) {
  const parts = [
    "You are an expert software architect. Create an implementation plan for the following task.",
    "",
    "## Task",
    task,
    ""
  ];

  if (context) {
    parts.push("## Context", context, "");
  }

  const archSection = formatArchitectContext(architectContext);
  if (archSection) {
    parts.push(archSection, "");
  }

  parts.push(
    "## Output format",
    "Respond with a JSON object containing:",
    "- `approach`: A concise paragraph describing the overall strategy",
    "- `steps`: An array of objects, each with `description` (what to do) and `commit` (conventional commit message). Each step should correspond to a single commit.",
    "- `risks`: An array of strings describing potential risks or challenges",
    "- `outOfScope`: An array of strings listing what is explicitly NOT included",
    "",
    "Respond ONLY with valid JSON, no markdown fences or extra text."
  );

  return parts.join("\n");
}
