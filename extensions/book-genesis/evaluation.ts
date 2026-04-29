import { readFileSync } from "node:fs";
import path from "node:path";

import type { QualityScores, RunState } from "./types.js";

export interface IndependentEvaluationScores {
  scores: Partial<QualityScores>;
  matchedKeys: string[];
}

const SCORE_LINE = /^\s*(?:[-*]\s*)?([a-z][a-z0-9_]*)\s*:\s*(\d{1,3})\s*$/i;

export function parseIndependentEvaluationScores(markdown: string): IndependentEvaluationScores {
  const scores: Partial<QualityScores> = {};
  const matchedKeys: string[] = [];

  for (const line of markdown.split(/\r?\n/)) {
    const match = line.match(SCORE_LINE);
    if (!match) {
      continue;
    }

    const key = match[1];
    const raw = Number(match[2]);
    if (!Number.isFinite(raw) || raw < 1 || raw > 100) {
      continue;
    }

    // Preserve the exact key shape we found; QualityScores allows extra keys.
    scores[key] = Math.round(raw);
    matchedKeys.push(key);
  }

  return { scores, matchedKeys };
}

export function readIndependentEvaluationScores(run: RunState) {
  const filePath = path.join(run.rootDir, "evaluations", "independent-evaluation.md");
  const markdown = readFileSync(filePath, "utf8");
  return parseIndependentEvaluationScores(markdown);
}

export function scoreDisagreement(primary: QualityScores, independent: Partial<QualityScores>) {
  const keys = Object.keys(primary);
  let compared = 0;
  let totalAbsDelta = 0;

  for (const key of keys) {
    const independentValue = independent[key];
    if (typeof independentValue !== "number") {
      continue;
    }
    compared += 1;
    totalAbsDelta += Math.abs(primary[key] - independentValue);
  }

  return {
    compared,
    meanAbsDelta: compared > 0 ? totalAbsDelta / compared : null,
  };
}

