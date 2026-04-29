import { existsSync } from "node:fs";
import path from "node:path";

import { validatePhaseArtifacts } from "./artifacts.js";
import { analyzeManuscript, formatManuscriptIntelligenceReport } from "./intelligence.js";
import { buildPublishingReadiness, formatPublishingReadiness } from "./publishing.js";
import type { HealthCheckResult, PhaseName, RunState } from "./types.js";

function promotionReadiness(run: RunState) {
  const results: HealthCheckResult[] = [];
  if (!run.config.promotion.shortStoryEnabled) {
    results.push({
      ok: true,
      severity: "info",
      code: "short_story_disabled",
      message: "Short-story promotion is disabled for this run.",
    });
    return { ok: true, results };
  }

  const packageDir = path.join(run.rootDir, "promotion", "short-story-package");
  const storyPath = path.join(packageDir, "story.md");
  const landingPath = path.join(packageDir, "landing-page-copy.md");
  results.push(existsSync(storyPath) && existsSync(landingPath)
    ? {
        ok: true,
        severity: "info",
        code: "short_story_package_present",
        message: "Short-story lead magnet package is present.",
      }
    : {
        ok: false,
        severity: "warning",
        code: "short_story_package_missing",
        message: "Short-story lead magnet package is missing.",
        remedy: "Run /book-genesis short-story brainstorm, then /book-genesis short-story package.",
      });

  return {
    ok: results.every((item) => item.severity !== "error"),
    results,
  };
}

export function buildAuditReport(run: RunState) {
  const phases = Array.from(new Set([...run.completedPhases, run.currentPhase])) as PhaseName[];
  const artifacts = phases.map((phase) => ({
    phase,
    validation: validatePhaseArtifacts(run, phase, run.artifacts[phase] ?? []),
  }));
  const manuscript = analyzeManuscript(run);
  const publishing = buildPublishingReadiness(run);
  const promotion = promotionReadiness(run);
  const nextActions = [
    ...artifacts.flatMap((entry) => entry.validation.issues.slice(0, 3).map((issue) => `Fix ${issue.target}: ${issue.message}`)),
    ...manuscript.findings.slice(0, 3).map((finding) => `${finding.target}: ${finding.suggestedAction}`),
    ...publishing.results.filter((item) => item.severity !== "info").slice(0, 3).map((item) => item.remedy ?? item.message),
    ...promotion.results.filter((item) => item.severity !== "info").map((item) => item.remedy ?? item.message),
  ];

  return {
    generatedAt: new Date().toISOString(),
    runId: run.id,
    status: run.status,
    currentPhase: run.currentPhase,
    artifacts,
    manuscript,
    publishing,
    promotion,
    nextActions,
  };
}

export function formatAuditReport(report: ReturnType<typeof buildAuditReport>) {
  const artifactLines = report.artifacts.length > 0
    ? report.artifacts.map((entry) => `- ${entry.phase}: ${entry.validation.ok ? "OK" : `FAIL (${entry.validation.issues.length})`}`).join("\n")
    : "- none";
  const promotionLines = report.promotion.results.map((item) => `- [${item.severity.toUpperCase()}] ${item.code}: ${item.message}`).join("\n");
  const nextActions = report.nextActions.length > 0 ? report.nextActions.map((item) => `- ${item}`).join("\n") : "- none";

  return [
    `# Book Genesis audit for ${report.runId}`,
    "",
    `- Status: ${report.status}`,
    `- Current phase: ${report.currentPhase}`,
    "",
    "## Artifact validation",
    artifactLines,
    "",
    "## Manuscript intelligence",
    formatManuscriptIntelligenceReport(report.manuscript).replace(/^# Manuscript Intelligence Report\n\n/, ""),
    "",
    "## Publishing readiness",
    formatPublishingReadiness(report.publishing).replace(/^# Publishing Readiness\n\n/, ""),
    "",
    "## Promotion readiness",
    promotionLines,
    "",
    "## Next actions",
    nextActions,
    "",
  ].join("\n");
}
