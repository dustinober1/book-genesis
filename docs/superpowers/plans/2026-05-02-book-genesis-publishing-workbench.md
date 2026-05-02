# Book Genesis Publishing Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the next Book Genesis release layer: marketplace metadata, revision board, source vault, print layout profiles, and a richer Pi operator console.

**Architecture:** Keep the existing seven-phase runtime and command registry. Add focused modules under `extensions/book-genesis/`, write artifacts inside the active run directory, and surface readiness through the existing `audit`, `final-check`, `dashboard`, `kdp`, and `index` command seams.

**Tech Stack:** TypeScript ESM, Node.js 20, built-in `node:test`, existing PI extension APIs, Markdown/JSON artifacts, existing DOCX/PDF/EPUB export helpers.

---

## File Structure

- Create `extensions/book-genesis/metadata-lab.ts`: marketplace metadata generation, scoring, formatting, and artifact writes.
- Create `extensions/book-genesis/revision-board.ts`: chapter-level task aggregation from critique, beta feedback, style, pacing, continuity, source, publishing, and final-check reports.
- Create `extensions/book-genesis/source-vault.ts`: durable source capture, claim links, source confidence, bibliography drafts, and source-vault artifacts.
- Create `extensions/book-genesis/layout-profiles.ts`: print/export profile definitions and format helpers.
- Create `extensions/book-genesis/workbench.ts`: richer operator console data model and Markdown/JSON output.
- Modify `extensions/book-genesis/types.ts`: add config, report, and task/source/layout types.
- Modify `extensions/book-genesis/config.ts`: normalize new config sections with migration-safe defaults.
- Modify `extensions/book-genesis/index.ts`: register new slash commands and completions.
- Modify `extensions/book-genesis/audit.ts`: include metadata lab, revision board, source vault, layout profile, and workbench readiness.
- Modify `extensions/book-genesis/final-check.ts`: include release blockers for required metadata/source/layout artifacts.
- Modify `extensions/book-genesis/kdp.ts`: copy metadata-lab output into the KDP package and prefer scored metadata where configured.
- Modify `extensions/book-genesis/exports.ts`: apply layout profile hints to DOCX/PDF packaging and manifest output.
- Modify `extensions/book-genesis/dashboard.ts`: include workbench summary links and stronger next-action routing.
- Modify `extensions/book-genesis/source-audit.ts`: consume source-vault claim links when present.
- Modify `extensions/book-genesis/research-web.ts`: optionally save fetched sources into the vault.
- Modify `prompts/book-genesis/research.md`, `prompts/book-genesis/evaluate.md`, `prompts/book-genesis/revise.md`, and `prompts/book-genesis/deliver.md`: include the new artifact contracts.
- Modify `README.md`: document commands, artifacts, config, and release workflow.
- Create `tests/publishing-workbench-config.test.ts`.
- Create `tests/metadata-lab.test.ts`.
- Create `tests/revision-board.test.ts`.
- Create `tests/source-vault.test.ts`.
- Create `tests/layout-profiles.test.ts`.
- Create `tests/workbench.test.ts`.
- Modify `tests/kdp.test.ts`, `tests/exports.test.ts`, `tests/audit.test.ts`, `tests/all-10-upgrades.test.ts`, and `tests/prompt-contracts.test.ts`.

## Release Order

1. Config and types.
2. Marketplace Metadata Lab.
3. Source Vault.
4. Revision Board.
5. Interior Layout Profiles.
6. Operator Workbench.
7. Readiness/KDP/export integration.
8. Prompt, README, and release notes.

---

### Task 1: Add Release Config And Shared Types

**Files:**
- Modify: `extensions/book-genesis/types.ts`
- Modify: `extensions/book-genesis/config.ts`
- Modify: `tests/helpers.ts`
- Create: `tests/publishing-workbench-config.test.ts`

- [x] **Step 1: Write config tests**

Create `tests/publishing-workbench-config.test.ts`:

```ts
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
      workbench: { includeRecentHistoryLimit: 12 }
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
      revisionBoard: { defaultPriority: "urgent" }
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
    compliance: 10
  });
});
```

- [x] **Step 2: Run the config tests and verify the red state**

Run:

```bash
node --test --import tsx tests/publishing-workbench-config.test.ts
```

Expected: FAIL because `metadataLab`, `sourceVault`, `revisionBoard`, `layoutProfiles`, and `workbench` are not defined.

- [x] **Step 3: Add shared types**

Add these exported types to `extensions/book-genesis/types.ts`:

```ts
export type MetadataVariantKind = "subtitle" | "description" | "keyword-chain" | "category";
export type RevisionPriority = "low" | "medium" | "high";
export type RevisionTaskStatus = "open" | "in_progress" | "done" | "deferred";
export type SourceConfidence = "low" | "medium" | "high";
export type LayoutProfileId =
  | "fiction-paperback-6x9"
  | "nonfiction-paperback-6x9"
  | "devotional-paperback-6x9"
  | "childrens-large-square"
  | "large-print-6x9";

export interface MetadataLabConfig {
  enabled: boolean;
  requiredForKdp: boolean;
  maxSubtitleOptions: number;
  maxDescriptionOptions: number;
  maxKeywordChains: number;
  scoringWeights: {
    clarity: number;
    marketFit: number;
    keywordCoverage: number;
    differentiation: number;
    compliance: number;
  };
}

export interface SourceVaultConfig {
  enabled: boolean;
  requireClaimLinksForNonfiction: boolean;
  minConfidenceForFinal: SourceConfidence;
}

export interface RevisionBoardConfig {
  enabled: boolean;
  defaultPriority: RevisionPriority;
  includeInfoFindings: boolean;
}

export interface LayoutProfilesConfig {
  enabled: boolean;
  defaultProfile: LayoutProfileId;
  requireProfileForPaperback: boolean;
}

export interface WorkbenchConfig {
  enabled: boolean;
  includeRecentHistoryLimit: number;
  includeArtifactLinks: boolean;
}

export interface MetadataScore {
  clarity: number;
  marketFit: number;
  keywordCoverage: number;
  differentiation: number;
  compliance: number;
  total: number;
}

export interface MetadataVariant {
  kind: MetadataVariantKind;
  value: string;
  rationale: string;
  score: MetadataScore;
}

export interface ClaimLink {
  claimId: string;
  claim: string;
  sourceIds: string[];
  confidence: SourceConfidence;
  location?: string;
}

export interface RevisionBoardTask {
  id: string;
  title: string;
  source: string;
  target: string;
  priority: RevisionPriority;
  status: RevisionTaskStatus;
  acceptanceCriteria: string[];
}
```

Extend `RunConfig` with:

```ts
metadataLab: MetadataLabConfig;
sourceVault: SourceVaultConfig;
revisionBoard: RevisionBoardConfig;
layoutProfiles: LayoutProfilesConfig;
workbench: WorkbenchConfig;
```

- [x] **Step 4: Normalize config defaults**

In `extensions/book-genesis/config.ts`, add defaults:

```ts
metadataLab: {
  enabled: true,
  requiredForKdp: true,
  maxSubtitleOptions: 7,
  maxDescriptionOptions: 4,
  maxKeywordChains: 7,
  scoringWeights: {
    clarity: 25,
    marketFit: 25,
    keywordCoverage: 20,
    differentiation: 20,
    compliance: 10,
  },
},
sourceVault: {
  enabled: true,
  requireClaimLinksForNonfiction: true,
  minConfidenceForFinal: "medium",
},
revisionBoard: {
  enabled: true,
  defaultPriority: "medium",
  includeInfoFindings: false,
},
layoutProfiles: {
  enabled: true,
  defaultProfile: "fiction-paperback-6x9",
  requireProfileForPaperback: true,
},
workbench: {
  enabled: true,
  includeRecentHistoryLimit: 8,
  includeArtifactLinks: true,
},
```

Add normalizers that validate booleans, positive integers, `RevisionPriority`, `SourceConfidence`, and `LayoutProfileId`.

- [x] **Step 5: Update test helper config merging**

In `tests/helpers.ts`, extend `makeRun` config merging:

```ts
metadataLab: { ...DEFAULT_RUN_CONFIG.metadataLab, ...config.metadataLab },
sourceVault: { ...DEFAULT_RUN_CONFIG.sourceVault, ...config.sourceVault },
revisionBoard: { ...DEFAULT_RUN_CONFIG.revisionBoard, ...config.revisionBoard },
layoutProfiles: { ...DEFAULT_RUN_CONFIG.layoutProfiles, ...config.layoutProfiles },
workbench: { ...DEFAULT_RUN_CONFIG.workbench, ...config.workbench },
```

- [x] **Step 6: Verify and commit**

Run:

```bash
node --test --import tsx tests/publishing-workbench-config.test.ts
npm run typecheck
```

Expected: PASS.

Commit:

```bash
git add extensions/book-genesis/types.ts extensions/book-genesis/config.ts tests/helpers.ts tests/publishing-workbench-config.test.ts
git commit -m "feat: add publishing workbench config"
```

---

### Task 2: Build Marketplace Metadata Lab

**Files:**
- Create: `extensions/book-genesis/metadata-lab.ts`
- Modify: `extensions/book-genesis/index.ts`
- Create: `tests/metadata-lab.test.ts`
- Modify: `README.md`

- [x] **Step 1: Write metadata lab tests**

Create `tests/metadata-lab.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { buildMetadataLab, writeMetadataLab } from "../extensions/book-genesis/metadata-lab.js";
import { makeRun, withWorkspace, writeBasicManuscript } from "./helpers.js";

test("metadata lab builds scored variants from run positioning", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace, {
      kdp: {
        authorName: "D. Ober",
        keywords: ["memory theft thriller", "near future crime"],
        categories: ["Fiction / Thrillers / Technological"]
      }
    });
    writeBasicManuscript(run);

    const lab = buildMetadataLab(run);
    assert.equal(lab.runId, run.id);
    assert.equal(lab.subtitleOptions.length > 0, true);
    assert.equal(lab.descriptionOptions.length > 0, true);
    assert.equal(lab.keywordChains.length > 0, true);
    assert.equal(lab.scorecard.bestSubtitle.score.total > 0, true);
  });
});

test("metadata lab writes markdown and json artifacts", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    writeBasicManuscript(run);

    const output = writeMetadataLab(run);
    assert.equal(existsSync(output.jsonPath), true);
    assert.equal(existsSync(output.markdownPath), true);
    assert.match(readFileSync(output.markdownPath, "utf8"), /# Marketplace Metadata Lab/);
    assert.match(readFileSync(path.join(run.rootDir, "delivery", "metadata-lab", "keyword-chains.md"), "utf8"), /Keyword Chains/);
  });
});
```

- [x] **Step 2: Run the metadata tests and verify the red state**

Run:

```bash
node --test --import tsx tests/metadata-lab.test.ts
```

Expected: FAIL because `metadata-lab.ts` does not exist.

- [x] **Step 3: Implement metadata lab module**

Create `extensions/book-genesis/metadata-lab.ts` with these exported functions:

```ts
export function buildMetadataLab(run: RunState): MetadataLabReport;
export function formatMetadataLab(report: MetadataLabReport): string;
export function writeMetadataLab(run: RunState): {
  report: MetadataLabReport;
  jsonPath: string;
  markdownPath: string;
};
export function metadataLabReady(run: RunState): HealthCheckResult[];
```

Use `run-files.ts` helpers. Read positioning from `run.kickoff`, `run.config.audience`, `run.config.kdp`, `delivery/logline.md`, `delivery/synopsis.md`, and `delivery/package-summary.md`.

Write these files:

- `delivery/metadata-lab/metadata-scorecard.json`
- `delivery/metadata-lab/metadata-lab.md`
- `delivery/metadata-lab/subtitles.md`
- `delivery/metadata-lab/descriptions.md`
- `delivery/metadata-lab/keyword-chains.md`
- `delivery/metadata-lab/categories.md`

Scoring rules:

- `clarity`: 0-25 based on concrete nouns, length, and absence of vague terms.
- `marketFit`: 0-25 based on genre/audience terms from kickoff/config.
- `keywordCoverage`: 0-20 based on configured KDP keyword overlap.
- `differentiation`: 0-20 based on avoiding duplicate phrasing across options.
- `compliance`: 0-10 based on no unverifiable bestseller claims, no price claims, and description under 4000 characters.

- [x] **Step 4: Register `/book-genesis metadata-lab`**

In `extensions/book-genesis/index.ts`:

- Import `writeMetadataLab`.
- Add `metadata-lab` to completions.
- Add a `case "metadata-lab"` branch resolving the run and sending the artifact paths.

Response shape:

```text
Metadata lab written.
- Markdown: <path>
- Scorecard: <path>
```

- [x] **Step 5: Document the command**

In `README.md`, add `/book-genesis metadata-lab` to the quick reference and add a short section listing the generated files.

- [x] **Step 6: Verify and commit**

Run:

```bash
node --test --import tsx tests/metadata-lab.test.ts
npm run typecheck
```

Expected: PASS.

Commit:

```bash
git add extensions/book-genesis/metadata-lab.ts extensions/book-genesis/index.ts tests/metadata-lab.test.ts README.md
git commit -m "feat: add marketplace metadata lab"
```

---

### Task 3: Build Source Vault

**Files:**
- Create: `extensions/book-genesis/source-vault.ts`
- Modify: `extensions/book-genesis/research-web.ts`
- Modify: `extensions/book-genesis/source-audit.ts`
- Modify: `extensions/book-genesis/index.ts`
- Create: `tests/source-vault.test.ts`
- Modify: `README.md`

- [x] **Step 1: Write source vault tests**

Create `tests/source-vault.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { addVaultSource, buildSourceVault, linkClaimToSources, writeSourceVault } from "../extensions/book-genesis/source-vault.js";
import { makeRun, withWorkspace, writeBasicManuscript } from "./helpers.js";

test("source vault records sources and claim links", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace, { bookMode: "narrative-nonfiction" });
    writeBasicManuscript(run);

    const source = addVaultSource(run, {
      title: "Memory Research Review",
      url: "https://example.com/memory-review",
      summary: "Research context for memory indexing claims.",
      confidence: "high"
    });
    const claim = linkClaimToSources(run, {
      claim: "Research showed memory indexing was commercially viable.",
      sourceIds: [source.id],
      confidence: "high",
      location: "manuscript/full-manuscript.md"
    });

    assert.match(source.id, /^src_/);
    assert.match(claim.claimId, /^claim_/);
    const vault = buildSourceVault(run);
    assert.equal(vault.sources.length, 1);
    assert.equal(vault.claimLinks.length, 1);
  });
});

test("source vault writes durable artifacts", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    const output = writeSourceVault(run);
    assert.equal(existsSync(output.jsonPath), true);
    assert.equal(existsSync(output.markdownPath), true);
    assert.match(readFileSync(path.join(run.rootDir, "research", "source-vault.md"), "utf8"), /# Source Vault/);
  });
});
```

- [x] **Step 2: Run source vault tests and verify the red state**

Run:

```bash
node --test --import tsx tests/source-vault.test.ts
```

Expected: FAIL because `source-vault.ts` does not exist.

- [x] **Step 3: Implement source vault module**

Create `extensions/book-genesis/source-vault.ts` with:

```ts
export interface AddVaultSourceInput {
  title: string;
  url?: string;
  summary: string;
  confidence: SourceConfidence;
  excerpt?: string;
}

export interface LinkClaimInput {
  claim: string;
  sourceIds: string[];
  confidence: SourceConfidence;
  location?: string;
}

export function buildSourceVault(run: RunState): SourceVaultReport;
export function addVaultSource(run: RunState, input: AddVaultSourceInput): VaultSource;
export function linkClaimToSources(run: RunState, input: LinkClaimInput): ClaimLink;
export function writeSourceVault(run: RunState): { report: SourceVaultReport; jsonPath: string; markdownPath: string };
export function sourceVaultReadiness(run: RunState): HealthCheckResult[];
```

Persist JSON at `research/source-vault.json` and Markdown at `research/source-vault.md`. Generate stable IDs from a slug plus a short hash of source title or claim text.

- [x] **Step 4: Wire source vault into research and audit**

In `research-web.ts`, add a pure helper:

```ts
export function researchResultToVaultSource(result: ResearchSearchResult): AddVaultSourceInput
```

In `source-audit.ts`, include source-vault claim links when deciding whether nonfiction and memoir claims have coverage.

- [x] **Step 5: Register source-vault commands**

In `index.ts`, add:

- `/book-genesis source-vault [run-dir]`
- `/book-genesis source-vault add [run-dir] "<title>" "<url>" "<summary>"`
- `/book-genesis source-vault claim [run-dir] "<claim>" "<source-id[,source-id]>"`

The command parser may be simple for this release: quoted strings are enough.

- [x] **Step 6: Verify and commit**

Run:

```bash
node --test --import tsx tests/source-vault.test.ts tests/source-audit.test.ts
npm run typecheck
```

Expected: PASS.

Commit:

```bash
git add extensions/book-genesis/source-vault.ts extensions/book-genesis/research-web.ts extensions/book-genesis/source-audit.ts extensions/book-genesis/index.ts tests/source-vault.test.ts README.md
git commit -m "feat: add source vault"
```

---

### Task 4: Build Revision Board

**Files:**
- Create: `extensions/book-genesis/revision-board.ts`
- Modify: `extensions/book-genesis/audit.ts`
- Modify: `extensions/book-genesis/index.ts`
- Create: `tests/revision-board.test.ts`
- Modify: `README.md`

- [x] **Step 1: Write revision board tests**

Create `tests/revision-board.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { buildRevisionBoard, writeRevisionBoard } from "../extensions/book-genesis/revision-board.js";
import { makeRun, withWorkspace, writeBasicManuscript } from "./helpers.js";

test("revision board aggregates actionable tasks", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    writeBasicManuscript(run);

    const board = buildRevisionBoard(run);
    assert.equal(board.runId, run.id);
    assert.equal(board.tasks.length > 0, true);
    assert.equal(board.tasks.every((task) => task.acceptanceCriteria.length > 0), true);
  });
});

test("revision board writes markdown and json", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    writeBasicManuscript(run);

    const output = writeRevisionBoard(run);
    assert.equal(existsSync(output.jsonPath), true);
    assert.equal(existsSync(output.markdownPath), true);
    assert.match(readFileSync(output.markdownPath, "utf8"), /# Revision Board/);
  });
});
```

- [x] **Step 2: Run revision board tests and verify the red state**

Run:

```bash
node --test --import tsx tests/revision-board.test.ts
```

Expected: FAIL because `revision-board.ts` does not exist.

- [x] **Step 3: Implement revision board module**

Create `extensions/book-genesis/revision-board.ts` with:

```ts
export function buildRevisionBoard(run: RunState): RevisionBoardReport;
export function formatRevisionBoard(report: RevisionBoardReport): string;
export function writeRevisionBoard(run: RunState): {
  report: RevisionBoardReport;
  jsonPath: string;
  markdownPath: string;
};
export function revisionBoardReadiness(run: RunState): HealthCheckResult[];
```

Input sources:

- `analyzeManuscript(run)`
- `lintStyle(run)`
- `buildPacingDashboard(run)`
- `buildSourceAudit(run)`
- `buildCritiquePanel(run)`
- `buildFinalCheck(run)`, but avoid recursion by allowing `buildFinalCheck` to skip revision-board readiness when called from the board.
- `run.reviewerFeedback`
- `run.pendingRevisionPlan`

Write:

- `revisions/revision-board.json`
- `revisions/revision-board.md`

Each task must include:

- Stable `id`
- Clear `title`
- `source`
- `target`
- `priority`
- `status`
- At least one acceptance criterion

- [x] **Step 4: Add command and audit visibility**

In `index.ts`, register `/book-genesis revision-board [run-dir]`.

In `audit.ts`, include a `revisionBoard` section with readiness:

- present if `revisions/revision-board.json` exists
- warning if missing after `evaluate`, `revise`, or `deliver`

- [x] **Step 5: Verify and commit**

Run:

```bash
node --test --import tsx tests/revision-board.test.ts tests/audit.test.ts
npm run typecheck
```

Expected: PASS.

Commit:

```bash
git add extensions/book-genesis/revision-board.ts extensions/book-genesis/audit.ts extensions/book-genesis/index.ts tests/revision-board.test.ts tests/audit.test.ts README.md
git commit -m "feat: add revision board"
```

---

### Task 5: Add Interior Layout Profiles

**Files:**
- Create: `extensions/book-genesis/layout-profiles.ts`
- Modify: `extensions/book-genesis/exports.ts`
- Modify: `extensions/book-genesis/kdp.ts`
- Modify: `extensions/book-genesis/index.ts`
- Create: `tests/layout-profiles.test.ts`
- Modify: `tests/exports.test.ts`
- Modify: `tests/kdp.test.ts`
- Modify: `README.md`

- [x] **Step 1: Write layout profile tests**

Create `tests/layout-profiles.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { getLayoutProfile, writeLayoutProfileReport } from "../extensions/book-genesis/layout-profiles.js";
import { makeRun, withWorkspace, writeBasicManuscript } from "./helpers.js";

test("layout profiles expose trim, margins, and typography settings", () => {
  const profile = getLayoutProfile("fiction-paperback-6x9");
  assert.equal(profile.trimSize, "6 x 9");
  assert.equal(profile.pdfMediaBox.widthPoints, 432);
  assert.equal(profile.pdfMediaBox.heightPoints, 648);
  assert.equal(profile.bodyFontSize > 0, true);
});

test("layout profile report is written into delivery", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    writeBasicManuscript(run);
    const output = writeLayoutProfileReport(run);
    assert.equal(existsSync(output.jsonPath), true);
    assert.match(readFileSync(path.join(run.rootDir, "delivery", "layout-profile.md"), "utf8"), /# Interior Layout Profile/);
  });
});
```

- [x] **Step 2: Run layout tests and verify the red state**

Run:

```bash
node --test --import tsx tests/layout-profiles.test.ts
```

Expected: FAIL because `layout-profiles.ts` does not exist.

- [x] **Step 3: Implement layout profile module**

Create `extensions/book-genesis/layout-profiles.ts` with:

```ts
export interface LayoutProfile {
  id: LayoutProfileId;
  label: string;
  trimSize: string;
  pdfMediaBox: { widthPoints: number; heightPoints: number };
  margins: { top: number; bottom: number; inside: number; outside: number };
  bodyFont: string;
  bodyFontSize: number;
  lineSpacing: number;
  chapterStart: "new-page" | "same-page";
}

export function getLayoutProfile(id: LayoutProfileId): LayoutProfile;
export function resolveLayoutProfile(run: RunState): LayoutProfile;
export function writeLayoutProfileReport(run: RunState): {
  profile: LayoutProfile;
  jsonPath: string;
  markdownPath: string;
};
export function layoutProfileReadiness(run: RunState): HealthCheckResult[];
```

Profiles:

- `fiction-paperback-6x9`
- `nonfiction-paperback-6x9`
- `devotional-paperback-6x9`
- `childrens-large-square`
- `large-print-6x9`

- [x] **Step 4: Integrate layout profiles into exports**

In `exports.ts`:

- Use `resolveLayoutProfile(run)` when generating PDF page size instead of only parsing `kdp.trimSize`.
- Include `layoutProfile` in the export manifest.
- Write `delivery/layout-profile.json` and `delivery/layout-profile.md` during export.

- [x] **Step 5: Integrate layout profiles into KDP package**

In `kdp.ts`:

- Copy layout profile reports into `delivery/kdp/`.
- Add a warning if paperback target and `layoutProfiles.requireProfileForPaperback` is true but no profile report exists.

- [x] **Step 6: Register command**

In `index.ts`, register `/book-genesis layout-profile [run-dir]`.

- [x] **Step 7: Verify and commit**

Run:

```bash
node --test --import tsx tests/layout-profiles.test.ts tests/exports.test.ts tests/kdp.test.ts
npm run typecheck
```

Expected: PASS.

Commit:

```bash
git add extensions/book-genesis/layout-profiles.ts extensions/book-genesis/exports.ts extensions/book-genesis/kdp.ts extensions/book-genesis/index.ts tests/layout-profiles.test.ts tests/exports.test.ts tests/kdp.test.ts README.md
git commit -m "feat: add interior layout profiles"
```

---

### Task 6: Build Operator Workbench

**Files:**
- Create: `extensions/book-genesis/workbench.ts`
- Modify: `extensions/book-genesis/dashboard.ts`
- Modify: `extensions/book-genesis/doctor-run.ts`
- Modify: `extensions/book-genesis/index.ts`
- Create: `tests/workbench.test.ts`
- Modify: `tests/all-10-upgrades.test.ts`
- Modify: `README.md`

- [x] **Step 1: Write workbench tests**

Create `tests/workbench.test.ts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

import { buildWorkbench, writeWorkbench } from "../extensions/book-genesis/workbench.js";
import { makeRun, withWorkspace, writeBasicManuscript } from "./helpers.js";

test("workbench summarizes operator state", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    writeBasicManuscript(run);

    const workbench = buildWorkbench(run);
    assert.equal(workbench.runId, run.id);
    assert.match(workbench.next.command, /^\/book-genesis/);
    assert.equal(workbench.artifacts.length > 0, true);
    assert.equal(workbench.readiness.length > 0, true);
  });
});

test("workbench writes console artifacts", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    writeBasicManuscript(run);

    const output = writeWorkbench(run);
    assert.equal(existsSync(output.jsonPath), true);
    assert.equal(existsSync(output.markdownPath), true);
    assert.match(readFileSync(output.markdownPath, "utf8"), /# Book Genesis Workbench/);
  });
});
```

- [x] **Step 2: Run workbench tests and verify the red state**

Run:

```bash
node --test --import tsx tests/workbench.test.ts
```

Expected: FAIL because `workbench.ts` does not exist.

- [x] **Step 3: Implement workbench module**

Create `extensions/book-genesis/workbench.ts` with:

```ts
export function buildWorkbench(run: RunState): WorkbenchReport;
export function formatWorkbench(report: WorkbenchReport): string;
export function writeWorkbench(run: RunState): {
  report: WorkbenchReport;
  jsonPath: string;
  markdownPath: string;
};
```

Workbench report should include:

- run identity
- status and phase
- recommended next command
- current blocker summary
- artifact links
- recent phase history limited by `run.config.workbench.includeRecentHistoryLimit`
- readiness rows for final check, metadata lab, revision board, source vault, layout profile, cover check, launch kit, archive

Write:

- `dashboard/workbench.json`
- `dashboard/workbench.md`

- [x] **Step 4: Route dashboard and doctor to workbench output**

In `dashboard.ts`, add workbench path fields when files exist.

In `doctor-run.ts`, add an info result if `dashboard/workbench.json` is missing with remedy `Run /book-genesis workbench.`

- [x] **Step 5: Register command**

In `index.ts`, register `/book-genesis workbench [run-dir]`.

- [x] **Step 6: Verify and commit**

Run:

```bash
node --test --import tsx tests/workbench.test.ts tests/all-10-upgrades.test.ts
npm run typecheck
```

Expected: PASS.

Commit:

```bash
git add extensions/book-genesis/workbench.ts extensions/book-genesis/dashboard.ts extensions/book-genesis/doctor-run.ts extensions/book-genesis/index.ts tests/workbench.test.ts tests/all-10-upgrades.test.ts README.md
git commit -m "feat: add operator workbench"
```

---

### Task 7: Integrate Readiness, KDP, And Export Gates

**Files:**
- Modify: `extensions/book-genesis/audit.ts`
- Modify: `extensions/book-genesis/final-check.ts`
- Modify: `extensions/book-genesis/kdp.ts`
- Modify: `extensions/book-genesis/exports.ts`
- Modify: `tests/audit.test.ts`
- Modify: `tests/kdp.test.ts`
- Modify: `tests/exports.test.ts`

- [x] **Step 1: Add integration tests**

Extend `tests/audit.test.ts` with:

```ts
test("audit reports new publishing workbench readiness", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    writeBasicManuscript(run);
    const report = buildAuditReport(run);
    assert.equal(Boolean(report.metadataLab), true);
    assert.equal(Boolean(report.revisionBoard), true);
    assert.equal(Boolean(report.sourceVault), true);
    assert.equal(Boolean(report.layoutProfile), true);
  });
});
```

Extend `tests/kdp.test.ts` with:

```ts
test("kdp package includes metadata lab and layout profile artifacts", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace, {
      kdp: {
        authorName: "D. Ober",
        description: "A commercial near-future thriller about memory theft.",
        keywords: ["memory theft thriller"],
        categories: ["Fiction / Thrillers / Technological"]
      }
    });
    writeBasicManuscript(run);
    writeMetadataLab(run);
    writeLayoutProfileReport(run);

    const output = writeKdpPackage(run);
    assert.equal(existsSync(path.join(run.rootDir, "delivery", "kdp", "metadata-lab.md")), true);
    assert.equal(existsSync(path.join(run.rootDir, "delivery", "kdp", "layout-profile.md")), true);
    assert.equal(output.manifest.files.some((file) => file.endsWith("metadata-lab.md")), true);
  });
});
```

- [x] **Step 2: Run integration tests and verify failures**

Run:

```bash
node --test --import tsx tests/audit.test.ts tests/kdp.test.ts tests/exports.test.ts
```

Expected: FAIL until readiness and package copying are wired.

- [x] **Step 3: Wire audit report sections**

In `audit.ts`, import readiness helpers and add sections:

- `metadataLab`
- `revisionBoard`
- `sourceVault`
- `layoutProfile`

Add each non-info result to `nextActions`.

- [x] **Step 4: Wire final-check gates**

In `final-check.ts`, add:

- error when `metadataLab.requiredForKdp` is true and `delivery/metadata-lab/metadata-scorecard.json` is missing
- error for nonfiction/memoir when `sourceVault.requireClaimLinksForNonfiction` is true and source vault has no claim links
- warning when revision board is missing after evaluate/revise/deliver
- warning when paperback target has no layout profile report

- [x] **Step 5: Copy artifacts into KDP package**

In `kdp.ts`, copy:

- `delivery/metadata-lab/metadata-lab.md` to `delivery/kdp/metadata-lab.md`
- `delivery/metadata-lab/metadata-scorecard.json` to `delivery/kdp/metadata-scorecard.json`
- `delivery/layout-profile.md` to `delivery/kdp/layout-profile.md`
- `delivery/layout-profile.json` to `delivery/kdp/layout-profile.json`

Record copied files in the KDP manifest.

- [x] **Step 6: Include layout profile in export manifest**

In `exports.ts`, add layout profile fields to the manifest:

```ts
layoutProfile: {
  id: profile.id,
  label: profile.label,
  trimSize: profile.trimSize,
  pdfMediaBox: profile.pdfMediaBox
}
```

- [x] **Step 7: Verify and commit**

Run:

```bash
node --test --import tsx tests/audit.test.ts tests/kdp.test.ts tests/exports.test.ts
npm run typecheck
```

Expected: PASS.

Commit:

```bash
git add extensions/book-genesis/audit.ts extensions/book-genesis/final-check.ts extensions/book-genesis/kdp.ts extensions/book-genesis/exports.ts tests/audit.test.ts tests/kdp.test.ts tests/exports.test.ts
git commit -m "feat: integrate publishing workbench readiness"
```

---

### Task 8: Update Prompt Contracts, Docs, And Release Notes

**Files:**
- Modify: `prompts/book-genesis/research.md`
- Modify: `prompts/book-genesis/evaluate.md`
- Modify: `prompts/book-genesis/revise.md`
- Modify: `prompts/book-genesis/deliver.md`
- Modify: `tests/prompt-contracts.test.ts`
- Modify: `README.md`
- Create: `docs/releases/2026-05-publishing-workbench.md`

- [x] **Step 1: Add prompt contract tests**

Extend `tests/prompt-contracts.test.ts` with assertions that:

- research prompt mentions source vault and claim links
- evaluate prompt mentions revision board
- revise prompt mentions revision board task acceptance criteria
- deliver prompt mentions metadata lab, layout profile, and KDP readiness

Example assertion:

```ts
assert.match(researchPrompt, /source vault/i);
assert.match(evaluatePrompt, /revision board/i);
assert.match(deliverPrompt, /metadata lab/i);
```

- [x] **Step 2: Run prompt contract tests and verify failures**

Run:

```bash
node --test --import tsx tests/prompt-contracts.test.ts
```

Expected: FAIL until prompt files are updated.

- [x] **Step 3: Update prompt files**

Add concise phase instructions:

- `research.md`: record material sources in the source vault; link claims for nonfiction/memoir.
- `evaluate.md`: convert major findings into revision-board candidates.
- `revise.md`: satisfy revision-board acceptance criteria and update task status in notes.
- `deliver.md`: generate metadata lab, layout profile report, source vault report, and workbench before KDP packaging.

- [x] **Step 4: Update README**

Document:

- `/book-genesis metadata-lab`
- `/book-genesis source-vault`
- `/book-genesis revision-board`
- `/book-genesis layout-profile`
- `/book-genesis workbench`
- new config sections
- new artifact directories
- recommended final release workflow:

```text
/book-genesis source-vault
/book-genesis metadata-lab
/book-genesis revision-board
/book-genesis layout-profile
/book-genesis workbench
/book-genesis final-check
/book-genesis export
/book-genesis kdp
```

- [x] **Step 5: Write release notes**

Create `docs/releases/2026-05-publishing-workbench.md`:

```md
# Book Genesis 6.2.0 PI Release Notes

## Summary

This release adds a publishing workbench layer for marketplace metadata, source capture, revision operations, print layout profiles, and operator visibility.

## Added

- `/book-genesis metadata-lab`
- `/book-genesis source-vault`
- `/book-genesis revision-board`
- `/book-genesis layout-profile`
- `/book-genesis workbench`
- Metadata, source, revision, layout, and workbench readiness in audit and final-check.
- Metadata and layout artifacts copied into the KDP package.

## Validation

- `npm test`
- `npm run typecheck`
```

- [x] **Step 6: Verify and commit**

Run:

```bash
node --test --import tsx tests/prompt-contracts.test.ts
npm test
npm run typecheck
```

Expected: PASS.

Commit:

```bash
git add prompts/book-genesis/research.md prompts/book-genesis/evaluate.md prompts/book-genesis/revise.md prompts/book-genesis/deliver.md tests/prompt-contracts.test.ts README.md docs/releases/2026-05-publishing-workbench.md
git commit -m "docs: document publishing workbench release"
```

---

## Final Verification

- [x] Run the full test suite:

```bash
npm test
```

Expected: PASS.

- [x] Run typecheck:

```bash
npm run typecheck
```

Expected: PASS.

- [x] Run package install verification:

```bash
pi install .
pi list
```

Expected: `book-genesis` appears in the installed package list and Pi starts without dependency errors.

- [x] Inspect git status:

```bash
git status --short --branch
```

Expected: clean branch after commits.

## Implementation Notes

- Keep every generated artifact inside `run.rootDir`.
- Keep command writes non-destructive. Existing reports may be overwritten by the same command because they are generated artifacts.
- Use `writeJson` and `writeMarkdown` from `run-files.ts` for new artifacts.
- Keep `index.ts` as command routing only. Put feature logic in focused modules.
- Prefer deterministic heuristics over model calls for report generation so tests stay stable.
- Do not block export or KDP packaging directly. Surface blockers through `final-check`, warnings, and package manifests, matching current package behavior.
