import path from "node:path";

import type { RunState, StyleLintFinding, StyleLintReport, StyleProfile } from "./types.js";
import { listChapterFiles, plainText, readManuscript, readOptional, relativeToRun, writeJson, writeMarkdown } from "./run-files.js";

const GENERIC_TRANSITIONS = ["suddenly", "in that moment", "it was clear", "little did they know", "as if on cue"];
const WEAK_PLACEHOLDERS = ["TODO", "TBD", "lorem ipsum", "placeholder"];
const AIISH_PHRASES = ["a testament to", "in a world where", "more than just", "not only that", "a tapestry of"];

function firstSentence(value: string) {
  return plainText(value).split(/(?<=[.!?])\s+/)[0]?.trim() ?? "";
}

function lastSentence(value: string) {
  const sentences = plainText(value).split(/(?<=[.!?])\s+/).map((item) => item.trim()).filter(Boolean);
  return sentences.at(-1) ?? "";
}

function frequency(haystack: string, needle: string) {
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return haystack.match(new RegExp(`\\b${escaped}\\b`, "gi"))?.length ?? 0;
}

function collectSources(run: RunState) {
  const candidates = [
    "foundation/kickoff-brief.md",
    "foundation/project-brief.md",
    "foundation/voice-dna.md",
    "foundation/story-bible.md",
    "manuscript/full-manuscript.md",
  ];
  return candidates
    .map((relative) => ({ relative, text: readOptional(path.join(run.rootDir, relative)) }))
    .filter((entry) => entry.text.trim().length > 0);
}

export function buildStyleProfile(run: RunState): StyleProfile {
  const sources = collectSources(run);
  const combined = plainText(sources.map((entry) => entry.text).join("\n\n"));
  const sampleWords = combined.split(/\s+/).filter((word) => /^[A-Za-z][A-Za-z'-]+$/.test(word));
  const diction = [...new Set(sampleWords.filter((word) => word.length > 7).map((word) => word.toLowerCase()))].slice(0, 12);
  const chapters = listChapterFiles(run);

  return {
    generatedAt: new Date().toISOString(),
    runId: run.id,
    sourceArtifacts: sources.map((entry) => entry.relative),
    voicePrinciples: [
      run.config.tone || run.kickoff?.tone || "Keep the voice aligned with the book promise.",
      run.kickoff?.promise || run.idea,
      `Strictness: ${run.config.style.voiceStrictness}.`,
    ],
    sentenceRhythm: combined.length > 0 ? "Vary sentence length and avoid repeated openings across adjacent chapters." : "No source prose found yet.",
    diction,
    povDistance: run.config.bookMode === "memoir" ? "Close first-person authority where appropriate." : "Maintain the selected narrative distance consistently.",
    dialogueRules: ["Use dialogue tags only when speaker clarity requires them.", "Prefer action beats over repeated said-bookisms."],
    bannedPhrases: run.config.style.bannedPhrases,
    preferredOpenings: chapters.map((chapter) => firstSentence(chapter.markdown)).filter(Boolean).slice(0, 5),
    preferredEndings: chapters.map((chapter) => lastSentence(chapter.markdown)).filter(Boolean).slice(0, 5),
    examples: chapters.map((chapter) => firstSentence(chapter.markdown)).filter(Boolean).slice(0, 3),
  };
}

export function writeStyleProfile(run: RunState) {
  const profile = buildStyleProfile(run);
  const jsonPath = writeJson(path.join(run.rootDir, "foundation", "style-profile.json"), profile);
  const mdPath = writeMarkdown(path.join(run.rootDir, "foundation", "style-profile.md"), formatStyleProfile(profile));
  return { profile, jsonPath, mdPath };
}

export function lintStyle(run: RunState): StyleLintReport {
  const manuscript = readManuscript(run);
  const text = plainText(manuscript);
  const lower = text.toLowerCase();
  const chapters = listChapterFiles(run);
  const findings: StyleLintFinding[] = [];

  for (const phrase of run.config.style.bannedPhrases) {
    const count = frequency(text, phrase);
    if (count > 0) {
      findings.push({
        severity: "error",
        code: "banned_phrase",
        target: phrase,
        evidence: `${count} occurrence(s) found.`,
        suggestedAction: `Remove or replace "${phrase}".`,
      });
    }
  }

  for (const phrase of [...GENERIC_TRANSITIONS, ...WEAK_PLACEHOLDERS, ...AIISH_PHRASES]) {
    const count = frequency(text, phrase);
    if (count > 1 || (WEAK_PLACEHOLDERS.includes(phrase) && count > 0)) {
      findings.push({
        severity: WEAK_PLACEHOLDERS.includes(phrase) ? "error" : "warning",
        code: WEAK_PLACEHOLDERS.includes(phrase) ? "placeholder_phrase" : "generic_phrase",
        target: phrase,
        evidence: `${count} occurrence(s) found.`,
        suggestedAction: "Revise repeated or placeholder phrasing into book-specific prose.",
      });
    }
  }

  const openings = new Map<string, number>();
  const closings = new Map<string, number>();
  for (const chapter of chapters) {
    const opening = firstSentence(chapter.markdown).toLowerCase();
    const closing = lastSentence(chapter.markdown).toLowerCase();
    if (opening) openings.set(opening, (openings.get(opening) ?? 0) + 1);
    if (closing) closings.set(closing, (closings.get(closing) ?? 0) + 1);
  }
  for (const [opening, count] of openings) {
    if (count > 1) {
      findings.push({ severity: "warning", code: "repeated_opening", target: opening, evidence: `${count} chapters share this opening.`, suggestedAction: "Vary chapter entry points." });
    }
  }
  for (const [closing, count] of closings) {
    if (count > 1) {
      findings.push({ severity: "warning", code: "repeated_closing", target: closing, evidence: `${count} chapters share this ending.`, suggestedAction: "Vary chapter exits and emotional turns." });
    }
  }

  const dialogueTags = (lower.match(/\b(said|asked|replied|muttered|whispered)\b/g) ?? []).length;
  if (dialogueTags > Math.max(20, chapters.length * 12)) {
    findings.push({ severity: "info", code: "dialogue_tag_density", target: "manuscript", evidence: `${dialogueTags} dialogue tags found.`, suggestedAction: "Replace unnecessary tags with action beats where clarity allows." });
  }

  if (!text.trim()) {
    findings.push({ severity: "info", code: "empty_manuscript", target: "manuscript/full-manuscript.md", evidence: "No manuscript text found.", suggestedAction: "Draft chapters before running style lint for meaningful results." });
  }

  return { generatedAt: new Date().toISOString(), runId: run.id, findings };
}

export function writeStyleLint(run: RunState) {
  const report = lintStyle(run);
  const jsonPath = writeJson(path.join(run.rootDir, "evaluations", "style-lint.json"), report);
  const mdPath = writeMarkdown(path.join(run.rootDir, "evaluations", "style-lint.md"), formatStyleLint(report));
  return { report, jsonPath, mdPath };
}

export function formatStyleProfile(profile: StyleProfile) {
  return [
    `# Style Profile for ${profile.runId}`,
    "",
    "## Voice Principles",
    ...profile.voicePrinciples.map((item) => `- ${item}`),
    "",
    `## Sentence Rhythm\n${profile.sentenceRhythm}`,
    "",
    "## Banned Phrases",
    profile.bannedPhrases.length ? profile.bannedPhrases.map((item) => `- ${item}`).join("\n") : "- none",
    "",
    "## Source Artifacts",
    profile.sourceArtifacts.length ? profile.sourceArtifacts.map((item) => `- ${item}`).join("\n") : "- none",
  ].join("\n");
}

export function formatStyleLint(report: StyleLintReport) {
  const lines = report.findings.length
    ? report.findings.map((finding) => `- [${finding.severity.toUpperCase()}] ${finding.code} (${finding.target}): ${finding.evidence} ${finding.suggestedAction}`)
    : ["- No style findings."];
  return [`# Style Lint for ${report.runId}`, "", ...lines, ""].join("\n");
}

export function summarizeStyleFindings(run: RunState) {
  const lintPath = path.join(run.rootDir, "evaluations", "style-lint.json");
  if (!readOptional(lintPath)) {
    return [];
  }
  const report = JSON.parse(readOptional(lintPath)) as StyleLintReport;
  return report.findings.slice(0, 5).map((finding) => `${relativeToRun(run, lintPath)}: ${finding.code} - ${finding.suggestedAction}`);
}
