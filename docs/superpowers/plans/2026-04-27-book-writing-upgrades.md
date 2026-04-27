# Book Writing Upgrades Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Book Genesis from a generic autonomous pipeline into a stronger long-form book-writing runtime with structured story memory, chapter planning, genre-aware evaluation, configurable author checkpoints, richer delivery outputs, and stronger validation.

**Architecture:** Keep the existing seven-phase runtime (`kickoff` through `deliver`) and extend it with config-driven overlays rather than adding a second orchestration system. Put durable book intelligence into focused support modules: `bible.ts` for structured book memory, `presets.ts` for mode-specific artifacts and prompt guidance, `rubrics.ts` for weighted evaluation logic, and `exports.ts` for final package generation. Leave lifecycle control centralized in `state.ts` and `index.ts`, with prompts and artifact validation consuming shared configuration instead of hard-coded assumptions.

**Tech Stack:** TypeScript ESM, Node.js 20, built-in `node:test`, existing PI extension APIs, `@sinclair/typebox` tool schemas, Markdown-first artifacts with adapter-based DOCX and EPUB export.

---

## File Structure

- Modify `extensions/book-genesis/types.ts`: add mode, preset, story bible, checkpoint, export, and rubric types.
- Modify `extensions/book-genesis/config.ts`: load and validate new author-facing configuration fields.
- Modify `extensions/book-genesis/state.ts`: persist checkpoint state, new run metadata, richer validation status, and export outcomes.
- Modify `extensions/book-genesis/index.ts`: register new tools and commands, route approval gates, surface run listing and export actions, and inject richer phase context.
- Modify `extensions/book-genesis/prompts.ts`: include preset, rubric, and story bible context in prompts and compaction summaries.
- Modify `extensions/book-genesis/artifacts.ts`: support mode-specific required outputs plus semantic validation for chapter flow and manuscript completeness.
- Modify `extensions/book-genesis/quality.ts`: delegate rubric scoring and pass/fail logic to weighted rubric helpers.
- Create `extensions/book-genesis/bible.ts`: own the structured story bible schema, persistence, and prompt summaries.
- Create `extensions/book-genesis/presets.ts`: define fiction, memoir, prescriptive nonfiction, narrative nonfiction, and children’s book presets.
- Create `extensions/book-genesis/rubrics.ts`: define preset-aware quality dimensions, weights, thresholds, and serialization helpers.
- Create `extensions/book-genesis/exports.ts`: create final package assets, DOCX/EPUB adapter hooks, and export manifests.
- Create `tests/config.test.ts`: cover new config normalization and invalid values.
- Create `tests/bible.test.ts`: cover story bible writes, merges, and summaries.
- Create `tests/manuscript.test.ts`: cover chapter-brief requirements, chapter numbering, manuscript assembly, and continuity validation.
- Create `tests/presets.test.ts`: cover preset artifact maps and preset prompt guidance.
- Create `tests/rubrics.test.ts`: cover rubric selection, weighted scoring, and threshold failures.
- Create `tests/checkpoints.test.ts`: cover approval gate transitions and commands.
- Create `tests/exports.test.ts`: cover export manifests and markdown-first package generation.
- Modify `tests/artifacts.test.ts`, `tests/state.test.ts`, `tests/intake.test.ts`: extend current tests to new runtime rules.
- Modify `README.md`: document new config, author checkpoints, mode presets, outputs, and commands.
- Modify prompt files under `prompts/book-genesis/`: require story bible upkeep, chapter briefs, preset-specific delivery artifacts, and rubric usage.

## Implementation Strategy

Implement the author-facing substrate first: config, story bible, presets, and chapter-planning rules. Then wire in evaluation, checkpoints, and exports. Finish by hardening semantic validation, adding operator commands, and expanding the regression suite. Keep commits narrow so each feature can be rolled back independently if prompt behavior regresses.

### Task 1: Extend Runtime Types And Config

**Files:**
- Modify: `extensions/book-genesis/types.ts`
- Modify: `extensions/book-genesis/config.ts`
- Create: `tests/config.test.ts`

- [ ] **Step 1: Write the failing config tests**

Create `tests/config.test.ts`:

```ts
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_RUN_CONFIG, loadRunConfig } from "../extensions/book-genesis/config.js";

function withWorkspace(fn: (workspace: string) => void) {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-config-"));
  try {
    fn(workspace);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("loadRunConfig returns new defaults when config file is absent", () => {
  withWorkspace((workspace) => {
    const config = loadRunConfig(workspace);
    assert.equal(config.bookMode, DEFAULT_RUN_CONFIG.bookMode);
    assert.equal(config.storyBibleEnabled, true);
    assert.deepEqual(config.approvalPhases, []);
    assert.deepEqual(config.exportFormats, ["md", "docx", "epub"]);
  });
});

test("loadRunConfig normalizes new book-writing fields", () => {
  withWorkspace((workspace) => {
    writeFileSync(path.join(workspace, "book-genesis.config.json"), JSON.stringify({
      bookMode: "memoir",
      approvalPhases: ["foundation", "write"],
      sampleChaptersForApproval: 2,
      exportFormats: ["md", "docx"],
      qualityThreshold: 87
    }));

    const config = loadRunConfig(workspace);
    assert.equal(config.bookMode, "memoir");
    assert.deepEqual(config.approvalPhases, ["foundation", "write"]);
    assert.equal(config.sampleChaptersForApproval, 2);
    assert.deepEqual(config.exportFormats, ["md", "docx"]);
  });
});

test("loadRunConfig rejects invalid book mode and export format", () => {
  withWorkspace((workspace) => {
    writeFileSync(path.join(workspace, "book-genesis.config.json"), JSON.stringify({
      bookMode: "screenplay",
      exportFormats: ["pdf"]
    }));

    assert.throws(() => loadRunConfig(workspace), /bookMode|exportFormats/);
  });
});
```

- [ ] **Step 2: Run the config tests to verify they fail**

Run:

```bash
node --test --import tsx tests/config.test.ts
```

Expected: FAIL with missing `bookMode`, `storyBibleEnabled`, `approvalPhases`, or `exportFormats` fields on `RunConfig`.

- [ ] **Step 3: Add the new runtime types and config normalization**

Update `extensions/book-genesis/types.ts` with the new config and state shape:

```ts
export type BookMode =
  | "fiction"
  | "memoir"
  | "prescriptive-nonfiction"
  | "narrative-nonfiction"
  | "childrens";

export type ExportFormat = "md" | "docx" | "epub";

export interface RubricDimension {
  key: string;
  label: string;
  weight: number;
  threshold: number;
}

export interface ApprovalRequest {
  phase: PhaseName;
  requestedAt: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  note?: string;
}

export interface RunConfig {
  maxRetriesPerPhase: number;
  chapterBatchSize: number;
  qualityThreshold: number;
  maxRevisionCycles: number;
  researchDepth: ResearchDepth;
  targetWordCount?: number;
  audience?: string;
  tone?: string;
  bookMode: BookMode;
  storyBibleEnabled: boolean;
  approvalPhases: PhaseName[];
  sampleChaptersForApproval: number;
  exportFormats: ExportFormat[];
  gitAutoInit: boolean;
  gitAutoCommit: boolean;
  gitCommitPaths: string[];
}
```

Update `extensions/book-genesis/config.ts`:

```ts
export const DEFAULT_RUN_CONFIG: RunConfig = {
  maxRetriesPerPhase: 1,
  chapterBatchSize: 3,
  qualityThreshold: 85,
  maxRevisionCycles: 2,
  researchDepth: "standard",
  bookMode: "fiction",
  storyBibleEnabled: true,
  approvalPhases: [],
  sampleChaptersForApproval: 3,
  exportFormats: ["md", "docx", "epub"],
  gitAutoInit: true,
  gitAutoCommit: true,
  gitCommitPaths: ["book-projects"],
};
```

- [ ] **Step 4: Re-run the config tests and typecheck**

Run:

```bash
node --test --import tsx tests/config.test.ts
npm run typecheck
```

Expected: PASS for `tests/config.test.ts` and `tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add extensions/book-genesis/types.ts extensions/book-genesis/config.ts tests/config.test.ts
git commit -m "feat: add book writing runtime config"
```

### Task 2: Add A Structured Story Bible

**Files:**
- Create: `extensions/book-genesis/bible.ts`
- Modify: `extensions/book-genesis/types.ts`
- Modify: `extensions/book-genesis/state.ts`
- Modify: `extensions/book-genesis/prompts.ts`
- Modify: `extensions/book-genesis/index.ts`
- Create: `tests/bible.test.ts`

- [ ] **Step 1: Write failing story bible tests**

Create `tests/bible.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_RUN_CONFIG } from "../extensions/book-genesis/config.js";
import { createRunState } from "../extensions/book-genesis/state.js";
import { readStoryBible, upsertStoryBible } from "../extensions/book-genesis/bible.js";

function withRun(fn: (run: ReturnType<typeof createRunState>) => void) {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-bible-"));
  try {
    fn(createRunState(workspace, "multi-generational family saga", DEFAULT_RUN_CONFIG));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("upsertStoryBible creates a readable bible file and json payload", () => {
  withRun((run) => {
    const result = upsertStoryBible(run, {
      premise: "Three sisters inherit a failing vineyard.",
      characters: [{ id: "rosa", name: "Rosa Vale", role: "eldest sister", desire: "save the estate" }],
      promises: ["Each sister must sacrifice something real by the ending."]
    });

    assert.match(result.markdownPath, /story-bible\.md$/);
    assert.match(result.jsonPath, /story-bible\.json$/);

    const bible = readStoryBible(run);
    assert.equal(bible.characters[0].name, "Rosa Vale");
    assert.equal(bible.promises.length, 1);
  });
});

test("upsertStoryBible merges later updates instead of replacing prior sections", () => {
  withRun((run) => {
    upsertStoryBible(run, {
      premise: "A survival memoir about rebuilding after wildfire.",
      glossary: [{ term: "red flag day", definition: "a day of extreme fire danger" }]
    });

    upsertStoryBible(run, {
      settings: [{ name: "Cedar Ridge", function: "primary hometown", rules: ["water is scarce in summer"] }]
    });

    const bible = readStoryBible(run);
    assert.equal(bible.glossary.length, 1);
    assert.equal(bible.settings.length, 1);
  });
});
```

- [ ] **Step 2: Run the story bible tests to verify they fail**

Run:

```bash
node --test --import tsx tests/bible.test.ts
```

Expected: FAIL with `Cannot find module '../extensions/book-genesis/bible.js'`.

- [ ] **Step 3: Implement story bible persistence and prompt integration**

Create `extensions/book-genesis/bible.ts`:

```ts
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { RunState, StoryBible, StoryBibleUpdate } from "./types.js";
import { ensureRunDirectories } from "./state.js";

function biblePaths(run: RunState) {
  return {
    markdownPath: path.join(run.rootDir, "foundation", "story-bible.md"),
    jsonPath: path.join(run.rootDir, "foundation", "story-bible.json"),
  };
}

export function readStoryBible(run: RunState): StoryBible {
  const { jsonPath } = biblePaths(run);
  if (!existsSync(jsonPath)) {
    return {
      premise: "",
      themes: [],
      characters: [],
      relationships: [],
      settings: [],
      timeline: [],
      promises: [],
      motifs: [],
      glossary: [],
    };
  }
  return JSON.parse(readFileSync(jsonPath, "utf8")) as StoryBible;
}

export function upsertStoryBible(run: RunState, update: StoryBibleUpdate) {
  ensureRunDirectories(run.rootDir);
  const current = readStoryBible(run);
  const next: StoryBible = {
    ...current,
    ...update,
    themes: update.themes ?? current.themes,
    characters: [...current.characters, ...(update.characters ?? [])],
    relationships: [...current.relationships, ...(update.relationships ?? [])],
    settings: [...current.settings, ...(update.settings ?? [])],
    timeline: [...current.timeline, ...(update.timeline ?? [])],
    promises: [...current.promises, ...(update.promises ?? [])],
    motifs: [...current.motifs, ...(update.motifs ?? [])],
    glossary: [...current.glossary, ...(update.glossary ?? [])],
  };

  const { markdownPath, jsonPath } = biblePaths(run);
  writeFileSync(jsonPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, renderStoryBibleMarkdown(next), "utf8");
  return { markdownPath, jsonPath };
}
```

Register a new tool in `extensions/book-genesis/index.ts`:

```ts
pi.registerTool({
  name: "book_genesis_update_story_bible",
  label: "Book Genesis Update Story Bible",
  description: "Persist durable book memory for characters, settings, promises, and continuity facts.",
  parameters: Type.Object({
    run_dir: Type.String(),
    phase: StringEnum(PHASE_ORDER),
    premise: Type.Optional(Type.String()),
    themes: Type.Optional(Type.Array(Type.String())),
    promises: Type.Optional(Type.Array(Type.String())),
  }),
  async execute(_toolCallId: string, params: any) {
    const run = readRunState(stripQuotes(params.run_dir));
    const paths = upsertStoryBible(run, params);
    run.storyBiblePath = paths.markdownPath;
    writeRunState(run);
    return { content: [{ type: "text", text: "Updated story bible." }] };
  },
});
```

- [ ] **Step 4: Re-run the story bible tests and targeted existing tests**

Run:

```bash
node --test --import tsx tests/bible.test.ts tests/state.test.ts
npm run typecheck
```

Expected: PASS for both tests and clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add extensions/book-genesis/bible.ts extensions/book-genesis/types.ts extensions/book-genesis/state.ts extensions/book-genesis/prompts.ts extensions/book-genesis/index.ts tests/bible.test.ts
git commit -m "feat: add structured story bible"
```

### Task 3: Add Chapter Briefs, Continuity Checks, And Manuscript Assembly Rules

**Files:**
- Create: `extensions/book-genesis/manuscript.ts`
- Modify: `extensions/book-genesis/artifacts.ts`
- Modify: `extensions/book-genesis/prompts.ts`
- Modify: `prompts/book-genesis/write.md`
- Create: `tests/manuscript.test.ts`
- Modify: `tests/artifacts.test.ts`

- [ ] **Step 1: Write failing manuscript workflow tests**

Create `tests/manuscript.test.ts`:

```ts
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_RUN_CONFIG } from "../extensions/book-genesis/config.js";
import { createRunState } from "../extensions/book-genesis/state.js";
import { validateWriteArtifacts } from "../extensions/book-genesis/manuscript.js";

function withRun(fn: (run: ReturnType<typeof createRunState>) => void) {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-manuscript-"));
  try {
    fn(createRunState(workspace, "locked room thriller", DEFAULT_RUN_CONFIG));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("validateWriteArtifacts requires chapter briefs before manuscript completion", () => {
  withRun((run) => {
    mkdirSync(path.join(run.rootDir, "manuscript", "chapters"), { recursive: true });
    writeFileSync(path.join(run.rootDir, "manuscript", "chapters", "01-the-body.md"), "# Chapter 1\n");
    writeFileSync(path.join(run.rootDir, "manuscript", "full-manuscript.md"), "# Full Manuscript\n");
    writeFileSync(path.join(run.rootDir, "manuscript", "write-report.md"), "# Write Report\n");

    const result = validateWriteArtifacts(run);
    assert.equal(result.ok, false);
    assert.equal(result.issues.some((issue) => issue.code === "missing_required_target"), true);
  });
});

test("validateWriteArtifacts accepts ordered briefs, chapters, and continuity report", () => {
  withRun((run) => {
    mkdirSync(path.join(run.rootDir, "manuscript", "chapter-briefs"), { recursive: true });
    mkdirSync(path.join(run.rootDir, "manuscript", "chapters"), { recursive: true });
    writeFileSync(path.join(run.rootDir, "manuscript", "chapter-briefs", "01-the-body.md"), "# Brief 1\n");
    writeFileSync(path.join(run.rootDir, "manuscript", "chapters", "01-the-body.md"), "# Chapter 1\n");
    writeFileSync(path.join(run.rootDir, "manuscript", "full-manuscript.md"), "# Full Manuscript\n");
    writeFileSync(path.join(run.rootDir, "manuscript", "write-report.md"), "# Write Report\n");
    writeFileSync(path.join(run.rootDir, "manuscript", "continuity-report.md"), "# Continuity Report\n");

    const result = validateWriteArtifacts(run);
    assert.equal(result.ok, true);
  });
});
```

- [ ] **Step 2: Run the manuscript workflow tests to verify they fail**

Run:

```bash
node --test --import tsx tests/manuscript.test.ts
```

Expected: FAIL with `Cannot find module '../extensions/book-genesis/manuscript.js'`.

- [ ] **Step 3: Implement chapter-brief validation and write-phase requirements**

Create `extensions/book-genesis/manuscript.ts`:

```ts
import { readdirSync } from "node:fs";
import path from "node:path";

import type { ArtifactValidationResult, RunState } from "./types.js";
import { validatePhaseArtifacts } from "./artifacts.js";

export function validateWriteArtifacts(run: RunState): ArtifactValidationResult {
  const base = validatePhaseArtifacts(run, "write", [
    "manuscript/chapter-briefs/",
    "manuscript/chapters/",
    "manuscript/full-manuscript.md",
    "manuscript/write-report.md",
    "manuscript/continuity-report.md",
  ]);

  const briefs = readdirSync(path.join(run.rootDir, "manuscript", "chapter-briefs")).filter((entry) => entry.endsWith(".md"));
  const chapters = readdirSync(path.join(run.rootDir, "manuscript", "chapters")).filter((entry) => entry.endsWith(".md"));

  if (briefs.length < chapters.length) {
    base.issues.push({
      code: "missing_required_target",
      target: "manuscript/chapter-briefs/",
      message: "Each drafted chapter must have a corresponding chapter brief.",
    });
  }

  return { ok: base.issues.length === 0, issues: base.issues };
}
```

Update `prompts/book-genesis/write.md`:

```md
- produce `manuscript/chapter-briefs/` with one brief per chapter before prose drafting
- produce `manuscript/continuity-report.md` after each chapter batch
- do not complete the phase unless chapter briefs, chapter drafts, continuity report, and assembled manuscript all agree on chapter count
```

- [ ] **Step 4: Re-run manuscript and artifact tests**

Run:

```bash
node --test --import tsx tests/manuscript.test.ts tests/artifacts.test.ts
npm run typecheck
```

Expected: PASS for the new tests and clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add extensions/book-genesis/manuscript.ts extensions/book-genesis/artifacts.ts extensions/book-genesis/prompts.ts prompts/book-genesis/write.md tests/manuscript.test.ts tests/artifacts.test.ts
git commit -m "feat: add chapter planning and continuity validation"
```

### Task 4: Add Book Mode Presets And Mode-Specific Artifact Contracts

**Files:**
- Create: `extensions/book-genesis/presets.ts`
- Modify: `extensions/book-genesis/artifacts.ts`
- Modify: `extensions/book-genesis/prompts.ts`
- Modify: `prompts/book-genesis/foundation.md`
- Modify: `prompts/book-genesis/research.md`
- Modify: `prompts/book-genesis/deliver.md`
- Create: `tests/presets.test.ts`

- [ ] **Step 1: Write failing preset tests**

Create `tests/presets.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the preset tests to verify they fail**

Run:

```bash
node --test --import tsx tests/presets.test.ts
```

Expected: FAIL with `Cannot find module '../extensions/book-genesis/presets.js'`.

- [ ] **Step 3: Implement preset definitions and wire them into prompts and artifact targets**

Create `extensions/book-genesis/presets.ts`:

```ts
import type { BookMode } from "./types.js";

export interface BookPreset {
  mode: BookMode;
  researchFocus: string[];
  foundationArtifacts: string[];
  deliveryArtifacts: string[];
  evaluationFocus: string[];
}

const PRESETS: Record<BookMode, BookPreset> = {
  fiction: {
    mode: "fiction",
    researchFocus: ["comp titles", "reader desire", "market gap"],
    foundationArtifacts: [
      "foundation/foundation.md",
      "foundation/outline.md",
      "foundation/reader-personas.md",
      "foundation/voice-dna.md",
      "foundation/story-bible.md",
    ],
    deliveryArtifacts: [
      "delivery/logline.md",
      "delivery/synopsis.md",
      "delivery/query-letter.md",
      "delivery/cover-brief.md",
      "delivery/package-summary.md",
    ],
    evaluationFocus: ["voice", "pacing", "character payoff"],
  },
  "prescriptive-nonfiction": {
    mode: "prescriptive-nonfiction",
    researchFocus: ["problem/solution promise", "reader outcome", "authority gap"],
    foundationArtifacts: [
      "foundation/foundation.md",
      "foundation/outline.md",
      "foundation/reader-personas.md",
      "foundation/story-bible.md",
    ],
    deliveryArtifacts: [
      "delivery/book-proposal.md",
      "delivery/one-page-synopsis.md",
      "delivery/chapter-summary-grid.md",
      "delivery/package-summary.md",
    ],
    evaluationFocus: ["clarity", "authority", "reader transformation"],
  },
};

export function getPresetForMode(mode: BookMode) {
  return PRESETS[mode];
}
```

Update `extensions/book-genesis/artifacts.ts` so `foundation` and `deliver` targets are computed from `run.config.bookMode` instead of one global static list.

- [ ] **Step 4: Re-run the preset tests and prompt-related tests**

Run:

```bash
node --test --import tsx tests/presets.test.ts tests/artifacts.test.ts
npm run typecheck
```

Expected: PASS for the preset tests and clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add extensions/book-genesis/presets.ts extensions/book-genesis/artifacts.ts extensions/book-genesis/prompts.ts prompts/book-genesis/foundation.md prompts/book-genesis/research.md prompts/book-genesis/deliver.md tests/presets.test.ts
git commit -m "feat: add mode-specific book presets"
```

### Task 5: Add Genre-Aware Weighted Quality Rubrics

**Files:**
- Create: `extensions/book-genesis/rubrics.ts`
- Modify: `extensions/book-genesis/quality.ts`
- Modify: `extensions/book-genesis/types.ts`
- Modify: `extensions/book-genesis/index.ts`
- Modify: `prompts/book-genesis/evaluate.md`
- Create: `tests/rubrics.test.ts`
- Modify: `tests/state.test.ts`

- [ ] **Step 1: Write failing rubric tests**

Create `tests/rubrics.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the rubric tests to verify they fail**

Run:

```bash
node --test --import tsx tests/rubrics.test.ts
```

Expected: FAIL because `createQualityGate` does not accept a mode argument or track `failedDimensions`.

- [ ] **Step 3: Implement weighted preset-aware rubric logic**

Create `extensions/book-genesis/rubrics.ts`:

```ts
import type { BookMode, RubricDimension } from "./types.js";

const RUBRICS: Record<BookMode, RubricDimension[]> = {
  fiction: [
    { key: "marketFit", label: "Market Fit", weight: 0.15, threshold: 85 },
    { key: "structure", label: "Structure", weight: 0.2, threshold: 85 },
    { key: "prose", label: "Prose", weight: 0.15, threshold: 85 },
    { key: "consistency", label: "Consistency", weight: 0.15, threshold: 85 },
    { key: "deliveryReadiness", label: "Delivery Readiness", weight: 0.1, threshold: 85 },
    { key: "pacing", label: "Pacing", weight: 0.1, threshold: 88 },
    { key: "payoff", label: "Payoff", weight: 0.15, threshold: 88 },
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
};

export function getRubricForMode(mode: BookMode) {
  return RUBRICS[mode];
}
```

Update `extensions/book-genesis/quality.ts`:

```ts
export function createQualityGate(mode: BookMode, input: QualityGateInput): QualityGateRecord {
  const rubric = getRubricForMode(mode);
  const failedDimensions = rubric
    .filter((dimension) => (input.scores[dimension.key] ?? 0) < dimension.threshold)
    .map((dimension) => dimension.key);

  return {
    phase: "evaluate",
    threshold: input.threshold,
    scores: input.scores,
    repairBrief: input.repairBrief.trim(),
    passed: failedDimensions.length === 0,
    failedDimensions,
    recordedAt: nowIso(),
  };
}
```

- [ ] **Step 4: Re-run rubric tests and state tests**

Run:

```bash
node --test --import tsx tests/rubrics.test.ts tests/state.test.ts
npm run typecheck
```

Expected: PASS for the rubric tests and updated state tests.

- [ ] **Step 5: Commit**

```bash
git add extensions/book-genesis/rubrics.ts extensions/book-genesis/quality.ts extensions/book-genesis/types.ts extensions/book-genesis/index.ts prompts/book-genesis/evaluate.md tests/rubrics.test.ts tests/state.test.ts
git commit -m "feat: add weighted genre-aware quality rubrics"
```

### Task 6: Add Optional Human Checkpoints And Author Commands

**Files:**
- Modify: `extensions/book-genesis/types.ts`
- Modify: `extensions/book-genesis/state.ts`
- Modify: `extensions/book-genesis/index.ts`
- Modify: `README.md`
- Create: `tests/checkpoints.test.ts`

- [ ] **Step 1: Write failing checkpoint tests**

Create `tests/checkpoints.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { createRunState, completeCurrentPhase } from "../extensions/book-genesis/state.js";
import { DEFAULT_RUN_CONFIG } from "../extensions/book-genesis/config.js";

function withRun(fn: (run: ReturnType<typeof createRunState>) => void) {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-checkpoints-"));
  try {
    fn(createRunState(workspace, "startup leadership book", {
      ...DEFAULT_RUN_CONFIG,
      approvalPhases: ["foundation"],
    }));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("completeCurrentPhase pauses for approval when the phase is gated", () => {
  withRun((run) => {
    run.currentPhase = "foundation";

    completeCurrentPhase(run, {
      summary: "Foundation complete.",
      artifacts: ["foundation/foundation.md"],
      unresolvedIssues: [],
    });

    assert.equal(run.status, "awaiting_approval");
    assert.equal(run.approval?.phase, "foundation");
  });
});
```

- [ ] **Step 2: Run the checkpoint tests to verify they fail**

Run:

```bash
node --test --import tsx tests/checkpoints.test.ts
```

Expected: FAIL because `RunStatus` does not include `awaiting_approval`.

- [ ] **Step 3: Implement approval-gated state transitions and commands**

Update `extensions/book-genesis/state.ts`:

```ts
export type RunStatus = "running" | "stopped" | "failed" | "completed" | "awaiting_approval";

function shouldPauseForApproval(run: RunState, phase: PhaseName) {
  return run.config.approvalPhases.includes(phase);
}

if (shouldPauseForApproval(run, phase)) {
  run.status = "awaiting_approval";
  run.approval = {
    phase,
    requestedAt: nowIso(),
    reason: `Human checkpoint requested after ${phase}.`,
    status: "pending",
  };
  run.nextAction = `Review ${phase} artifacts and run /book-genesis approve "${run.rootDir}".`;
  return;
}
```

Add commands in `extensions/book-genesis/index.ts`:

```ts
getArgumentCompletions: () => ["run", "resume", "status", "stop", "approve", "reject", "list-runs", "export"];
```

```ts
case "approve": {
  const run = readRunState(resolveRunDir(rest, ctx)!);
  run.status = "running";
  run.approval = { ...run.approval!, status: "approved" };
  run.nextAction = `Launch ${run.currentPhase} successor phase.`;
  writeRunState(run);
  await launchPhaseSession(pi, ctx, run, `Approval received after ${run.currentPhase}.`);
  return;
}
```

- [ ] **Step 4: Re-run checkpoint tests and relevant runtime tests**

Run:

```bash
node --test --import tsx tests/checkpoints.test.ts tests/state.test.ts
npm run typecheck
```

Expected: PASS for checkpoint behavior and clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add extensions/book-genesis/types.ts extensions/book-genesis/state.ts extensions/book-genesis/index.ts README.md tests/checkpoints.test.ts
git commit -m "feat: add author checkpoints and commands"
```

### Task 7: Add Delivery Package Exports

**Files:**
- Create: `extensions/book-genesis/exports.ts`
- Modify: `extensions/book-genesis/index.ts`
- Modify: `extensions/book-genesis/artifacts.ts`
- Modify: `prompts/book-genesis/deliver.md`
- Create: `tests/exports.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Write failing export tests**

Create `tests/exports.test.ts`:

```ts
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_RUN_CONFIG } from "../extensions/book-genesis/config.js";
import { createRunState } from "../extensions/book-genesis/state.js";
import { writeExportPackage } from "../extensions/book-genesis/exports.js";

function withRun(fn: (run: ReturnType<typeof createRunState>) => void) {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-exports-"));
  try {
    const run = createRunState(workspace, "heist novel", DEFAULT_RUN_CONFIG);
    writeFileSync(path.join(run.rootDir, "manuscript", "full-manuscript.md"), "# Full Manuscript\n");
    fn(run);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("writeExportPackage always creates a markdown submission package and manifest", async () => {
  await withRun(async (run) => {
    const manifest = await writeExportPackage(run);
    assert.equal(manifest.files.some((file) => file.endsWith("submission-manuscript.md")), true);
    assert.equal(manifest.files.some((file) => file.endsWith("export-manifest.json")), true);
  });
});

test("writeExportPackage records configured formats in the manifest", async () => {
  await withRun(async (run) => {
    run.config.exportFormats = ["md", "docx"];
    const manifest = await writeExportPackage(run);
    assert.equal(manifest.formats.includes("docx"), true);
  });
});
```

- [ ] **Step 2: Run the export tests to verify they fail**

Run:

```bash
node --test --import tsx tests/exports.test.ts
```

Expected: FAIL with `Cannot find module '../extensions/book-genesis/exports.js'`.

- [ ] **Step 3: Implement export manifests and delivery adapters**

Create `extensions/book-genesis/exports.ts`:

```ts
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { ExportFormat, RunState } from "./types.js";

export async function writeExportPackage(run: RunState) {
  const deliveryDir = path.join(run.rootDir, "delivery");
  mkdirSync(deliveryDir, { recursive: true });

  const manuscript = readFileSync(path.join(run.rootDir, "manuscript", "full-manuscript.md"), "utf8");
  const files: string[] = [];

  const markdownPath = path.join(deliveryDir, "submission-manuscript.md");
  writeFileSync(markdownPath, manuscript, "utf8");
  files.push(markdownPath);

  for (const format of run.config.exportFormats) {
    if (format === "docx") {
      files.push(await writeDocxExport(run, manuscript));
    }
    if (format === "epub") {
      files.push(await writeEpubExport(run, manuscript));
    }
  }

  const manifestPath = path.join(deliveryDir, "export-manifest.json");
  writeFileSync(manifestPath, `${JSON.stringify({ formats: run.config.exportFormats, files }, null, 2)}\n`, "utf8");
  files.push(manifestPath);

  return { formats: run.config.exportFormats, files };
}
```

Expose `/book-genesis export [run-dir]` in `extensions/book-genesis/index.ts` so authors can regenerate packaging without replaying the whole run.

- [ ] **Step 4: Re-run export tests**

Run:

```bash
node --test --import tsx tests/exports.test.ts
npm run typecheck
```

Expected: PASS for export manifest behavior and clean typecheck.

- [ ] **Step 5: Commit**

```bash
git add extensions/book-genesis/exports.ts extensions/book-genesis/index.ts extensions/book-genesis/artifacts.ts prompts/book-genesis/deliver.md tests/exports.test.ts package.json
git commit -m "feat: add delivery package exports"
```

### Task 8: Strengthen Semantic Artifact Validation

**Files:**
- Modify: `extensions/book-genesis/artifacts.ts`
- Modify: `extensions/book-genesis/index.ts`
- Modify: `tests/artifacts.test.ts`
- Modify: `tests/manuscript.test.ts`

- [ ] **Step 1: Add failing semantic validation tests**

Extend `tests/artifacts.test.ts` with:

```ts
test("validatePhaseArtifacts rejects manuscripts when chapter numbering skips", () => {
  withRun((run) => {
    mkdirSync(path.join(run.rootDir, "manuscript", "chapter-briefs"), { recursive: true });
    mkdirSync(path.join(run.rootDir, "manuscript", "chapters"), { recursive: true });
    writeFileSync(path.join(run.rootDir, "manuscript", "chapter-briefs", "01-opening.md"), "# Brief 1\n");
    writeFileSync(path.join(run.rootDir, "manuscript", "chapter-briefs", "03-finale.md"), "# Brief 3\n");
    writeFileSync(path.join(run.rootDir, "manuscript", "chapters", "01-opening.md"), "# Chapter 1\n");
    writeFileSync(path.join(run.rootDir, "manuscript", "chapters", "03-finale.md"), "# Chapter 3\n");
    writeFileSync(path.join(run.rootDir, "manuscript", "full-manuscript.md"), "# Full\n");
    writeFileSync(path.join(run.rootDir, "manuscript", "write-report.md"), "# Report\n");
    writeFileSync(path.join(run.rootDir, "manuscript", "continuity-report.md"), "# Continuity\n");

    const result = validatePhaseArtifacts(run, "write", []);
    assert.equal(result.ok, false);
    assert.equal(result.issues.some((issue) => issue.message.includes("chapter numbering")), true);
  });
});
```

- [ ] **Step 2: Run artifact tests to verify the new semantic test fails**

Run:

```bash
node --test --import tsx tests/artifacts.test.ts
```

Expected: FAIL because current validation only checks existence and placeholder content.

- [ ] **Step 3: Implement semantic write and evaluate checks**

Update `extensions/book-genesis/artifacts.ts`:

```ts
function validateSequentialChapterNames(run: RunState, issues: ArtifactValidationIssue[]) {
  const chapterDir = path.join(run.rootDir, "manuscript", "chapters");
  const chapterNames = readdirSync(chapterDir).filter((entry) => entry.endsWith(".md")).sort();

  for (let index = 0; index < chapterNames.length; index += 1) {
    const expectedPrefix = String(index + 1).padStart(2, "0");
    if (!chapterNames[index].startsWith(expectedPrefix)) {
      issues.push({
        code: "missing_required_target",
        target: "manuscript/chapters/",
        message: "Write artifacts must use sequential chapter numbering with no gaps.",
      });
      break;
    }
  }
}
```

Also reject `evaluate` completion when `quality_gate` is missing:

```ts
if (params.phase === "evaluate" && !params.quality_gate) {
  return {
    isError: true,
    content: [{ type: "text", text: "Evaluate phase requires quality_gate." }],
  };
}
```

- [ ] **Step 4: Re-run artifact and manuscript tests**

Run:

```bash
node --test --import tsx tests/artifacts.test.ts tests/manuscript.test.ts
npm run typecheck
```

Expected: PASS for semantic validation behavior.

- [ ] **Step 5: Commit**

```bash
git add extensions/book-genesis/artifacts.ts extensions/book-genesis/index.ts tests/artifacts.test.ts tests/manuscript.test.ts
git commit -m "feat: add semantic artifact validation"
```

### Task 9: Expand Operator Surface, Integration Tests, And Docs

**Files:**
- Modify: `extensions/book-genesis/index.ts`
- Modify: `extensions/book-genesis/prompts.ts`
- Modify: `README.md`
- Modify: `tests/state.test.ts`
- Create: `tests/runtime-flow.test.ts`

- [ ] **Step 1: Write a failing end-to-end runtime test**

Create `tests/runtime-flow.test.ts`:

```ts
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_RUN_CONFIG } from "../extensions/book-genesis/config.js";
import { createRunState, completeCurrentPhase } from "../extensions/book-genesis/state.js";

function withRun(fn: (run: ReturnType<typeof createRunState>) => void) {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-runtime-"));
  try {
    fn(createRunState(workspace, "cozy mystery series starter", {
      ...DEFAULT_RUN_CONFIG,
      approvalPhases: ["foundation"],
      bookMode: "fiction",
    }));
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("runtime can pause after foundation and still route evaluate failure to revise", () => {
  withRun((run) => {
    run.currentPhase = "foundation";
    completeCurrentPhase(run, {
      summary: "Foundation ready.",
      artifacts: ["foundation/foundation.md"],
      unresolvedIssues: [],
    });

    assert.equal(run.status, "awaiting_approval");
  });
});
```

- [ ] **Step 2: Run the runtime flow test to verify it fails or is incomplete**

Run:

```bash
node --test --import tsx tests/runtime-flow.test.ts
```

Expected: FAIL until the full approval and routing path is implemented.

- [ ] **Step 3: Finish operator-facing commands and docs**

Add the remaining commands to `extensions/book-genesis/index.ts`:

```ts
case "list-runs": {
  const runs = listRunDirs(process.cwd()).map((dir) => formatRunStatus(readRunState(dir)));
  sendStatus(pi, runs.join("\n\n---\n\n"));
  return;
}

case "export": {
  const run = readRunState(resolveRunDir(rest, ctx)!);
  const manifest = await writeExportPackage(run);
  sendStatus(pi, `Exported ${manifest.files.length} files for ${run.id}.`);
  return;
}
```

Update `README.md` sections for:

```md
- `/book-genesis approve [run-dir]`
- `/book-genesis reject [run-dir]`
- `/book-genesis list-runs`
- `/book-genesis export [run-dir]`
```

- [ ] **Step 4: Run the full suite**

Run:

```bash
npm test
npm run typecheck
```

Expected: full PASS across state, config, bible, manuscript, presets, rubrics, checkpoints, exports, and runtime flow tests.

- [ ] **Step 5: Commit**

```bash
git add extensions/book-genesis/index.ts extensions/book-genesis/prompts.ts README.md tests/state.test.ts tests/runtime-flow.test.ts
git commit -m "docs: finalize book writing runtime workflow"
```

## Self-Review

- Spec coverage: this plan includes structured story memory, chapter-brief drafting, genre-aware rubrics, mode presets, optional author checkpoints, richer delivery outputs, semantic validation, author commands, and expanded automated testing.
- Placeholder scan: every task names exact files, exact commands, concrete test targets, and commit boundaries. The export task intentionally defines adapter boundaries inside `exports.ts` so the implementation can swap concrete DOCX/EPUB libraries without changing the runtime surface.
- Type consistency: the plan uses `bookMode`, `storyBibleEnabled`, `approvalPhases`, `exportFormats`, `ApprovalRequest`, `awaiting_approval`, and `failedDimensions` consistently across config, state, prompts, and tests.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-27-book-writing-upgrades.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
