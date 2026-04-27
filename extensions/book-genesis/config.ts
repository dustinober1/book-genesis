import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { RunConfig } from "./types.js";

export const DEFAULT_RUN_CONFIG: RunConfig = {
  maxRetriesPerPhase: 1,
  chapterBatchSize: 3,
  qualityThreshold: 85,
  maxRevisionCycles: 2,
  researchDepth: "standard",
  bookMode: "fiction",
  storyBibleEnabled: true,
  approvalPhases: [],
  sampleChaptersForApproval: 3,
  exportFormats: ["md", "docx", "epub"],
  gitAutoInit: true,
  gitAutoCommit: true,
  gitCommitPaths: ["book-projects"],
};

const VALID_BOOK_MODES = new Set<RunConfig["bookMode"]>([
  "fiction",
  "memoir",
  "prescriptive-nonfiction",
  "narrative-nonfiction",
  "childrens",
]);

const VALID_EXPORT_FORMATS = new Set<RunConfig["exportFormats"][number]>(["md", "docx", "epub"]);

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

function normalizeConfig(value: Partial<RunConfig>): RunConfig {
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

  if (!VALID_BOOK_MODES.has(config.bookMode)) {
    throw new Error("bookMode must be one of fiction, memoir, prescriptive-nonfiction, narrative-nonfiction, or childrens.");
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
  return normalizeConfig(parsed);
}
