import path from "node:path";

import { PHASE_ORDER, type RunState } from "./types.js";
import { recommendNextAction } from "./dashboard.js";
import { writeMarkdown } from "./run-files.js";

export function buildProjectMap(run: RunState) {
  const next = recommendNextAction(run);
  const phaseLines = PHASE_ORDER.map((phase, index) => {
    const status = run.completedPhases.includes(phase) ? "completed" : phase === run.currentPhase ? run.status : "pending";
    return `  ${phase}["${phase} (${status})"]${index < PHASE_ORDER.length - 1 ? ` --> ${PHASE_ORDER[index + 1]}` : ""}`;
  });
  const approvalLines = run.approval
    ? [`  approval["approval: ${run.approval.status}"]`, `  ${run.approval.phase} --> approval`]
    : [];
  const failureLines = run.history.filter((entry) => entry.status === "failed").map((entry, index) => `  failure${index}["failed: ${entry.phase} attempt ${entry.attempt}"]`);
  const markdown = [
    `# Project Map for ${run.id}`,
    "",
    "```mermaid",
    "flowchart TD",
    ...phaseLines,
    ...approvalLines,
    ...failureLines,
    `  next["next: ${next.command}"]`,
    `  ${run.currentPhase} --> next`,
    "```",
    "",
    `Next action: ${next.command} - ${next.reason}`,
    "",
  ].join("\n");
  return { runId: run.id, markdown };
}

export function writeProjectMap(run: RunState) {
  const map = buildProjectMap(run);
  const markdownPath = writeMarkdown(path.join(run.rootDir, "dashboard", "project-map.md"), map.markdown);
  return { map, markdownPath };
}
