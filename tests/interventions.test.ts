import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_RUN_CONFIG } from "../extensions/book-genesis/config.js";
import {
  compareDrafts,
  requestChapterRevision,
  requestWriteSampleCheckpoint,
} from "../extensions/book-genesis/interventions.js";
import { createRunState } from "../extensions/book-genesis/state.js";

function withRun(fn: (run: ReturnType<typeof createRunState>) => void) {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-interventions-"));
  try {
    const run = createRunState(workspace, "detective novel", {
      ...DEFAULT_RUN_CONFIG,
      approvalPhases: [...DEFAULT_RUN_CONFIG.approvalPhases],
      exportFormats: [...DEFAULT_RUN_CONFIG.exportFormats],
      gitCommitPaths: [...DEFAULT_RUN_CONFIG.gitCommitPaths],
      kdp: {
        ...DEFAULT_RUN_CONFIG.kdp,
        formats: [...DEFAULT_RUN_CONFIG.kdp.formats],
        keywords: [...DEFAULT_RUN_CONFIG.kdp.keywords],
        categories: [...DEFAULT_RUN_CONFIG.kdp.categories],
      },
    });
    fn(run);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("requestChapterRevision reopens a running run with chapter-specific feedback", () => {
  withRun((run) => {
    const feedbackPath = requestChapterRevision(run, "03", "Make the midpoint reveal sharper.");

    assert.equal(run.currentPhase, "revise");
    assert.equal(run.status, "running");
    assert.equal(run.reviewerFeedback.length, 1);
    assert.match(readFileSync(feedbackPath, "utf8"), /Chapter: 03/);
    assert.match(readFileSync(feedbackPath, "utf8"), /midpoint reveal/);
  });
});

test("requestWriteSampleCheckpoint queues an approval gate for a sample size", () => {
  withRun((run) => {
    requestWriteSampleCheckpoint(run, 3);

    assert.equal(run.status, "awaiting_approval");
    assert.equal(run.approval?.phase, "write");
    assert.equal(run.approval?.nextPhase, "write");
    assert.match(run.nextAction, /sample of 3 chapter/);
  });
});

test("compareDrafts writes a draft comparison report inside the run", () => {
  withRun((run) => {
    mkdirSync(path.join(run.rootDir, "drafts"), { recursive: true });
    writeFileSync(path.join(run.rootDir, "drafts", "left.md"), "# Draft\n\nOld opening.\nSame line.\n");
    writeFileSync(path.join(run.rootDir, "drafts", "right.md"), "# Draft\n\nNew opening.\nSame line.\n");

    const report = compareDrafts(run, "drafts/left.md", "drafts/right.md");
    const text = readFileSync(report.reportPath, "utf8");

    assert.equal(report.addedLines, 1);
    assert.equal(report.removedLines, 1);
    assert.match(text, /New opening/);
    assert.match(text, /Old opening/);
  });
});

test("compareDrafts rejects paths outside the run", () => {
  withRun((run) => {
    assert.throws(() => compareDrafts(run, "../left.md", "drafts/right.md"), /inside the run/);
  });
});
