import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { buildMetadataLab, writeMetadataLab } from "../extensions/book-genesis/metadata-lab.js";
import { makeRun, withWorkspace, writeBasicManuscript } from "./helpers.js";

test("metadata lab builds scored variants from run positioning", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace, {
      kdp: {
        formats: ["ebook", "paperback"],
        bleed: false,
        authorName: "D. Ober",
        keywords: ["memory theft thriller", "near future crime"],
        categories: ["Fiction / Thrillers / Technological"],
      },
    });
    writeBasicManuscript(run);

    const lab = buildMetadataLab(run);
    assert.equal(lab.runId, run.id);
    assert.equal(lab.subtitleOptions.length > 0, true);
    assert.equal(lab.descriptionOptions.length > 0, true);
    assert.equal(lab.keywordChains.length > 0, true);
    assert.equal(lab.scorecard.bestSubtitle.score.total > 0, true);
  });
});

test("metadata lab writes markdown and json artifacts", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    writeBasicManuscript(run);

    const output = writeMetadataLab(run);
    assert.equal(existsSync(output.jsonPath), true);
    assert.equal(existsSync(output.markdownPath), true);
    assert.match(readFileSync(output.markdownPath, "utf8"), /# Marketplace Metadata Lab/);
    assert.match(readFileSync(path.join(run.rootDir, "delivery", "metadata-lab", "keyword-chains.md"), "utf8"), /Keyword Chains/);
  });
});
