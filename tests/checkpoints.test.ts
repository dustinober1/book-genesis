import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_RUN_CONFIG } from "../extensions/book-genesis/config.js";
import { approveRun, completeCurrentPhase, createRunState, rejectRun } from "../extensions/book-genesis/state.js";

function withRun(fn: (run: ReturnType<typeof createRunState>) => void) {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-checkpoints-"));
  try {
    fn(createRunState(workspace, "startup leadership book", {
      ...DEFAULT_RUN_CONFIG,
      approvalPhases: ["foundation"],
      bookMode: "prescriptive-nonfiction",
    }));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("completeCurrentPhase pauses for approval when the phase is gated", () => {
  withRun((run) => {
    run.currentPhase = "foundation";

    completeCurrentPhase(run, {
      summary: "Foundation complete.",
      artifacts: ["foundation/foundation.md"],
      unresolvedIssues: [],
    });

    assert.equal(run.status, "awaiting_approval");
    assert.equal(run.approval?.phase, "foundation");
    assert.equal(run.currentPhase, "write");
  });
});

test("approveRun resumes the queued next phase", () => {
  withRun((run) => {
    run.currentPhase = "foundation";
    completeCurrentPhase(run, {
      summary: "Foundation complete.",
      artifacts: ["foundation/foundation.md"],
      unresolvedIssues: [],
    });

    approveRun(run);

    assert.equal(run.status, "running");
    assert.equal(run.currentPhase, "write");
    assert.equal(run.approval?.status, "approved");
  });
});

test("rejectRun stops the run with a rejection marker", () => {
  withRun((run) => {
    run.currentPhase = "foundation";
    completeCurrentPhase(run, {
      summary: "Foundation complete.",
      artifacts: ["foundation/foundation.md"],
      unresolvedIssues: [],
    });

    rejectRun(run, "Needs a sharper reader promise.");

    assert.equal(run.status, "stopped");
    assert.equal(run.stopRequested, true);
    assert.equal(run.approval?.status, "rejected");
  });
});
