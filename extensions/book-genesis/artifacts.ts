import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

import type { ArtifactValidationIssue, ArtifactValidationResult, PhaseName, RunState } from "./types.js";
import { getArtifactsForPhase } from "./presets.js";

const PLACEHOLDER_PATTERNS = [/\bTODO\b/i, /\bTBD\b/i, /\bplaceholder\b/i, /\blorem ipsum\b/i];
const WORD_COUNT_TOLERANCE = 0.4;

function markdownToPlainText(markdown: string) {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[*-]\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

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

function validateTargetWordCount(run: RunState, issues: ArtifactValidationIssue[]) {
  const target = run.config.targetWordCount;
  if (!target) {
    return;
  }

  const manuscriptPath = path.join(run.rootDir, "manuscript", "full-manuscript.md");
  if (!existsSync(manuscriptPath)) {
    return;
  }

  const plain = markdownToPlainText(readFileSync(manuscriptPath, "utf8"));
  const words = countWords(plain);
  if (!words) {
    return;
  }

  const min = Math.floor(target * (1 - WORD_COUNT_TOLERANCE));
  const max = Math.ceil(target * (1 + WORD_COUNT_TOLERANCE));

  if (words < min) {
    issues.push({
      code: "missing_required_target",
      target: "manuscript/full-manuscript.md",
      message: `Manuscript word count is ${words}, below the configured target band (${min}-${max} words).`,
    });
    return;
  }

  if (words > max) {
    issues.push({
      code: "missing_required_target",
      target: "manuscript/full-manuscript.md",
      message: `Manuscript word count is ${words}, above the configured target band (${min}-${max} words).`,
    });
  }
}

function validateDuplicateParagraphs(run: RunState, issues: ArtifactValidationIssue[]) {
  const manuscriptPath = path.join(run.rootDir, "manuscript", "full-manuscript.md");
  if (!existsSync(manuscriptPath)) {
    return;
  }

  const markdown = readFileSync(manuscriptPath, "utf8");
  const paragraphs = markdown
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
    .filter((chunk) => !chunk.startsWith("#"))
    .map((chunk) => chunk.replace(/\s+/g, " ").trim())
    .filter((chunk) => chunk.length >= 240);

  if (paragraphs.length < 3) {
    return;
  }

  const counts = new Map<string, number>();
  for (const paragraph of paragraphs) {
    counts.set(paragraph, (counts.get(paragraph) ?? 0) + 1);
  }

  const repeats = [...counts.entries()].filter(([, count]) => count >= 3);
  if (repeats.length === 0) {
    return;
  }

  const worst = repeats.sort((a, b) => b[1] - a[1])[0];
  issues.push({
    code: "placeholder_text",
    target: "manuscript/full-manuscript.md",
    message: `Manuscript appears to repeat at least one long paragraph ${worst[1]} times. Remove accidental duplication before completing the phase.`,
  });
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
    independentEvaluationPass: run.config.independentEvaluationPass,
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
    validateTargetWordCount(run, issues);
    validateDuplicateParagraphs(run, issues);
  }

  return { ok: issues.length === 0, issues };
}

export function listArtifactTargets(run: RunState, phase: PhaseName) {
  return getArtifactsForPhase(run.config.bookMode, phase, {
    storyBibleEnabled: run.config.storyBibleEnabled,
    independentEvaluationPass: run.config.independentEvaluationPass,
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
