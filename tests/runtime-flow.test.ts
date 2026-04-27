import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_RUN_CONFIG } from "../extensions/book-genesis/config.js";
import { approveRun, completeCurrentPhase, createRunState } from "../extensions/book-genesis/state.js";

function withRun(fn: (run: ReturnType<typeof createRunState>) => void) {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-runtime-"));
  try {
    fn(createRunState(workspace, "cozy mystery series starter", {
      ...DEFAULT_RUN_CONFIG,
      approvalPhases: ["foundation"],
      bookMode: "fiction",
    }));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("runtime can pause after foundation and still route evaluate failure to revise", () => {
  withRun((run) => {
    run.currentPhase = "foundation";
    completeCurrentPhase(run, {
      summary: "Foundation ready.",
      artifacts: ["foundation/foundation.md"],
      unresolvedIssues: [],
    });

    assert.equal(run.status, "awaiting_approval");
    approveRun(run);
    assert.equal(run.currentPhase, "write");

    run.currentPhase = "evaluate";
    completeCurrentPhase(run, {
      summary: "Evaluation found weaknesses.",
      artifacts: ["evaluations/genesis-score.md"],
      unresolvedIssues: ["Pacing dips in the middle."],
      qualityGate: {
        threshold: 85,
        scores: {
          marketFit: 88,
          structure: 82,
          prose: 86,
          consistency: 87,
          deliveryReadiness: 88,
          pacing: 79,
          payoff: 90,
        },
        repairBrief: "Tighten the middle sequence and sharpen the midpoint turn.",
      },
    });

    assert.equal(run.currentPhase, "revise");
    assert.equal(run.status, "running");
    assert.match(run.nextAction, /Tighten the middle sequence/);
  });
});
