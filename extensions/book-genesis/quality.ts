import type { QualityGateInput, QualityGateRecord, QualityScores } from "./types.js";

function nowIso() {
  return new Date().toISOString();
}

function normalizeScore(name: keyof QualityScores, value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error(`${name} score must be an integer between 1 and 100.`);
  }

  return value;
}

export function createQualityGate(input: QualityGateInput): QualityGateRecord {
  const scores: QualityScores = {
    marketFit: normalizeScore("marketFit", input.scores.marketFit),
    structure: normalizeScore("structure", input.scores.structure),
    prose: normalizeScore("prose", input.scores.prose),
    consistency: normalizeScore("consistency", input.scores.consistency),
    deliveryReadiness: normalizeScore("deliveryReadiness", input.scores.deliveryReadiness),
  };

  const passed = Object.values(scores).every((score) => score >= input.threshold);

  return {
    phase: "evaluate",
    threshold: input.threshold,
    scores,
    repairBrief: input.repairBrief.trim(),
    passed,
    recordedAt: nowIso(),
  };
}

