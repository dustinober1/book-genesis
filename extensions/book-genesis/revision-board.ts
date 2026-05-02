import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import path from "node:path";

import { buildCritiquePanel } from "./critique.js";
import { analyzeManuscript } from "./intelligence.js";
import { buildPacingDashboard } from "./scenes.js";
import { buildSourceAudit } from "./source-audit.js";
import { lintStyle } from "./style.js";
import type { HealthCheckResult, RevisionBoardTask, RevisionPriority, RunState } from "./types.js";
import { writeJson, writeMarkdown } from "./run-files.js";

export interface RevisionBoardReport {
  generatedAt: string;
  runId: string;
  openTasks: number;
  tasks: RevisionBoardTask[];
}

function taskId(source: string, target: string, title: string) {
  return `rev_${createHash("sha1").update(`${source}|${target}|${title}`).digest("hex").slice(0, 10)}`;
}

function priority(severity: "info" | "warning" | "error", fallback: RevisionPriority): RevisionPriority {
  if (severity === "error") return "high";
  if (severity === "warning") return "medium";
  return fallback;
}

function makeTask(input: {
  source: string;
  target: string;
  title: string;
  severity: "info" | "warning" | "error";
  suggestedAction: string;
  fallbackPriority: RevisionPriority;
}): RevisionBoardTask {
  return {
    id: taskId(input.source, input.target, input.title),
    title: input.title,
    source: input.source,
    target: input.target,
    priority: priority(input.severity, input.fallbackPriority),
    status: "open",
    acceptanceCriteria: [
      input.suggestedAction,
      `Update ${input.target} so the issue no longer appears in the originating report.`,
    ],
  };
}

function uniqueTasks(tasks: RevisionBoardTask[]) {
  const seen = new Set<string>();
  return tasks.filter((task) => {
    if (seen.has(task.id)) return false;
    seen.add(task.id);
    return true;
  });
}

export function buildRevisionBoard(run: RunState): RevisionBoardReport {
  const includeInfo = run.config.revisionBoard.includeInfoFindings;
  const fallbackPriority = run.config.revisionBoard.defaultPriority;
  const tasks: RevisionBoardTask[] = [];

  for (const finding of analyzeManuscript(run).findings) {
    if (finding.severity === "info" && !includeInfo) continue;
    tasks.push(makeTask({
      source: "manuscript-intelligence",
      target: finding.target,
      title: finding.evidence,
      severity: finding.severity,
      suggestedAction: finding.suggestedAction,
      fallbackPriority,
    }));
  }

  for (const finding of lintStyle(run).findings) {
    if (finding.severity === "info" && !includeInfo) continue;
    tasks.push(makeTask({
      source: "style-lint",
      target: finding.target,
      title: finding.evidence,
      severity: finding.severity,
      suggestedAction: finding.suggestedAction,
      fallbackPriority,
    }));
  }

  for (const finding of buildPacingDashboard(run).findings) {
    if (finding.severity === "info" && !includeInfo) continue;
    tasks.push(makeTask({
      source: "pacing",
      target: finding.target,
      title: finding.evidence,
      severity: finding.severity,
      suggestedAction: finding.suggestedAction,
      fallbackPriority,
    }));
  }

  for (const finding of buildSourceAudit(run).findings) {
    if (finding.severity === "info" && !includeInfo) continue;
    tasks.push(makeTask({
      source: "source-audit",
      target: "research/source-coverage-map.md",
      title: finding.message,
      severity: finding.severity,
      suggestedAction: finding.remedy ?? finding.message,
      fallbackPriority,
    }));
  }

  const critique = buildCritiquePanel(run);
  if (critique.disagreement.meanAbsDelta !== null && critique.disagreement.meanAbsDelta > run.config.critiquePanel.maxMeanDisagreement) {
    tasks.push(makeTask({
      source: "critique-panel",
      target: "evaluations/critique-panel.md",
      title: `Reviewer disagreement is ${critique.disagreement.meanAbsDelta}.`,
      severity: "warning",
      suggestedAction: "Resolve the highest-disagreement critique dimensions before the next revision pass.",
      fallbackPriority,
    }));
  }

  for (const feedback of run.reviewerFeedback) {
    tasks.push(makeTask({
      source: "reviewer-feedback",
      target: feedback.artifactPath,
      title: feedback.note,
      severity: "warning",
      suggestedAction: "Address the reviewer note and record the manuscript change in revision history.",
      fallbackPriority,
    }));
  }

  if (run.pendingRevisionPlan?.status === "pending") {
    tasks.push(makeTask({
      source: "revision-plan",
      target: run.pendingRevisionPlan.planPath,
      title: "Revision plan is awaiting approval.",
      severity: "warning",
      suggestedAction: "Approve or reject the pending revision plan before rewriting.",
      fallbackPriority,
    }));
  }

  const unique = uniqueTasks(tasks).sort((a, b) => {
    const rank = { high: 3, medium: 2, low: 1 };
    return rank[b.priority] - rank[a.priority] || a.target.localeCompare(b.target);
  });

  return {
    generatedAt: new Date().toISOString(),
    runId: run.id,
    openTasks: unique.filter((task) => task.status === "open").length,
    tasks: unique,
  };
}

export function formatRevisionBoard(report: RevisionBoardReport) {
  return [
    "# Revision Board",
    "",
    `- Run: ${report.runId}`,
    `- Open tasks: ${report.openTasks}`,
    "",
    ...(report.tasks.length
      ? report.tasks.map((task) => [
          `## ${task.id}: ${task.title}`,
          "",
          `- Source: ${task.source}`,
          `- Target: ${task.target}`,
          `- Priority: ${task.priority}`,
          `- Status: ${task.status}`,
          "- Acceptance criteria:",
          ...task.acceptanceCriteria.map((criterion) => `  - ${criterion}`),
        ].join("\n"))
      : ["## No Open Tasks", "", "No actionable revision tasks were detected."]),
    "",
  ].join("\n");
}

export function writeRevisionBoard(run: RunState) {
  const report = buildRevisionBoard(run);
  const jsonPath = writeJson(path.join(run.rootDir, "revisions", "revision-board.json"), report);
  const markdownPath = writeMarkdown(path.join(run.rootDir, "revisions", "revision-board.md"), formatRevisionBoard(report));
  return { report, jsonPath, markdownPath };
}

export function revisionBoardReadiness(run: RunState): HealthCheckResult[] {
  if (!run.config.revisionBoard.enabled) {
    return [{ ok: true, severity: "info", code: "revision_board_disabled", message: "Revision board is disabled for this run." }];
  }
  const boardPath = path.join(run.rootDir, "revisions", "revision-board.json");
  if (existsSync(boardPath)) {
    return [{ ok: true, severity: "info", code: "revision_board_present", message: "Revision board is present." }];
  }
  const shouldExist = run.completedPhases.includes("evaluate") || run.currentPhase === "revise" || run.currentPhase === "deliver" || run.status === "completed";
  return [{
    ok: !shouldExist,
    severity: shouldExist ? "warning" : "info",
    code: "revision_board_missing",
    message: "Revision board has not been generated.",
    remedy: "Run /book-genesis revision-board.",
  }];
}
