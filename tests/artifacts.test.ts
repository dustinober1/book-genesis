import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_RUN_CONFIG } from "../extensions/book-genesis/config.js";
import { validatePhaseArtifacts, formatArtifactValidationReport } from "../extensions/book-genesis/artifacts.js";
import { createRunState } from "../extensions/book-genesis/state.js";

function withRun(fn: (run: ReturnType<typeof createRunState>) => void) {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-"));
  try {
    fn(createRunState(workspace, "detective novel", DEFAULT_RUN_CONFIG));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("validatePhaseArtifacts accepts required research files", () => {
  withRun((run) => {
    mkdirSync(path.join(run.rootDir, "research"), { recursive: true });
    writeFileSync(path.join(run.rootDir, "research/market-research.md"), "# Market\nReaders want this.\n");
    writeFileSync(path.join(run.rootDir, "research/bestseller-dna.md"), "# DNA\nClear pattern.\n");

    const result = validatePhaseArtifacts(run, "research", [
      "research/market-research.md",
      "research/bestseller-dna.md",
    ]);

    assert.equal(result.ok, true);
    assert.deepEqual(result.issues, []);
  });
});

test("validatePhaseArtifacts rejects missing required targets", () => {
  withRun((run) => {
    const result = validatePhaseArtifacts(run, "research", []);

    assert.equal(result.ok, false);
    assert.equal(result.issues.some((issue) => issue.code === "missing_required_target"), true);
  });
});

test("validatePhaseArtifacts rejects empty files and placeholders", () => {
  withRun((run) => {
    mkdirSync(path.join(run.rootDir, "research"), { recursive: true });
    writeFileSync(path.join(run.rootDir, "research/market-research.md"), "TODO\n");
    writeFileSync(path.join(run.rootDir, "research/bestseller-dna.md"), "\n");

    const result = validatePhaseArtifacts(run, "research", [
      "research/market-research.md",
      "research/bestseller-dna.md",
    ]);

    assert.equal(result.ok, false);
    assert.equal(result.issues.some((issue) => issue.code === "placeholder_text"), true);
    assert.equal(result.issues.some((issue) => issue.code === "empty_file"), true);
  });
});

test("formatArtifactValidationReport produces actionable text", () => {
  const text = formatArtifactValidationReport({
    ok: false,
    issues: [
      {
        code: "empty_file",
        target: "research/market-research.md",
        message: "Artifact file is empty.",
      },
    ],
  });

  assert.match(text, /Artifact validation failed/);
  assert.match(text, /research\/market-research\.md/);
});

test("validatePhaseArtifacts rejects manuscripts when chapter numbering skips", () => {
  withRun((run) => {
    mkdirSync(path.join(run.rootDir, "manuscript", "chapter-briefs"), { recursive: true });
    mkdirSync(path.join(run.rootDir, "manuscript", "chapters"), { recursive: true });
    writeFileSync(path.join(run.rootDir, "manuscript", "chapter-briefs", "01-opening.md"), "# Brief 1\n");
    writeFileSync(path.join(run.rootDir, "manuscript", "chapter-briefs", "03-finale.md"), "# Brief 3\n");
    writeFileSync(path.join(run.rootDir, "manuscript", "chapters", "01-opening.md"), "# Chapter 1\n");
    writeFileSync(path.join(run.rootDir, "manuscript", "chapters", "03-finale.md"), "# Chapter 3\n");
    writeFileSync(path.join(run.rootDir, "manuscript", "full-manuscript.md"), "# Full\n");
    writeFileSync(path.join(run.rootDir, "manuscript", "write-report.md"), "# Report\n");
    writeFileSync(path.join(run.rootDir, "manuscript", "continuity-report.md"), "# Continuity\n");

    const result = validatePhaseArtifacts(run, "write", []);
    assert.equal(result.ok, false);
    assert.equal(result.issues.some((issue) => issue.message.includes("chapter numbering")), true);
  });
});
