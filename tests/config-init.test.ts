import test from "node:test";
import assert from "node:assert/strict";

import { loadRunConfig } from "../extensions/book-genesis/config.js";
import { buildStarterConfig, STARTER_CONFIG_MODES, writeStarterConfig } from "../extensions/book-genesis/config-init.js";
import { withWorkspace } from "./helpers.js";

test("buildStarterConfig supports every mode", () => {
  for (const mode of STARTER_CONFIG_MODES) {
    assert.equal(buildStarterConfig(mode).bookMode, mode);
  }
});

test("writeStarterConfig writes loadable config and refuses overwrite", async () => {
  await withWorkspace((workspace) => {
    writeStarterConfig(workspace, "fiction");
    assert.equal(loadRunConfig(workspace).bookMode, "fiction");
    assert.throws(() => writeStarterConfig(workspace, "memoir"), /Refusing to overwrite/);
    writeStarterConfig(workspace, "memoir", true);
    assert.equal(loadRunConfig(workspace).bookMode, "memoir");
  });
});
