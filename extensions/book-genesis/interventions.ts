import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { requestReviewerRevision } from "./state.js";
import type { RunState } from "./types.js";

function nowFileStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function assertInsideRun(run: RunState, value: string) {
  const absolute = path.isAbsolute(value) ? value : path.join(run.rootDir, value);
  const relative = path.relative(run.rootDir, absolute);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Draft paths must stay inside the run directory.");
  }
  return { absolute, relative };
}

export function requestChapterRevision(run: RunState, chapter: string, notes: string) {
  const trimmedChapter = chapter.trim();
  const trimmedNotes = notes.trim();
  if (!trimmedChapter || !trimmedNotes) {
    throw new Error("Chapter and notes are required.");
  }

  if (run.status === "running") {
    run.status = "stopped";
    run.stopRequested = true;
  }

  return requestReviewerRevision(run, [
    `Targeted chapter revision requested.`,
    `Chapter: ${trimmedChapter}`,
    "",
    trimmedNotes,
  ].join("\n"));
}

export function requestWriteSampleCheckpoint(run: RunState, sampleChapters: number) {
  if (!Number.isInteger(sampleChapters) || sampleChapters < 1) {
    throw new Error("Sample chapter count must be a positive integer.");
  }

  run.currentPhase = "write";
  run.status = "awaiting_approval";
  run.stopRequested = false;
  run.approval = {
    phase: "write",
    requestedAt: new Date().toISOString(),
    reason: `Review a sample of ${sampleChapters} chapter${sampleChapters === 1 ? "" : "s"} before continuing the write phase.`,
    status: "pending",
    nextPhase: "write",
    completionPending: false,
  };
  run.nextAction = `Review the sample of ${sampleChapters} chapter${sampleChapters === 1 ? "" : "s"} and run /book-genesis approve "${run.rootDir}".`;
}

function diffLineSets(left: string[], right: string[]) {
  const leftCounts = new Map<string, number>();
  const rightCounts = new Map<string, number>();
  for (const line of left) {
    leftCounts.set(line, (leftCounts.get(line) ?? 0) + 1);
  }
  for (const line of right) {
    rightCounts.set(line, (rightCounts.get(line) ?? 0) + 1);
  }

  const removed = left.filter((line) => {
    const count = rightCounts.get(line) ?? 0;
    if (count <= 0) {
      return true;
    }
    rightCounts.set(line, count - 1);
    return false;
  });

  const added = right.filter((line) => {
    const count = leftCounts.get(line) ?? 0;
    if (count <= 0) {
      return true;
    }
    leftCounts.set(line, count - 1);
    return false;
  });

  return { added, removed };
}

export function compareDrafts(run: RunState, leftPath: string, rightPath: string) {
  const left = assertInsideRun(run, leftPath);
  const right = assertInsideRun(run, rightPath);
  if (!existsSync(left.absolute) || !existsSync(right.absolute)) {
    throw new Error("Both draft files must exist.");
  }

  const leftLines = readFileSync(left.absolute, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const rightLines = readFileSync(right.absolute, "utf8").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const diff = diffLineSets(leftLines, rightLines);
  const outDir = path.join(run.rootDir, "evaluations", "draft-comparisons");
  mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, `${nowFileStamp()}-comparison.md`);
  const content = [
    "# Draft Comparison",
    "",
    `- Run: ${run.id}`,
    `- Left: ${left.relative}`,
    `- Right: ${right.relative}`,
    `- Added lines: ${diff.added.length}`,
    `- Removed lines: ${diff.removed.length}`,
    "",
    "## Added",
    diff.added.length > 0 ? diff.added.map((line) => `- ${line}`).join("\n") : "- none",
    "",
    "## Removed",
    diff.removed.length > 0 ? diff.removed.map((line) => `- ${line}`).join("\n") : "- none",
    "",
  ].join("\n");
  writeFileSync(reportPath, content, "utf8");

  return {
    reportPath,
    addedLines: diff.added.length,
    removedLines: diff.removed.length,
  };
}
