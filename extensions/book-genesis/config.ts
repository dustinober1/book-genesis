import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { BookMode, KdpConfig, RunConfig, SeriesConfig } from "./types.js";

export const DEFAULT_RUN_CONFIG: RunConfig = {
  maxRetriesPerPhase: 1,
  chapterBatchSize: 3,
  qualityThreshold: 85,
  maxRevisionCycles: 2,
  researchDepth: "standard",
  independentEvaluationPass: true,
  bookMode: "fiction",
  storyBibleEnabled: true,
  approvalPhases: [],
  sampleChaptersForApproval: 3,
  exportFormats: ["md", "docx", "epub"],
  gitAutoInit: true,
  gitAutoCommit: true,
  gitCommitPaths: ["book-projects"],
  kdp: {
    formats: ["ebook", "paperback"],
    bleed: false,
    keywords: [],
    categories: [],
  },
  promotion: {
    shortStoryEnabled: true,
    shortStoryMaxPages: 15,
    shortStoryPurpose: "lead-magnet",
  },
  style: {
    enabled: true,
    bannedPhrases: [],
    voiceStrictness: "standard",
    lintOnEvaluate: true,
  },
  sceneMap: {
    enabled: true,
    includeEmotionalValence: true,
    includePromiseTracking: true,
  },
  critiquePanel: {
    enabled: true,
    reviewers: ["developmental-editor", "line-editor", "target-reader", "market-editor", "continuity-editor"],
    requireConsensus: true,
    maxMeanDisagreement: 8,
  },
  sourceAudit: {
    enabled: true,
    requiredForModes: ["memoir", "prescriptive-nonfiction", "narrative-nonfiction"],
    flagUnsupportedStatistics: true,
  },
  launchKit: {
    enabled: true,
    includeNewsletterSequence: true,
    includePressKit: true,
    includeBookClubGuide: true,
  },
  bookMatter: {
    frontMatter: ["title-page", "copyright"],
    backMatter: ["author-note", "newsletter-cta"],
    series: null,
  },
  coverCheck: {
    enabled: true,
    minEbookWidth: 625,
    minEbookHeight: 1000,
    idealEbookWidth: 1600,
    idealEbookHeight: 2560,
  },
  revisionPlan: {
    requirePlanBeforeRewrite: true,
    approvalRequired: true,
  },
  archive: {
    includeState: true,
    includeLedger: true,
    includeReports: true,
  },
};

const VALID_BOOK_MODES = new Set<RunConfig["bookMode"]>([
  "fiction",
  "memoir",
  "prescriptive-nonfiction",
  "narrative-nonfiction",
  "childrens",
]);

const VALID_EXPORT_FORMATS = new Set<RunConfig["exportFormats"][number]>(["md", "docx", "epub"]);
const VALID_KDP_FORMATS = new Set<NonNullable<KdpConfig["formats"]>[number]>(["ebook", "paperback"]);
const VALID_SHORT_STORY_PURPOSES = new Set<RunConfig["promotion"]["shortStoryPurpose"]>([
  "lead-magnet",
  "world-teaser",
  "content-series",
]);
const VALID_VOICE_STRICTNESS = new Set<RunConfig["style"]["voiceStrictness"]>(["light", "standard", "strict"]);
export const VALID_GENRE_PRESETS = [
  "thriller",
  "memoir",
  "business",
  "devotional",
  "childrens-picture-book",
  "middle-grade",
  "romantasy",
] as const;

function assertPositiveInteger(name: string, value: number) {
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }
}

function assertRelativePath(value: string) {
  if (path.isAbsolute(value)) {
    throw new Error("gitCommitPaths must contain only relative paths.");
  }

  const normalized = value.replace(/\\/g, "/");
  if (normalized === "" || normalized === "." || normalized.includes("..")) {
    throw new Error("gitCommitPaths must not contain '.' or '..' segments.");
  }
}

function normalizeStringList(name: string, value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array of strings.`);
  }

  return value.map((entry) => {
    if (typeof entry !== "string" || !entry.trim()) {
      throw new Error(`${name} must contain only non-empty strings.`);
    }
    return entry.trim();
  });
}

function assertBoolean(name: string, value: unknown): asserts value is boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${name} must be a boolean.`);
  }
}

function normalizeBookModeList(name: string, value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error(`${name} must be an array of book modes.`);
  }

  return value.map((entry) => {
    if (typeof entry !== "string" || !VALID_BOOK_MODES.has(entry as BookMode)) {
      throw new Error(`${name} must contain only supported book modes.`);
    }
    return entry as BookMode;
  });
}

function normalizeKdpConfig(value: Partial<KdpConfig> | undefined): KdpConfig {
  const config: KdpConfig = {
    ...DEFAULT_RUN_CONFIG.kdp,
    ...value,
  };

  if (!Array.isArray(config.formats) || config.formats.length === 0) {
    throw new Error("kdp.formats must be a non-empty array.");
  }

  config.formats = config.formats.map((entry) => {
    const trimmed = entry.trim() as KdpConfig["formats"][number];
    if (!VALID_KDP_FORMATS.has(trimmed)) {
      throw new Error("kdp.formats must contain only ebook or paperback.");
    }
    return trimmed;
  });

  if (typeof config.bleed !== "boolean") {
    throw new Error("kdp.bleed must be a boolean.");
  }

  if (config.trimSize !== undefined) {
    if (typeof config.trimSize !== "string" || !config.trimSize.trim()) {
      throw new Error("kdp.trimSize must be a non-empty string when provided.");
    }
    config.trimSize = config.trimSize.trim();
  }

  if (config.authorName !== undefined) {
    if (typeof config.authorName !== "string" || !config.authorName.trim()) {
      throw new Error("kdp.authorName must be a non-empty string when provided.");
    }
    config.authorName = config.authorName.trim();
  }

  if (config.description !== undefined) {
    if (typeof config.description !== "string" || !config.description.trim()) {
      throw new Error("kdp.description must be a non-empty string when provided.");
    }
    config.description = config.description.trim();
  }

  config.keywords = normalizeStringList("kdp.keywords", config.keywords);
  config.categories = normalizeStringList("kdp.categories", config.categories);
  return config;
}

function normalizePromotionConfig(value: Partial<RunConfig["promotion"]> | undefined): RunConfig["promotion"] {
  const config: RunConfig["promotion"] = {
    ...DEFAULT_RUN_CONFIG.promotion,
    ...value,
  };

  if (typeof config.shortStoryEnabled !== "boolean") {
    throw new Error("promotion.shortStoryEnabled must be a boolean.");
  }

  assertPositiveInteger("promotion.shortStoryMaxPages", config.shortStoryMaxPages);
  if (config.shortStoryMaxPages > 15) {
    throw new Error("promotion.shortStoryMaxPages must be 15 or less.");
  }

  if (!VALID_SHORT_STORY_PURPOSES.has(config.shortStoryPurpose)) {
    throw new Error("promotion.shortStoryPurpose must be lead-magnet, world-teaser, or content-series.");
  }

  return config;
}

function normalizeStyleConfig(value: Partial<RunConfig["style"]> | undefined): RunConfig["style"] {
  const config = { ...DEFAULT_RUN_CONFIG.style, ...value };
  assertBoolean("style.enabled", config.enabled);
  assertBoolean("style.lintOnEvaluate", config.lintOnEvaluate);
  config.bannedPhrases = normalizeStringList("style.bannedPhrases", config.bannedPhrases);
  if (!VALID_VOICE_STRICTNESS.has(config.voiceStrictness)) {
    throw new Error("style.voiceStrictness must be light, standard, or strict.");
  }
  return config;
}

function normalizeSceneMapConfig(value: Partial<RunConfig["sceneMap"]> | undefined): RunConfig["sceneMap"] {
  const config = { ...DEFAULT_RUN_CONFIG.sceneMap, ...value };
  assertBoolean("sceneMap.enabled", config.enabled);
  assertBoolean("sceneMap.includeEmotionalValence", config.includeEmotionalValence);
  assertBoolean("sceneMap.includePromiseTracking", config.includePromiseTracking);
  return config;
}

function normalizeCritiquePanelConfig(value: Partial<RunConfig["critiquePanel"]> | undefined): RunConfig["critiquePanel"] {
  const config = { ...DEFAULT_RUN_CONFIG.critiquePanel, ...value };
  assertBoolean("critiquePanel.enabled", config.enabled);
  assertBoolean("critiquePanel.requireConsensus", config.requireConsensus);
  config.reviewers = normalizeStringList("critiquePanel.reviewers", config.reviewers);
  if (config.reviewers.length === 0) {
    throw new Error("critiquePanel.reviewers must include at least one reviewer.");
  }
  assertPositiveInteger("critiquePanel.maxMeanDisagreement", config.maxMeanDisagreement);
  return config;
}

function normalizeSourceAuditConfig(value: Partial<RunConfig["sourceAudit"]> | undefined): RunConfig["sourceAudit"] {
  const config = { ...DEFAULT_RUN_CONFIG.sourceAudit, ...value };
  assertBoolean("sourceAudit.enabled", config.enabled);
  assertBoolean("sourceAudit.flagUnsupportedStatistics", config.flagUnsupportedStatistics);
  config.requiredForModes = normalizeBookModeList("sourceAudit.requiredForModes", config.requiredForModes);
  return config;
}

function normalizeLaunchKitConfig(value: Partial<RunConfig["launchKit"]> | undefined): RunConfig["launchKit"] {
  const config = { ...DEFAULT_RUN_CONFIG.launchKit, ...value };
  assertBoolean("launchKit.enabled", config.enabled);
  assertBoolean("launchKit.includeNewsletterSequence", config.includeNewsletterSequence);
  assertBoolean("launchKit.includePressKit", config.includePressKit);
  assertBoolean("launchKit.includeBookClubGuide", config.includeBookClubGuide);
  return config;
}

function normalizeSeriesConfig(value: unknown): SeriesConfig | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error("bookMatter.series must be null or an object.");
  }
  const source = value as Partial<SeriesConfig>;
  if (typeof source.name !== "string" || !source.name.trim()) {
    throw new Error("bookMatter.series.name must be a non-empty string.");
  }
  assertPositiveInteger("bookMatter.series.bookNumber", Number(source.bookNumber));
  return {
    name: source.name.trim(),
    bookNumber: Number(source.bookNumber),
    previousTitle: typeof source.previousTitle === "string" && source.previousTitle.trim() ? source.previousTitle.trim() : undefined,
    nextTitleTeaser: typeof source.nextTitleTeaser === "string" && source.nextTitleTeaser.trim() ? source.nextTitleTeaser.trim() : undefined,
  };
}

function normalizeBookMatterConfig(value: Partial<RunConfig["bookMatter"]> | undefined): RunConfig["bookMatter"] {
  const config = { ...DEFAULT_RUN_CONFIG.bookMatter, ...value };
  config.frontMatter = normalizeStringList("bookMatter.frontMatter", config.frontMatter);
  config.backMatter = normalizeStringList("bookMatter.backMatter", config.backMatter);
  config.series = normalizeSeriesConfig(config.series);
  return config;
}

function normalizeCoverCheckConfig(value: Partial<RunConfig["coverCheck"]> | undefined): RunConfig["coverCheck"] {
  const config = { ...DEFAULT_RUN_CONFIG.coverCheck, ...value };
  assertBoolean("coverCheck.enabled", config.enabled);
  assertPositiveInteger("coverCheck.minEbookWidth", config.minEbookWidth);
  assertPositiveInteger("coverCheck.minEbookHeight", config.minEbookHeight);
  assertPositiveInteger("coverCheck.idealEbookWidth", config.idealEbookWidth);
  assertPositiveInteger("coverCheck.idealEbookHeight", config.idealEbookHeight);
  return config;
}

function normalizeRevisionPlanConfig(value: Partial<RunConfig["revisionPlan"]> | undefined): RunConfig["revisionPlan"] {
  const config = { ...DEFAULT_RUN_CONFIG.revisionPlan, ...value };
  assertBoolean("revisionPlan.requirePlanBeforeRewrite", config.requirePlanBeforeRewrite);
  assertBoolean("revisionPlan.approvalRequired", config.approvalRequired);
  return config;
}

function normalizeArchiveConfig(value: Partial<RunConfig["archive"]> | undefined): RunConfig["archive"] {
  const config = { ...DEFAULT_RUN_CONFIG.archive, ...value };
  assertBoolean("archive.includeState", config.includeState);
  assertBoolean("archive.includeLedger", config.includeLedger);
  assertBoolean("archive.includeReports", config.includeReports);
  return config;
}

export function normalizeRunConfig(value: Partial<RunConfig>): RunConfig {
  const config: RunConfig = { ...DEFAULT_RUN_CONFIG, ...value };

  assertPositiveInteger("maxRetriesPerPhase", config.maxRetriesPerPhase);
  assertPositiveInteger("chapterBatchSize", config.chapterBatchSize);
  assertPositiveInteger("maxRevisionCycles", config.maxRevisionCycles);

  if (!Number.isInteger(config.qualityThreshold) || config.qualityThreshold < 1 || config.qualityThreshold > 100) {
    throw new Error("qualityThreshold must be between 1 and 100.");
  }

  if (config.researchDepth !== "standard" && config.researchDepth !== "deep") {
    throw new Error("researchDepth must be standard or deep.");
  }

  if (typeof config.independentEvaluationPass !== "boolean") {
    throw new Error("independentEvaluationPass must be a boolean.");
  }

  if (!VALID_BOOK_MODES.has(config.bookMode)) {
    throw new Error("bookMode must be one of fiction, memoir, prescriptive-nonfiction, narrative-nonfiction, or childrens.");
  }

  if (config.genrePreset !== undefined) {
    if (typeof config.genrePreset !== "string" || !VALID_GENRE_PRESETS.includes(config.genrePreset.trim() as (typeof VALID_GENRE_PRESETS)[number])) {
      throw new Error(`genrePreset must be one of ${VALID_GENRE_PRESETS.join(", ")}.`);
    }
    config.genrePreset = config.genrePreset.trim();
  }

  if (typeof config.storyBibleEnabled !== "boolean") {
    throw new Error("storyBibleEnabled must be a boolean.");
  }

  if (!Array.isArray(config.approvalPhases)) {
    throw new Error("approvalPhases must be an array of phase names.");
  }

  for (const phase of config.approvalPhases) {
    if (!["kickoff", "research", "foundation", "write", "evaluate", "revise", "deliver"].includes(phase)) {
      throw new Error("approvalPhases must contain only valid phase names.");
    }
  }

  assertPositiveInteger("sampleChaptersForApproval", config.sampleChaptersForApproval);

  if (!Array.isArray(config.exportFormats) || config.exportFormats.length === 0) {
    throw new Error("exportFormats must be a non-empty array.");
  }

  for (const format of config.exportFormats) {
    if (!VALID_EXPORT_FORMATS.has(format)) {
      throw new Error("exportFormats must contain only md, docx, or epub.");
    }
  }

  if (config.targetWordCount !== undefined) {
    assertPositiveInteger("targetWordCount", config.targetWordCount);
  }

  if (typeof config.gitAutoInit !== "boolean" || typeof config.gitAutoCommit !== "boolean") {
    throw new Error("gitAutoInit and gitAutoCommit must be booleans.");
  }

  if (!Array.isArray(config.gitCommitPaths) || config.gitCommitPaths.length === 0) {
    throw new Error("gitCommitPaths must be a non-empty array of relative paths.");
  }

  for (const entry of config.gitCommitPaths) {
    if (typeof entry !== "string" || !entry.trim()) {
      throw new Error("gitCommitPaths must be a non-empty array of relative paths.");
    }
    assertRelativePath(entry.trim());
  }

  config.gitCommitPaths = config.gitCommitPaths.map((entry) => entry.trim());
  config.approvalPhases = config.approvalPhases.map((entry) => entry.trim()) as RunConfig["approvalPhases"];
  config.exportFormats = config.exportFormats.map((entry) => entry.trim()) as RunConfig["exportFormats"];
  config.kdp = normalizeKdpConfig(value.kdp);
  config.promotion = normalizePromotionConfig(value.promotion);
  config.style = normalizeStyleConfig(value.style);
  config.sceneMap = normalizeSceneMapConfig(value.sceneMap);
  config.critiquePanel = normalizeCritiquePanelConfig(value.critiquePanel);
  config.sourceAudit = normalizeSourceAuditConfig(value.sourceAudit);
  config.launchKit = normalizeLaunchKitConfig(value.launchKit);
  config.bookMatter = normalizeBookMatterConfig(value.bookMatter);
  config.coverCheck = normalizeCoverCheckConfig(value.coverCheck);
  config.revisionPlan = normalizeRevisionPlanConfig(value.revisionPlan);
  config.archive = normalizeArchiveConfig(value.archive);

  return config;
}

export function loadRunConfig(workspaceRoot: string, configPath?: string) {
  const resolvedPath = configPath
    ? path.resolve(workspaceRoot, configPath)
    : path.join(workspaceRoot, "book-genesis.config.json");

  if (!existsSync(resolvedPath)) {
    return DEFAULT_RUN_CONFIG;
  }

  const parsed = JSON.parse(readFileSync(resolvedPath, "utf8")) as Partial<RunConfig>;
  return normalizeRunConfig(parsed);
}
