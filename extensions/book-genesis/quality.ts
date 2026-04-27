import { getRubricForMode } from "./rubrics.js";
import type { BookMode, QualityGateInput, QualityGateRecord } from "./types.js";

function nowIso() {
  return new Date().toISOString();
}

function normalizeScore(name: string, value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error(`${name} score must be an integer between 1 and 100.`);
  }

  return value;
}

function normalizeThreshold(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error("threshold must be an integer between 1 and 100.");
  }

  return value;
}

export function createQualityGate(mode: BookMode, input: QualityGateInput): QualityGateRecord {
  const rubric = getRubricForMode(mode);
  const scores = { ...input.scores };
  const threshold = normalizeThreshold(input.threshold);

  for (const [name, value] of Object.entries(scores)) {
    scores[name] = normalizeScore(name, value);
  }

  const weightedScore = rubric.reduce((total, dimension) => {
    return total + (scores[dimension.key] ?? 0) * dimension.weight;
  }, 0);
  const failedDimensions = rubric
    .filter((dimension) => (scores[dimension.key] ?? 0) < dimension.threshold)
    .map((dimension) => dimension.key);

  return {
    phase: "evaluate",
    threshold,
    scores,
    repairBrief: input.repairBrief.trim(),
    passed: failedDimensions.length === 0 && weightedScore >= threshold,
    failedDimensions,
    recordedAt: nowIso(),
  };
}
