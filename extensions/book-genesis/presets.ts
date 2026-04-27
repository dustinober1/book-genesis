import type { BookMode, PhaseName } from "./types.js";

export interface BookPreset {
  mode: BookMode;
  researchFocus: string[];
  foundationArtifacts: string[];
  deliveryArtifacts: string[];
  evaluationFocus: string[];
}

const FICTION_FOUNDATION = [
  "foundation/foundation.md",
  "foundation/outline.md",
  "foundation/reader-personas.md",
  "foundation/voice-dna.md",
  "foundation/story-bible.md",
];

const NONFICTION_FOUNDATION = [
  "foundation/foundation.md",
  "foundation/outline.md",
  "foundation/reader-personas.md",
  "foundation/story-bible.md",
];

const PRESETS: Record<BookMode, BookPreset> = {
  fiction: {
    mode: "fiction",
    researchFocus: ["comp titles", "reader desire", "market gap"],
    foundationArtifacts: FICTION_FOUNDATION,
    deliveryArtifacts: [
      "delivery/logline.md",
      "delivery/synopsis.md",
      "delivery/query-letter.md",
      "delivery/cover-brief.md",
      "delivery/package-summary.md",
    ],
    evaluationFocus: ["voice", "pacing", "character payoff"],
  },
  memoir: {
    mode: "memoir",
    researchFocus: ["category expectations", "voice intimacy", "narrative authority"],
    foundationArtifacts: NONFICTION_FOUNDATION,
    deliveryArtifacts: [
      "delivery/logline.md",
      "delivery/synopsis.md",
      "delivery/book-proposal.md",
      "delivery/package-summary.md",
    ],
    evaluationFocus: ["vulnerability", "narrative drive", "earned reflection"],
  },
  "prescriptive-nonfiction": {
    mode: "prescriptive-nonfiction",
    researchFocus: ["problem/solution promise", "reader outcome", "authority gap"],
    foundationArtifacts: NONFICTION_FOUNDATION,
    deliveryArtifacts: [
      "delivery/book-proposal.md",
      "delivery/one-page-synopsis.md",
      "delivery/chapter-summary-grid.md",
      "delivery/package-summary.md",
    ],
    evaluationFocus: ["clarity", "authority", "reader transformation"],
  },
  "narrative-nonfiction": {
    mode: "narrative-nonfiction",
    researchFocus: ["reporting depth", "narrative spine", "reader takeaway"],
    foundationArtifacts: NONFICTION_FOUNDATION,
    deliveryArtifacts: [
      "delivery/logline.md",
      "delivery/synopsis.md",
      "delivery/book-proposal.md",
      "delivery/package-summary.md",
    ],
    evaluationFocus: ["narrative propulsion", "credibility", "structure"],
  },
  childrens: {
    mode: "childrens",
    researchFocus: ["read-aloud rhythm", "age fit", "illustration hooks"],
    foundationArtifacts: [
      "foundation/foundation.md",
      "foundation/outline.md",
      "foundation/reader-personas.md",
      "foundation/story-bible.md",
    ],
    deliveryArtifacts: [
      "delivery/logline.md",
      "delivery/synopsis.md",
      "delivery/illustrator-brief.md",
      "delivery/package-summary.md",
    ],
    evaluationFocus: ["age appropriateness", "voice economy", "visual story support"],
  },
};

const PHASE_DEFAULTS: Record<Exclude<PhaseName, "foundation" | "deliver">, string[]> = {
  kickoff: ["foundation/project-brief.md"],
  research: ["research/market-research.md", "research/bestseller-dna.md"],
  write: [
    "manuscript/chapter-briefs/",
    "manuscript/chapters/",
    "manuscript/full-manuscript.md",
    "manuscript/write-report.md",
    "manuscript/continuity-report.md",
  ],
  evaluate: [
    "evaluations/genesis-score.md",
    "evaluations/beta-readers.md",
    "evaluations/revision-brief.md",
  ],
  revise: ["manuscript/full-manuscript.md", "manuscript/chapters/", "evaluations/revision-log.md"],
};

export function getPresetForMode(mode: BookMode) {
  return PRESETS[mode];
}

export function getArtifactsForPhase(mode: BookMode, phase: PhaseName) {
  if (phase === "foundation") {
    return getPresetForMode(mode).foundationArtifacts;
  }

  if (phase === "deliver") {
    return getPresetForMode(mode).deliveryArtifacts;
  }

  return PHASE_DEFAULTS[phase];
}
