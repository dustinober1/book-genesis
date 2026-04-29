import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";

import { DEFAULT_RUN_CONFIG, normalizeRunConfig } from "./config.js";
import type { BookMode, RunConfig } from "./types.js";

export const STARTER_CONFIG_MODES: BookMode[] = ["fiction", "memoir", "prescriptive-nonfiction", "narrative-nonfiction", "childrens"];

export function buildStarterConfig(mode: BookMode): RunConfig {
  if (!STARTER_CONFIG_MODES.includes(mode)) {
    throw new Error(`Unsupported mode "${mode}". Use one of: ${STARTER_CONFIG_MODES.join(", ")}.`);
  }
  const common = { ...DEFAULT_RUN_CONFIG, bookMode: mode };
  const tuned: Partial<RunConfig> =
    mode === "childrens"
      ? { targetWordCount: 1200, exportFormats: ["md", "docx"], sampleChaptersForApproval: 1 }
      : mode === "fiction"
        ? { targetWordCount: 80000, approvalPhases: ["foundation", "write"] }
        : mode === "memoir"
          ? { targetWordCount: 65000, researchDepth: "deep", approvalPhases: ["foundation", "write"], sourceAudit: { ...DEFAULT_RUN_CONFIG.sourceAudit, enabled: true } }
          : { targetWordCount: 60000, researchDepth: "deep", independentEvaluationPass: true, sourceAudit: { ...DEFAULT_RUN_CONFIG.sourceAudit, enabled: true } };
  return normalizeRunConfig({
    ...common,
    ...tuned,
    kdp: {
      ...DEFAULT_RUN_CONFIG.kdp,
      authorName: "TODO Author Name",
      trimSize: mode === "childrens" ? "8 x 10" : "6 x 9",
      keywords: [],
      categories: [],
    },
    promotion: {
      ...DEFAULT_RUN_CONFIG.promotion,
      shortStoryEnabled: mode === "fiction",
    },
    bookMatter: {
      ...DEFAULT_RUN_CONFIG.bookMatter,
      backMatter: mode === "childrens" ? ["author-note"] : DEFAULT_RUN_CONFIG.bookMatter.backMatter,
    },
  });
}

export function writeStarterConfig(workspaceRoot: string, mode: BookMode, force = false) {
  const configPath = path.join(workspaceRoot, "book-genesis.config.json");
  const guidePath = path.join(workspaceRoot, "book-genesis.config.guide.md");
  if (existsSync(configPath) && !force) {
    throw new Error(`Refusing to overwrite ${configPath}. Re-run with --force to replace it.`);
  }
  const config = buildStarterConfig(mode);
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  writeFileSync(guidePath, [
    `# Book Genesis ${mode} Starter Config`,
    "",
    "JSON does not support comments, so this guide explains the adjacent config file.",
    "",
    "- Set `kdp.authorName`, `kdp.description`, keywords, and categories before publishing.",
    "- Tune `targetWordCount`, `audience`, and `tone` before starting a serious run.",
    "- Existing runs are migration-safe; new nested feature config falls back to defaults.",
  ].join("\n"), "utf8");
  return { config, configPath, guidePath };
}
