import test from "node:test";
import assert from "node:assert/strict";

import { parseIndependentEvaluationScores, scoreDisagreement } from "../extensions/book-genesis/evaluation.js";

test("parseIndependentEvaluationScores extracts numeric scores from markdown", () => {
  const parsed = parseIndependentEvaluationScores([
    "# Independent Evaluation",
    "",
    "- marketFit: 88",
    "- structure: 80",
    "prose: 90",
    "consistency: 85",
    "deliveryReadiness: 86",
  ].join("\n"));

  assert.equal(parsed.scores.marketFit, 88);
  assert.equal(parsed.scores.structure, 80);
  assert.equal(parsed.scores.prose, 90);
  assert.equal(parsed.matchedKeys.length >= 5, true);
});

test("scoreDisagreement computes mean absolute delta over overlapping keys", () => {
  const primary = {
    marketFit: 90,
    structure: 90,
    prose: 90,
    consistency: 90,
    deliveryReadiness: 90,
  };

  const independent = {
    marketFit: 80,
    structure: 100,
    prose: 90,
  };

  const result = scoreDisagreement(primary, independent);
  assert.equal(result.compared, 3);
  assert.equal(result.meanAbsDelta, (10 + 10 + 0) / 3);
});

