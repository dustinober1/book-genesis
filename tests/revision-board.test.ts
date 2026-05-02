import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { buildRevisionBoard, writeRevisionBoard } from "../extensions/book-genesis/revision-board.js";
import { makeRun, withWorkspace, writeBasicManuscript } from "./helpers.js";

test("revision board aggregates actionable tasks", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    writeBasicManuscript(run);

    const board = buildRevisionBoard(run);
    assert.equal(board.runId, run.id);
    assert.equal(board.tasks.length > 0, true);
    assert.equal(board.tasks.every((task) => task.acceptanceCriteria.length > 0), true);
  });
});

test("revision board writes markdown and json", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    writeBasicManuscript(run);

    const output = writeRevisionBoard(run);
    assert.equal(existsSync(output.jsonPath), true);
    assert.equal(existsSync(output.markdownPath), true);
    assert.match(readFileSync(output.markdownPath, "utf8"), /# Revision Board/);
  });
});
