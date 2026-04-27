import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_RUN_CONFIG } from "../extensions/book-genesis/config.js";
import { buildPhasePrompt } from "../extensions/book-genesis/prompts.js";
import { createRunState } from "../extensions/book-genesis/state.js";

function withRun(fn: (prompt: string) => void) {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-prompts-"));
  try {
    const run = createRunState(workspace, "cozy fantasy", {
      ...DEFAULT_RUN_CONFIG,
      storyBibleEnabled: false,
    });
    run.currentPhase = "foundation";
    fn(buildPhasePrompt(run));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("buildPhasePrompt tells the agent not to use the story bible when disabled", () => {
  withRun((prompt) => {
    assert.equal(prompt.includes("foundation/story-bible.md"), false);
    assert.match(prompt, /Story bible:\s+disabled for this run/i);
  });
});

test("buildPhasePrompt includes checkpoint notes and reviewer feedback", () => {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-prompts-"));
  try {
    const run = createRunState(workspace, "cozy fantasy", DEFAULT_RUN_CONFIG);
    run.currentPhase = "revise";
    run.approval = {
      phase: "evaluate",
      requestedAt: new Date().toISOString(),
      reason: "Review checkpoint",
      status: "approved",
      note: "Keep the voice, but simplify the subplot.",
      nextPhase: "revise",
    };
    run.reviewerFeedback.push({
      id: "feedback-1",
      phase: "completed",
      note: "The beta reviewer wants a stronger midpoint and cleaner final chapter pacing.",
      artifactPath: path.join(run.rootDir, "evaluations", "reviewer-feedback", "feedback-1.md"),
      recordedAt: new Date().toISOString(),
    });

    const prompt = buildPhasePrompt(run);
    assert.match(prompt, /Keep the voice, but simplify the subplot/);
    assert.match(prompt, /stronger midpoint and cleaner final chapter pacing/);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
