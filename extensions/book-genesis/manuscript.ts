import { readdirSync } from "node:fs";
import path from "node:path";

import type { ArtifactValidationIssue, ArtifactValidationResult, RunState } from "./types.js";
import { validatePhaseArtifacts } from "./artifacts.js";

function listMarkdownFiles(dir: string) {
  return readdirSync(dir).filter((entry) => entry.endsWith(".md")).sort();
}

function addIssue(issues: ArtifactValidationIssue[], target: string, message: string) {
  issues.push({
    code: "missing_required_target",
    target,
    message,
  });
}

export function validateWriteArtifacts(run: RunState): ArtifactValidationResult {
  const result = validatePhaseArtifacts(run, "write", []);
  if (!result.ok) {
    return result;
  }

  const briefDir = path.join(run.rootDir, "manuscript", "chapter-briefs");
  const chapterDir = path.join(run.rootDir, "manuscript", "chapters");

  const briefs = listMarkdownFiles(briefDir);
  const chapters = listMarkdownFiles(chapterDir);

  if (briefs.length < chapters.length) {
    addIssue(result.issues, "manuscript/chapter-briefs/", "Each drafted chapter must have a corresponding chapter brief.");
  }

  if (chapters.length === 0) {
    addIssue(result.issues, "manuscript/chapters/", "Write phase requires at least one drafted chapter.");
  }

  return { ok: result.issues.length === 0, issues: result.issues };
}
