import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_RUN_CONFIG, loadRunConfig } from "../extensions/book-genesis/config.js";

function withWorkspace(fn: (workspace: string) => void) {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-config-"));
  try {
    fn(workspace);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("loadRunConfig returns new defaults when config file is absent", () => {
  withWorkspace((workspace) => {
    const config = loadRunConfig(workspace);
    assert.equal(config.bookMode, DEFAULT_RUN_CONFIG.bookMode);
    assert.equal(config.storyBibleEnabled, true);
    assert.deepEqual(config.approvalPhases, []);
    assert.deepEqual(config.exportFormats, ["md", "docx", "epub"]);
  });
});

test("loadRunConfig normalizes new book-writing fields", () => {
  withWorkspace((workspace) => {
    writeFileSync(path.join(workspace, "book-genesis.config.json"), JSON.stringify({
      bookMode: "memoir",
      approvalPhases: ["foundation", "write"],
      sampleChaptersForApproval: 2,
      exportFormats: ["md", "docx"],
      qualityThreshold: 87,
    }));

    const config = loadRunConfig(workspace);
    assert.equal(config.bookMode, "memoir");
    assert.deepEqual(config.approvalPhases, ["foundation", "write"]);
    assert.equal(config.sampleChaptersForApproval, 2);
    assert.deepEqual(config.exportFormats, ["md", "docx"]);
  });
});

test("loadRunConfig rejects invalid book mode and export format", () => {
  withWorkspace((workspace) => {
    writeFileSync(path.join(workspace, "book-genesis.config.json"), JSON.stringify({
      bookMode: "screenplay",
      exportFormats: ["pdf"],
    }));

    assert.throws(() => loadRunConfig(workspace), /bookMode|exportFormats/);
  });
});
