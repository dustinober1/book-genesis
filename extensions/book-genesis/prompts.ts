import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { PHASE_ROLE_MAP, type PhaseName, type RunState } from "./types.js";
import { ARTIFACT_TARGETS } from "./artifacts.js";

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROMPTS_DIR = path.resolve(MODULE_DIR, "../../prompts/book-genesis");
const cache = new Map<string, string>();

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
    `ledger_path: ${run.ledgerPath}`,
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
    `Ledger file: ${run.ledgerPath}`,
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
  const artifactTargets = (ARTIFACT_TARGETS[run.currentPhase] ?? []).map((item) => `- ${item}`).join("\n");
  const completionProtocol = run.currentPhase === "kickoff"
    ? [
        "- Call `book_genesis_complete_kickoff` exactly once when kickoff intake is complete.",
        "- Provide the final, complete answers (not partial drafts).",
      ].join("\n")
    : [
        "- Call `book_genesis_complete_phase` exactly once when this phase is done.",
        "- Pass the real artifact paths you created or updated.",
        "- Include unresolved issues only if they truly remain.",
        "- If completion is blocked, call `book_genesis_report_failure`.",
      ].join("\n");

  return [
    buildRunMarker(run),
    "",
    "Operate this Book Genesis run autonomously.",
    "",
    `Run root: ${run.rootDir}`,
    `State file: ${run.statePath}`,
    `Ledger file: ${run.ledgerPath}`,
    `Current phase: ${run.currentPhase}`,
    `Language: ${run.language}`,
    `Idea: ${run.idea}`,
    `Config: ${JSON.stringify(run.config)}`,
    "",
    "Required artifact targets:",
    artifactTargets,
    "",
    "Previous handoff:",
    readLastHandoff(run),
    "",
    "Project brief:",
    run.kickoff ? JSON.stringify(run.kickoff, null, 2) : "No kickoff brief has been recorded yet.",
    "",
    "Completion protocol:",
    completionProtocol,
    "",
    phasePrompt,
  ].join("\n");
}

export function buildCompactionSummary(run: RunState) {
  const artifacts = run.artifacts[run.currentPhase];
  const latestGate = run.qualityGates.length > 0 ? run.qualityGates[run.qualityGates.length - 1] : null;
  return [
    `Book Genesis run ${run.id}`,
    `Current phase: ${run.currentPhase}`,
    `Completed phases: ${run.completedPhases.join(", ") || "none"}`,
    `Current phase artifacts: ${artifacts.length > 0 ? artifacts.join(", ") : "none"}`,
    `Unresolved issues: ${run.unresolvedIssues.length > 0 ? run.unresolvedIssues.join("; ") : "none"}`,
    `Ledger: ${run.ledgerPath}`,
    `Revision cycle: ${run.revisionCycle}/${run.config.maxRevisionCycles}`,
    latestGate
      ? `Latest quality gate: ${latestGate.passed ? "passed" : "failed"} at threshold ${latestGate.threshold}`
      : "Latest quality gate: none",
    `Next action: ${run.nextAction}`,
  ].join("\n");
}
