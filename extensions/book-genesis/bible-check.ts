import path from "node:path";

import { readStoryBible } from "./bible.js";
import type { HealthCheckResult, RunState } from "./types.js";
import { plainText, readManuscript, writeJson, writeMarkdown } from "./run-files.js";

function includesLoose(haystack: string, needle: string) {
  const words = needle.toLowerCase().split(/\W+/).filter((word) => word.length > 3);
  if (words.length === 0) return true;
  return words.some((word) => haystack.includes(word));
}

export function buildBibleCheck(run: RunState) {
  const bible = readStoryBible(run);
  const manuscript = plainText(readManuscript(run)).toLowerCase();
  const findings: HealthCheckResult[] = [];

  if (!run.config.storyBibleEnabled) {
    findings.push({ ok: true, severity: "info", code: "story_bible_disabled", message: "Story bible enforcement is disabled for this run." });
  }

  for (const promise of bible.promises) {
    if (!includesLoose(manuscript, promise)) {
      findings.push({ ok: false, severity: "warning", code: "promise_missing", message: `Story promise may be missing from manuscript: ${promise}`, remedy: "Revise the manuscript or update the story bible if the promise changed." });
    }
  }

  for (const entry of bible.glossary) {
    if (entry.term && !manuscript.includes(entry.term.toLowerCase())) {
      findings.push({ ok: false, severity: "warning", code: "glossary_term_missing", message: `Glossary term does not appear in manuscript: ${entry.term}`, remedy: "Use the canonical term or remove it from the story bible." });
    }
  }

  for (const character of bible.characters) {
    if (character.name && !manuscript.includes(character.name.toLowerCase())) {
      findings.push({ ok: false, severity: "warning", code: "character_missing", message: `Character does not appear in manuscript: ${character.name}`, remedy: "Restore the character, rename consistently, or update the story bible." });
    }
  }

  for (const setting of bible.settings) {
    if (setting.name && !manuscript.includes(setting.name.toLowerCase())) {
      findings.push({ ok: false, severity: "info", code: "setting_missing", message: `Setting does not appear in manuscript: ${setting.name}` });
    }
  }

  if (findings.length === 0) {
    findings.push({ ok: true, severity: "info", code: "story_bible_aligned", message: "No deterministic story-bible drift detected." });
  }

  return {
    generatedAt: new Date().toISOString(),
    runId: run.id,
    checked: {
      promises: bible.promises.length,
      glossaryTerms: bible.glossary.length,
      characters: bible.characters.length,
      settings: bible.settings.length,
    },
    findings,
  };
}

export function writeBibleCheck(run: RunState) {
  const report = buildBibleCheck(run);
  const jsonPath = writeJson(path.join(run.rootDir, "evaluations", "bible-check.json"), report);
  const mdPath = writeMarkdown(path.join(run.rootDir, "evaluations", "bible-check.md"), [
    `# Story Bible Check for ${run.id}`,
    "",
    `- Promises checked: ${report.checked.promises}`,
    `- Glossary terms checked: ${report.checked.glossaryTerms}`,
    `- Characters checked: ${report.checked.characters}`,
    `- Settings checked: ${report.checked.settings}`,
    "",
    "## Findings",
    ...report.findings.map((finding) => `- [${finding.severity.toUpperCase()}] ${finding.code}: ${finding.message}`),
    "",
  ].join("\n"));
  return { report, jsonPath, mdPath };
}
