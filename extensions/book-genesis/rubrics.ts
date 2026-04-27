import type { BookMode, RubricDimension } from "./types.js";

const CORE_FICTION_DIMENSIONS: RubricDimension[] = [
  { key: "marketFit", label: "Market Fit", weight: 0.15, threshold: 85 },
  { key: "structure", label: "Structure", weight: 0.2, threshold: 85 },
  { key: "prose", label: "Prose", weight: 0.15, threshold: 85 },
  { key: "consistency", label: "Consistency", weight: 0.15, threshold: 85 },
  { key: "deliveryReadiness", label: "Delivery Readiness", weight: 0.1, threshold: 85 },
];

const RUBRICS: Record<BookMode, RubricDimension[]> = {
  fiction: [
    ...CORE_FICTION_DIMENSIONS,
    { key: "pacing", label: "Pacing", weight: 0.1, threshold: 88 },
    { key: "payoff", label: "Payoff", weight: 0.15, threshold: 88 },
  ],
  memoir: [
    ...CORE_FICTION_DIMENSIONS,
    { key: "vulnerability", label: "Vulnerability", weight: 0.12, threshold: 86 },
    { key: "reflection", label: "Reflection", weight: 0.13, threshold: 86 },
  ],
  "prescriptive-nonfiction": [
    { key: "marketFit", label: "Market Fit", weight: 0.15, threshold: 85 },
    { key: "structure", label: "Structure", weight: 0.15, threshold: 85 },
    { key: "prose", label: "Prose", weight: 0.1, threshold: 80 },
    { key: "consistency", label: "Consistency", weight: 0.15, threshold: 85 },
    { key: "deliveryReadiness", label: "Delivery Readiness", weight: 0.1, threshold: 85 },
    { key: "clarity", label: "Clarity", weight: 0.2, threshold: 90 },
    { key: "authority", label: "Authority", weight: 0.15, threshold: 88 },
  ],
  "narrative-nonfiction": [
    { key: "marketFit", label: "Market Fit", weight: 0.15, threshold: 85 },
    { key: "structure", label: "Structure", weight: 0.2, threshold: 85 },
    { key: "prose", label: "Prose", weight: 0.12, threshold: 83 },
    { key: "consistency", label: "Consistency", weight: 0.13, threshold: 85 },
    { key: "deliveryReadiness", label: "Delivery Readiness", weight: 0.1, threshold: 85 },
    { key: "credibility", label: "Credibility", weight: 0.15, threshold: 88 },
    { key: "narrativeDrive", label: "Narrative Drive", weight: 0.15, threshold: 88 },
  ],
  childrens: [
    { key: "marketFit", label: "Market Fit", weight: 0.15, threshold: 85 },
    { key: "structure", label: "Structure", weight: 0.15, threshold: 85 },
    { key: "prose", label: "Prose", weight: 0.1, threshold: 82 },
    { key: "consistency", label: "Consistency", weight: 0.15, threshold: 85 },
    { key: "deliveryReadiness", label: "Delivery Readiness", weight: 0.1, threshold: 85 },
    { key: "ageFit", label: "Age Fit", weight: 0.2, threshold: 90 },
    { key: "readAloudRhythm", label: "Read Aloud Rhythm", weight: 0.15, threshold: 88 },
  ],
};

export function getRubricForMode(mode: BookMode) {
  return RUBRICS[mode];
}
