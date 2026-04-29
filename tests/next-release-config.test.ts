import { writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { loadRunConfig } from "../extensions/book-genesis/config.js";
import { readRunState, writeRunState } from "../extensions/book-genesis/state.js";
import { makeRun, withWorkspace } from "./helpers.js";

test("missing nested next-release config uses defaults", async () => {
  await withWorkspace((workspace) => {
    writeFileSync(path.join(workspace, "book-genesis.config.json"), JSON.stringify({ bookMode: "fiction" }), "utf8");
    const config = loadRunConfig(workspace);
    assert.equal(config.style.enabled, true);
    assert.equal(config.critiquePanel.reviewers.length >= 3, true);
    assert.equal(config.coverCheck.minEbookWidth, 625);
  });
});

test("partial nested next-release config is normalized", async () => {
  await withWorkspace((workspace) => {
    writeFileSync(path.join(workspace, "book-genesis.config.json"), JSON.stringify({ style: { bannedPhrases: ["just"] } }), "utf8");
    const config = loadRunConfig(workspace);
    assert.deepEqual(config.style.bannedPhrases, ["just"]);
    assert.equal(config.style.voiceStrictness, "standard");
  });
});

test("invalid next-release enum throws actionable error", async () => {
  await withWorkspace((workspace) => {
    writeFileSync(path.join(workspace, "book-genesis.config.json"), JSON.stringify({ style: { voiceStrictness: "maximum" } }), "utf8");
    assert.throws(() => loadRunConfig(workspace), /style\.voiceStrictness/);
  });
});

test("legacy run state gains new config defaults", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    const legacy = { ...run, config: { bookMode: "fiction" } };
    writeFileSync(run.statePath, `${JSON.stringify(legacy, null, 2)}\n`, "utf8");
    const readBack = readRunState(run.rootDir);
    assert.equal(readBack.config.launchKit.enabled, true);
    assert.equal(readBack.config.revisionPlan.requirePlanBeforeRewrite, true);
    writeRunState(readBack);
  });
});
