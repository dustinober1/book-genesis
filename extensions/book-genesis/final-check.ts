import { existsSync } from "node:fs";
import path from "node:path";

import { buildAuditReport } from "./audit.js";
import { buildBibleCheck } from "./bible-check.js";
import { buildSourcePack, sourcePackExists } from "./source-pack.js";
import type { HealthCheckResult, RunState } from "./types.js";
import { writeJson, writeMarkdown } from "./run-files.js";

function result(ok: boolean, severity: HealthCheckResult["severity"], code: string, message: string, remedy?: string): HealthCheckResult {
  return { ok, severity, code, message, remedy };
}

export function buildFinalCheck(run: RunState) {
  const audit = buildAuditReport(run);
  const bible = buildBibleCheck(run);
  const sourcePack = buildSourcePack(run);
  const results: HealthCheckResult[] = [];

  results.push(...audit.publishing.results);
  results.push(...audit.promotion.results);
  results.push(...audit.coverCheck.results);
  results.push(...audit.launchKit.results);
  results.push(...audit.archive.results);
  results.push(...audit.style.findings.filter((finding) => finding.severity !== "info").map((finding) =>
    result(false, finding.severity, `style_${finding.code}`, `${finding.target}: ${finding.evidence}`, finding.suggestedAction)));
  results.push(...audit.pacing.findings.filter((finding) => finding.severity !== "info").map((finding) =>
    result(false, finding.severity, `pacing_${finding.code}`, `${finding.target}: ${finding.evidence}`, finding.suggestedAction)));
  results.push(...audit.sourceAudit.findings.filter((finding) => finding.severity !== "info"));
  results.push(...bible.findings.filter((finding) => finding.severity !== "info"));

  if (sourcePack.required && (!sourcePackExists(run) || sourcePack.gaps.some((gap) => gap.severity === "error"))) {
    results.push(result(false, "error", "source_pack_required", "A source pack is required before final packaging for this book mode.", "Run /book-genesis source-pack and resolve source gaps."));
  }

  if (!existsSync(path.join(run.rootDir, "evaluations", "critique-panel.json"))) {
    results.push(result(false, "warning", "critique_panel_missing", "Critique panel report is missing.", "Run /book-genesis critique-panel."));
  }

  if (results.length === 0) {
    results.push(result(true, "info", "final_check_ready", "No final packaging blockers detected."));
  }

  return {
    generatedAt: new Date().toISOString(),
    runId: run.id,
    ok: results.every((item) => item.severity !== "error"),
    results,
    nextActions: Array.from(new Set(results.filter((item) => item.severity !== "info").map((item) => item.remedy ?? item.message))),
  };
}

export function formatFinalCheck(report: ReturnType<typeof buildFinalCheck>) {
  return [
    `# Book Genesis final check for ${report.runId}`,
    "",
    `- Status: ${report.ok ? "READY" : "BLOCKED"}`,
    "",
    "## Results",
    ...report.results.map((item) => `- [${item.severity.toUpperCase()}] ${item.code}: ${item.message}`),
    "",
    "## Next Actions",
    ...(report.nextActions.length ? report.nextActions.map((item) => `- ${item}`) : ["- none"]),
    "",
  ].join("\n");
}

export function writeFinalCheck(run: RunState) {
  const report = buildFinalCheck(run);
  const jsonPath = writeJson(path.join(run.rootDir, "delivery", "final-check.json"), report);
  const mdPath = writeMarkdown(path.join(run.rootDir, "delivery", "final-check.md"), formatFinalCheck(report));
  return { report, jsonPath, mdPath };
}

export function finalCheckWarning(run: RunState) {
  const report = buildFinalCheck(run);
  if (report.ok) {
    return "";
  }
  const errors = report.results.filter((item) => item.severity === "error").length;
  const warnings = report.results.filter((item) => item.severity === "warning").length;
  return `Warning: /book-genesis final-check reports ${errors} error(s) and ${warnings} warning(s). Export/KDP was not blocked.`;
}
