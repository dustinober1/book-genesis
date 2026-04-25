import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PHASE_ROLE_MAP, type PhaseName, type RunState } from "./types.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.resolve(MODULE_DIR, "../../prompts/book-genesis");
const cache = new Map<string, string>();

const ARTIFACT_TARGETS: Record<PhaseName, string[]> = {
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
  revise: [
    "manuscript/full-manuscript.md",
    "manuscript/chapters/",
    "evaluations/revision-log.md",
  ],
  deliver: [
    "delivery/logline.md",
    "delivery/synopsis.md",
    "delivery/query-letter.md",
    "delivery/cover-brief.md",
    "delivery/package-summary.md",
  ],
};

function readPrompt(name: string) {
  if (!cache.has(name)) {
    const filePath = path.join(PROMPTS_DIR, `${name}.md`);
    const value = existsSync(filePath) ? readFileSync(filePath, "utf8").trim() : "";
    cache.set(name, value);
  }

  return cache.get(name) ?? "";
}

export function buildRunMarker(run: RunState) {
  return [
    "<book_genesis_run>",
    `id: ${run.id}`,
    `run_dir: ${run.rootDir}`,
    `state_path: ${run.statePath}`,
    `phase: ${run.currentPhase}`,
    `role: ${PHASE_ROLE_MAP[run.currentPhase]}`,
    `language: ${run.language}`,
    `idea: ${run.idea}`,
    "</book_genesis_run>",
  ].join("\n");
}

export function parseRunMarker(text: string) {
  const match = text.match(/<book_genesis_run>([\s\S]*?)<\/book_genesis_run>/);
  if (!match) {
    return null;
  }

  const data: Record<string, string> = {};
  for (const rawLine of match[1].split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      continue;
    }

    const separator = line.indexOf(":");
    if (separator === -1) {
      continue;
    }

    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    data[key] = value;
  }

  return data;
}

export function buildSystemPrompt(run: RunState) {
  const systemPrompt = readPrompt("system");
  return [
    systemPrompt,
    "",
    `Active phase: ${run.currentPhase}`,
    `Active specialist role: ${PHASE_ROLE_MAP[run.currentPhase]}`,
    `Run directory: ${run.rootDir}`,
    `State file: ${run.statePath}`,
    `Isolation rule: only use files and instructions relevant to the ${run.currentPhase} phase.`,
  ].join("\n");
}

function readLastHandoff(run: RunState) {
  if (!run.lastHandoffPath || !existsSync(run.lastHandoffPath)) {
    return "No prior handoff.";
  }

  return readFileSync(run.lastHandoffPath, "utf8").trim();
}

export function buildPhasePrompt(run: RunState) {
  const phasePrompt = readPrompt(run.currentPhase);
  const artifactTargets = ARTIFACT_TARGETS[run.currentPhase].map((item) => `- ${item}`).join("\n");

  return [
    buildRunMarker(run),
    "",
    "Operate this Book Genesis run autonomously.",
    "",
    `Run root: ${run.rootDir}`,
    `State file: ${run.statePath}`,
    `Current phase: ${run.currentPhase}`,
    `Language: ${run.language}`,
    `Idea: ${run.idea}`,
    "",
    "Required artifact targets:",
    artifactTargets,
    "",
    "Previous handoff:",
    readLastHandoff(run),
    "",
    "Completion protocol:",
    "- Call `book_genesis_complete_phase` exactly once when this phase is done.",
    "- Pass the real artifact paths you created or updated.",
    "- Include unresolved issues only if they truly remain.",
    "- If completion is blocked, call `book_genesis_report_failure`.",
    "",
    phasePrompt,
  ].join("\n");
}

export function buildCompactionSummary(run: RunState) {
  const artifacts = run.artifacts[run.currentPhase];
  return [
    `Book Genesis run ${run.id}`,
    `Current phase: ${run.currentPhase}`,
    `Completed phases: ${run.completedPhases.join(", ") || "none"}`,
    `Current phase artifacts: ${artifacts.length > 0 ? artifacts.join(", ") : "none"}`,
    `Unresolved issues: ${run.unresolvedIssues.length > 0 ? run.unresolvedIssues.join("; ") : "none"}`,
    `Next action: ${run.nextAction}`,
  ].join("\n");
}
