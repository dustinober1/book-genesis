import { existsSync } from "node:fs";
import path from "node:path";

import type { HealthCheckResult, MetadataScore, MetadataVariant, RunState } from "./types.js";
import { plainText, readOptional, writeJson, writeMarkdown } from "./run-files.js";

const PROHIBITED_CLAIMS = /\b(best[- ]?selling|guaranteed|free|limited time|\$|#1)\b/i;
const VAGUE_TERMS = /\b(amazing|incredible|unforgettable|powerful|journey|story)\b/i;

export interface MetadataLabReport {
  generatedAt: string;
  runId: string;
  title: string;
  positioning: {
    genre: string | null;
    audience: string | null;
    promise: string | null;
    logline: string | null;
  };
  subtitleOptions: MetadataVariant[];
  descriptionOptions: MetadataVariant[];
  keywordChains: MetadataVariant[];
  categories: MetadataVariant[];
  scorecard: {
    bestSubtitle: MetadataVariant;
    bestDescription: MetadataVariant;
    bestKeywordChain: MetadataVariant;
    bestCategory: MetadataVariant;
  };
}

function clean(value: string | undefined | null) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function readDelivery(run: RunState, name: string) {
  return plainText(readOptional(path.join(run.rootDir, "delivery", name)));
}

function unique(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    const normalized = clean(value);
    const key = normalized.toLowerCase();
    if (!normalized || seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(normalized);
  }
  return result;
}

function terms(run: RunState) {
  return unique([
    run.kickoff?.genre,
    run.kickoff?.targetReader,
    run.kickoff?.promise,
    run.config.audience,
    run.config.tone,
    readDelivery(run, "logline.md"),
    readDelivery(run, "synopsis.md"),
    readDelivery(run, "package-summary.md"),
    run.idea,
    ...run.config.kdp.keywords,
    ...run.config.kdp.categories,
  ].filter((value): value is string => Boolean(value?.trim())));
}

function wordSet(values: string[]) {
  return new Set(values.join(" ").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3));
}

function clamp(value: number, max: number) {
  return Math.max(0, Math.min(max, Math.round(value)));
}

function scoreValue(run: RunState, value: string, priorValues: string[] = []): MetadataScore {
  const sourceTerms = wordSet(terms(run));
  const candidateWords = value.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  const concreteWords = candidateWords.filter((word) => word.length > 5).length;
  const matched = candidateWords.filter((word) => sourceTerms.has(word)).length;
  const duplicate = priorValues.some((prior) => prior.toLowerCase() === value.toLowerCase());
  const configuredKeywords = run.config.kdp.keywords.join(" ").toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length > 3);
  const keywordHits = candidateWords.filter((word) => configuredKeywords.includes(word)).length;

  const clarity = clamp((concreteWords / Math.max(3, candidateWords.length)) * 25 - (VAGUE_TERMS.test(value) ? 8 : 0), 25);
  const marketFit = clamp(matched * 6, 25);
  const keywordCoverage = clamp(keywordHits * 6, 20);
  const differentiation = duplicate ? 4 : clamp(20 - Math.max(0, value.length - 180) / 12, 20);
  const compliance = PROHIBITED_CLAIMS.test(value) || value.length > 4000 ? 0 : 10;

  return {
    clarity,
    marketFit,
    keywordCoverage,
    differentiation,
    compliance,
    total: clarity + marketFit + keywordCoverage + differentiation + compliance,
  };
}

function variant(kind: MetadataVariant["kind"], value: string, rationale: string, run: RunState, prior: string[] = []): MetadataVariant {
  return {
    kind,
    value,
    rationale,
    score: scoreValue(run, value, prior),
  };
}

function best(values: MetadataVariant[]) {
  return [...values].sort((a, b) => b.score.total - a.score.total)[0];
}

function subtitleOptions(run: RunState) {
  const genre = clean(run.kickoff?.genre || run.config.genrePreset || run.config.bookMode.replace(/-/g, " "));
  const promise = clean(run.kickoff?.promise || readDelivery(run, "logline.md") || run.idea);
  const audience = clean(run.kickoff?.targetReader || run.config.audience || "serious readers");
  const base = unique([
    `A ${genre} for ${audience}`,
    `${promise.slice(0, 90)}`,
    `A novel of ${genre} and consequence`,
    `A ${run.config.bookMode.replace(/-/g, " ")} about ${promise.slice(0, 70)}`,
    `${genre} for readers who want ${promise.slice(0, 70)}`,
  ]).slice(0, run.config.metadataLab.maxSubtitleOptions);

  return base.map((value, index) => variant("subtitle", value, index === 0 ? "Directly names genre and reader fit." : "Tests an alternate marketplace hook.", run, base.slice(0, index)));
}

function descriptionOptions(run: RunState) {
  const logline = readDelivery(run, "logline.md") || run.kickoff?.promise || run.idea;
  const synopsis = readDelivery(run, "synopsis.md") || readDelivery(run, "package-summary.md") || logline;
  const audience = clean(run.kickoff?.targetReader || run.config.audience || "readers");
  const values = unique([
    `${logline}\n\nBuilt for ${audience}, this book delivers ${clean(run.kickoff?.promise || "a clear reader promise")}.`,
    `${synopsis}\n\nFor ${audience}, the appeal is the pressure of the premise and the payoff promised in the package copy.`,
    `${run.title} is a ${run.config.bookMode.replace(/-/g, " ")} shaped around ${logline}`,
  ]).slice(0, run.config.metadataLab.maxDescriptionOptions);

  return values.map((value, index) => variant("description", value, index === 0 ? "Uses the strongest available logline as the opening hook." : "Offers a different description angle.", run, values.slice(0, index)));
}

function keywordChains(run: RunState) {
  const seeds = run.config.kdp.keywords.length
    ? run.config.kdp.keywords
    : terms(run).flatMap((value) => value.split(/[.;,]/)).map(clean).filter(Boolean);
  const values = unique([
    ...seeds,
    `${run.config.bookMode.replace(/-/g, " ")} ${clean(run.kickoff?.genre || "book")}`,
    `${clean(run.kickoff?.targetReader || run.config.audience || "reader")} ${clean(run.kickoff?.genre || "fiction")}`,
    `${clean(run.kickoff?.promise || run.idea).split(" ").slice(0, 3).join(" ")} book`,
  ]).slice(0, run.config.metadataLab.maxKeywordChains);

  return values.map((value, index) => variant("keyword-chain", value, "Keyword chain candidate for one KDP keyword slot.", run, values.slice(0, index)));
}

function categoryOptions(run: RunState) {
  const values = unique([
    ...run.config.kdp.categories,
    run.config.bookMode === "fiction" ? "Fiction / Thrillers / Technological" : "",
    run.config.bookMode.includes("nonfiction") ? "Nonfiction / Writing / Authorship" : "",
    run.config.bookMode === "memoir" ? "Biography & Autobiography / Personal Memoirs" : "",
    run.config.bookMode === "childrens" ? "Juvenile Fiction / Concepts / General" : "",
  ]);
  const safeValues = values.length ? values : ["Fiction / General"];
  return safeValues.map((value, index) => variant("category", value, "Category candidate to validate during KDP setup.", run, safeValues.slice(0, index)));
}

export function buildMetadataLab(run: RunState): MetadataLabReport {
  const subtitles = subtitleOptions(run);
  const descriptions = descriptionOptions(run);
  const keywords = keywordChains(run);
  const categories = categoryOptions(run);

  return {
    generatedAt: new Date().toISOString(),
    runId: run.id,
    title: run.title,
    positioning: {
      genre: clean(run.kickoff?.genre) || null,
      audience: clean(run.kickoff?.targetReader || run.config.audience) || null,
      promise: clean(run.kickoff?.promise) || null,
      logline: readDelivery(run, "logline.md") || null,
    },
    subtitleOptions: subtitles,
    descriptionOptions: descriptions,
    keywordChains: keywords,
    categories,
    scorecard: {
      bestSubtitle: best(subtitles),
      bestDescription: best(descriptions),
      bestKeywordChain: best(keywords),
      bestCategory: best(categories),
    },
  };
}

function formatVariantList(title: string, values: MetadataVariant[]) {
  return [
    `## ${title}`,
    "",
    ...values.map((item, index) => [
      `### ${index + 1}. ${item.value}`,
      "",
      `- Score: ${item.score.total}`,
      `- Rationale: ${item.rationale}`,
    ].join("\n")),
    "",
  ].join("\n");
}

export function formatMetadataLab(report: MetadataLabReport) {
  return [
    "# Marketplace Metadata Lab",
    "",
    `- Run: ${report.runId}`,
    `- Title: ${report.title}`,
    `- Best subtitle: ${report.scorecard.bestSubtitle.value}`,
    `- Best description score: ${report.scorecard.bestDescription.score.total}`,
    `- Best keyword chain: ${report.scorecard.bestKeywordChain.value}`,
    `- Best category: ${report.scorecard.bestCategory.value}`,
    "",
    formatVariantList("Subtitle Options", report.subtitleOptions),
    formatVariantList("Description Options", report.descriptionOptions),
    formatVariantList("Keyword Chains", report.keywordChains),
    formatVariantList("Categories", report.categories),
  ].join("\n");
}

export function writeMetadataLab(run: RunState) {
  const report = buildMetadataLab(run);
  const dir = path.join(run.rootDir, "delivery", "metadata-lab");
  const jsonPath = writeJson(path.join(dir, "metadata-scorecard.json"), report);
  const markdownPath = writeMarkdown(path.join(dir, "metadata-lab.md"), formatMetadataLab(report));
  writeMarkdown(path.join(dir, "subtitles.md"), formatVariantList("Subtitle Options", report.subtitleOptions));
  writeMarkdown(path.join(dir, "descriptions.md"), formatVariantList("Description Options", report.descriptionOptions));
  writeMarkdown(path.join(dir, "keyword-chains.md"), formatVariantList("Keyword Chains", report.keywordChains));
  writeMarkdown(path.join(dir, "categories.md"), formatVariantList("Categories", report.categories));
  return { report, jsonPath, markdownPath };
}

export function metadataLabReady(run: RunState): HealthCheckResult[] {
  if (!run.config.metadataLab.enabled) {
    return [{ ok: true, severity: "info", code: "metadata_lab_disabled", message: "Metadata lab is disabled for this run." }];
  }

  const scorecardPath = path.join(run.rootDir, "delivery", "metadata-lab", "metadata-scorecard.json");
  return existsSync(scorecardPath)
    ? [{ ok: true, severity: "info", code: "metadata_lab_present", message: "Marketplace metadata lab scorecard is present." }]
    : [{
        ok: !run.config.metadataLab.requiredForKdp,
        severity: run.config.metadataLab.requiredForKdp ? "error" : "warning",
        code: "metadata_lab_missing",
        message: "Marketplace metadata lab has not been generated.",
        remedy: "Run /book-genesis metadata-lab.",
      }];
}
