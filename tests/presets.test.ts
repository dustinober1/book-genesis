import test from "node:test";
import assert from "node:assert/strict";

import { getArtifactsForPhase, getPresetForMode } from "../extensions/book-genesis/presets.js";

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

test("foundation artifacts omit the story bible when disabled in config", () => {
  const artifacts = getArtifactsForPhase("fiction", "foundation", { storyBibleEnabled: false });
  assert.equal(artifacts.includes("foundation/story-bible.md"), false);
});
