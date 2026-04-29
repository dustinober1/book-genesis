import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { RunState } from "./types.js";
import { countWords, listChapterFiles, plainText, readManuscript } from "./run-files.js";

function countJsonFindings(filePath: string) {
  if (!existsSync(filePath)) return 0;
  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as { findings?: unknown[]; claims?: unknown[]; issues?: unknown[] };
  return parsed.findings?.length ?? parsed.claims?.length ?? parsed.issues?.length ?? 0;
}

export function buildRunStats(run: RunState) {
  const chapters = listChapterFiles(run);
  const manuscriptWords = countWords(plainText(readManuscript(run)));
  const sorted = [...chapters].sort((a, b) => a.wordCount - b.wordCount);
  const latestGate = run.qualityGates.at(-1);
  return {
    runId: run.id,
    status: run.status,
    phase: run.currentPhase,
    completedPhases: run.completedPhases,
    wordCount: manuscriptWords,
    chapterCount: chapters.length,
    averageChapterLength: chapters.length ? Math.round(manuscriptWords / chapters.length) : 0,
    longestChapter: sorted.at(-1)?.title ?? null,
    shortestChapter: sorted[0]?.title ?? null,
    latestQualityGateStatus: latestGate ? (latestGate.passed ? "passed" : "failed") : "none",
    styleFindingsCount: countJsonFindings(path.join(run.rootDir, "evaluations", "style-lint.json")),
    sourceAuditWarningsCount: countJsonFindings(path.join(run.rootDir, "evaluations", "source-audit.json")),
    kdpReadinessIssuesCount: countJsonFindings(path.join(run.rootDir, "delivery", "kdp", "cover-check.json")),
    launchKitReady: existsSync(path.join(run.rootDir, "promotion", "launch-kit", "launch-kit-manifest.json")),
  };
}

export function formatRunStats(stats: ReturnType<typeof buildRunStats>) {
  return [
    `Book Genesis stats for ${stats.runId}`,
    "",
    `- Status: ${stats.status}`,
    `- Phase: ${stats.phase}`,
    `- Completed phases: ${stats.completedPhases.join(", ") || "none"}`,
    `- Word count: ${stats.wordCount}`,
    `- Chapter count: ${stats.chapterCount}`,
    `- Average chapter length: ${stats.averageChapterLength}`,
    `- Longest chapter: ${stats.longestChapter ?? "none"}`,
    `- Shortest chapter: ${stats.shortestChapter ?? "none"}`,
    `- Latest quality gate: ${stats.latestQualityGateStatus}`,
    `- Style findings: ${stats.styleFindingsCount}`,
    `- Source audit findings: ${stats.sourceAuditWarningsCount}`,
    `- KDP readiness issues: ${stats.kdpReadinessIssuesCount}`,
    `- Launch kit ready: ${stats.launchKitReady ? "yes" : "no"}`,
  ].join("\n");
}
