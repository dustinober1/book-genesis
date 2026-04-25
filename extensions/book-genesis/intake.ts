import { writeFileSync } from "node:fs";
import path from "node:path";

import type { KickoffIntake, KickoffValidationResult, RunState } from "./types.js";
import { ensureRunDirectories } from "./state.js";

const REQUIRED_FIELDS: Array<keyof Pick<
  KickoffIntake,
  "workingTitle" | "genre" | "targetReader" | "promise" | "targetLength" | "tone"
>> = ["workingTitle", "genre", "targetReader", "promise", "targetLength", "tone"];

function cleanList(values: string[]) {
  return values.map((value) => value.trim()).filter(Boolean);
}

export function normalizeKickoffIntake(input: KickoffIntake): KickoffIntake {
  return {
    workingTitle: input.workingTitle.trim(),
    genre: input.genre.trim(),
    targetReader: input.targetReader.trim(),
    promise: input.promise.trim(),
    targetLength: input.targetLength.trim(),
    tone: input.tone.trim(),
    constraints: cleanList(input.constraints),
    successCriteria: cleanList(input.successCriteria),
  };
}

export function validateKickoffIntake(input: KickoffIntake): KickoffValidationResult {
  const normalized = normalizeKickoffIntake(input);
  const issues = REQUIRED_FIELDS
    .filter((field) => !normalized[field])
    .map((field) => `${field} is required.`);

  if (normalized.successCriteria.length === 0) {
    issues.push("successCriteria must include at least one item.");
  }

  return { ok: issues.length === 0, issues };
}

export function writeKickoffBrief(run: RunState, input: KickoffIntake) {
  const normalized = normalizeKickoffIntake(input);
  ensureRunDirectories(run.rootDir);

  const briefPath = path.join(run.rootDir, "foundation", "project-brief.md");
  const constraints = normalized.constraints.length > 0
    ? normalized.constraints.map((item) => `- ${item}`).join("\n")
    : "- none";
  const successCriteria = normalized.successCriteria.map((item) => `- ${item}`).join("\n");

  const content = [
    "# Project Brief",
    "",
    `- Working title: ${normalized.workingTitle}`,
    `- Genre: ${normalized.genre}`,
    `- Target reader: ${normalized.targetReader}`,
    `- Promise: ${normalized.promise}`,
    `- Target length: ${normalized.targetLength}`,
    `- Tone: ${normalized.tone}`,
    "",
    "## Constraints",
    constraints,
    "",
    "## Success Criteria",
    successCriteria,
    "",
  ].join("\n");

  writeFileSync(briefPath, content, "utf8");
  return briefPath;
}

