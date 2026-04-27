import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_RUN_CONFIG } from "../extensions/book-genesis/config.js";
import {
  completeCurrentPhase,
  createRunState,
  readRunState,
  reportCurrentPhaseFailure,
  requestReviewerRevision,
  stopRun,
  writeRunState,
} from "../extensions/book-genesis/state.js";

function withWorkspace(fn: (workspace: string) => void) {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-"));
  try {
    fn(workspace);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("createRunState initializes a kickoff run", () => {
  withWorkspace((workspace) => {
    const run = createRunState(workspace, "en a climate thriller about ocean cities", DEFAULT_RUN_CONFIG);

    assert.equal(run.status, "running");
    assert.equal(run.currentPhase, "kickoff");
    assert.equal(run.language, "en");
    assert.equal(run.idea, "a climate thriller about ocean cities");
    assert.equal(run.config.maxRetriesPerPhase, 1);
    assert.equal(run.config.chapterBatchSize, 3);
  });
});

test("completeCurrentPhase records artifacts and advances to research", () => {
  withWorkspace((workspace) => {
    const run = createRunState(workspace, "space opera", DEFAULT_RUN_CONFIG);
    completeCurrentPhase(run, {
      summary: "Kickoff complete.",
      artifacts: ["foundation/project-brief.md"],
      unresolvedIssues: [],
    });

    assert.equal(run.currentPhase, "research");
    assert.deepEqual(run.completedPhases, ["kickoff"]);
    assert.deepEqual(run.artifacts.kickoff, ["foundation/project-brief.md"]);
    assert.match(run.lastHandoffPath ?? "", /kickoff\.md$/);
  });
});

test("retryable failure remains running until retry budget is exceeded", () => {
  withWorkspace((workspace) => {
    const run = createRunState(workspace, "mystery novel", DEFAULT_RUN_CONFIG);
    run.currentPhase = "research";

    const first = reportCurrentPhaseFailure(run, {
      reason: "Temporary provider failure.",
      retryable: true,
      unresolvedIssues: ["Provider returned 503."],
    });
    assert.equal(first.shouldRetry, true);
    assert.equal(run.status, "running");

    run.attempts.research = 2;
    const second = reportCurrentPhaseFailure(run, {
      reason: "Provider still unavailable.",
      retryable: true,
      unresolvedIssues: ["Provider returned 503 twice."],
    });
    assert.equal(second.shouldRetry, false);
    assert.equal(run.status, "failed");
  });
});

test("writeRunState and readRunState round trip persisted state", () => {
  withWorkspace((workspace) => {
    const run = createRunState(workspace, "memoir about rebuilding", DEFAULT_RUN_CONFIG);
    writeRunState(run);

    const readBack = readRunState(run.rootDir);
    assert.equal(readBack.id, run.id);
    assert.equal(readBack.rootDir, run.rootDir);
    assert.equal(readBack.currentPhase, run.currentPhase);
  });
});

test("stopRun marks an active run as stopped", () => {
  withWorkspace((workspace) => {
    const run = createRunState(workspace, "fantasy quest", DEFAULT_RUN_CONFIG);
    stopRun(run, "Paused by operator.");

    assert.equal(run.status, "stopped");
    assert.equal(run.stopRequested, true);
    assert.equal(run.nextAction, "Paused by operator.");
  });
});

test("evaluate with passing quality gate advances directly to deliver", () => {
  withWorkspace((workspace) => {
    const run = createRunState(workspace, "historical epic", { ...DEFAULT_RUN_CONFIG, qualityThreshold: 80 });
    run.currentPhase = "evaluate";

    completeCurrentPhase(run, {
      summary: "Evaluation passed.",
      artifacts: ["evaluations/genesis-score.md"],
      unresolvedIssues: [],
      qualityGate: {
        threshold: 80,
        scores: {
          marketFit: 88,
          structure: 90,
          prose: 86,
          consistency: 85,
          deliveryReadiness: 89,
          pacing: 91,
          payoff: 90,
        },
        repairBrief: "",
      },
    });

    assert.equal(run.status, "running");
    assert.equal(run.currentPhase, "deliver");
    assert.equal(run.qualityGates.at(-1)?.passed, true);
  });
});

test("evaluate with failing quality gate routes to revise", () => {
  withWorkspace((workspace) => {
    const run = createRunState(workspace, "historical epic", { ...DEFAULT_RUN_CONFIG, qualityThreshold: 90 });
    run.currentPhase = "evaluate";

    completeCurrentPhase(run, {
      summary: "Evaluation found weaknesses.",
      artifacts: ["evaluations/genesis-score.md"],
      unresolvedIssues: ["Structure below threshold."],
      qualityGate: {
        threshold: 90,
        scores: {
          marketFit: 91,
          structure: 72,
          prose: 88,
          consistency: 84,
          deliveryReadiness: 80,
          pacing: 90,
          payoff: 89,
        },
        repairBrief: "Strengthen midpoint escalation and ending payoff.",
      },
    });

    assert.equal(run.currentPhase, "revise");
    assert.equal(run.revisionCycle, 1);
    assert.match(run.nextAction, /Strengthen midpoint/);
  });
});

test("revise after failed gate routes back to evaluate", () => {
  withWorkspace((workspace) => {
    const run = createRunState(workspace, "historical epic", DEFAULT_RUN_CONFIG);
    run.currentPhase = "revise";
    run.revisionCycle = 1;
    run.qualityGates.push({
      phase: "evaluate",
      threshold: 85,
      passed: false,
      scores: {
        marketFit: 91,
        structure: 72,
        prose: 88,
        consistency: 84,
        deliveryReadiness: 80,
        pacing: 90,
        payoff: 89,
      },
      repairBrief: "Fix structure.",
      failedDimensions: ["structure"],
      recordedAt: new Date().toISOString(),
    });

    completeCurrentPhase(run, {
      summary: "Revision complete.",
      artifacts: ["manuscript/full-manuscript.md"],
      unresolvedIssues: [],
    });

    assert.equal(run.currentPhase, "evaluate");
  });
});

test("requestReviewerRevision reopens a completed run in revise and records feedback", () => {
  withWorkspace((workspace) => {
    const run = createRunState(workspace, "historical epic", DEFAULT_RUN_CONFIG);
    run.currentPhase = "deliver";
    run.status = "completed";

    const feedbackPath = requestReviewerRevision(
      run,
      "The ending lands, but the middle still drags and the reviewer wants clearer chapter transitions.",
    );

    assert.equal(run.currentPhase, "revise");
    assert.equal(run.status, "running");
    assert.equal(run.pendingReviewerRevision?.artifactPath, feedbackPath);
    assert.equal(run.reviewerFeedback.length, 1);
    assert.match(run.reviewerFeedback[0].note, /middle still drags/);
  });
});

test("revise after reviewer feedback routes back to evaluate", () => {
  withWorkspace((workspace) => {
    const run = createRunState(workspace, "historical epic", DEFAULT_RUN_CONFIG);
    run.currentPhase = "deliver";
    run.status = "completed";
    requestReviewerRevision(run, "Tighten the opening, cut repetition, and clarify the ending stakes.");

    completeCurrentPhase(run, {
      summary: "Reviewer-driven revision complete.",
      artifacts: ["manuscript/full-manuscript.md"],
      unresolvedIssues: [],
    });

    assert.equal(run.currentPhase, "evaluate");
    assert.equal(run.pendingReviewerRevision, undefined);
  });
});
