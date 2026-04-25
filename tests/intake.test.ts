import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_RUN_CONFIG } from "../extensions/book-genesis/config.js";
import { createRunState } from "../extensions/book-genesis/state.js";
import { validateKickoffIntake, writeKickoffBrief } from "../extensions/book-genesis/intake.js";

function withRun(fn: (run: ReturnType<typeof createRunState>) => void) {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-"));
  try {
    fn(createRunState(workspace, "near future thriller", DEFAULT_RUN_CONFIG));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("validateKickoffIntake accepts a complete project brief", () => {
  const result = validateKickoffIntake({
    workingTitle: "Salt Cities",
    genre: "near future thriller",
    targetReader: "adult climate fiction readers",
    promise: "a tense survival story with political intrigue",
    targetLength: "70,000 words",
    tone: "urgent and cinematic",
    constraints: ["avoid graphic violence", "keep chapters short"],
    successCriteria: ["coherent ending", "strong query package"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.issues.length, 0);
});

test("validateKickoffIntake rejects missing required answers", () => {
  const result = validateKickoffIntake({
    workingTitle: "",
    genre: "thriller",
    targetReader: "",
    promise: "fast pacing",
    targetLength: "70,000 words",
    tone: "tense",
    constraints: [],
    successCriteria: [],
  });

  assert.equal(result.ok, false);
  assert.equal(result.issues.includes("workingTitle is required."), true);
  assert.equal(result.issues.includes("targetReader is required."), true);
});

test("writeKickoffBrief persists intake markdown inside the run", () => {
  withRun((run) => {
    const briefPath = writeKickoffBrief(run, {
      workingTitle: "Salt Cities",
      genre: "near future thriller",
      targetReader: "adult climate fiction readers",
      promise: "a tense survival story with political intrigue",
      targetLength: "70,000 words",
      tone: "urgent and cinematic",
      constraints: ["avoid graphic violence"],
      successCriteria: ["coherent ending"],
    });

    assert.equal(briefPath, path.join(run.rootDir, "foundation/project-brief.md"));
    assert.equal(existsSync(briefPath), true);
    assert.match(readFileSync(briefPath, "utf8"), /Salt Cities/);
  });
});

