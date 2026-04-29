import path from "node:path";

import type { CritiquePanelReport, CritiqueReviewerResult, QualityScores, RunState } from "./types.js";
import { readManuscript, writeJson, writeMarkdown } from "./run-files.js";

const SCORE_KEYS = ["marketFit", "structure", "prose", "consistency", "deliveryReadiness"] as const;

function median(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
}

export function aggregateConsensusScores(reviewers: CritiqueReviewerResult[]): QualityScores {
  const scores: Record<string, number> = {};
  for (const key of SCORE_KEYS) {
    scores[key] = Math.round(median(reviewers.map((reviewer) => reviewer.scores[key]).filter(Number.isFinite)));
  }
  return scores as QualityScores;
}

export function calculateDisagreement(reviewers: CritiqueReviewerResult[], threshold: number) {
  const highDisagreementDimensions: string[] = [];
  const deltas: number[] = [];
  for (const key of SCORE_KEYS) {
    const values = reviewers.map((reviewer) => reviewer.scores[key]).filter(Number.isFinite);
    if (values.length < 2) continue;
    const delta = Math.max(...values) - Math.min(...values);
    deltas.push(delta);
    if (delta > threshold) highDisagreementDimensions.push(key);
  }
  return {
    comparedDimensions: deltas.length,
    meanAbsDelta: deltas.length ? Number((deltas.reduce((sum, value) => sum + value, 0) / deltas.length).toFixed(2)) : null,
    highDisagreementDimensions,
  };
}

function reviewerScores(reviewer: string, manuscriptWords: number): QualityScores {
  const base = manuscriptWords > 0 ? 78 : 40;
  const bias = reviewer.includes("line") ? 3 : reviewer.includes("market") ? -2 : reviewer.includes("continuity") ? -4 : 0;
  return {
    marketFit: Math.max(1, Math.min(100, base + (reviewer.includes("market") ? 5 : bias))),
    structure: Math.max(1, Math.min(100, base + (reviewer.includes("developmental") ? 4 : bias))),
    prose: Math.max(1, Math.min(100, base + (reviewer.includes("line") ? 5 : bias))),
    consistency: Math.max(1, Math.min(100, base + (reviewer.includes("continuity") ? 5 : bias))),
    deliveryReadiness: Math.max(1, Math.min(100, base - 3 + bias)),
  };
}

export function buildCritiquePanel(run: RunState): CritiquePanelReport {
  const manuscript = readManuscript(run);
  const manuscriptWords = manuscript.trim().split(/\s+/).filter(Boolean).length;
  const reviewers = run.config.critiquePanel.reviewers.map((reviewer): CritiqueReviewerResult => ({
    reviewer,
    scores: reviewerScores(reviewer, manuscriptWords),
    topStrengths: manuscriptWords > 0 ? ["Manuscript draft exists for review."] : ["Configuration is ready for future review."],
    topConcerns: manuscriptWords > 0 ? ["Confirm reader promise, pacing, and continuity in a human editorial pass."] : ["No manuscript prose is available yet."],
    requiredFixes: manuscriptWords > 0 ? [] : ["Draft manuscript chapters before final critique."],
    optionalFixes: ["Use reviewer-specific notes to prioritize the next revision plan."],
  }));
  const consensusScores = aggregateConsensusScores(reviewers);
  const disagreement = calculateDisagreement(reviewers, run.config.critiquePanel.maxMeanDisagreement);
  return {
    generatedAt: new Date().toISOString(),
    runId: run.id,
    reviewers,
    consensusScores,
    disagreement,
    revisionPriorities: reviewers.flatMap((reviewer) => reviewer.requiredFixes).slice(0, 8),
  };
}

export function writeCritiquePanel(run: RunState) {
  const report = buildCritiquePanel(run);
  const jsonPath = writeJson(path.join(run.rootDir, "evaluations", "critique-panel.json"), report);
  const mdPath = writeMarkdown(path.join(run.rootDir, "evaluations", "critique-panel.md"), [
    `# Critique Panel for ${run.id}`,
    "",
    "## Consensus Scores",
    ...Object.entries(report.consensusScores).map(([key, value]) => `- ${key}: ${value}`),
    "",
    "## Reviewers",
    ...report.reviewers.map((reviewer) => `- ${reviewer.reviewer}: ${reviewer.topConcerns.join(" ")}`),
  ].join("\n"));
  const disagreementPath = writeMarkdown(path.join(run.rootDir, "evaluations", "critique-disagreement.md"), [
    "# Critique Disagreement",
    "",
    `- Compared dimensions: ${report.disagreement.comparedDimensions}`,
    `- Mean absolute delta: ${report.disagreement.meanAbsDelta ?? "n/a"}`,
    `- High disagreement: ${report.disagreement.highDisagreementDimensions.join(", ") || "none"}`,
  ].join("\n"));
  return { report, jsonPath, mdPath, disagreementPath };
}
