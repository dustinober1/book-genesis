import { existsSync, writeFileSync } from "node:fs";
import path from "node:path";

import { DEFAULT_RUN_CONFIG, VALID_GENRE_PRESETS, normalizeRunConfig } from "./config.js";
import type { BookMode, RunConfig } from "./types.js";

export const STARTER_CONFIG_MODES: BookMode[] = ["fiction", "memoir", "prescriptive-nonfiction", "narrative-nonfiction", "childrens"];

export function buildStarterConfig(mode: BookMode, genrePreset?: string): RunConfig {
  if (!STARTER_CONFIG_MODES.includes(mode)) {
    throw new Error(`Unsupported mode "${mode}". Use one of: ${STARTER_CONFIG_MODES.join(", ")}.`);
  }
  if (genrePreset && !VALID_GENRE_PRESETS.includes(genrePreset as any)) {
    throw new Error(`Unsupported genre preset "${genrePreset}". Use one of: ${VALID_GENRE_PRESETS.join(", ")}.`);
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
  const base = normalizeRunConfig({
    ...common,
    ...tuned,
    genrePreset,
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

  switch (genrePreset) {
    case "thriller":
      return normalizeRunConfig({ ...base, targetWordCount: 85000, approvalPhases: ["foundation", "write"], promotion: { ...base.promotion, shortStoryEnabled: true } });
    case "memoir":
      return normalizeRunConfig({ ...base, bookMode: "memoir", targetWordCount: 65000, researchDepth: "deep", sourceAudit: { ...base.sourceAudit, enabled: true } });
    case "business":
      return normalizeRunConfig({ ...base, targetWordCount: 55000, researchDepth: "deep", bookMode: "prescriptive-nonfiction", sourceAudit: { ...base.sourceAudit, enabled: true } });
    case "devotional":
      return normalizeRunConfig({ ...base, targetWordCount: 40000, researchDepth: "deep", sourceAudit: { ...base.sourceAudit, enabled: true }, bookMatter: { ...base.bookMatter, backMatter: ["author-note", "newsletter-cta"] } });
    case "childrens-picture-book":
      return normalizeRunConfig({ ...base, bookMode: "childrens", targetWordCount: 1000, exportFormats: ["md", "docx"], sampleChaptersForApproval: 1 });
    case "middle-grade":
      return normalizeRunConfig({ ...base, targetWordCount: 45000, approvalPhases: ["foundation", "write"] });
    case "romantasy":
      return normalizeRunConfig({ ...base, targetWordCount: 95000, approvalPhases: ["foundation", "write"], promotion: { ...base.promotion, shortStoryEnabled: true, shortStoryPurpose: "world-teaser" } });
    default:
      return base;
  }
}

export function writeStarterConfig(workspaceRoot: string, mode: BookMode, force = false, genrePreset?: string) {
  const configPath = path.join(workspaceRoot, "book-genesis.config.json");
  const guidePath = path.join(workspaceRoot, "book-genesis.config.guide.md");
  if (existsSync(configPath) && !force) {
    throw new Error(`Refusing to overwrite ${configPath}. Re-run with --force to replace it.`);
  }
  const config = buildStarterConfig(mode, genrePreset);
  writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  writeFileSync(guidePath, [
    `# Book Genesis ${mode}${genrePreset ? ` / ${genrePreset}` : ""} Starter Config`,
    "",
    "JSON does not support comments, so this guide explains the adjacent config file.",
    "",
    "- Set `kdp.authorName`, `kdp.description`, keywords, and categories before publishing.",
    "- Tune `targetWordCount`, `audience`, and `tone` before starting a serious run.",
    "- Existing runs are migration-safe; new nested feature config falls back to defaults.",
  ].join("\n"), "utf8");
  return { config, configPath, guidePath };
}
