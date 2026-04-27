import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import type { ArtifactValidationIssue, ArtifactValidationResult, PhaseName, RunState } from "./types.js";
import { getArtifactsForPhase } from "./presets.js";

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

function validateSequentialChapterNames(run: RunState, issues: ArtifactValidationIssue[]) {
  const chapterDir = path.join(run.rootDir, "manuscript", "chapters");
  const chapterNames = readdirSync(chapterDir).filter((entry) => entry.endsWith(".md")).sort();

  for (let index = 0; index < chapterNames.length; index += 1) {
    const expectedPrefix = String(index + 1).padStart(2, "0");
    if (!chapterNames[index].startsWith(expectedPrefix)) {
      issues.push({
        code: "missing_required_target",
        target: "manuscript/chapters/",
        message: "Write artifacts must use sequential chapter numbering with no gaps.",
      });
      break;
    }
  }
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
  const requiredTargets = getArtifactsForPhase(run.config.bookMode, phase, {
    storyBibleEnabled: run.config.storyBibleEnabled,
  }) ?? [];
  const issues: ArtifactValidationIssue[] = [];

  for (const target of requiredTargets) {
    issues.push(...validateTarget(run, target, "missing_required_target"));
  }

  for (const artifact of reportedArtifacts) {
    issues.push(...validateTarget(run, artifact, "missing_reported_artifact"));
  }

  if (phase === "write" && issues.length === 0) {
    const briefDir = path.join(run.rootDir, "manuscript", "chapter-briefs");
    const chapterDir = path.join(run.rootDir, "manuscript", "chapters");
    const briefs = readdirSync(briefDir).filter((entry) => entry.endsWith(".md")).sort();
    const chapters = readdirSync(chapterDir).filter((entry) => entry.endsWith(".md")).sort();

    if (briefs.length < chapters.length) {
      issues.push({
        code: "missing_required_target",
        target: "manuscript/chapter-briefs/",
        message: "Each drafted chapter must have a corresponding chapter brief.",
      });
    }

    validateSequentialChapterNames(run, issues);
  }

  return { ok: issues.length === 0, issues };
}

export function listArtifactTargets(run: RunState, phase: PhaseName) {
  return getArtifactsForPhase(run.config.bookMode, phase, {
    storyBibleEnabled: run.config.storyBibleEnabled,
  }) ?? [];
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
