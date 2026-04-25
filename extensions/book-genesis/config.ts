import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { RunConfig } from "./types.js";

export const DEFAULT_RUN_CONFIG: RunConfig = {
  maxRetriesPerPhase: 1,
  chapterBatchSize: 3,
  qualityThreshold: 85,
  maxRevisionCycles: 2,
  researchDepth: "standard",
  gitAutoInit: true,
  gitAutoCommit: true,
  gitCommitPaths: ["book-projects"],
};

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
