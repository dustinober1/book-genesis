import { existsSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import { buildMatterWrappedManuscript, writeBookMatter } from "../extensions/book-genesis/book-matter.js";
import { makeRun, withWorkspace, writeBasicManuscript } from "./helpers.js";

test("book matter supports front matter only, back matter only, and series metadata", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace, {
      bookMatter: {
        frontMatter: ["title-page"],
        backMatter: ["newsletter-cta"],
        series: { name: "Memory City", bookNumber: 2, previousTitle: "The First Theft" },
      },
    });
    writeBasicManuscript(run);
    const result = writeBookMatter(run);
    assert.equal(result.frontFiles.length, 1);
    assert.equal(result.backFiles.length, 1);
    assert.equal(existsSync(result.seriesPath ?? ""), true);
    assert.match(buildMatterWrappedManuscript(run), /Stay Connected/);
  });
});
