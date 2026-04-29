import { existsSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import { chooseVariant, generateVariants } from "../extensions/book-genesis/variants.js";
import { makeRun, withWorkspace } from "./helpers.js";

test("variant generation writes count-specific files and choice persists", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    const variants = generateVariants(run, 2);
    assert.equal(variants.files.length, 2);
    const choice = chooseVariant(run, 2);
    assert.equal(existsSync(choice.selectedPath), true);
    assert.equal(run.selectedVariantPath, choice.selectedPath);
  });
});

test("choosing a missing variant throws", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    assert.throws(() => chooseVariant(run, 3), /does not exist/);
  });
});
