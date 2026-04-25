export const PHASE_ORDER = [
  "research",
  "foundation",
  "write",
  "evaluate",
  "revise",
  "deliver",
] as const;

export type PhaseName = (typeof PHASE_ORDER)[number];

export const PHASE_ROLE_MAP: Record<PhaseName, string> = {
  research: "researcher",
  foundation: "architect",
  write: "writer",
  evaluate: "evaluator",
  revise: "editor",
  deliver: "packager",
};

export type RunStatus = "running" | "stopped" | "failed" | "completed";
export type PhaseHistoryStatus = "running" | "completed" | "failed" | "stopped";

export interface PhaseHistoryEntry {
  phase: PhaseName;
  attempt: number;
  status: PhaseHistoryStatus;
  startedAt: string;
  endedAt?: string;
  summary?: string;
  artifacts: string[];
  unresolvedIssues: string[];
}

export interface PhaseCompletionPayload {
  summary: string;
  artifacts: string[];
  unresolvedIssues: string[];
}

export interface PhaseFailurePayload {
  reason: string;
  retryable: boolean;
  unresolvedIssues: string[];
}

export interface RunState {
  version: 1;
  id: string;
  slug: string;
  title: string;
  idea: string;
  language: string;
  workspaceRoot: string;
  rootDir: string;
  statePath: string;
  status: RunStatus;
  currentPhase: PhaseName;
  completedPhases: PhaseName[];
  attempts: Record<PhaseName, number>;
  artifacts: Record<PhaseName, string[]>;
  unresolvedIssues: string[];
  nextAction: string;
  createdAt: string;
  updatedAt: string;
  stopRequested: boolean;
  lastError?: string;
  lastHandoffPath?: string;
  history: PhaseHistoryEntry[];
  config: {
    maxRetriesPerPhase: number;
    chapterBatchSize: number;
  };
}

export interface ParsedIdeaInput {
  idea: string;
  language: string;
}
