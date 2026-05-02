import { existsSync } from "node:fs";
import path from "node:path";

import { validatePhaseArtifacts } from "./artifacts.js";
import { analyzeManuscript, formatManuscriptIntelligenceReport } from "./intelligence.js";
import { buildPublishingReadiness, formatPublishingReadiness } from "./publishing.js";
import type { HealthCheckResult, PhaseName, RunState } from "./types.js";
import { buildPacingDashboard } from "./scenes.js";
import { lintStyle } from "./style.js";
import { buildSourceAudit } from "./source-audit.js";
import { buildCritiquePanel } from "./critique.js";
import { layoutProfileReadiness } from "./layout-profiles.js";
import { launchKitReady } from "./launch.js";
import { metadataLabReady } from "./metadata-lab.js";
import { revisionBoardReadiness } from "./revision-board.js";
import { sourceVaultReadiness } from "./source-vault.js";

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
  const style = lintStyle(run);
  const pacing = buildPacingDashboard(run);
  const critique = buildCritiquePanel(run);
  const sourceAudit = buildSourceAudit(run);
  const metadataLabResults = metadataLabReady(run);
  const revisionBoardResults = revisionBoardReadiness(run);
  const sourceVaultResults = sourceVaultReadiness(run);
  const layoutProfileResults = layoutProfileReadiness(run);
  const metadataLab = { ok: metadataLabResults.every((item) => item.severity !== "error"), results: metadataLabResults };
  const revisionBoard = { ok: revisionBoardResults.every((item) => item.severity !== "error"), results: revisionBoardResults };
  const sourceVault = { ok: sourceVaultResults.every((item) => item.severity !== "error"), results: sourceVaultResults };
  const layoutProfile = { ok: layoutProfileResults.every((item) => item.severity !== "error"), results: layoutProfileResults };
  const publishing = buildPublishingReadiness(run);
  const promotion = promotionReadiness(run);
  const coverCheckPath = path.join(run.rootDir, "delivery", "kdp", "cover-check.json");
  const coverCheck = existsSync(coverCheckPath)
    ? { ok: true, results: [{ ok: true, severity: "info", code: "cover_check_present", message: "Cover-check report is present." } satisfies HealthCheckResult] }
    : { ok: false, results: [{ ok: false, severity: "warning", code: "cover_check_missing", message: "Cover-check report is missing.", remedy: "Run /book-genesis cover-check before KDP submission." } satisfies HealthCheckResult] };
  const launch = launchKitReady(run);
  const launchKit: { ok: boolean; results: HealthCheckResult[] } = launch
    ? { ok: true, results: [{ ok: true, severity: launch.warnings?.length ? "warning" : "info", code: "launch_kit_present", message: launch.warnings?.length ? `Launch kit has ${launch.warnings.length} warning(s).` : "Launch kit is present." }] }
    : { ok: false, results: [{ ok: false, severity: "warning", code: "launch_kit_missing", message: "Launch kit is missing.", remedy: "Run /book-genesis launch-kit." }] };
  const archivePath = path.join(run.rootDir, "delivery", "archive", "archive-manifest.json");
  const archive = existsSync(archivePath)
    ? { ok: true, results: [{ ok: true, severity: "info", code: "archive_present", message: "Archive manifest is present." } satisfies HealthCheckResult] }
    : { ok: false, results: [{ ok: false, severity: "warning", code: "archive_missing", message: "Archive manifest is missing.", remedy: "Run /book-genesis archive." } satisfies HealthCheckResult] };
  const nextActions = [
    ...artifacts.flatMap((entry) => entry.validation.issues.slice(0, 3).map((issue) => `Fix ${issue.target}: ${issue.message}`)),
    ...manuscript.findings.slice(0, 3).map((finding) => `${finding.target}: ${finding.suggestedAction}`),
    ...style.findings.filter((item) => item.severity !== "info").slice(0, 3).map((finding) => `${finding.target}: ${finding.suggestedAction}`),
    ...pacing.findings.filter((item) => item.severity !== "info").slice(0, 3).map((finding) => `${finding.target}: ${finding.suggestedAction}`),
    ...sourceAudit.findings.filter((item) => item.severity !== "info").map((item) => item.remedy ?? item.message),
    ...metadataLab.results.filter((item) => item.severity !== "info").map((item) => item.remedy ?? item.message),
    ...revisionBoard.results.filter((item) => item.severity !== "info").map((item) => item.remedy ?? item.message),
    ...sourceVault.results.filter((item) => item.severity !== "info").map((item) => item.remedy ?? item.message),
    ...layoutProfile.results.filter((item) => item.severity !== "info").map((item) => item.remedy ?? item.message),
    ...publishing.results.filter((item) => item.severity !== "info").slice(0, 3).map((item) => item.remedy ?? item.message),
    ...promotion.results.filter((item) => item.severity !== "info").map((item) => item.remedy ?? item.message),
    ...coverCheck.results.filter((item) => item.severity !== "info").map((item) => item.remedy ?? item.message),
    ...launchKit.results.filter((item) => item.severity !== "info").map((item) => item.remedy ?? item.message),
    ...archive.results.filter((item) => item.severity !== "info").map((item) => item.remedy ?? item.message),
  ];

  return {
    generatedAt: new Date().toISOString(),
    runId: run.id,
    status: run.status,
    currentPhase: run.currentPhase,
    artifacts,
    manuscript,
    style,
    pacing,
    critique,
    sourceAudit,
    metadataLab,
    revisionBoard,
    sourceVault,
    layoutProfile,
    publishing,
    promotion,
    coverCheck,
    launchKit,
    archive,
    nextActions: Array.from(new Set(nextActions)),
  };
}

export function formatAuditReport(report: ReturnType<typeof buildAuditReport>) {
  const artifactLines = report.artifacts.length > 0
    ? report.artifacts.map((entry) => `- ${entry.phase}: ${entry.validation.ok ? "OK" : `FAIL (${entry.validation.issues.length})`}`).join("\n")
    : "- none";
  const promotionLines = report.promotion.results.map((item) => `- [${item.severity.toUpperCase()}] ${item.code}: ${item.message}`).join("\n");
  const styleLines = report.style.findings.length ? report.style.findings.slice(0, 8).map((item) => `- [${item.severity.toUpperCase()}] ${item.code}: ${item.evidence}`).join("\n") : "- none";
  const pacingLines = report.pacing.findings.length ? report.pacing.findings.map((item) => `- [${item.severity.toUpperCase()}] ${item.code}: ${item.evidence}`).join("\n") : "- none";
  const sourceLines = report.sourceAudit.findings.map((item) => `- [${item.severity.toUpperCase()}] ${item.code}: ${item.message}`).join("\n");
  const metadataLabLines = report.metadataLab.results.map((item) => `- [${item.severity.toUpperCase()}] ${item.code}: ${item.message}`).join("\n");
  const revisionBoardLines = report.revisionBoard.results.map((item) => `- [${item.severity.toUpperCase()}] ${item.code}: ${item.message}`).join("\n");
  const sourceVaultLines = report.sourceVault.results.map((item) => `- [${item.severity.toUpperCase()}] ${item.code}: ${item.message}`).join("\n");
  const layoutProfileLines = report.layoutProfile.results.map((item) => `- [${item.severity.toUpperCase()}] ${item.code}: ${item.message}`).join("\n");
  const critiqueLines = [
    `- Reviewers: ${report.critique.reviewers.length}`,
    `- Mean disagreement: ${report.critique.disagreement.meanAbsDelta ?? "n/a"}`,
  ].join("\n");
  const coverLines = report.coverCheck.results.map((item) => `- [${item.severity.toUpperCase()}] ${item.code}: ${item.message}`).join("\n");
  const launchLines = report.launchKit.results.map((item) => `- [${item.severity.toUpperCase()}] ${item.code}: ${item.message}`).join("\n");
  const archiveLines = report.archive.results.map((item) => `- [${item.severity.toUpperCase()}] ${item.code}: ${item.message}`).join("\n");
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
    "## Style lint",
    styleLines,
    "",
    "## Scene map and pacing",
    pacingLines,
    "",
    "## Critique panel",
    critiqueLines,
    "",
    "## Source audit",
    sourceLines,
    "",
    "## Metadata lab",
    metadataLabLines,
    "",
    "## Revision board",
    revisionBoardLines,
    "",
    "## Source vault",
    sourceVaultLines,
    "",
    "## Layout profile",
    layoutProfileLines,
    "",
    "## Publishing readiness",
    formatPublishingReadiness(report.publishing).replace(/^# Publishing Readiness\n\n/, ""),
    "",
    "## Promotion readiness",
    promotionLines,
    "",
    "## Cover-check readiness",
    coverLines,
    "",
    "## Launch-kit readiness",
    launchLines,
    "",
    "## Archive readiness",
    archiveLines,
    "",
    "## Next actions",
    nextActions,
    "",
  ].join("\n");
}
