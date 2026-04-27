import test from "node:test";
import assert from "node:assert/strict";

import { createQualityGate } from "../extensions/book-genesis/quality.js";

test("fiction rubric weights pacing and payoff heavily", () => {
  const gate = createQualityGate("fiction", {
    threshold: 85,
    scores: {
      marketFit: 90,
      structure: 86,
      prose: 83,
      consistency: 88,
      deliveryReadiness: 90,
      pacing: 91,
      payoff: 92,
    },
    repairBrief: "Tighten voice consistency in chapters 4 through 6.",
  });

  assert.equal(gate.passed, false);
  assert.equal(gate.failedDimensions.includes("prose"), true);
});

test("prescriptive nonfiction rubric fails when clarity drops below its own threshold", () => {
  const gate = createQualityGate("prescriptive-nonfiction", {
    threshold: 85,
    scores: {
      marketFit: 90,
      structure: 88,
      prose: 86,
      consistency: 89,
      deliveryReadiness: 90,
      clarity: 71,
      authority: 92,
    },
    repairBrief: "Simplify chapter exercises and make takeaways explicit.",
  });

  assert.equal(gate.passed, false);
  assert.equal(gate.failedDimensions.includes("clarity"), true);
});

test("quality gate fails when scores clear rubric floors but miss the configured threshold", () => {
  const gate = createQualityGate("fiction", {
    threshold: 90,
    scores: {
      marketFit: 85,
      structure: 85,
      prose: 85,
      consistency: 85,
      deliveryReadiness: 85,
      pacing: 88,
      payoff: 88,
    },
    repairBrief: "Lift the overall draft quality above the target bar.",
  });

  assert.equal(gate.passed, false);
  assert.equal(gate.failedDimensions.length, 0);
});
