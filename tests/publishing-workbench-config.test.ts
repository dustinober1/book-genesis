import test from "node:test";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import path from "node:path";

import { DEFAULT_RUN_CONFIG, loadRunConfig } from "../extensions/book-genesis/config.js";
import { withWorkspace } from "./helpers.js";

test("publishing workbench config defaults are migration safe", async () => {
  await withWorkspace((workspace) => {
    const config = loadRunConfig(workspace);
    assert.equal(config.metadataLab.enabled, true);
    assert.equal(config.metadataLab.requiredForKdp, true);
    assert.equal(config.sourceVault.enabled, true);
    assert.equal(config.revisionBoard.enabled, true);
    assert.equal(config.layoutProfiles.defaultProfile, "fiction-paperback-6x9");
    assert.equal(config.workbench.enabled, true);
  });
});

test("partial publishing workbench config is normalized", async () => {
  await withWorkspace((workspace) => {
    writeFileSync(path.join(workspace, "book-genesis.config.json"), JSON.stringify({
      metadataLab: { requiredForKdp: false, maxSubtitleOptions: 9 },
      sourceVault: { requireClaimLinksForNonfiction: false },
      revisionBoard: { defaultPriority: "medium" },
      layoutProfiles: { defaultProfile: "large-print-6x9" },
      workbench: { includeRecentHistoryLimit: 12 },
    }));

    const config = loadRunConfig(workspace);
    assert.equal(config.metadataLab.maxSubtitleOptions, 9);
    assert.equal(config.metadataLab.requiredForKdp, false);
    assert.equal(config.sourceVault.requireClaimLinksForNonfiction, false);
    assert.equal(config.revisionBoard.defaultPriority, "medium");
    assert.equal(config.layoutProfiles.defaultProfile, "large-print-6x9");
    assert.equal(config.workbench.includeRecentHistoryLimit, 12);
  });
});

test("invalid publishing workbench config throws actionable errors", async () => {
  await withWorkspace((workspace) => {
    writeFileSync(path.join(workspace, "book-genesis.config.json"), JSON.stringify({
      revisionBoard: { defaultPriority: "urgent" },
    }));
    assert.throws(() => loadRunConfig(workspace), /revisionBoard.defaultPriority/);
  });
});

test("default config exposes the new sections", () => {
  assert.deepEqual(DEFAULT_RUN_CONFIG.metadataLab.scoringWeights, {
    clarity: 25,
    marketFit: 25,
    keywordCoverage: 20,
    differentiation: 20,
    compliance: 10,
  });
});
