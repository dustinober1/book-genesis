import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { RunState } from "./types.js";
import { writeJson, writeMarkdown } from "./run-files.js";

function readDraftComparisons(run: RunState) {
  const dir = path.join(run.rootDir, "evaluations", "draft-comparisons");
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".md"))
    .sort()
    .map((entry) => {
      const filePath = path.join(dir, entry);
      const text = readFileSync(filePath, "utf8");
      return {
        path: filePath,
        addedLines: Number(text.match(/Added lines:\s*(\d+)/i)?.[1] ?? 0),
        removedLines: Number(text.match(/Removed lines:\s*(\d+)/i)?.[1] ?? 0),
      };
    });
}

export function buildRevisionHistory(run: RunState) {
  return {
    generatedAt: new Date().toISOString(),
    runId: run.id,
    revisionCycle: run.revisionCycle,
    phaseEvents: run.history,
    feedback: run.reviewerFeedback,
    pendingRevisionPlan: run.pendingRevisionPlan ?? null,
    qualityGates: run.qualityGates,
    draftComparisons: readDraftComparisons(run),
  };
}

export function writeRevisionHistory(run: RunState) {
  const history = buildRevisionHistory(run);
  const jsonPath = writeJson(path.join(run.rootDir, "evaluations", "revision-history.json"), history);
  const mdPath = writeMarkdown(path.join(run.rootDir, "evaluations", "revision-history.md"), [
    `# Revision History for ${run.id}`,
    "",
    `- Revision cycle: ${history.revisionCycle}`,
    `- Phase events: ${history.phaseEvents.length}`,
    `- Reviewer feedback entries: ${history.feedback.length}`,
    `- Quality gates: ${history.qualityGates.length}`,
    `- Draft comparisons: ${history.draftComparisons.length}`,
    "",
    "## Phase Events",
    ...(history.phaseEvents.length ? history.phaseEvents.map((entry) => `- ${entry.phase} attempt ${entry.attempt}: ${entry.status}${entry.summary ? ` - ${entry.summary}` : ""}`) : ["- none"]),
    "",
    "## Reviewer Feedback",
    ...(history.feedback.length ? history.feedback.map((entry) => `- ${entry.recordedAt}: ${entry.note}`) : ["- none"]),
    "",
  ].join("\n"));
  return { history, jsonPath, mdPath };
}
