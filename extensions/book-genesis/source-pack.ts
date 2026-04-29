import { existsSync } from "node:fs";
import path from "node:path";

import { readLedger, recordSource } from "./ledger.js";
import { buildSourceAudit } from "./source-audit.js";
import type { HealthCheckResult, RunState } from "./types.js";
import { writeJson, writeMarkdown } from "./run-files.js";

export interface SourcePack {
  generatedAt: string;
  runId: string;
  required: boolean;
  sources: ReturnType<typeof readLedger>["sources"];
  claimCount: number;
  supportedClaimCount: number;
  gaps: HealthCheckResult[];
}

export function sourcePackPath(run: RunState) {
  return path.join(run.rootDir, "research", "source-pack.json");
}

export function sourcePackExists(run: RunState) {
  return existsSync(sourcePackPath(run));
}

export function addSourceToLedger(run: RunState, input: { title: string; summary: string; url?: string; usefulness?: string }) {
  const title = input.title.trim();
  const summary = input.summary.trim();
  if (!title || !summary) {
    throw new Error("Source title and summary are required.");
  }
  recordSource(run, {
    phase: run.currentPhase,
    title,
    url: input.url?.trim() || undefined,
    summary,
    usefulness: input.usefulness?.trim() || "Supports source-first planning and claim coverage.",
  });
}

export function buildSourcePack(run: RunState): SourcePack {
  const ledger = readLedger(run);
  const audit = buildSourceAudit(run);
  const required = run.config.sourceAudit.requiredForModes.includes(run.config.bookMode);
  const supportedClaimCount = audit.claims.filter((claim) => claim.supportLevel === "partial" || claim.supportLevel === "strong" || claim.supportLevel === "not-required").length;
  const gaps: HealthCheckResult[] = [];

  if (required && ledger.sources.length === 0) {
    gaps.push({
      ok: false,
      severity: "error",
      code: "source_pack_empty",
      message: "Source pack is required for this mode but no sources are recorded.",
      remedy: "Run /book-genesis source add <title> --summary <summary>, then /book-genesis source-pack.",
    });
  }

  for (const finding of audit.findings.filter((item) => item.severity !== "info")) {
    gaps.push(finding);
  }

  return {
    generatedAt: new Date().toISOString(),
    runId: run.id,
    required,
    sources: ledger.sources,
    claimCount: audit.claims.length,
    supportedClaimCount,
    gaps,
  };
}

export function writeSourcePack(run: RunState) {
  const pack = buildSourcePack(run);
  const jsonPath = writeJson(sourcePackPath(run), pack);
  const mdPath = writeMarkdown(path.join(run.rootDir, "research", "source-pack.md"), [
    `# Source Pack for ${run.id}`,
    "",
    `- Required: ${pack.required ? "yes" : "no"}`,
    `- Sources: ${pack.sources.length}`,
    `- Claims detected: ${pack.claimCount}`,
    `- Supported/not-required claims: ${pack.supportedClaimCount}`,
    "",
    "## Sources",
    ...(pack.sources.length ? pack.sources.map((source) => `- ${source.title}${source.url ? ` (${source.url})` : ""}: ${source.summary}`) : ["- none"]),
    "",
    "## Gaps",
    ...(pack.gaps.length ? pack.gaps.map((gap) => `- [${gap.severity.toUpperCase()}] ${gap.code}: ${gap.message}`) : ["- none"]),
    "",
  ].join("\n"));
  const gapPlanPath = writeMarkdown(path.join(run.rootDir, "research", "source-gap-plan.md"), [
    "# Source Gap Plan",
    "",
    ...(pack.gaps.length ? pack.gaps.map((gap) => `- ${gap.remedy ?? gap.message}`) : ["- No source gaps detected."]),
    "",
  ].join("\n"));
  return { pack, jsonPath, mdPath, gapPlanPath };
}
