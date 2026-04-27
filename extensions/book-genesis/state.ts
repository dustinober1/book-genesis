import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  PHASE_ORDER,
  type ParsedIdeaInput,
  type PhaseCompletionPayload,
  type PhaseFailurePayload,
  type PhaseHistoryEntry,
  type PhaseName,
  type RunConfig,
  type RunState,
} from "./types.js";
import { DEFAULT_RUN_CONFIG } from "./config.js";
import { createQualityGate } from "./quality.js";

const RUNS_DIRNAME = "book-projects";
const STATE_DIRNAME = ".book-genesis";

function nowIso() {
  return new Date().toISOString();
}

function buildFeedbackFileName(timestamp: string) {
  return `${timestamp.replace(/[:.]/g, "-")}-reviewer-feedback.md`;
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[-\s]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "book-genesis-run";
}

export function stripQuotes(value: string) {
  return value.trim().replace(/^['"]|['"]$/g, "");
}

export function parseIdeaInput(raw: string): ParsedIdeaInput {
  const trimmed = raw.trim();
  const [firstToken, ...rest] = trimmed.split(/\s+/);
  if (/^[a-z]{2}(?:-[a-z]{2})?$/i.test(firstToken) && rest.length > 0) {
    return {
      language: firstToken.toLowerCase(),
      idea: rest.join(" ").trim(),
    };
  }

  return {
    language: "auto",
    idea: trimmed,
  };
}

function createPhaseMap<T>(factory: () => T): Record<PhaseName, T> {
  return {
    kickoff: factory(),
    research: factory(),
    foundation: factory(),
    write: factory(),
    evaluate: factory(),
    revise: factory(),
    deliver: factory(),
  };
}

export function ensureRunDirectories(rootDir: string) {
  const dirs = [
    rootDir,
    path.join(rootDir, STATE_DIRNAME),
    path.join(rootDir, STATE_DIRNAME, "handoffs"),
    path.join(rootDir, "research"),
    path.join(rootDir, "foundation"),
    path.join(rootDir, "manuscript"),
    path.join(rootDir, "manuscript", "chapter-briefs"),
    path.join(rootDir, "manuscript", "chapters"),
    path.join(rootDir, "evaluations"),
    path.join(rootDir, "evaluations", "reviewer-feedback"),
    path.join(rootDir, "delivery"),
  ];

  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }
}

export function createRunState(workspaceRoot: string, rawIdea: string, config: RunConfig = DEFAULT_RUN_CONFIG): RunState {
  const parsed = parseIdeaInput(rawIdea);
  if (!parsed.idea) {
    throw new Error("A book idea is required.");
  }

  const slugBase = slugify(parsed.idea.split(/\s+/).slice(0, 10).join(" "));
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${slugBase}`;
  const rootDir = path.join(workspaceRoot, RUNS_DIRNAME, runId);
  const statePath = path.join(rootDir, STATE_DIRNAME, "run.json");
  const ledgerPath = path.join(rootDir, STATE_DIRNAME, "ledger.json");
  ensureRunDirectories(rootDir);

  const run: RunState = {
    version: 1,
    id: runId,
    slug: runId,
    title: slugBase.replace(/-/g, " "),
    idea: parsed.idea,
    language: parsed.language,
    workspaceRoot,
    rootDir,
    statePath,
    ledgerPath,
    status: "running",
    currentPhase: PHASE_ORDER[0],
    completedPhases: [],
    attempts: createPhaseMap(() => 0),
    artifacts: createPhaseMap(() => []),
    unresolvedIssues: [],
    nextAction: "Complete kickoff intake phase.",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    stopRequested: false,
    reviewerFeedback: [],
    history: [],
    config,
    qualityGates: [],
    revisionCycle: 0,
  };

  return run;
}

export function readRunState(runDir: string) {
  const statePath = path.join(runDir, STATE_DIRNAME, "run.json");
  if (!existsSync(statePath)) {
    throw new Error(`Run state not found at ${statePath}`);
  }

  const run = JSON.parse(readFileSync(statePath, "utf8")) as RunState;
  run.reviewerFeedback ??= [];
  return run;
}

export function writeRunState(run: RunState) {
  ensureRunDirectories(run.rootDir);
  run.updatedAt = nowIso();
  writeFileSync(run.statePath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
}

export function findLatestRunDir(workspaceRoot: string) {
  const runs = listRunDirs(workspaceRoot);
  return runs[0] ?? null;
}

export function listRunDirs(workspaceRoot: string) {
  const runsDir = path.join(workspaceRoot, RUNS_DIRNAME);
  if (!existsSync(runsDir)) {
    return [];
  }

  return readdirSync(runsDir)
    .map((entry) => path.join(runsDir, entry))
    .filter((entryPath) => {
      try {
        return statSync(entryPath).isDirectory() && existsSync(path.join(entryPath, STATE_DIRNAME, "run.json"));
      } catch {
        return false;
      }
    })
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs);
}

function getPhaseIndex(phase: PhaseName) {
  return PHASE_ORDER.indexOf(phase);
}

export function getNextPhase(phase: PhaseName) {
  const nextIndex = getPhaseIndex(phase) + 1;
  return PHASE_ORDER[nextIndex] ?? null;
}

function findLatestHistoryEntry(run: RunState, phase: PhaseName) {
  for (let index = run.history.length - 1; index >= 0; index -= 1) {
    const entry = run.history[index];
    if (entry.phase === phase) {
      return entry;
    }
  }

  return null;
}

export function markPhaseStarted(run: RunState, note: string) {
  const currentPhase = run.currentPhase;
  const nextAttempt = (run.attempts[currentPhase] ?? 0) + 1;
  run.attempts[currentPhase] = nextAttempt;
  run.status = "running";
  run.lastError = undefined;
  run.nextAction = `Complete ${currentPhase} phase.`;
  run.history.push({
    phase: currentPhase,
    attempt: nextAttempt,
    status: "running",
    startedAt: nowIso(),
    summary: note,
    artifacts: [],
    unresolvedIssues: [],
  });
}

function finalizeHistoryEntry(
  entry: PhaseHistoryEntry | null,
  status: PhaseHistoryEntry["status"],
  summary: string,
  artifacts: string[],
  unresolvedIssues: string[],
) {
  if (!entry) {
    return;
  }

  entry.status = status;
  entry.endedAt = nowIso();
  entry.summary = summary;
  entry.artifacts = artifacts;
  entry.unresolvedIssues = unresolvedIssues;
}

export function writeHandoff(
  run: RunState,
  phase: PhaseName,
  summary: string,
  artifacts: string[],
  unresolvedIssues: string[],
) {
  ensureRunDirectories(run.rootDir);
  const handoffPath = path.join(
    run.rootDir,
    STATE_DIRNAME,
    "handoffs",
    `${Date.now()}-${phase}.md`,
  );

  const artifactList = artifacts.length > 0 ? artifacts.map((item) => `- ${item}`).join("\n") : "- none";
  const issueList =
    unresolvedIssues.length > 0 ? unresolvedIssues.map((item) => `- ${item}`).join("\n") : "- none";

  const content = [
    `# ${phase} handoff`,
    "",
    `- Run: ${run.id}`,
    `- Phase: ${phase}`,
    `- Timestamp: ${nowIso()}`,
    "",
    "## Summary",
    summary.trim(),
    "",
    "## Artifacts",
    artifactList,
    "",
    "## Unresolved Issues",
    issueList,
    "",
  ].join("\n");

  writeFileSync(handoffPath, content, "utf8");
  run.lastHandoffPath = handoffPath;
  return handoffPath;
}

function shouldPauseForApproval(run: RunState, phase: PhaseName) {
  return run.config.approvalPhases.includes(phase);
}

function queueApproval(run: RunState, completedPhase: PhaseName, nextPhase: PhaseName | null, reason: string) {
  if (run.stopRequested || run.status !== "running" || !shouldPauseForApproval(run, completedPhase)) {
    return false;
  }

  run.status = "awaiting_approval";
  run.approval = {
    phase: completedPhase,
    requestedAt: nowIso(),
    reason,
    status: "pending",
    nextPhase,
    completionPending: nextPhase === null,
  };
  run.nextAction = `Review ${completedPhase} artifacts and run /book-genesis approve "${run.rootDir}".`;
  return true;
}

export function approveRun(run: RunState, note?: string) {
  if (run.status !== "awaiting_approval" || !run.approval) {
    throw new Error("Run is not awaiting approval.");
  }

  run.approval = {
    ...run.approval,
    status: "approved",
    note: note?.trim() || run.approval.note,
  };

  if (run.approval.completionPending) {
    run.status = "completed";
    run.nextAction = "Run complete.";
    return;
  }

  if (run.approval.nextPhase) {
    run.currentPhase = run.approval.nextPhase;
  }

  run.status = "running";
  run.nextAction = `Launch ${run.currentPhase} phase.`;
}

export function rejectRun(run: RunState, note?: string) {
  if (run.status !== "awaiting_approval" || !run.approval) {
    throw new Error("Run is not awaiting approval.");
  }

  run.status = "stopped";
  run.stopRequested = true;
  run.approval = {
    ...run.approval,
    status: "rejected",
    note: note?.trim() || run.approval.note,
  };
  run.nextAction = note?.trim() || `Approval rejected after ${run.approval.phase}. Manual review required.`;
}

export function requestReviewerRevision(run: RunState, note: string) {
  const trimmed = note.trim();
  if (!trimmed) {
    throw new Error("Reviewer feedback is required.");
  }

  if (run.status === "running") {
    throw new Error("Stop or pause the current run before requesting a reviewer-driven revision.");
  }

  ensureRunDirectories(run.rootDir);
  const recordedAt = nowIso();
  const feedbackPath = path.join(run.rootDir, "evaluations", "reviewer-feedback", buildFeedbackFileName(recordedAt));
  const requestedFrom = run.status === "completed" ? "completed" : run.currentPhase;
  const content = [
    "# Reviewer Feedback",
    "",
    `- Run: ${run.id}`,
    `- Recorded: ${recordedAt}`,
    `- Requested from: ${requestedFrom}`,
    "",
    "## Feedback",
    trimmed,
    "",
  ].join("\n");

  writeFileSync(feedbackPath, content, "utf8");

  run.reviewerFeedback.push({
    id: path.basename(feedbackPath, ".md"),
    phase: requestedFrom,
    note: trimmed,
    artifactPath: feedbackPath,
    recordedAt,
  });
  run.pendingReviewerRevision = {
    requestedAt: recordedAt,
    artifactPath: feedbackPath,
    note: trimmed,
    requestedFrom,
  };
  run.currentPhase = "revise";
  run.status = "running";
  run.stopRequested = false;
  run.lastError = undefined;
  run.approval = undefined;
  run.nextAction = "Revise manuscript using the latest reviewer feedback.";

  return feedbackPath;
}

export function completeCurrentPhase(run: RunState, payload: PhaseCompletionPayload) {
  const phase = run.currentPhase;
  const artifacts = payload.artifacts.map((item) => item.trim()).filter(Boolean);
  const unresolvedIssues = payload.unresolvedIssues.map((item) => item.trim()).filter(Boolean);

  finalizeHistoryEntry(
    findLatestHistoryEntry(run, phase),
    "completed",
    payload.summary,
    artifacts,
    unresolvedIssues,
  );

  run.artifacts[phase] = Array.from(new Set([...run.artifacts[phase], ...artifacts]));
  run.completedPhases = Array.from(new Set([...run.completedPhases, phase]));
  run.unresolvedIssues = unresolvedIssues;
  writeHandoff(run, phase, payload.summary, artifacts, unresolvedIssues);

  if (phase === "evaluate" && payload.qualityGate) {
    const gate = createQualityGate(run.config.bookMode, payload.qualityGate);
    run.qualityGates.push(gate);

    if (!gate.passed) {
      run.revisionCycle += 1;

      if (run.revisionCycle > run.config.maxRevisionCycles) {
        run.status = "failed";
        run.nextAction = `Manual review required after ${run.config.maxRevisionCycles} revision cycles.`;
        run.unresolvedIssues = [gate.repairBrief || "Quality gate failed after maximum revision cycles."];
        return;
      }

      run.currentPhase = "revise";
      run.status = run.stopRequested ? "stopped" : "running";
      run.nextAction = gate.repairBrief
        ? `Revise manuscript using repair brief: ${gate.repairBrief}`
        : "Revise manuscript using the latest evaluation findings.";
      queueApproval(run, phase, run.currentPhase, `Human checkpoint requested after ${phase}.`);
      return;
    }

    run.currentPhase = "deliver";
    run.status = run.stopRequested ? "stopped" : "running";
    run.nextAction = run.stopRequested ? "Run paused before deliver phase." : "Launch deliver phase.";
    queueApproval(run, phase, run.currentPhase, `Human checkpoint requested after ${phase}.`);
    return;
  }

  if (phase === "revise" && run.pendingReviewerRevision) {
    run.pendingReviewerRevision = undefined;
    run.currentPhase = "evaluate";
    run.status = run.stopRequested ? "stopped" : "running";
    run.nextAction = run.stopRequested
      ? "Run paused before evaluate phase."
      : "Re-evaluate the manuscript after reviewer-driven revisions.";
    queueApproval(run, phase, run.currentPhase, `Human checkpoint requested after ${phase}.`);
    return;
  }

  if (phase === "revise" && run.qualityGates.some((gate) => !gate.passed)) {
    run.currentPhase = "evaluate";
    run.status = run.stopRequested ? "stopped" : "running";
    run.nextAction = run.stopRequested ? "Run paused before evaluate phase." : "Re-evaluate revised manuscript.";
    queueApproval(run, phase, run.currentPhase, `Human checkpoint requested after ${phase}.`);
    return;
  }

  const nextPhase = getNextPhase(phase);
  if (nextPhase) {
    run.currentPhase = nextPhase;
    run.status = run.stopRequested ? "stopped" : "running";
    run.nextAction = run.stopRequested
      ? `Run paused before ${nextPhase} phase.`
      : `Launch ${nextPhase} phase.`;
    queueApproval(run, phase, nextPhase, `Human checkpoint requested after ${phase}.`);
    return;
  }

  run.status = "completed";
  run.nextAction = "Run complete.";
  queueApproval(run, phase, null, `Human checkpoint requested after ${phase}.`);
}

export function reportCurrentPhaseFailure(run: RunState, payload: PhaseFailurePayload) {
  const phase = run.currentPhase;
  const unresolvedIssues = payload.unresolvedIssues.map((item) => item.trim()).filter(Boolean);
  const attempt = run.attempts[phase] ?? 0;

  finalizeHistoryEntry(
    findLatestHistoryEntry(run, phase),
    "failed",
    payload.reason,
    run.artifacts[phase],
    unresolvedIssues,
  );

  run.unresolvedIssues = unresolvedIssues;
  run.lastError = payload.reason;

  if (payload.retryable && attempt <= run.config.maxRetriesPerPhase) {
    run.status = "running";
    run.nextAction = `Retry ${phase} phase after transient failure.`;
    return { shouldRetry: true };
  }

  run.status = "failed";
  run.nextAction = `Manual resume required for ${phase} phase.`;
  return { shouldRetry: false };
}

export function stopRun(run: RunState, reason?: string) {
  run.stopRequested = true;
  run.status = "stopped";
  run.nextAction = reason?.trim() || "Run stopped.";
  const latestEntry = findLatestHistoryEntry(run, run.currentPhase);
  if (latestEntry && latestEntry.status === "running") {
    latestEntry.status = "stopped";
    latestEntry.endedAt = nowIso();
  }
}

export function formatRunStatus(run: RunState) {
  const lines = [
    `Run: ${run.id}`,
    `Status: ${run.status}`,
    `Phase: ${run.currentPhase}`,
    `Language: ${run.language}`,
    `Idea: ${run.idea}`,
    `Root: ${run.rootDir}`,
    `Ledger: ${run.ledgerPath}`,
    `Completed: ${run.completedPhases.length > 0 ? run.completedPhases.join(", ") : "none"}`,
    `Next action: ${run.nextAction}`,
  ];

  if (run.lastError) {
    lines.push(`Last error: ${run.lastError}`);
  }

  if (run.lastHandoffPath) {
    lines.push(`Last handoff: ${run.lastHandoffPath}`);
  }

  if (run.approval) {
    lines.push(`Approval: ${run.approval.status} after ${run.approval.phase}`);
    if (run.approval.note) {
      lines.push(`Approval note: ${run.approval.note}`);
    }
  }

  if (run.reviewerFeedback.length > 0) {
    lines.push(`Reviewer feedback entries: ${run.reviewerFeedback.length}`);
    lines.push(`Latest reviewer feedback: ${run.reviewerFeedback[run.reviewerFeedback.length - 1].artifactPath}`);
  }

  lines.push(`Revision cycle: ${run.revisionCycle}/${run.config.maxRevisionCycles}`);
  const latestGate = run.qualityGates.length > 0 ? run.qualityGates[run.qualityGates.length - 1] : null;
  if (latestGate) {
    lines.push(`Latest quality gate: ${latestGate.passed ? "passed" : "failed"} at threshold ${latestGate.threshold}`);
  }

  if (run.git?.repoRoot) {
    lines.push(`Git repo: ${run.git.repoRoot}`);
  }
  if (run.git?.initializedByRuntime) {
    lines.push("Git init: initialized by runtime");
  }
  if (run.git?.lastSnapshotCommit) {
    lines.push(`Last snapshot commit: ${run.git.lastSnapshotCommit}`);
  }

  if (run.unresolvedIssues.length > 0) {
    lines.push("Unresolved:");
    lines.push(...run.unresolvedIssues.map((item) => `- ${item}`));
  }

  return lines.join("\n");
}
