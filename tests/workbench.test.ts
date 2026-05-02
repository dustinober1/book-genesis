import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { buildWorkbench, writeWorkbench } from "../extensions/book-genesis/workbench.js";
import { makeRun, withWorkspace, writeBasicManuscript } from "./helpers.js";

test("workbench summarizes operator state", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    writeBasicManuscript(run);

    const workbench = buildWorkbench(run);
    assert.equal(workbench.runId, run.id);
    assert.match(workbench.next.command, /^\/book-genesis/);
    assert.equal(workbench.artifacts.length > 0, true);
    assert.equal(workbench.readiness.length > 0, true);
  });
});

test("workbench writes console artifacts", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    writeBasicManuscript(run);

    const output = writeWorkbench(run);
    assert.equal(existsSync(output.jsonPath), true);
    assert.equal(existsSync(output.markdownPath), true);
    assert.match(readFileSync(output.markdownPath, "utf8"), /# Book Genesis Workbench/);
  });
});
