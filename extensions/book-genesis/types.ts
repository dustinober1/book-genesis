export const PHASE_ORDER = [
  "kickoff",
  "research",
  "foundation",
  "write",
  "evaluate",
  "revise",
  "deliver",
] as const;

export type PhaseName = (typeof PHASE_ORDER)[number];

export type BookMode =
  | "fiction"
  | "memoir"
  | "prescriptive-nonfiction"
  | "narrative-nonfiction"
  | "childrens";

export type ExportFormat = "md" | "docx" | "epub";

export const PHASE_ROLE_MAP: Record<PhaseName, string> = {
  kickoff: "intake strategist",
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
  qualityGate?: QualityGateInput;
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
  ledgerPath: string;
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
  storyBiblePath?: string;
  storyBibleJsonPath?: string;
  history: PhaseHistoryEntry[];
  config: RunConfig;
  kickoff?: KickoffIntake;
  qualityGates: QualityGateRecord[];
  revisionCycle: number;
  git?: {
    repoRoot?: string;
    initializedByRuntime?: boolean;
    lastSnapshotCommit?: string;
  };
}

export interface ParsedIdeaInput {
  idea: string;
  language: string;
}

export type ResearchDepth = "standard" | "deep";

export interface RunConfig {
  maxRetriesPerPhase: number;
  chapterBatchSize: number;
  qualityThreshold: number;
  maxRevisionCycles: number;
  researchDepth: ResearchDepth;
  targetWordCount?: number;
  audience?: string;
  tone?: string;
  bookMode: BookMode;
  storyBibleEnabled: boolean;
  approvalPhases: PhaseName[];
  sampleChaptersForApproval: number;
  exportFormats: ExportFormat[];
  gitAutoInit: boolean;
  gitAutoCommit: boolean;
  gitCommitPaths: string[];
}

export interface KickoffIntake {
  workingTitle: string;
  genre: string;
  targetReader: string;
  promise: string;
  targetLength: string;
  tone: string;
  constraints: string[];
  successCriteria: string[];
}

export interface KickoffValidationResult {
  ok: boolean;
  issues: string[];
}

export interface StoryBibleCharacter {
  id: string;
  name: string;
  role: string;
  desire: string;
  fear?: string;
  notes?: string[];
}

export interface StoryBibleRelationship {
  from: string;
  to: string;
  dynamic: string;
  pressure?: string;
}

export interface StoryBibleSetting {
  name: string;
  function: string;
  rules: string[];
}

export interface StoryBibleTimelineEvent {
  point: string;
  event: string;
  consequence?: string;
}

export interface StoryBibleGlossaryEntry {
  term: string;
  definition: string;
}

export interface StoryBible {
  premise: string;
  themes: string[];
  characters: StoryBibleCharacter[];
  relationships: StoryBibleRelationship[];
  settings: StoryBibleSetting[];
  timeline: StoryBibleTimelineEvent[];
  promises: string[];
  motifs: string[];
  glossary: StoryBibleGlossaryEntry[];
}

export interface StoryBibleUpdate {
  premise?: string;
  themes?: string[];
  characters?: StoryBibleCharacter[];
  relationships?: StoryBibleRelationship[];
  settings?: StoryBibleSetting[];
  timeline?: StoryBibleTimelineEvent[];
  promises?: string[];
  motifs?: string[];
  glossary?: StoryBibleGlossaryEntry[];
}

export type ArtifactValidationCode =
  | "missing_required_target"
  | "missing_reported_artifact"
  | "empty_file"
  | "empty_directory"
  | "placeholder_text"
  | "path_outside_run";

export interface ArtifactValidationIssue {
  code: ArtifactValidationCode;
  target: string;
  message: string;
}

export interface ArtifactValidationResult {
  ok: boolean;
  issues: ArtifactValidationIssue[];
}

export interface SourceLedgerEntry {
  phase: PhaseName;
  title: string;
  url?: string;
  summary: string;
  usefulness: string;
  recordedAt: string;
}

export interface DecisionLedgerEntry {
  phase: PhaseName;
  decision: string;
  rationale: string;
  impact: string;
  recordedAt: string;
}

export interface RunLedger {
  sources: SourceLedgerEntry[];
  decisions: DecisionLedgerEntry[];
}

export interface QualityScores {
  marketFit: number;
  structure: number;
  prose: number;
  consistency: number;
  deliveryReadiness: number;
}

export interface QualityGateInput {
  threshold: number;
  scores: QualityScores;
  repairBrief: string;
}

export interface QualityGateRecord extends QualityGateInput {
  phase: PhaseName;
  passed: boolean;
  recordedAt: string;
}

export interface GitSnapshotResult {
  enabled: boolean;
  initialized: boolean;
  createdCommit: boolean;
  commitMessage?: string;
}
