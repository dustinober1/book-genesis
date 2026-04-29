import test from "node:test";
import assert from "node:assert/strict";

import { buildCritiquePanel, calculateDisagreement, writeCritiquePanel } from "../extensions/book-genesis/critique.js";
import { makeRun, withWorkspace, writeBasicManuscript } from "./helpers.js";

test("critique panel has reviewer perspectives and stable disagreement", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    writeBasicManuscript(run);
    const panel = buildCritiquePanel(run);
    assert.equal(panel.reviewers.length >= 3, true);
    assert.equal(panel.disagreement.comparedDimensions > 0, true);
    assert.match(writeCritiquePanel(run).disagreementPath, /critique-disagreement\.md$/);
  });
});

test("calculateDisagreement flags high-delta dimensions", () => {
  const disagreement = calculateDisagreement([
    { reviewer: "a", scores: { marketFit: 90, structure: 90, prose: 90, consistency: 90, deliveryReadiness: 90 }, topStrengths: [], topConcerns: [], requiredFixes: [], optionalFixes: [] },
    { reviewer: "b", scores: { marketFit: 40, structure: 90, prose: 90, consistency: 90, deliveryReadiness: 90 }, topStrengths: [], topConcerns: [], requiredFixes: [], optionalFixes: [] },
  ], 8);
  assert.deepEqual(disagreement.highDisagreementDimensions, ["marketFit"]);
});
