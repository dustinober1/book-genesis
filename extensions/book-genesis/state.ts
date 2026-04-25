import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  PHASE_ORDER,
  type ParsedIdeaInput,
  type PhaseCompletionPayload,
  type PhaseFailurePayload,
  type PhaseHistoryEntry,
  type PhaseName,
  type RunState,
} from "./types.js";

const RUNS_DIRNAME = "book-projects";
const STATE_DIRNAME = ".book-genesis";

function nowIso() {
  return new Date().toISOString();
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
    path.join(rootDir, "manuscript", "chapters"),
    path.join(rootDir, "evaluations"),
    path.join(rootDir, "delivery"),
  ];

  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }
}

export function createRunState(workspaceRoot: string, rawIdea: string): RunState {
  const parsed = parseIdeaInput(rawIdea);
  if (!parsed.idea) {
    throw new Error("A book idea is required.");
  }

  const slugBase = slugify(parsed.idea.split(/\s+/).slice(0, 10).join(" "));
  const runId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${slugBase}`;
  const rootDir = path.join(workspaceRoot, RUNS_DIRNAME, runId);
  const statePath = path.join(rootDir, STATE_DIRNAME, "run.json");
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
    status: "running",
    currentPhase: PHASE_ORDER[0],
    completedPhases: [],
    attempts: createPhaseMap(() => 0),
    artifacts: createPhaseMap(() => []),
    unresolvedIssues: [],
    nextAction: "Launch research phase.",
    createdAt: nowIso(),
    updatedAt: nowIso(),
    stopRequested: false,
    history: [],
    config: {
      maxRetriesPerPhase: 1,
      chapterBatchSize: 3,
    },
  };

  return run;
}

export function readRunState(runDir: string) {
  const statePath = path.join(runDir, STATE_DIRNAME, "run.json");
  if (!existsSync(statePath)) {
    throw new Error(`Run state not found at ${statePath}`);
  }

  return JSON.parse(readFileSync(statePath, "utf8")) as RunState;
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

  const nextPhase = getNextPhase(phase);
  if (nextPhase) {
    run.currentPhase = nextPhase;
    run.status = run.stopRequested ? "stopped" : "running";
    run.nextAction = run.stopRequested
      ? `Run paused before ${nextPhase} phase.`
      : `Launch ${nextPhase} phase.`;
  } else {
    run.status = "completed";
    run.nextAction = "Run complete.";
  }
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
    `Completed: ${run.completedPhases.length > 0 ? run.completedPhases.join(", ") : "none"}`,
    `Next action: ${run.nextAction}`,
  ];

  if (run.lastError) {
    lines.push(`Last error: ${run.lastError}`);
  }

  if (run.lastHandoffPath) {
    lines.push(`Last handoff: ${run.lastHandoffPath}`);
  }

  if (run.unresolvedIssues.length > 0) {
    lines.push("Unresolved:");
    lines.push(...run.unresolvedIssues.map((item) => `- ${item}`));
  }

  return lines.join("\n");
}
