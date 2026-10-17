/**
 * KJC-TSK-1086: the Steward's block (STW-C, KJC-TSK-0791) at commit too. Only
 * where the project adopted it (method_gates.steward: block), only the hard
 * invariants (vulnerable dependencies, a persistently red main), and never on
 * an invariant whose verdict is unknown. Having declared block, a missing or
 * unreadable report blocks too: the sweep has to run.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const HARD = new Set(["vulnerable-deps", "main-ci"]);

/** @returns {{ sweptAt: string, hard: object[], reason: string } | null} */
export function stewardBlocking({ projectDir, config }) {
  if (config?.method_gates?.steward !== "block") return null;
  const file = join(projectDir, ".karajan", "steward", "report.json");
  let rep;
  try {
    rep = JSON.parse(readFileSync(file, "utf8"));
  } catch (err) {
    // block was adopted explicitly: a missing or unreadable report is never a silent pass.
    return { sweptAt: null, hard: [], reason: `steward cannot read ${file} (${err.message}) — rerun kj steward sweep; while it is unreadable the block stands` };
  }
  if (!Array.isArray(rep?.invariants)) {
    return { sweptAt: rep?.sweptAt ?? null, hard: [], reason: `steward report ${file} has no invariants list — rerun kj steward sweep; while it is malformed the block stands` };
  }
  const hard = rep.invariants.filter((r) => r?.verdict === "broken" && HARD.has(r.id));
  if (hard.length === 0) return null;
  const lines = hard.map((r) => `${r.id}: ${r.evidence || ""} -> ${r.remedy || r.renew || "kj steward sweep"}`);
  return { sweptAt: rep.sweptAt, hard, reason: `steward (sweep ${rep.sweptAt}) blocks: ${lines.join("; ")} — if the work goes on, your user sets method_gates.steward to inform` };
}
