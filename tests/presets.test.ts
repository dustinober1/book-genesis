import test from "node:test";
import assert from "node:assert/strict";

import { getPresetForMode } from "../extensions/book-genesis/presets.js";

test("fiction preset requires query package artifacts", () => {
  const preset = getPresetForMode("fiction");
  assert.equal(preset.deliveryArtifacts.includes("delivery/query-letter.md"), true);
  assert.equal(preset.foundationArtifacts.includes("foundation/voice-dna.md"), true);
});

test("prescriptive nonfiction preset requires proposal artifacts", () => {
  const preset = getPresetForMode("prescriptive-nonfiction");
  assert.equal(preset.deliveryArtifacts.includes("delivery/book-proposal.md"), true);
  assert.equal(preset.researchFocus.includes("problem/solution promise"), true);
});

test("childrens preset requires illustrator guidance", () => {
  const preset = getPresetForMode("childrens");
  assert.equal(preset.deliveryArtifacts.includes("delivery/illustrator-brief.md"), true);
});
