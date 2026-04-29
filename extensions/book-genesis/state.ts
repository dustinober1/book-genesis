import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

import {
  PHASE_ORDER,
  type ParsedIdeaInput,
  type PhaseCompletionPayload,
  type PhaseFailurePayload,
  type ApprovalRequest,
  type QualityGateRecord,
  type PhaseHistoryEntry,
  type PhaseName,
  type ReviewerFeedbackEntry,
  type RunConfig,
  type RunState,
} from "./types.js";
import { DEFAULT_RUN_CONFIG } from "./config.js";
import { createQualityGate } from "./quality.js";

const RUNS_DIRNAME = "book-projects";
const STATE_DIRNAME = ".book-genesis";
const CURRENT_RUN_STATE_VERSION = 1;
const VALID_STATUSES = ["running", "stopped", "failed", "completed", "awaiting_approval"] as const;
const VALID_HISTORY_STATUSES = ["running", "completed", "failed", "stopped"] as const;

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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : undefined;
}

function asBoolean(value: unknown) {
  return typeof value === "boolean" ? value : undefined;
}

function asNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function asStringArray(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
}

function asPhaseName(value: unknown): PhaseName | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const lowered = value.toLowerCase().trim();
  return PHASE_ORDER.includes(lowered as PhaseName) ? (lowered as PhaseName) : undefined;
}

function normalizePhaseMap<T>(value: unknown, factory: () => T, normalize: (item: unknown) => T): Record<PhaseName, T> {
  const base = createPhaseMap(factory);
  if (!isObject(value)) {
    return base;
  }

  for (const phase of PHASE_ORDER) {
    if (phase in value) {
      base[phase] = normalize(value[phase]);
    }
  }

  return base;
}

function normalizeRunConfig(raw: unknown): RunConfig {
  if (!isObject(raw)) {
    return DEFAULT_RUN_CONFIG;
  }

  const source = raw as Partial<RunConfig>;
  const kdpSource = isObject(source.kdp) ? source.kdp : {};
  const promotionSource = isObject(source.promotion) ? source.promotion : {};
  const kdp = {
    ...DEFAULT_RUN_CONFIG.kdp,
    ...kdpSource,
    keywords: asStringArray((kdpSource as { keywords?: unknown }).keywords).slice(0, 7),
    categories: asStringArray((kdpSource as { categories?: unknown }).categories),
  };
  const promotion = {
    ...DEFAULT_RUN_CONFIG.promotion,
    ...promotionSource,
  };

  const approvalPhases = asStringArray(source.approvalPhases).filter((phase) => asPhaseName(phase));

  return {
    ...DEFAULT_RUN_CONFIG,
    ...source,
    approvalPhases: approvalPhases.length > 0 ? approvalPhases.map((phase) => phase as PhaseName) : DEFAULT_RUN_CONFIG.approvalPhases,
    kdp,
    promotion,
  };
}

function normalizeHistory(value: unknown): PhaseHistoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!isObject(entry)) {
        return null;
      }

      const phase = asPhaseName(entry.phase);
      const attempt = asNumber(entry.attempt) ?? 1;
      const status = asString(entry.status);
      const startedAt = asString(entry.startedAt) ?? nowIso();
      const endedAt = asString(entry.endedAt);
      const summary = asString(entry.summary) ?? undefined;
      const artifacts = asStringArray(entry.artifacts);
      const unresolvedIssues = asStringArray(entry.unresolvedIssues);

      if (!phase) {
        return null;
      }

      return {
        phase,
        attempt,
        status: VALID_HISTORY_STATUSES.includes(status as (typeof VALID_HISTORY_STATUSES)[number])
          ? (status as (typeof VALID_HISTORY_STATUSES)[number])
          : "completed",
        startedAt,
        endedAt,
        summary,
        artifacts,
        unresolvedIssues,
      };
    })
    .filter(Boolean) as PhaseHistoryEntry[];
}

function normalizeReviewerFeedback(value: unknown): ReviewerFeedbackEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!isObject(entry)) {
        return null;
      }

      const id = asString(entry.id);
      const phase = asPhaseName(entry.phase) || "completed";
      const artifactPath = asString(entry.artifactPath);
      const note = asString(entry.note);
      const recordedAt = asString(entry.recordedAt);
      if (!id || !artifactPath || !note || !recordedAt) {
        return null;
      }

      return { id, phase, note, artifactPath, recordedAt };
    })
    .filter((entry): entry is ReviewerFeedbackEntry => Boolean(entry));
}

function inferCurrentPhase(completedPhases: PhaseName[], status?: string) {
  if (status === "completed") {
    return "deliver";
  }

  if (completedPhases.length === 0) {
    return PHASE_ORDER[0];
  }

  const index = Math.max(...completedPhases.map((phase) => PHASE_ORDER.indexOf(phase)));
  if (index === -1) {
    return PHASE_ORDER[0];
  }

  return PHASE_ORDER[Math.min(index + 1, PHASE_ORDER.length - 1)] ?? PHASE_ORDER[0];
}

function inferNextAction(run: Pick<RunState, "status" | "currentPhase" | "config">) {
  if (run.status === "running") {
    return `Resume ${run.currentPhase} phase.`;
  }
  if (run.status === "awaiting_approval") {
    return `Run is waiting for approval after ${run.currentPhase}.`;
  }
  if (run.status === "stopped") {
    return `Run paused at ${run.currentPhase} phase.`;
  }
  if (run.status === "failed") {
    return "Manual review required.";
  }
  if (run.status === "completed") {
    return "Run complete.";
  }
  return `Launch ${run.currentPhase} phase.`;
}

function backupMigratedRun(statePath: string, contents: string) {
  const backupPath = `${statePath}.${nowIso().replace(/[:.]/g, "-")}.bak`;
  writeFileSync(backupPath, contents, "utf8");
}

function runNeedsMigration(runDir: string, raw: unknown, normalized: RunState) {
  if (!isObject(raw)) {
    return { needsMigration: true, reason: "run file is not an object" };
  }

  if ((raw as { version?: unknown }).version !== CURRENT_RUN_STATE_VERSION) {
    return { needsMigration: true, reason: "version mismatch" };
  }

  const inferredRoot = path.resolve(runDir);
  const rootPath = path.join(inferredRoot, STATE_DIRNAME, "run.json");
  const rawState = raw as Record<string, unknown>;

  if (!rawState.id || asString(rawState.id) !== normalized.id) {
    return { needsMigration: true, reason: "id missing" };
  }

  if (typeof rawState.currentPhase !== "string" || !PHASE_ORDER.includes(rawState.currentPhase as PhaseName)) {
    return { needsMigration: true, reason: "currentPhase missing or invalid" };
  }

  if (!Array.isArray(rawState.completedPhases) || !Array.isArray(rawState.history)) {
    return { needsMigration: true, reason: "legacy bookkeeping missing" };
  }

  if (!Array.isArray(rawState.qualityGates)) {
    return { needsMigration: true, reason: "quality gates missing" };
  }

  if (!Array.isArray(rawState.reviewerFeedback)) {
    return { needsMigration: true, reason: "reviewer feedback missing" };
  }

  if (asString(rawState.statePath) !== rootPath) {
    return { needsMigration: true, reason: "statePath missing or stale" };
  }

  return { needsMigration: false };
}

function normalizeRunState(runDir: string, raw: unknown): { run: RunState; needsMigration: boolean; fromVersion: number | null; toVersion: number; } {
  const runDirPath = path.resolve(runDir);
  const rawRun = isObject(raw) ? raw : {};
  const inferredWorkspaceRoot = path.resolve(runDirPath, "..", "..");
  const statePath = path.join(runDirPath, STATE_DIRNAME, "run.json");
  const ledgerPath = path.join(runDirPath, STATE_DIRNAME, "ledger.json");
  const config = normalizeRunConfig(rawRun.config);
  const completedPhases = asStringArray(rawRun.completedPhases).filter((phase) => asPhaseName(phase)) as PhaseName[];
  const legacyCurrentPhase = asPhaseName((rawRun as { phase?: unknown }).phase);
  const normalizedCurrentPhase = asPhaseName(rawRun.currentPhase) || legacyCurrentPhase
    || inferCurrentPhase(completedPhases, asString(rawRun.status));
  const rawStatus = asString(rawRun.status);
  const status = VALID_STATUSES.includes(rawStatus as (typeof VALID_STATUSES)[number])
    ? (rawStatus as RunState["status"])
    : "running";
  const reviewerFeedback = normalizeReviewerFeedback(rawRun.reviewerFeedback);

  const run: RunState = {
    version: CURRENT_RUN_STATE_VERSION,
    id: asString(rawRun.id) || path.basename(runDirPath),
    slug: asString(rawRun.slug) || path.basename(runDirPath),
    title: asString(rawRun.title) || asString(rawRun.slug)?.replace(/-/g, " ") || path.basename(runDirPath),
    idea: asString(rawRun.idea) || "",
    language: asString(rawRun.language) || "auto",
    workspaceRoot: asString(rawRun.workspaceRoot) || inferredWorkspaceRoot,
    rootDir: asString(rawRun.rootDir) || runDirPath,
    statePath,
    ledgerPath,
    status,
    currentPhase: normalizedCurrentPhase,
    completedPhases: Array.from(new Set(completedPhases)),
    attempts: normalizePhaseMap(rawRun.attempts, () => 0, (item) => asNumber(item) ?? 0),
    artifacts: normalizePhaseMap(rawRun.artifacts, () => [], (item) => asStringArray(item)),
    unresolvedIssues: asStringArray(rawRun.unresolvedIssues),
    nextAction: asString(rawRun.nextAction) || inferNextAction({
      status,
      currentPhase: normalizedCurrentPhase,
      config,
    }),
    createdAt: asString(rawRun.createdAt) || nowIso(),
    updatedAt: asString(rawRun.updatedAt) || nowIso(),
    stopRequested: asBoolean(rawRun.stopRequested) ?? false,
    lastError: asString(rawRun.lastError),
    lastHandoffPath: asString(rawRun.lastHandoffPath),
    storyBiblePath: asString(rawRun.storyBiblePath),
    storyBibleJsonPath: asString(rawRun.storyBibleJsonPath),
    lastExportManifestPath: asString(rawRun.lastExportManifestPath),
    lastKdpPackageManifestPath: asString(rawRun.lastKdpPackageManifestPath),
    approval: isObject(rawRun.approval)
      ? {
          phase: asPhaseName(rawRun.approval.phase) || normalizedCurrentPhase,
          requestedAt: asString(rawRun.approval.requestedAt) || nowIso(),
          reason: asString(rawRun.approval.reason) || "System migration update.",
          status: (asString(rawRun.approval.status) as ApprovalRequest["status"]) || "pending",
          nextPhase: asPhaseName((rawRun.approval as { nextPhase?: unknown }).nextPhase) || null,
          completionPending: asBoolean((rawRun.approval as { completionPending?: unknown }).completionPending),
        }
      : undefined,
    reviewerFeedback,
    pendingReviewerRevision: isObject(rawRun.pendingReviewerRevision)
      ? {
          requestedAt: asString(rawRun.pendingReviewerRevision.requestedAt) || nowIso(),
          artifactPath: asString(rawRun.pendingReviewerRevision.artifactPath) || "",
          note: asString(rawRun.pendingReviewerRevision.note) || "",
          requestedFrom: asPhaseName(rawRun.pendingReviewerRevision.requestedFrom) || "completed",
        }
      : undefined,
    history: normalizeHistory(rawRun.history),
    config,
    qualityGates: Array.isArray((rawRun as { qualityGates?: unknown }).qualityGates)
      ? ((rawRun as { qualityGates?: QualityGateRecord[] }).qualityGates ?? [])
      : [],
    revisionCycle: asNumber((rawRun as { revisionCycle?: unknown }).revisionCycle) ?? 0,
    git: isObject(rawRun.git)
      ? {
          repoRoot: asString(rawRun.git.repoRoot),
          initializedByRuntime: asBoolean(rawRun.git.initializedByRuntime),
          lastSnapshotCommit: asString(rawRun.git.lastSnapshotCommit),
        }
      : undefined,
  };

  if (run.currentPhase === "kickoff" && run.status === "completed") {
    run.status = "completed";
    run.nextAction = "Run complete.";
  }

  if (!run.artifacts) {
    run.artifacts = createPhaseMap(() => []);
  }

  return {
    run,
    needsMigration: runNeedsMigration(runDirPath, rawRun, run).needsMigration,
    fromVersion: isObject(rawRun) && typeof rawRun.version === "number" ? rawRun.version : null,
    toVersion: CURRENT_RUN_STATE_VERSION,
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

  const rawContents = readFileSync(statePath, "utf8");
  const migration = normalizeRunState(runDir, JSON.parse(rawContents));
  const run = migration.run;

  if (migration.needsMigration) {
    try {
      backupMigratedRun(statePath, rawContents);
      writeRunState(run);
    } catch {
      // Fall through and return best-effort normalized state if write fails.
    }
  }

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
    // Threshold is config-driven; ignore any caller-supplied value.
    const gate = createQualityGate(run.config.bookMode, {
      ...payload.qualityGate,
      threshold: run.config.qualityThreshold,
    });
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

  if (run.lastKdpPackageManifestPath) {
    lines.push(`Last KDP package: ${run.lastKdpPackageManifestPath}`);
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
