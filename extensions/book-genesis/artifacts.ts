import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import type { ArtifactValidationIssue, ArtifactValidationResult, PhaseName, RunState } from "./types.js";

export const ARTIFACT_TARGETS: Record<PhaseName, string[]> = {
  kickoff: ["foundation/project-brief.md"],
  research: ["research/market-research.md", "research/bestseller-dna.md"],
  foundation: [
    "foundation/foundation.md",
    "foundation/outline.md",
    "foundation/reader-personas.md",
    "foundation/voice-dna.md",
  ],
  write: ["manuscript/chapters/", "manuscript/full-manuscript.md", "manuscript/write-report.md"],
  evaluate: [
    "evaluations/genesis-score.md",
    "evaluations/beta-readers.md",
    "evaluations/revision-brief.md",
  ],
  revise: ["manuscript/full-manuscript.md", "manuscript/chapters/", "evaluations/revision-log.md"],
  deliver: [
    "delivery/logline.md",
    "delivery/synopsis.md",
    "delivery/query-letter.md",
    "delivery/cover-brief.md",
    "delivery/package-summary.md",
  ],
};

const PLACEHOLDER_PATTERNS = [/\bTODO\b/i, /\bTBD\b/i, /\bplaceholder\b/i, /\blorem ipsum\b/i];

function normalizeRelativePath(run: RunState, value: string) {
  const trimmed = value.trim();
  const absolute = path.isAbsolute(trimmed) ? trimmed : path.join(run.rootDir, trimmed);
  const relative = path.relative(run.rootDir, absolute);
  return { absolute, relative };
}

function isInsideRun(relative: string) {
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function hasVisibleDirectoryContent(absolute: string) {
  return readdirSync(absolute).some((entry) => !entry.startsWith("."));
}

function validateTarget(
  run: RunState,
  target: string,
  code: ArtifactValidationIssue["code"],
): ArtifactValidationIssue[] {
  const { absolute, relative } = normalizeRelativePath(run, target);
  const issues: ArtifactValidationIssue[] = [];

  if (!isInsideRun(relative)) {
    issues.push({
      code: "path_outside_run",
      target,
      message: "Artifact path must stay inside the run directory.",
    });
    return issues;
  }

  if (!existsSync(absolute)) {
    issues.push({
      code,
      target,
      message:
        code === "missing_required_target"
          ? "Required artifact target is missing."
          : "Reported artifact is missing.",
    });
    return issues;
  }

  const stat = statSync(absolute);
  if (stat.isDirectory()) {
    if (!hasVisibleDirectoryContent(absolute)) {
      issues.push({
        code: "empty_directory",
        target,
        message: "Artifact directory has no visible files.",
      });
    }
    return issues;
  }

  if (stat.size === 0) {
    issues.push({
      code: "empty_file",
      target,
      message: "Artifact file is empty.",
    });
    return issues;
  }

  const text = readFileSync(absolute, "utf8");
  if (!text.trim()) {
    issues.push({
      code: "empty_file",
      target,
      message: "Artifact file contains only whitespace.",
    });
  }

  if (PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text))) {
    issues.push({
      code: "placeholder_text",
      target,
      message: "Artifact contains placeholder text.",
    });
  }

  return issues;
}

export function validatePhaseArtifacts(
  run: RunState,
  phase: PhaseName,
  reportedArtifacts: string[],
): ArtifactValidationResult {
  const requiredTargets = ARTIFACT_TARGETS[phase] ?? [];
  const issues: ArtifactValidationIssue[] = [];

  for (const target of requiredTargets) {
    issues.push(...validateTarget(run, target, "missing_required_target"));
  }

  for (const artifact of reportedArtifacts) {
    issues.push(...validateTarget(run, artifact, "missing_reported_artifact"));
  }

  return { ok: issues.length === 0, issues };
}

export function formatArtifactValidationReport(result: ArtifactValidationResult) {
  if (result.ok) {
    return "Artifact validation passed.";
  }

  return [
    "Artifact validation failed:",
    ...result.issues.map((issue) => `- ${issue.target}: ${issue.message} [${issue.code}]`),
  ].join("\n");
}

