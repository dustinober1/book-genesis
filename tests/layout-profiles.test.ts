import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { getLayoutProfile, writeLayoutProfileReport } from "../extensions/book-genesis/layout-profiles.js";
import { makeRun, withWorkspace, writeBasicManuscript } from "./helpers.js";

test("layout profiles expose trim, margins, and typography settings", () => {
  const profile = getLayoutProfile("fiction-paperback-6x9");
  assert.equal(profile.trimSize, "6 x 9");
  assert.equal(profile.pdfMediaBox.widthPoints, 432);
  assert.equal(profile.pdfMediaBox.heightPoints, 648);
  assert.equal(profile.bodyFontSize > 0, true);
});

test("layout profile report is written into delivery", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    writeBasicManuscript(run);
    const output = writeLayoutProfileReport(run);
    assert.equal(existsSync(output.jsonPath), true);
    assert.match(readFileSync(path.join(run.rootDir, "delivery", "layout-profile.md"), "utf8"), /# Interior Layout Profile/);
  });
});
