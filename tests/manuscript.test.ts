import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_RUN_CONFIG } from "../extensions/book-genesis/config.js";
import { createRunState } from "../extensions/book-genesis/state.js";
import { validateWriteArtifacts } from "../extensions/book-genesis/manuscript.js";

function withRun(fn: (run: ReturnType<typeof createRunState>) => void) {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-manuscript-"));
  try {
    fn(createRunState(workspace, "locked room thriller", DEFAULT_RUN_CONFIG));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("validateWriteArtifacts requires chapter briefs before manuscript completion", () => {
  withRun((run) => {
    mkdirSync(path.join(run.rootDir, "manuscript", "chapters"), { recursive: true });
    writeFileSync(path.join(run.rootDir, "manuscript", "chapters", "01-the-body.md"), "# Chapter 1\n");
    writeFileSync(path.join(run.rootDir, "manuscript", "full-manuscript.md"), "# Full Manuscript\n");
    writeFileSync(path.join(run.rootDir, "manuscript", "write-report.md"), "# Write Report\n");

    const result = validateWriteArtifacts(run);
    assert.equal(result.ok, false);
    assert.equal(result.issues.some((issue) => issue.code === "missing_required_target"), true);
  });
});

test("validateWriteArtifacts accepts ordered briefs, chapters, and continuity report", () => {
  withRun((run) => {
    mkdirSync(path.join(run.rootDir, "manuscript", "chapter-briefs"), { recursive: true });
    mkdirSync(path.join(run.rootDir, "manuscript", "chapters"), { recursive: true });
    writeFileSync(path.join(run.rootDir, "manuscript", "chapter-briefs", "01-the-body.md"), "# Brief 1\n");
    writeFileSync(path.join(run.rootDir, "manuscript", "chapters", "01-the-body.md"), "# Chapter 1\n");
    writeFileSync(path.join(run.rootDir, "manuscript", "full-manuscript.md"), "# Full Manuscript\n");
    writeFileSync(path.join(run.rootDir, "manuscript", "write-report.md"), "# Write Report\n");
    writeFileSync(path.join(run.rootDir, "manuscript", "continuity-report.md"), "# Continuity Report\n");

    const result = validateWriteArtifacts(run);
    assert.equal(result.ok, true);
  });
});
