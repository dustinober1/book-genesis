import { existsSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import { writeLaunchKit } from "../extensions/book-genesis/launch.js";
import { makeRun, withWorkspace, writeBasicManuscript } from "./helpers.js";

test("launch kit writes every launch artifact for fiction and nonfiction", async () => {
  await withWorkspace((workspace) => {
    for (const bookMode of ["fiction", "prescriptive-nonfiction"] as const) {
      const run = makeRun(workspace, { bookMode });
      writeBasicManuscript(run);
      const { manifest } = writeLaunchKit(run);
      assert.equal(manifest.files.length >= 9, true);
      assert.equal(manifest.files.every((file) => existsSync(file)), true);
    }
  });
});
