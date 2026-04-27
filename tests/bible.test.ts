import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_RUN_CONFIG } from "../extensions/book-genesis/config.js";
import { createRunState } from "../extensions/book-genesis/state.js";
import { readStoryBible, upsertStoryBible } from "../extensions/book-genesis/bible.js";

function withRun(fn: (run: ReturnType<typeof createRunState>) => void) {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-bible-"));
  try {
    fn(createRunState(workspace, "multi-generational family saga", DEFAULT_RUN_CONFIG));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("upsertStoryBible creates a readable bible file and json payload", () => {
  withRun((run) => {
    const result = upsertStoryBible(run, {
      premise: "Three sisters inherit a failing vineyard.",
      characters: [{ id: "rosa", name: "Rosa Vale", role: "eldest sister", desire: "save the estate" }],
      promises: ["Each sister must sacrifice something real by the ending."],
    });

    assert.match(result.markdownPath, /story-bible\.md$/);
    assert.match(result.jsonPath, /story-bible\.json$/);

    const bible = readStoryBible(run);
    assert.equal(bible.characters[0].name, "Rosa Vale");
    assert.equal(bible.promises.length, 1);
  });
});

test("upsertStoryBible merges later updates instead of replacing prior sections", () => {
  withRun((run) => {
    upsertStoryBible(run, {
      premise: "A survival memoir about rebuilding after wildfire.",
      glossary: [{ term: "red flag day", definition: "a day of extreme fire danger" }],
    });

    upsertStoryBible(run, {
      settings: [{ name: "Cedar Ridge", function: "primary hometown", rules: ["water is scarce in summer"] }],
    });

    const bible = readStoryBible(run);
    assert.equal(bible.glossary.length, 1);
    assert.equal(bible.settings.length, 1);
  });
});
