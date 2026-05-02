import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { ClaimEntry, HealthCheckResult, RunLedger, RunState, SourceAuditReport } from "./types.js";
import { listChapterFiles, plainText, readManuscript, writeJson, writeMarkdown } from "./run-files.js";
import { buildSourceVault } from "./source-vault.js";

function readLedger(run: RunState): RunLedger {
  if (!existsSync(run.ledgerPath)) {
    return { sources: [], decisions: [] };
  }
  return JSON.parse(readFileSync(run.ledgerPath, "utf8")) as RunLedger;
}

function classifyClaim(text: string): ClaimEntry["claimType"] {
  if (/%|\b\d+(?:,\d{3})*(?:\.\d+)?\b/.test(text)) return "statistic";
  if (/\b(18|19|20)\d{2}\b/.test(text)) return "historical";
  if (/\b(medical|clinical|diagnosis|therapy|disease|symptom)\b/i.test(text)) return "medical";
  if (/\b(legal|law|lawsuit|contract|liability)\b/i.test(text)) return "legal";
  if (/\b(financial|investment|tax|revenue|profit)\b/i.test(text)) return "financial";
  return "general";
}

function detectClaims(run: RunState): ClaimEntry[] {
  const chapters = listChapterFiles(run);
  const paragraphs = chapters.length
    ? chapters.flatMap((chapter) => plainText(chapter.markdown).split(/(?<=[.!?])\s+/).map((claim) => ({ chapter: chapter.title, claim })))
    : plainText(readManuscript(run)).split(/(?<=[.!?])\s+/).map((claim) => ({ chapter: undefined, claim }));
  return paragraphs
    .map((entry) => ({ ...entry, claim: entry.claim.trim() }))
    .filter((entry) => entry.claim.length > 30 && (/%|\b(18|19|20)\d{2}\b|\bstudies?\b|\bresearch\b|\bmedical\b|\blegal\b|\bfinancial\b/i.test(entry.claim)))
    .map((entry, index): ClaimEntry => {
      const claimType = run.config.bookMode === "memoir" && /\b(I|we|my|our)\b/.test(entry.claim) ? "memoir" : classifyClaim(entry.claim);
      return {
        id: `claim-${String(index + 1).padStart(3, "0")}`,
        chapter: entry.chapter,
        claim: entry.claim,
        claimType,
        sourceTitles: [],
        supportLevel: claimType === "memoir" ? "not-required" : "missing",
        risk: claimType === "medical" || claimType === "legal" || claimType === "financial" || claimType === "statistic" ? "high" : "medium",
        suggestedFix: claimType === "memoir" ? "Confirm memory framing is clear." : "Add a source ledger entry or soften the unsupported claim.",
      };
    });
}

export function buildSourceAudit(run: RunState): SourceAuditReport {
  const ledger = readLedger(run);
  const claims = detectClaims(run);
  const sourceText = ledger.sources.map((source) => `${source.title} ${source.summary}`).join(" ").toLowerCase();
  const vault = buildSourceVault(run);
  for (const claim of claims) {
    if (claim.supportLevel === "not-required") continue;
    const linked = vault.claimLinks.find((entry) => entry.claim.toLowerCase().includes(claim.claim.slice(0, 40).toLowerCase()) || claim.claim.toLowerCase().includes(entry.claim.slice(0, 40).toLowerCase()));
    if (linked) {
      claim.supportLevel = linked.confidence === "high" ? "strong" : "partial";
      claim.sourceTitles = vault.sources.filter((source) => linked.sourceIds.includes(source.id)).map((source) => source.title);
      claim.risk = linked.confidence === "high" ? "low" : "medium";
      continue;
    }
    const terms = claim.claim.toLowerCase().split(/\W+/).filter((term) => term.length > 5).slice(0, 8);
    const hits = terms.filter((term) => sourceText.includes(term)).length;
    if (hits >= 2) {
      claim.supportLevel = "partial";
      claim.sourceTitles = ledger.sources.map((source) => source.title).slice(0, 3);
      claim.risk = claim.risk === "high" ? "medium" : "low";
    }
  }
  const required = run.config.sourceAudit.requiredForModes.includes(run.config.bookMode);
  const findings: HealthCheckResult[] = [];
  const unsupported = claims.filter((claim) => claim.supportLevel === "missing" && claim.risk !== "low");
  if (required && unsupported.length > 0) {
    findings.push({ ok: false, severity: "warning", code: "unsupported_claims", message: `${unsupported.length} high/medium-risk claim(s) need stronger source support.`, remedy: "Record sources with /book-genesis source add or revise unsupported claims." });
  } else {
    findings.push({ ok: true, severity: "info", code: "source_audit_ready", message: required ? "Source audit completed for required mode." : "Source audit is optional for this mode." });
  }
  return { generatedAt: new Date().toISOString(), runId: run.id, mode: run.config.bookMode, claims, findings };
}

export function writeSourceAudit(run: RunState) {
  const report = buildSourceAudit(run);
  const jsonPath = writeJson(path.join(run.rootDir, "evaluations", "source-audit.json"), report);
  const mdPath = writeMarkdown(path.join(run.rootDir, "evaluations", "source-audit.md"), [
    `# Source Audit for ${run.id}`,
    "",
    ...report.findings.map((finding) => `- [${finding.severity.toUpperCase()}] ${finding.code}: ${finding.message}`),
    "",
    "## Claims",
    ...(report.claims.length ? report.claims.map((claim) => `- ${claim.id} [${claim.risk}/${claim.supportLevel}] ${claim.claim}`) : ["- none detected"]),
  ].join("\n"));
  const coveragePath = writeMarkdown(path.join(run.rootDir, "research", "source-coverage-map.md"), [
    "# Source Coverage Map",
    "",
    ...(report.claims.length ? report.claims.map((claim) => `- ${claim.id}: ${claim.sourceTitles.join(", ") || claim.supportLevel}`) : ["- No claims detected."]),
  ].join("\n"));
  return { report, jsonPath, mdPath, coveragePath };
}
