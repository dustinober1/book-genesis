import { existsSync } from "node:fs";
import path from "node:path";

import { buildFinalCheck } from "./final-check.js";
import { layoutProfileReadiness } from "./layout-profiles.js";
import { launchKitReady } from "./launch.js";
import { metadataLabReady } from "./metadata-lab.js";
import { revisionBoardReadiness } from "./revision-board.js";
import { sourceVaultReadiness } from "./source-vault.js";
import { recommendNextAction, type NextActionRecommendation } from "./dashboard.js";
import type { HealthCheckResult, RunState } from "./types.js";
import { relativeToRun, writeJson, writeMarkdown } from "./run-files.js";

export interface WorkbenchArtifact {
  label: string;
  path: string;
  exists: boolean;
}

export interface WorkbenchReadinessRow {
  area: string;
  severity: HealthCheckResult["severity"];
  code: string;
  message: string;
  remedy?: string;
}

export interface WorkbenchReport {
  generatedAt: string;
  runId: string;
  title: string;
  status: RunState["status"];
  phase: RunState["currentPhase"];
  next: NextActionRecommendation;
  blockers: WorkbenchReadinessRow[];
  artifacts: WorkbenchArtifact[];
  recentHistory: RunState["history"];
  readiness: WorkbenchReadinessRow[];
}

function artifact(run: RunState, label: string, relativePath: string): WorkbenchArtifact {
  const absolute = path.join(run.rootDir, relativePath);
  return { label, path: relativeToRun(run, absolute), exists: existsSync(absolute) };
}

function row(area: string, result: HealthCheckResult): WorkbenchReadinessRow {
  return {
    area,
    severity: result.severity,
    code: result.code,
    message: result.message,
    remedy: result.remedy,
  };
}

export function buildWorkbench(run: RunState): WorkbenchReport {
  const finalCheck = buildFinalCheck(run);
  const readiness = [
    ...finalCheck.results.map((result) => row("final-check", result)),
    ...metadataLabReady(run).map((result) => row("metadata-lab", result)),
    ...revisionBoardReadiness(run).map((result) => row("revision-board", result)),
    ...sourceVaultReadiness(run).map((result) => row("source-vault", result)),
    ...layoutProfileReadiness(run).map((result) => row("layout-profile", result)),
    ...(launchKitReady(run)
      ? [row("launch-kit", { ok: true, severity: "info", code: "launch_kit_present", message: "Launch kit is present." })]
      : [row("launch-kit", { ok: false, severity: "warning", code: "launch_kit_missing", message: "Launch kit is missing.", remedy: "Run /book-genesis launch-kit." })]),
    row("archive", existsSync(path.join(run.rootDir, "delivery", "archive", "archive-manifest.json"))
      ? { ok: true, severity: "info", code: "archive_present", message: "Archive manifest is present." }
      : { ok: false, severity: "warning", code: "archive_missing", message: "Archive manifest is missing.", remedy: "Run /book-genesis archive." }),
  ];

  return {
    generatedAt: new Date().toISOString(),
    runId: run.id,
    title: run.title,
    status: run.status,
    phase: run.currentPhase,
    next: recommendNextAction(run),
    blockers: readiness.filter((item) => item.severity === "error" || item.severity === "warning"),
    artifacts: [
      artifact(run, "Run state", ".book-genesis/run.json"),
      artifact(run, "Ledger", ".book-genesis/ledger.json"),
      artifact(run, "Manuscript", "manuscript/full-manuscript.md"),
      artifact(run, "Metadata lab", "delivery/metadata-lab/metadata-lab.md"),
      artifact(run, "Revision board", "revisions/revision-board.md"),
      artifact(run, "Source vault", "research/source-vault.md"),
      artifact(run, "Layout profile", "delivery/layout-profile.md"),
      artifact(run, "Final check", "delivery/final-check.md"),
      artifact(run, "KDP manifest", "delivery/kdp/kdp-manifest.json"),
    ],
    recentHistory: run.history.slice(-run.config.workbench.includeRecentHistoryLimit),
    readiness,
  };
}

export function formatWorkbench(report: WorkbenchReport) {
  return [
    "# Book Genesis Workbench",
    "",
    `- Run: ${report.runId}`,
    `- Title: ${report.title}`,
    `- Status: ${report.status}`,
    `- Phase: ${report.phase}`,
    `- Next command: ${report.next.command}`,
    `- Next reason: ${report.next.reason}`,
    "",
    "## Blockers",
    ...(report.blockers.length
      ? report.blockers.map((item) => `- [${item.severity.toUpperCase()}] ${item.area}/${item.code}: ${item.message}${item.remedy ? ` Remedy: ${item.remedy}` : ""}`)
      : ["- none"]),
    "",
    "## Artifacts",
    ...report.artifacts.map((item) => `- [${item.exists ? "x" : " "}] ${item.label}: ${item.path}`),
    "",
    "## Readiness",
    ...report.readiness.map((item) => `- [${item.severity.toUpperCase()}] ${item.area}: ${item.message}`),
    "",
    "## Recent History",
    ...(report.recentHistory.length
      ? report.recentHistory.map((entry) => `- ${entry.phase} attempt ${entry.attempt}: ${entry.status}`)
      : ["- none"]),
    "",
  ].join("\n");
}

export function writeWorkbench(run: RunState) {
  const report = buildWorkbench(run);
  const jsonPath = writeJson(path.join(run.rootDir, "dashboard", "workbench.json"), report);
  const markdownPath = writeMarkdown(path.join(run.rootDir, "dashboard", "workbench.md"), formatWorkbench(report));
  return { report, jsonPath, markdownPath };
}
