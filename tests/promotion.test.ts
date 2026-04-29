import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_RUN_CONFIG } from "../extensions/book-genesis/config.js";
import {
  buildShortStoryBrainstorm,
  writeShortStoryPackage,
} from "../extensions/book-genesis/promotion.js";
import { createRunState } from "../extensions/book-genesis/state.js";

function withRun(fn: (run: ReturnType<typeof createRunState>) => void) {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-promotion-"));
  try {
    const run = createRunState(workspace, "a haunted lighthouse mystery", {
      ...DEFAULT_RUN_CONFIG,
      promotion: {
        shortStoryEnabled: true,
        shortStoryMaxPages: 15,
        shortStoryPurpose: "lead-magnet",
      },
    });
    run.kickoff = {
      workingTitle: "The Lantern Below",
      genre: "coastal mystery",
      targetReader: "readers who love eerie clue trails",
      promise: "A forgotten warning changes the case.",
      targetLength: "novel",
      tone: "moody and suspenseful",
      constraints: ["Do not spoil the main culprit"],
      successCriteria: ["Readers want the full book."],
    };
    fn(run);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("buildShortStoryBrainstorm creates multiple lead-magnet concepts under the page limit", () => {
  withRun((run) => {
    const brainstorm = buildShortStoryBrainstorm(run, "Feature the lighthouse keeper.");

    assert.equal(brainstorm.concepts.length >= 5, true);
    assert.equal(brainstorm.concepts.length <= 7, true);
    assert.equal(brainstorm.maxPages, 15);
    assert.equal(brainstorm.purpose, "lead-magnet");
    assert.equal(brainstorm.concepts.some((concept) => concept.recommended), true);
    assert.match(brainstorm.markdown, /Website positioning/);
  });
});

test("writeShortStoryPackage writes website-ready lead magnet assets", () => {
  withRun((run) => {
    const brainstorm = buildShortStoryBrainstorm(run);
    const manifest = writeShortStoryPackage(run, brainstorm.concepts[0].title);

    assert.equal(manifest.files.length, 6);
    for (const filePath of manifest.files) {
      assert.match(filePath, /promotion\/short-story-package/);
    }

    assert.match(readFileSync(path.join(run.rootDir, "promotion", "short-story-package", "story.md"), "utf8"), /under 15 pages/);
    assert.match(readFileSync(path.join(run.rootDir, "promotion", "short-story-package", "landing-page-copy.md"), "utf8"), /Lead Magnet/);
    assert.match(readFileSync(path.join(run.rootDir, "promotion", "short-story-package", "email-signup-copy.md"), "utf8"), /email/);
  });
});

test("writeShortStoryPackage rejects disabled promotion", () => {
  withRun((run) => {
    run.config.promotion.shortStoryEnabled = false;
    assert.throws(() => writeShortStoryPackage(run, "Lantern Test"), /disabled/);
  });
});
