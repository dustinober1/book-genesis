import { existsSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import { buildArchiveManifest, writeArchive } from "../extensions/book-genesis/archive.js";
import { makeRun, withWorkspace, writeBasicManuscript } from "./helpers.js";

test("archive manifest is stable and includes run files", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    writeBasicManuscript(run);
    const manifest = buildArchiveManifest(run);
    assert.equal(manifest.files.some((file) => file.path === "manuscript/full-manuscript.md"), true);
    assert.equal(existsSync(writeArchive(run).manifestPath), true);
  });
});
