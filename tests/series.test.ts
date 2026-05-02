import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import {
  addRunToSeries,
  createSeriesState,
  formatSeriesStatus,
  planNextSeriesBook,
  readSeriesState,
  writeSeriesBible,
  writeSeriesContinuityReport,
  writeSeriesPublishingMetadata,
  writeSeriesState,
} from "../extensions/book-genesis/series.js";
import { readRunState } from "../extensions/book-genesis/state.js";
import { makeRun, withWorkspace, writeBasicManuscript } from "./helpers.js";

test("createSeriesState writes durable series state with publishing and creative defaults", async () => {
  await withWorkspace((workspace) => {
    const series = createSeriesState(workspace, "Memory City", { plannedBookCount: 5 });
    writeSeriesState(series);

    const saved = readSeriesState(series.rootDir);
    assert.equal(saved.name, "Memory City");
    assert.equal(saved.plannedBookCount, 5);
    assert.equal(saved.books.length, 0);
    assert.equal(saved.publishing.seriesName, "Memory City");
    assert.equal(saved.creative.seriesPromise.includes("Memory City"), true);
    assert.equal(existsSync(saved.statePath), true);
  });
});

test("addRunToSeries links a book run and updates bookMatter series metadata", async () => {
  await withWorkspace((workspace) => {
    const series = createSeriesState(workspace, "Memory City", { plannedBookCount: 3 });
    writeSeriesState(series);
    const run = makeRun(workspace);

    const updated = addRunToSeries(series.rootDir, run.rootDir);

    assert.equal(updated.books.length, 1);
    assert.equal(updated.books[0].bookNumber, 1);
    assert.equal(updated.books[0].runDir, run.rootDir);
    const linkedRun = readRunState(run.rootDir);
    assert.equal(linkedRun.config.bookMatter.series?.name, "Memory City");
    assert.equal(linkedRun.config.bookMatter.series?.bookNumber, 1);
    assert.equal(linkedRun.config.bookMatter.series?.nextTitleTeaser, "Book 2 in Memory City");
  });
});

test("planNextSeriesBook writes a starter config and operator command for the next book", async () => {
  await withWorkspace((workspace) => {
    const series = createSeriesState(workspace, "Memory City", { plannedBookCount: 3 });
    writeSeriesState(series);
    addRunToSeries(series.rootDir, makeRun(workspace).rootDir);

    const result = planNextSeriesBook(series.rootDir, "Escalate the city-wide memory conspiracy.");

    assert.equal(result.bookNumber, 2);
    assert.equal(existsSync(result.briefPath), true);
    assert.equal(existsSync(result.configPath), true);
    assert.match(result.command, /\/book-genesis run --config/);
    assert.match(readFileSync(result.briefPath, "utf8"), /Book 2/);
    assert.match(readFileSync(result.configPath, "utf8"), /"bookNumber": 2/);
  });
});

test("series reports cover creative bible, publishing metadata, continuity, and status", async () => {
  await withWorkspace((workspace) => {
    const series = createSeriesState(workspace, "Memory City", { plannedBookCount: 2 });
    writeSeriesState(series);
    const run = makeRun(workspace);
    writeBasicManuscript(run);
    const linked = addRunToSeries(series.rootDir, run.rootDir);

    const bible = writeSeriesBible(linked.rootDir);
    const publishing = writeSeriesPublishingMetadata(linked.rootDir);
    const continuity = writeSeriesContinuityReport(linked.rootDir);

    assert.equal(existsSync(bible.markdownPath), true);
    assert.equal(existsSync(bible.jsonPath), true);
    assert.equal(existsSync(publishing.readingOrderPath), true);
    assert.equal(existsSync(publishing.metadataPath), true);
    assert.equal(existsSync(continuity.markdownPath), true);
    assert.equal(continuity.report.missingLinkedRuns.length, 0);
    assert.match(formatSeriesStatus(readSeriesState(linked.rootDir)), /Memory City/);
    assert.match(readFileSync(path.join(linked.rootDir, "publishing", "reading-order.md"), "utf8"), /Book 1/);
  });
});
