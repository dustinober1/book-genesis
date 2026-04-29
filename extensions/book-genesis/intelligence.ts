import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { ManuscriptIntelligenceFinding, ManuscriptIntelligenceReport, RunState, StoryBible } from "./types.js";

function markdownToPlainText(markdown: string) {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[*-]\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function readOptional(filePath: string) {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

function chapterFiles(run: RunState) {
  const dir = path.join(run.rootDir, "manuscript", "chapters");
  if (!existsSync(dir)) {
    return [];
  }
  return readdirSync(dir)
    .filter((entry) => entry.endsWith(".md"))
    .sort()
    .map((entry) => ({ name: entry, path: path.join(dir, entry), text: readFileSync(path.join(dir, entry), "utf8") }));
}

function readStoryBible(run: RunState): Partial<StoryBible> {
  const filePath = run.storyBibleJsonPath ?? path.join(run.rootDir, "foundation", "story-bible.json");
  if (!existsSync(filePath)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf8")) as Partial<StoryBible>;
  } catch {
    return {};
  }
}

function addFinding(
  findings: ManuscriptIntelligenceFinding[],
  severity: ManuscriptIntelligenceFinding["severity"],
  code: string,
  target: string,
  evidence: string,
  suggestedAction: string,
) {
  findings.push({ severity, code, target, evidence, suggestedAction });
}

function findRepeatedParagraphs(run: RunState, manuscript: string, findings: ManuscriptIntelligenceFinding[]) {
  const paragraphs = manuscript
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim().replace(/\s+/g, " "))
    .filter((chunk) => chunk.length >= 180 && !chunk.startsWith("#"));
  const seen = new Map<string, number>();
  for (const paragraph of paragraphs) {
    seen.set(paragraph, (seen.get(paragraph) ?? 0) + 1);
  }
  const repeated = [...seen.entries()].filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1])[0];
  if (repeated) {
    addFinding(
      findings,
      "warning",
      "repeated_passage",
      "manuscript/full-manuscript.md",
      `A long passage appears ${repeated[1]} times.`,
      "Remove accidental duplication or rewrite the repeated beat so it escalates instead of repeats.",
    );
  }
}

function findPromiseGaps(run: RunState, manuscriptText: string, findings: ManuscriptIntelligenceFinding[]) {
  const storyBible = readStoryBible(run);
  const promises = [
    run.kickoff?.promise,
    ...(run.kickoff?.successCriteria ?? []),
    ...(storyBible.promises ?? []),
  ].filter((value): value is string => Boolean(value?.trim()));

  for (const promise of promises) {
    const keyTerms = promise.toLowerCase().split(/\W+/).filter((word) => word.length > 5).slice(0, 4);
    const hits = keyTerms.filter((term) => manuscriptText.toLowerCase().includes(term));
    if (keyTerms.length > 0 && hits.length === 0) {
      addFinding(
        findings,
        "warning",
        "promise_missing",
        "manuscript/full-manuscript.md",
        `Promise may be unresolved: "${promise}".`,
        "Add an explicit setup or payoff for this reader promise, or remove the promise from positioning.",
      );
    }
  }
}

function findPacingVariance(run: RunState, findings: ManuscriptIntelligenceFinding[]) {
  const chapters = chapterFiles(run).map((chapter) => ({
    ...chapter,
    words: countWords(markdownToPlainText(chapter.text)),
  }));
  if (chapters.length < 2) {
    return;
  }
  const average = chapters.reduce((sum, chapter) => sum + chapter.words, 0) / chapters.length;
  const outliers = chapters.filter((chapter) => average > 0 && (chapter.words < average * 0.45 || chapter.words > average * 1.8));
  if (outliers.length > 0) {
    addFinding(
      findings,
      "info",
      "pacing_variance",
      "manuscript/chapters/",
      `Chapter word counts vary sharply. Average ${Math.round(average)} words; outliers: ${outliers.map((chapter) => `${chapter.name} (${chapter.words})`).join(", ")}.`,
      "Review whether the outlier chapters create intentional rhythm or need splitting, merging, or expansion.",
    );
  }
}

function findMissingBriefs(run: RunState, findings: ManuscriptIntelligenceFinding[]) {
  const chapterDir = path.join(run.rootDir, "manuscript", "chapters");
  const briefDir = path.join(run.rootDir, "manuscript", "chapter-briefs");
  if (!existsSync(chapterDir)) {
    return;
  }
  const chapters = readdirSync(chapterDir).filter((entry) => entry.endsWith(".md"));
  const briefs = existsSync(briefDir) ? new Set(readdirSync(briefDir).filter((entry) => entry.endsWith(".md"))) : new Set<string>();
  if (briefs.size < chapters.length) {
    addFinding(
      findings,
      "warning",
      "missing_chapter_briefs",
      "manuscript/chapter-briefs/",
      `${chapters.length} chapter files exist but only ${briefs.size} chapter briefs were found.`,
      "Write one brief per drafted chapter so revisions can preserve intent and continuity.",
    );
  }
}

function findStoryBibleDrift(run: RunState, manuscriptText: string, findings: ManuscriptIntelligenceFinding[]) {
  const storyBible = readStoryBible(run);
  for (const character of storyBible.characters ?? []) {
    if (character.name && !manuscriptText.toLowerCase().includes(character.name.toLowerCase())) {
      addFinding(
        findings,
        "info",
        "story_bible_character_absent",
        "foundation/story-bible.json",
        `Story bible character "${character.name}" does not appear by name in the manuscript text.`,
        "Confirm whether this character was cut intentionally or needs to be restored.",
      );
    }
  }
}

function findSourceCoverage(run: RunState, findings: ManuscriptIntelligenceFinding[]) {
  if (!run.config.bookMode.includes("nonfiction") && run.config.bookMode !== "memoir") {
    return;
  }
  const ledger = readOptional(run.ledgerPath);
  if (!ledger.includes("sources") || !ledger.match(/"title"\s*:/)) {
    addFinding(
      findings,
      "warning",
      "source_coverage_gap",
      ".book-genesis/ledger.json",
      "Nonfiction or memoir mode has no recorded source entries in the ledger.",
      "Record sources or rationale for lived-experience claims before publishing.",
    );
  }
}

function findDeliveryPayoff(run: RunState, manuscriptText: string, findings: ManuscriptIntelligenceFinding[]) {
  const summary = readOptional(path.join(run.rootDir, "delivery", "package-summary.md"));
  if (!summary) {
    return;
  }
  const terms = markdownToPlainText(summary).toLowerCase().split(/\W+/).filter((word) => word.length > 7).slice(0, 8);
  const missing = terms.filter((term) => !manuscriptText.toLowerCase().includes(term));
  if (terms.length >= 4 && missing.length >= Math.ceil(terms.length / 2)) {
    addFinding(
      findings,
      "info",
      "delivery_payoff_mismatch",
      "delivery/package-summary.md",
      `Several package-summary terms do not appear in the manuscript: ${missing.join(", ")}.`,
      "Align package copy with the finished manuscript or add clearer payoff language to the book.",
    );
  }
}

export function analyzeManuscript(run: RunState): ManuscriptIntelligenceReport {
  const manuscriptPath = path.join(run.rootDir, "manuscript", "full-manuscript.md");
  const manuscript = readOptional(manuscriptPath);
  const manuscriptText = markdownToPlainText(manuscript);
  const findings: ManuscriptIntelligenceFinding[] = [];

  if (!manuscript) {
    addFinding(findings, "warning", "manuscript_missing", "manuscript/full-manuscript.md", "No full manuscript was found.", "Complete the write phase before running manuscript intelligence.");
  } else {
    findRepeatedParagraphs(run, manuscript, findings);
    findPromiseGaps(run, manuscriptText, findings);
    findPacingVariance(run, findings);
    findMissingBriefs(run, findings);
    findStoryBibleDrift(run, manuscriptText, findings);
    findSourceCoverage(run, findings);
    findDeliveryPayoff(run, manuscriptText, findings);
  }

  return {
    generatedAt: new Date().toISOString(),
    runId: run.id,
    findings,
  };
}

export function formatManuscriptIntelligenceReport(report: ManuscriptIntelligenceReport) {
  const body = report.findings.length > 0
    ? report.findings.map((finding) => [
        `## ${finding.code}`,
        "",
        `- Severity: ${finding.severity}`,
        `- Target: ${finding.target}`,
        `- Evidence: ${finding.evidence}`,
        `- Suggested action: ${finding.suggestedAction}`,
      ].join("\n")).join("\n\n")
    : "No manuscript intelligence findings.";

  return [
    "# Manuscript Intelligence Report",
    "",
    `- Run: ${report.runId}`,
    `- Generated: ${report.generatedAt}`,
    "",
    body,
    "",
  ].join("\n");
}

export function writeManuscriptIntelligenceReport(run: RunState) {
  const report = analyzeManuscript(run);
  const outputDir = path.join(run.rootDir, "evaluations");
  mkdirSync(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, "manuscript-intelligence.md");
  writeFileSync(outputPath, formatManuscriptIntelligenceReport(report), "utf8");
  return outputPath;
}
