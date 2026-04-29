import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_RUN_CONFIG } from "../extensions/book-genesis/config.js";
import {
  analyzeManuscript,
  formatManuscriptIntelligenceReport,
  writeManuscriptIntelligenceReport,
} from "../extensions/book-genesis/intelligence.js";
import { createRunState } from "../extensions/book-genesis/state.js";

function withRun(fn: (run: ReturnType<typeof createRunState>) => void) {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-intelligence-"));
  try {
    fn(createRunState(workspace, "space academy mystery", DEFAULT_RUN_CONFIG));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("analyzeManuscript flags unresolved promises and repeated passages", () => {
  withRun((run) => {
    run.kickoff = {
      workingTitle: "Space Academy Mystery",
      genre: "YA mystery",
      targetReader: "Readers who want clue-driven school stories",
      promise: "A secret betrayal will be uncovered.",
      targetLength: "short novel",
      tone: "tense and curious",
      constraints: [],
      successCriteria: ["The betrayal is clearly paid off."],
    };
    mkdirSync(path.join(run.rootDir, "foundation"), { recursive: true });
    writeFileSync(path.join(run.rootDir, "foundation", "story-bible.json"), JSON.stringify({
      promises: ["A missing mentor returns with the final clue"],
      characters: [{ id: "mentor", name: "Captain Vale", role: "mentor", desire: "protect the students" }],
      settings: [],
      themes: [],
      relationships: [],
      timeline: [],
      motifs: [],
      glossary: [],
      premise: "A school mystery in orbit.",
    }));
    run.storyBibleJsonPath = path.join(run.rootDir, "foundation", "story-bible.json");

    mkdirSync(path.join(run.rootDir, "manuscript", "chapters"), { recursive: true });
    const repeated = "The corridor hummed with old secrets and the crew kept walking past the same locked door. ".repeat(8);
    writeFileSync(path.join(run.rootDir, "manuscript", "chapters", "01-opening.md"), `# Opening\n\n${repeated}\n\n${repeated}\n`);
    writeFileSync(path.join(run.rootDir, "manuscript", "chapters", "02-finale.md"), "# Finale\n\nThe students solve a smaller clue.\n");
    writeFileSync(path.join(run.rootDir, "manuscript", "full-manuscript.md"), `# Full\n\n${repeated}\n\n${repeated}\n`);

    const report = analyzeManuscript(run);
    assert.equal(report.findings.some((finding) => finding.code === "promise_missing"), true);
    assert.equal(report.findings.some((finding) => finding.code === "repeated_passage"), true);
  });
});

test("writeManuscriptIntelligenceReport writes readable findings without changing phase", () => {
  withRun((run) => {
    const originalPhase = run.currentPhase;
    mkdirSync(path.join(run.rootDir, "manuscript"), { recursive: true });
    writeFileSync(path.join(run.rootDir, "manuscript", "full-manuscript.md"), "# Manuscript\n\nA clean short sample.\n");

    const outputPath = writeManuscriptIntelligenceReport(run);
    const text = readFileSync(outputPath, "utf8");

    assert.equal(run.currentPhase, originalPhase);
    assert.match(text, /Manuscript Intelligence Report/);
  });
});

test("formatManuscriptIntelligenceReport includes suggested actions", () => {
  const text = formatManuscriptIntelligenceReport({
    generatedAt: "2026-04-29T00:00:00.000Z",
    runId: "run",
    findings: [{
      severity: "warning",
      code: "pacing_variance",
      target: "manuscript/chapters/",
      evidence: "One chapter is much shorter than the average.",
      suggestedAction: "Balance chapter length.",
    }],
  });

  assert.match(text, /pacing_variance/);
  assert.match(text, /Balance chapter length/);
});
