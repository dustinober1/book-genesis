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

export type ExportFormat = "md" | "docx" | "epub" | "pdf";
export type KdpTargetFormat = "ebook" | "paperback";
export type MetadataVariantKind = "subtitle" | "description" | "keyword-chain" | "category";
export type RevisionPriority = "low" | "medium" | "high";
export type RevisionTaskStatus = "open" | "in_progress" | "done" | "deferred";
export type SourceConfidence = "low" | "medium" | "high";
export type LayoutProfileId =
  | "fiction-paperback-6x9"
  | "nonfiction-paperback-6x9"
  | "devotional-paperback-6x9"
  | "childrens-large-square"
  | "large-print-6x9";

export interface RubricDimension {
  key: string;
  label: string;
  weight: number;
  threshold: number;
}

export const PHASE_ROLE_MAP: Record<PhaseName, string> = {
  kickoff: "intake strategist",
  research: "researcher",
  foundation: "architect",
  write: "writer",
  evaluate: "evaluator",
  revise: "editor",
  deliver: "packager",
};

export type RunStatus = "running" | "stopped" | "failed" | "completed" | "awaiting_approval";
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
  lastExportManifestPath?: string;
  lastKdpPackageManifestPath?: string;
  selectedVariantPath?: string;
  approval?: ApprovalRequest;
  reviewerFeedback: ReviewerFeedbackEntry[];
  pendingReviewerRevision?: PendingReviewerRevision;
  pendingRevisionPlan?: PendingRevisionPlan;
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
  independentEvaluationPass: boolean;
  targetWordCount?: number;
  audience?: string;
  tone?: string;
  bookMode: BookMode;
  genrePreset?: string;
  storyBibleEnabled: boolean;
  approvalPhases: PhaseName[];
  sampleChaptersForApproval: number;
  exportFormats: ExportFormat[];
  gitAutoInit: boolean;
  gitAutoCommit: boolean;
  gitCommitPaths: string[];
  kdp: KdpConfig;
  promotion: PromotionConfig;
  style: StyleConfig;
  sceneMap: SceneMapConfig;
  critiquePanel: CritiquePanelConfig;
  sourceAudit: SourceAuditConfig;
  launchKit: LaunchKitConfig;
  bookMatter: BookMatterConfig;
  coverCheck: CoverCheckConfig;
  revisionPlan: RevisionPlanConfig;
  archive: ArchiveConfig;
  metadataLab: MetadataLabConfig;
  sourceVault: SourceVaultConfig;
  revisionBoard: RevisionBoardConfig;
  layoutProfiles: LayoutProfilesConfig;
  workbench: WorkbenchConfig;
}

export type VoiceStrictness = "light" | "standard" | "strict";

export interface StyleConfig {
  enabled: boolean;
  bannedPhrases: string[];
  voiceStrictness: VoiceStrictness;
  lintOnEvaluate: boolean;
}

export interface SceneMapConfig {
  enabled: boolean;
  includeEmotionalValence: boolean;
  includePromiseTracking: boolean;
}

export interface CritiquePanelConfig {
  enabled: boolean;
  reviewers: string[];
  requireConsensus: boolean;
  maxMeanDisagreement: number;
}

export interface SourceAuditConfig {
  enabled: boolean;
  requiredForModes: BookMode[];
  flagUnsupportedStatistics: boolean;
}

export interface LaunchKitConfig {
  enabled: boolean;
  includeNewsletterSequence: boolean;
  includePressKit: boolean;
  includeBookClubGuide: boolean;
}

export interface SeriesConfig {
  name: string;
  bookNumber: number;
  previousTitle?: string;
  nextTitleTeaser?: string;
}

export interface BookMatterConfig {
  frontMatter: string[];
  backMatter: string[];
  series: SeriesConfig | null;
}

export interface CoverCheckConfig {
  enabled: boolean;
  minEbookWidth: number;
  minEbookHeight: number;
  idealEbookWidth: number;
  idealEbookHeight: number;
}

export interface RevisionPlanConfig {
  requirePlanBeforeRewrite: boolean;
  approvalRequired: boolean;
}

export interface ArchiveConfig {
  includeState: boolean;
  includeLedger: boolean;
  includeReports: boolean;
}

export interface MetadataLabConfig {
  enabled: boolean;
  requiredForKdp: boolean;
  maxSubtitleOptions: number;
  maxDescriptionOptions: number;
  maxKeywordChains: number;
  scoringWeights: {
    clarity: number;
    marketFit: number;
    keywordCoverage: number;
    differentiation: number;
    compliance: number;
  };
}

export interface SourceVaultConfig {
  enabled: boolean;
  requireClaimLinksForNonfiction: boolean;
  minConfidenceForFinal: SourceConfidence;
}

export interface RevisionBoardConfig {
  enabled: boolean;
  defaultPriority: RevisionPriority;
  includeInfoFindings: boolean;
}

export interface LayoutProfilesConfig {
  enabled: boolean;
  defaultProfile: LayoutProfileId;
  requireProfileForPaperback: boolean;
}

export interface WorkbenchConfig {
  enabled: boolean;
  includeRecentHistoryLimit: number;
  includeArtifactLinks: boolean;
}

export interface MetadataScore {
  clarity: number;
  marketFit: number;
  keywordCoverage: number;
  differentiation: number;
  compliance: number;
  total: number;
}

export interface MetadataVariant {
  kind: MetadataVariantKind;
  value: string;
  rationale: string;
  score: MetadataScore;
}

export interface ClaimLink {
  claimId: string;
  claim: string;
  sourceIds: string[];
  confidence: SourceConfidence;
  location?: string;
}

export interface RevisionBoardTask {
  id: string;
  title: string;
  source: string;
  target: string;
  priority: RevisionPriority;
  status: RevisionTaskStatus;
  acceptanceCriteria: string[];
}

export interface KdpConfig {
  formats: KdpTargetFormat[];
  trimSize?: string;
  bleed: boolean;
  authorName?: string;
  description?: string;
  keywords: string[];
  categories: string[];
}

export type ShortStoryPurpose = "lead-magnet" | "world-teaser" | "content-series";

export interface PromotionConfig {
  shortStoryEnabled: boolean;
  shortStoryMaxPages: number;
  shortStoryPurpose: ShortStoryPurpose;
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

export interface ApprovalRequest {
  phase: PhaseName;
  requestedAt: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  note?: string;
  nextPhase?: PhaseName | null;
  completionPending?: boolean;
}

export interface ReviewerFeedbackEntry {
  id: string;
  phase: PhaseName | "completed";
  note: string;
  artifactPath: string;
  recordedAt: string;
}

export interface PendingReviewerRevision {
  requestedAt: string;
  artifactPath: string;
  note: string;
  requestedFrom: PhaseName | "completed";
}

export interface PendingRevisionPlan {
  requestedAt: string;
  feedbackPath: string;
  planPath: string;
  status: "pending" | "approved" | "rejected";
  note?: string;
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
  [key: string]: number;
}

export interface QualityGateInput {
  threshold: number;
  scores: QualityScores;
  repairBrief: string;
}

export interface QualityGateRecord extends QualityGateInput {
  phase: PhaseName;
  passed: boolean;
  failedDimensions: string[];
  recordedAt: string;
}

export interface GitSnapshotResult {
  enabled: boolean;
  initialized: boolean;
  createdCommit: boolean;
  commitMessage?: string;
}

export interface ExportManifest {
  formats: ExportFormat[];
  files: string[];
  layoutProfile?: {
    id: LayoutProfileId;
    label: string;
    trimSize: string;
    pdfMediaBox: { widthPoints: number; heightPoints: number };
  };
}

export interface KdpPreflightIssue {
  severity: "info" | "warning" | "error";
  code: string;
  message: string;
}

export interface KdpPackageManifest {
  files: string[];
  exportFormats: ExportFormat[];
  copiedAssets: string[];
  metadataJsonPath: string;
  metadataMarkdownPath: string;
  preflightPath: string;
  checklistPath: string;
  instructionsPath: string;
  coverPromptsPath: string;
  coverSpecsPath: string;
  issues: KdpPreflightIssue[];
}

export interface StyleProfile {
  generatedAt: string;
  runId: string;
  sourceArtifacts: string[];
  voicePrinciples: string[];
  sentenceRhythm: string;
  diction: string[];
  povDistance: string;
  dialogueRules: string[];
  bannedPhrases: string[];
  preferredOpenings: string[];
  preferredEndings: string[];
  examples: string[];
}

export interface StyleLintFinding {
  severity: "info" | "warning" | "error";
  code: string;
  target: string;
  evidence: string;
  suggestedAction: string;
}

export interface StyleLintReport {
  generatedAt: string;
  runId: string;
  findings: StyleLintFinding[];
}

export type HealthCheckSeverity = "info" | "warning" | "error";

export interface HealthCheckResult {
  ok: boolean;
  severity: HealthCheckSeverity;
  code: string;
  message: string;
  remedy?: string;
}

export interface DoctorReport {
  ok: boolean;
  generatedAt: string;
  workspaceRoot: string;
  packageRoot: string;
  results: HealthCheckResult[];
}

export type ManuscriptFindingSeverity = "info" | "warning" | "error";

export interface ManuscriptIntelligenceFinding {
  severity: ManuscriptFindingSeverity;
  code: string;
  target: string;
  evidence: string;
  suggestedAction: string;
}

export interface ManuscriptIntelligenceReport {
  generatedAt: string;
  runId: string;
  findings: ManuscriptIntelligenceFinding[];
}

export interface SceneEntry {
  chapter: string;
  sceneIndex: number;
  title?: string;
  pov?: string;
  location?: string;
  goal?: string;
  conflict?: string;
  turn?: string;
  wordCount: number;
  emotionalValence?: "positive" | "negative" | "mixed" | "neutral";
  promisesSetup: string[];
  promisesPaidOff: string[];
  continuityRisks: string[];
}

export interface PacingDashboard {
  generatedAt: string;
  runId: string;
  totalWords: number;
  chapterCount: number;
  averageChapterWords: number;
  longestChapter: string | null;
  shortestChapter: string | null;
  findings: ManuscriptIntelligenceFinding[];
}

export interface CritiqueReviewerResult {
  reviewer: string;
  scores: QualityScores;
  topStrengths: string[];
  topConcerns: string[];
  requiredFixes: string[];
  optionalFixes: string[];
}

export interface CritiquePanelReport {
  generatedAt: string;
  runId: string;
  reviewers: CritiqueReviewerResult[];
  consensusScores: QualityScores;
  disagreement: {
    comparedDimensions: number;
    meanAbsDelta: number | null;
    highDisagreementDimensions: string[];
  };
  revisionPriorities: string[];
}

export interface ClaimEntry {
  id: string;
  chapter?: string;
  claim: string;
  claimType: "statistic" | "historical" | "medical" | "legal" | "financial" | "memoir" | "general";
  sourceTitles: string[];
  supportLevel: "strong" | "partial" | "missing" | "not-required";
  risk: "low" | "medium" | "high";
  suggestedFix: string;
}

export interface SourceAuditReport {
  generatedAt: string;
  runId: string;
  mode: BookMode;
  claims: ClaimEntry[];
  findings: HealthCheckResult[];
}

export interface ShortStoryConcept {
  title: string;
  hook: string;
  emotionalPromise: string;
  protagonistPov: string;
  connectionToBook: string;
  spoilerRisk: "low" | "medium" | "high";
  websitePositioning: string;
  recommended: boolean;
}

export interface ShortStoryBrainstorm {
  runId: string;
  purpose: ShortStoryPurpose;
  maxPages: number;
  targetWords: string;
  concepts: ShortStoryConcept[];
  markdown: string;
}

export interface ShortStoryPackageManifest {
  files: string[];
  selectedConcept: string;
  maxPages: number;
}
