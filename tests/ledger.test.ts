import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_RUN_CONFIG } from "../extensions/book-genesis/config.js";
import { createRunState } from "../extensions/book-genesis/state.js";
import { readLedger, recordDecision, recordSource } from "../extensions/book-genesis/ledger.js";

function withRun(fn: (run: ReturnType<typeof createRunState>) => void) {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-"));
  try {
    fn(createRunState(workspace, "romance novel", DEFAULT_RUN_CONFIG));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("recordSource appends a source ledger entry", () => {
  withRun((run) => {
    recordSource(run, {
      phase: "research",
      title: "Romance readership report",
      url: "https://example.com/report",
      summary: "Audience expects emotional stakes.",
      usefulness: "Shapes target reader and comp titles.",
    });

    const ledger = readLedger(run);
    assert.equal(ledger.sources.length, 1);
    assert.equal(ledger.sources[0].phase, "research");
  });
});

test("recordDecision appends a decision ledger entry", () => {
  withRun((run) => {
    recordDecision(run, {
      phase: "foundation",
      decision: "Use dual point of view.",
      rationale: "The premise needs both leads' emotional arcs.",
      impact: "Outline alternates chapter perspective.",
    });

    const ledger = readLedger(run);
    assert.equal(ledger.decisions.length, 1);
    assert.equal(ledger.decisions[0].decision, "Use dual point of view.");
  });
});

