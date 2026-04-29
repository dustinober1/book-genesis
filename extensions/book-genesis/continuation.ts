import type { RunState } from "./types.js";

export function buildAutoContinuePrompt(run: RunState, reason = "context compacted") {
  return [
    `Continue the active Book Genesis ${run.currentPhase} phase for run ${run.id}.`,
    "",
    `Reason: ${reason}.`,
    `Run directory: ${run.rootDir}`,
    `State file: ${run.statePath}`,
    `Current next action: ${run.nextAction}`,
    "",
    "Use the run state and handoff context already preserved by Book Genesis. Do not ask the operator to resume manually unless a real blocker remains.",
  ].join("\n");
}
