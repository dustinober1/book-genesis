import path from "node:path";
import { existsSync } from "node:fs";

import { buildFinalCheck } from "./final-check.js";
import { buildRunStats } from "./stats.js";
import { buildSourcePack, sourcePackExists } from "./source-pack.js";
import type { RunState } from "./types.js";
import { writeJson, writeMarkdown } from "./run-files.js";

export interface NextActionRecommendation {
  command: string;
  reason: string;
  severity: "info" | "warning" | "error";
}

export function recommendNextAction(run: RunState): NextActionRecommendation {
  if (run.status === "awaiting_approval") {
    return { command: "/book-genesis approve", reason: `Run is waiting for approval after ${run.approval?.phase ?? run.currentPhase}.`, severity: "warning" };
  }
  if (run.status === "failed") {
    return { command: "/book-genesis doctor-run", reason: "Run failed and needs diagnostics before resuming.", severity: "error" };
  }
  if (run.status === "stopped") {
    return { command: "/book-genesis resume", reason: "Run is paused and can be resumed or inspected.", severity: "info" };
  }

  const sourcePack = buildSourcePack(run);
  if (sourcePack.required && !sourcePackExists(run) && (run.currentPhase === "research" || run.currentPhase === "foundation")) {
    return { command: "/book-genesis source-pack", reason: "Source-first modes should create a source pack before outline lock-in.", severity: "warning" };
  }

  if (run.status === "completed" || run.currentPhase === "deliver") {
    const finalCheck = buildFinalCheck(run);
    return finalCheck.ok
      ? { command: "/book-genesis export", reason: "Final readiness checks are clear enough for export.", severity: "info" }
      : { command: "/book-genesis final-check", reason: "Final packaging readiness has blockers or warnings.", severity: "warning" };
  }

  return { command: "/book-genesis resume", reason: `Continue the ${run.currentPhase} phase.`, severity: "info" };
}

export function buildRunDashboard(run: RunState) {
  const stats = buildRunStats(run);
  const finalCheck = buildFinalCheck(run);
  return {
    generatedAt: new Date().toISOString(),
    runId: run.id,
    status: run.status,
    phase: run.currentPhase,
    next: recommendNextAction(run),
    stats,
    readiness: {
      finalCheckOk: finalCheck.ok,
      finalCheckErrors: finalCheck.results.filter((item) => item.severity === "error").length,
      finalCheckWarnings: finalCheck.results.filter((item) => item.severity === "warning").length,
    },
    workbench: {
      jsonPath: path.join(run.rootDir, "dashboard", "workbench.json"),
      markdownPath: path.join(run.rootDir, "dashboard", "workbench.md"),
      present: existsSync(path.join(run.rootDir, "dashboard", "workbench.json")),
    },
  };
}

export function formatRunDashboard(dashboard: ReturnType<typeof buildRunDashboard>) {
  return [
    `# Book Genesis Dashboard for ${dashboard.runId}`,
    "",
    `- Status: ${dashboard.status}`,
    `- Phase: ${dashboard.phase}`,
    `- Word count: ${dashboard.stats.wordCount}`,
    `- Chapters: ${dashboard.stats.chapterCount}`,
    `- Latest quality gate: ${dashboard.stats.latestQualityGateStatus}`,
    `- Final-check errors: ${dashboard.readiness.finalCheckErrors}`,
    `- Final-check warnings: ${dashboard.readiness.finalCheckWarnings}`,
    `- Workbench: ${dashboard.workbench.present ? dashboard.workbench.markdownPath : "not generated"}`,
    "",
    "## Recommended Next Action",
    "",
    `- Command: ${dashboard.next.command}`,
    `- Reason: ${dashboard.next.reason}`,
    "",
  ].join("\n");
}

export function writeRunDashboard(run: RunState) {
  const dashboard = buildRunDashboard(run);
  const jsonPath = writeJson(path.join(run.rootDir, "dashboard", "run-dashboard.json"), dashboard);
  const markdownPath = writeMarkdown(path.join(run.rootDir, "dashboard", "run-dashboard.md"), formatRunDashboard(dashboard));
  return { dashboard, jsonPath, markdownPath };
}
