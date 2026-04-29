import test from "node:test";
import assert from "node:assert/strict";

import { buildDoctorReport } from "../extensions/book-genesis/doctor.js";
import { buildRunStats } from "../extensions/book-genesis/stats.js";
import { makeRun, withWorkspace, writeBasicManuscript } from "./helpers.js";

test("stats JSON is parseable and useful", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    writeBasicManuscript(run);
    const stats = buildRunStats(run);
    assert.equal(stats.chapterCount, 2);
    assert.equal(stats.wordCount > 0, true);
  });
});

test("doctor --fix creates safe workspace scaffolding and starter config when mode is provided", async () => {
  await withWorkspace((workspace) => {
    const report = buildDoctorReport({ workspaceRoot: workspace, packageRoot: process.cwd(), includeSiblingExtensions: false, fix: true, mode: "fiction" });
    assert.equal(report.results.some((item) => item.code === "starter_config_created"), true);
  });
});
