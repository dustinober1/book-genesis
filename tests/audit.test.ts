import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { buildAuditReport, formatAuditReport } from "../extensions/book-genesis/audit.js";
import { DEFAULT_RUN_CONFIG } from "../extensions/book-genesis/config.js";
import { writePublishingReadinessReport } from "../extensions/book-genesis/publishing.js";
import { createRunState } from "../extensions/book-genesis/state.js";

function withRun(fn: (run: ReturnType<typeof createRunState>) => void) {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-audit-"));
  try {
    const run = createRunState(workspace, "a cyberpunk recovery mystery", {
      ...DEFAULT_RUN_CONFIG,
      kdp: {
        ...DEFAULT_RUN_CONFIG.kdp,
        formats: [...DEFAULT_RUN_CONFIG.kdp.formats],
        keywords: [],
        categories: [],
      },
    });
    fn(run);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("buildAuditReport combines artifact, manuscript, publishing, and promotion readiness", () => {
  withRun((run) => {
    mkdirSync(path.join(run.rootDir, "manuscript"), { recursive: true });
    writeFileSync(path.join(run.rootDir, "manuscript", "full-manuscript.md"), "# Manuscript\n\nA complete sample.\n");

    const report = buildAuditReport(run);

    assert.equal(report.runId, run.id);
    assert.equal(report.manuscript.findings.some((finding) => finding.code === "missing_chapter_briefs"), false);
    assert.equal(report.publishing.results.some((result) => result.code === "kdp_author_missing"), true);
    assert.equal(report.promotion.results.some((result) => result.code === "short_story_package_missing"), true);
  });
});

test("formatAuditReport includes next actions", () => {
  withRun((run) => {
    const text = formatAuditReport(buildAuditReport(run));

    assert.match(text, /Book Genesis audit/);
    assert.match(text, /Next actions/);
  });
});

test("writePublishingReadinessReport writes delivery readiness markdown", () => {
  withRun((run) => {
    const outputPath = writePublishingReadinessReport(run);
    const text = readFileSync(outputPath, "utf8");

    assert.match(outputPath, /delivery\/publishing-readiness\.md/);
    assert.match(text, /Publishing Readiness/);
    assert.match(text, /kdp_author_missing/);
  });
});
