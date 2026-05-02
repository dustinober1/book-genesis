import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { ClaimLink, HealthCheckResult, RunState, SourceConfidence } from "./types.js";
import { writeJson, writeMarkdown } from "./run-files.js";

export interface AddVaultSourceInput {
  title: string;
  url?: string;
  summary: string;
  confidence: SourceConfidence;
  excerpt?: string;
}

export interface LinkClaimInput {
  claim: string;
  sourceIds: string[];
  confidence: SourceConfidence;
  location?: string;
}

export interface VaultSource extends AddVaultSourceInput {
  id: string;
  addedAt: string;
}

export interface SourceVaultReport {
  generatedAt: string;
  runId: string;
  sources: VaultSource[];
  claimLinks: ClaimLink[];
  bibliography: string[];
}

function vaultPath(run: RunState) {
  return path.join(run.rootDir, "research", "source-vault.json");
}

function shortHash(value: string) {
  return createHash("sha1").update(value).digest("hex").slice(0, 10);
}

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "source";
}

function readVault(run: RunState): SourceVaultReport {
  if (!existsSync(vaultPath(run))) {
    return {
      generatedAt: new Date().toISOString(),
      runId: run.id,
      sources: [],
      claimLinks: [],
      bibliography: [],
    };
  }
  const parsed = JSON.parse(readFileSync(vaultPath(run), "utf8")) as Partial<SourceVaultReport>;
  return {
    generatedAt: parsed.generatedAt ?? new Date().toISOString(),
    runId: parsed.runId ?? run.id,
    sources: parsed.sources ?? [],
    claimLinks: parsed.claimLinks ?? [],
    bibliography: parsed.bibliography ?? [],
  };
}

function bibliographyFor(source: VaultSource) {
  return source.url ? `${source.title}. ${source.url}.` : source.title;
}

function writeVault(run: RunState, report: SourceVaultReport) {
  const next = {
    ...report,
    generatedAt: new Date().toISOString(),
    runId: run.id,
    bibliography: report.sources.map(bibliographyFor),
  };
  writeJson(vaultPath(run), next);
  return next;
}

export function buildSourceVault(run: RunState): SourceVaultReport {
  const report = readVault(run);
  return {
    ...report,
    generatedAt: new Date().toISOString(),
    runId: run.id,
    bibliography: report.sources.map(bibliographyFor),
  };
}

export function addVaultSource(run: RunState, input: AddVaultSourceInput): VaultSource {
  if (!input.title.trim()) {
    throw new Error("Source title is required.");
  }
  if (!input.summary.trim()) {
    throw new Error("Source summary is required.");
  }
  const report = readVault(run);
  const id = `src_${slug(input.title)}_${shortHash(`${input.title}|${input.url ?? ""}`)}`;
  const source: VaultSource = {
    id,
    title: input.title.trim(),
    url: input.url?.trim() || undefined,
    summary: input.summary.trim(),
    confidence: input.confidence,
    excerpt: input.excerpt?.trim() || undefined,
    addedAt: new Date().toISOString(),
  };
  const sources = [source, ...report.sources.filter((entry) => entry.id !== id)];
  writeVault(run, { ...report, sources });
  return source;
}

export function linkClaimToSources(run: RunState, input: LinkClaimInput): ClaimLink {
  if (!input.claim.trim()) {
    throw new Error("Claim text is required.");
  }
  if (input.sourceIds.length === 0) {
    throw new Error("At least one source id is required.");
  }
  const report = readVault(run);
  const knownSources = new Set(report.sources.map((source) => source.id));
  const missing = input.sourceIds.filter((sourceId) => !knownSources.has(sourceId));
  if (missing.length > 0) {
    throw new Error(`Unknown source id(s): ${missing.join(", ")}`);
  }
  const claim: ClaimLink = {
    claimId: `claim_${shortHash(`${input.claim}|${input.sourceIds.join(",")}`)}`,
    claim: input.claim.trim(),
    sourceIds: input.sourceIds,
    confidence: input.confidence,
    location: input.location?.trim() || undefined,
  };
  const claimLinks = [claim, ...report.claimLinks.filter((entry) => entry.claimId !== claim.claimId)];
  writeVault(run, { ...report, claimLinks });
  return claim;
}

export function formatSourceVault(report: SourceVaultReport) {
  return [
    "# Source Vault",
    "",
    `- Run: ${report.runId}`,
    `- Sources: ${report.sources.length}`,
    `- Claim links: ${report.claimLinks.length}`,
    "",
    "## Sources",
    ...(report.sources.length
      ? report.sources.map((source) => `- ${source.id}: ${source.title} [${source.confidence}]${source.url ? ` - ${source.url}` : ""}\n  ${source.summary}`)
      : ["- none"]),
    "",
    "## Claim Links",
    ...(report.claimLinks.length
      ? report.claimLinks.map((claim) => `- ${claim.claimId} [${claim.confidence}] ${claim.claim}\n  Sources: ${claim.sourceIds.join(", ")}${claim.location ? `\n  Location: ${claim.location}` : ""}`)
      : ["- none"]),
    "",
    "## Bibliography Draft",
    ...(report.bibliography.length ? report.bibliography.map((entry) => `- ${entry}`) : ["- none"]),
    "",
  ].join("\n");
}

export function writeSourceVault(run: RunState) {
  const report = buildSourceVault(run);
  const jsonPath = writeJson(vaultPath(run), report);
  const markdownPath = writeMarkdown(path.join(run.rootDir, "research", "source-vault.md"), formatSourceVault(report));
  return { report, jsonPath, markdownPath };
}

function confidenceRank(value: SourceConfidence) {
  return value === "high" ? 3 : value === "medium" ? 2 : 1;
}

export function sourceVaultReadiness(run: RunState): HealthCheckResult[] {
  if (!run.config.sourceVault.enabled) {
    return [{ ok: true, severity: "info", code: "source_vault_disabled", message: "Source vault is disabled for this run." }];
  }
  const report = buildSourceVault(run);
  const required = run.config.sourceVault.requireClaimLinksForNonfiction
    && (run.config.bookMode === "memoir" || run.config.bookMode.includes("nonfiction"));
  if (!required) {
    return [{ ok: true, severity: "info", code: "source_vault_optional", message: "Source vault is optional for this book mode." }];
  }
  const minimum = confidenceRank(run.config.sourceVault.minConfidenceForFinal);
  const supported = report.claimLinks.filter((claim) => confidenceRank(claim.confidence) >= minimum).length;
  return supported > 0
    ? [{ ok: true, severity: "info", code: "source_vault_claim_links_present", message: `${supported} claim link(s) meet source-vault confidence requirements.` }]
    : [{
        ok: false,
        severity: "error",
        code: "source_vault_claim_links_missing",
        message: "No source-vault claim links meet the configured confidence requirement.",
        remedy: "Run /book-genesis source-vault add, then /book-genesis source-vault claim.",
      }];
}
