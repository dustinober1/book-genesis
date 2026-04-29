import { existsSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";

import { lintStyle, writeStyleLint, writeStyleProfile } from "../extensions/book-genesis/style.js";
import { makeRun, withWorkspace, writeBasicManuscript } from "./helpers.js";

test("style profile and lint write markdown and json", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace, { style: { enabled: true, bannedPhrases: ["Suddenly"], voiceStrictness: "standard", lintOnEvaluate: true } });
    writeBasicManuscript(run);
    const profile = writeStyleProfile(run);
    const lint = writeStyleLint(run);
    assert.equal(existsSync(profile.jsonPath), true);
    assert.equal(existsSync(profile.mdPath), true);
    assert.equal(existsSync(lint.jsonPath), true);
    assert.equal(existsSync(lint.mdPath), true);
  });
});

test("style lint detects banned phrases and empty manuscript", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace, { style: { enabled: true, bannedPhrases: ["Suddenly"], voiceStrictness: "standard", lintOnEvaluate: true } });
    writeBasicManuscript(run);
    assert.equal(lintStyle(run).findings.some((finding) => finding.code === "banned_phrase"), true);
    const empty = makeRun(workspace);
    assert.equal(lintStyle(empty).findings.some((finding) => finding.code === "empty_manuscript"), true);
  });
});
