import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { HealthCheckResult, RunState } from "./types.js";

function result(
  ok: boolean,
  severity: HealthCheckResult["severity"],
  code: string,
  message: string,
  remedy?: string,
): HealthCheckResult {
  return { ok, severity, code, message, remedy };
}

function readOptional(run: RunState, relativePath: string) {
  const filePath = path.join(run.rootDir, relativePath);
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

function plain(markdown: string) {
  return markdown.replace(/^#{1,6}\s+/gm, "").replace(/\s+/g, " ").trim();
}

export function buildPublishingReadiness(run: RunState) {
  const results: HealthCheckResult[] = [];
  const manuscript = readOptional(run, "manuscript/full-manuscript.md");
  const synopsis = readOptional(run, "delivery/synopsis.md") || readOptional(run, "delivery/one-page-synopsis.md");
  const logline = readOptional(run, "delivery/logline.md");
  const packageSummary = readOptional(run, "delivery/package-summary.md");
  const coverBrief = readOptional(run, "delivery/cover-brief.md") || readOptional(run, "delivery/illustrator-brief.md");

  results.push(manuscript.trim()
    ? result(true, "info", "manuscript_present", "Full manuscript is present.")
    : result(false, "error", "manuscript_missing", "Full manuscript is missing.", "Complete the write phase before packaging."));

  results.push(synopsis.trim()
    ? result(true, "info", "synopsis_present", "Synopsis is present.")
    : result(false, "warning", "synopsis_missing", "Synopsis is missing.", "Complete delivery assets before publishing."));

  results.push(logline.trim()
    ? result(true, "info", "logline_present", "Logline is present.")
    : result(false, "warning", "logline_missing", "Logline is missing.", "Add delivery/logline.md for website and store positioning."));

  results.push(packageSummary.trim()
    ? result(true, "info", "package_summary_present", "Package summary is present.")
    : result(false, "warning", "package_summary_missing", "Package summary is missing.", "Add delivery/package-summary.md."));

  results.push(coverBrief.trim()
    ? result(true, "info", "cover_brief_present", "Cover or illustrator brief is present.")
    : result(false, "warning", "cover_brief_missing", "Cover brief is missing.", "Add a cover or illustrator brief before final KDP packaging."));

  results.push(run.config.kdp.authorName
    ? result(true, "info", "kdp_author_present", "KDP author name is set.")
    : result(false, "error", "kdp_author_missing", "KDP author name is missing.", "Set kdp.authorName in book-genesis.config.json."));

  results.push(run.config.kdp.keywords.length > 0
    ? result(true, "info", "kdp_keywords_present", `KDP has ${run.config.kdp.keywords.length}/7 keyword slots configured.`)
    : result(false, "warning", "kdp_keywords_missing", "No KDP keywords are configured.", "Add up to seven KDP keyword phrases."));

  results.push(run.config.kdp.categories.length > 0
    ? result(true, "info", "kdp_categories_present", `KDP has ${run.config.kdp.categories.length} categories configured.`)
    : result(false, "warning", "kdp_categories_missing", "No KDP categories are configured.", "Choose KDP categories before publication."));

  if (synopsis && packageSummary) {
    const synopsisTerms = new Set(plain(synopsis).toLowerCase().split(/\W+/).filter((word) => word.length > 6));
    const summaryTerms = plain(packageSummary).toLowerCase().split(/\W+/).filter((word) => word.length > 6);
    const overlap = summaryTerms.filter((word) => synopsisTerms.has(word)).length;
    results.push(overlap > 0
      ? result(true, "info", "metadata_consistency_ok", "Synopsis and package summary share positioning language.")
      : result(false, "warning", "metadata_consistency_gap", "Synopsis and package summary do not share clear positioning terms.", "Align delivery copy before using it on a website or KDP page."));
  }

  return {
    ok: results.every((item) => item.severity !== "error"),
    generatedAt: new Date().toISOString(),
    runId: run.id,
    results,
  };
}

export function formatPublishingReadiness(report: ReturnType<typeof buildPublishingReadiness>) {
  return [
    "# Publishing Readiness",
    "",
    `- Run: ${report.runId}`,
    `- Generated: ${report.generatedAt}`,
    `- Status: ${report.ok ? "OK" : "NEEDS ATTENTION"}`,
    "",
    ...report.results.flatMap((item) => [
      `- [${item.severity.toUpperCase()}] ${item.code}: ${item.message}`,
      ...(item.remedy ? [`  Remedy: ${item.remedy}`] : []),
    ]),
    "",
  ].join("\n");
}

export function writePublishingReadinessReport(run: RunState) {
  const deliveryDir = path.join(run.rootDir, "delivery");
  mkdirSync(deliveryDir, { recursive: true });
  const outputPath = path.join(deliveryDir, "publishing-readiness.md");
  writeFileSync(outputPath, formatPublishingReadiness(buildPublishingReadiness(run)), "utf8");
  return outputPath;
}
