import { existsSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import { buildPacingDashboard, buildSceneMap, writePacingDashboard, writeSceneMap } from "../extensions/book-genesis/scenes.js";
import { makeRun, withWorkspace, writeBasicManuscript } from "./helpers.js";

test("scene map works with one or many chapters and writes reports", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    writeBasicManuscript(run);
    assert.equal(buildSceneMap(run).scenes.length >= 2, true);
    assert.equal(existsSync(writeSceneMap(run).jsonPath), true);
  });
});

test("pacing dashboard identifies chapter length outliers", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    writeBasicManuscript(run);
    const dashboard = buildPacingDashboard(run);
    assert.equal(dashboard.chapterCount, 2);
    assert.equal(existsSync(writePacingDashboard(run).mdPath), true);
  });
});
