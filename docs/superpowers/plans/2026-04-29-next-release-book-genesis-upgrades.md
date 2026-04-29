# Next Release Book Genesis Upgrade Plan

> For agentic workers: REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` for parallel feature work where safe, or `superpowers:executing-plans` for sequential implementation. Track progress by editing the checkbox tasks in this file. Do not skip tests or documentation updates.

## Goal

Implement the next major Book Genesis PI release by adding all recommended upgrade areas:

1. Style lock and author voice linting.
2. Scene map and pacing dashboard.
3. Multi-reviewer critique panel.
4. Nonfiction and memoir source/claim coverage audit.
5. Guided config initialization.
6. Planning variants before outline lock-in.
7. Full launch-kit promotion package.
8. Front matter, back matter, and series metadata.
9. Cover asset validation.
10. Revision-plan-first workflow.
11. Small operator polish commands: open, stats, doctor --fix, archive, and stronger prompt-contract tests.

This release should turn Book Genesis from a capable autonomous book pipeline into a production-minded authoring, revision, publishing, and launch-prep runtime.

## Architectural principles

- Keep lifecycle control centralized in `extensions/book-genesis/state.ts` and command/tool registration in `extensions/book-genesis/index.ts`.
- Prefer focused support modules instead of growing `index.ts`.
- Every feature must have tests under `tests/`.
- Every new command must be documented in `README.md`.
- Every generated artifact must stay inside the active run directory.
- JSON outputs should be machine-readable; Markdown outputs should be author/operator-readable.
- Destructive or broad changes should require explicit operator action.
- Preserve compatibility with existing runs through migration-safe defaults.

## Target file structure

Create or modify these files during the release:

- Modify `extensions/book-genesis/types.ts`
- Modify `extensions/book-genesis/config.ts`
- Modify `extensions/book-genesis/state.ts`
- Modify `extensions/book-genesis/index.ts`
- Modify `extensions/book-genesis/prompts.ts`
- Modify `extensions/book-genesis/artifacts.ts`
- Modify `extensions/book-genesis/audit.ts`
- Modify `extensions/book-genesis/doctor.ts`
- Modify `extensions/book-genesis/exports.ts`
- Modify `extensions/book-genesis/kdp.ts`
- Modify `extensions/book-genesis/promotion.ts`
- Modify `extensions/book-genesis/publishing.ts`
- Create `extensions/book-genesis/style.ts`
- Create `extensions/book-genesis/scenes.ts`
- Create `extensions/book-genesis/critique.ts`
- Create `extensions/book-genesis/source-audit.ts`
- Create `extensions/book-genesis/config-init.ts`
- Create `extensions/book-genesis/variants.ts`
- Create `extensions/book-genesis/launch.ts`
- Create `extensions/book-genesis/book-matter.ts`
- Create `extensions/book-genesis/cover-check.ts`
- Create `extensions/book-genesis/revision-plan.ts`
- Create `extensions/book-genesis/archive.ts`
- Create or modify prompt files under `prompts/book-genesis/`
- Modify `README.md`
- Add tests listed in each task below

## Release phases

### Phase 1: User-facing foundation and config

Deliver guided configuration, new config schema fields, migration compatibility, and documentation. This phase makes the rest of the release easier to test.

### Phase 2: Quality intelligence

Deliver style lock, scene map, pacing dashboard, critique panel, source audit, and revision planning. This phase improves manuscript quality before expanding publishing surfaces.

### Phase 3: Publishing and launch readiness

Deliver launch kit, front/back matter, series metadata, cover validation, archive packaging, and export integration.

### Phase 4: Operator polish and hardening

Deliver open/stats/doctor --fix, prompt-contract tests, audit integration, docs, and final regression pass.

---

## Task 1: Extend release config and types

### Purpose

Add configuration fields for new release features without changing behavior yet.

### Files

- Modify `extensions/book-genesis/types.ts`
- Modify `extensions/book-genesis/config.ts`
- Modify `extensions/book-genesis/state.ts`
- Modify `tests/config.test.ts`
- Create `tests/next-release-config.test.ts`

### Implementation steps

- [ ] Add config interfaces:
  - `StyleConfig`
  - `SceneMapConfig`
  - `CritiquePanelConfig`
  - `SourceAuditConfig`
  - `LaunchKitConfig`
  - `BookMatterConfig`
  - `SeriesConfig`
  - `CoverCheckConfig`
  - `RevisionPlanConfig`
  - `ArchiveConfig`
- [ ] Add safe defaults to `DEFAULT_RUN_CONFIG`.
- [ ] Normalize and validate nested config values.
- [ ] Ensure `readRunState()` can normalize older run configs without failing.
- [ ] Add tests for missing config, partial config, invalid feature config, and legacy run-state normalization.

### Suggested config shape

```json
{
  "style": {
    "enabled": true,
    "bannedPhrases": [],
    "voiceStrictness": "standard",
    "lintOnEvaluate": true
  },
  "sceneMap": {
    "enabled": true,
    "includeEmotionalValence": true,
    "includePromiseTracking": true
  },
  "critiquePanel": {
    "enabled": true,
    "reviewers": ["developmental-editor", "line-editor", "target-reader", "market-editor", "continuity-editor"],
    "requireConsensus": true,
    "maxMeanDisagreement": 8
  },
  "sourceAudit": {
    "enabled": true,
    "requiredForModes": ["memoir", "prescriptive-nonfiction", "narrative-nonfiction"],
    "flagUnsupportedStatistics": true
  },
  "launchKit": {
    "enabled": true,
    "includeNewsletterSequence": true,
    "includePressKit": true,
    "includeBookClubGuide": true
  },
  "bookMatter": {
    "frontMatter": ["title-page", "copyright"],
    "backMatter": ["author-note", "newsletter-cta"],
    "series": null
  },
  "coverCheck": {
    "enabled": true,
    "minEbookWidth": 625,
    "minEbookHeight": 1000,
    "idealEbookWidth": 1600,
    "idealEbookHeight": 2560
  },
  "revisionPlan": {
    "requirePlanBeforeRewrite": true,
    "approvalRequired": true
  },
  "archive": {
    "includeState": true,
    "includeLedger": true,
    "includeReports": true
  }
}
```

### Acceptance criteria

- [ ] `npm test` passes.
- [ ] `npm run typecheck` passes.
- [ ] Existing configs still load.
- [ ] Missing nested config uses defaults.
- [ ] Invalid enum values throw actionable errors.

---

## Task 2: Add `/book-genesis init-config`

### Purpose

Make first-run setup easier by writing a mode-specific starter `book-genesis.config.json`.

### Files

- Create `extensions/book-genesis/config-init.ts`
- Modify `extensions/book-genesis/index.ts`
- Modify `README.md`
- Create `tests/config-init.test.ts`

### Command design

```text
/book-genesis init-config [mode]
/book-genesis init-config fiction
/book-genesis init-config memoir
/book-genesis init-config prescriptive-nonfiction
/book-genesis init-config narrative-nonfiction
/book-genesis init-config childrens
/book-genesis init-config fiction --force
```

### Implementation steps

- [ ] Create `buildStarterConfig(mode)`.
- [ ] Create `writeStarterConfig(workspaceRoot, mode, force)`.
- [ ] Do not overwrite an existing config unless `--force` is present.
- [ ] Include comments as adjacent Markdown guidance if JSON comments are not supported.
- [ ] For each mode, tune target word count, artifact defaults, approval phases, rubric behavior, promotion settings, KDP defaults, and book matter defaults.
- [ ] Add command completions for mode names.
- [ ] Add README examples.

### Suggested outputs

- `book-genesis.config.json`
- `book-genesis.config.guide.md`

### Acceptance criteria

- [ ] Command creates valid config for every supported book mode.
- [ ] Command refuses to overwrite without `--force`.
- [ ] Generated config passes `loadRunConfig()`.
- [ ] Tests cover all modes.

---

## Task 3: Add style profile and style lint

### Purpose

Create an enforceable author voice layer so books remain stylistically consistent across long manuscripts.

### Files

- Create `extensions/book-genesis/style.ts`
- Modify `extensions/book-genesis/index.ts`
- Modify `extensions/book-genesis/audit.ts`
- Modify `prompts/book-genesis/foundation.md`
- Modify `prompts/book-genesis/write.md`
- Modify `prompts/book-genesis/evaluate.md`
- Modify `README.md`
- Create `tests/style.test.ts`

### Commands

```text
/book-genesis style-profile [run-dir]
/book-genesis style-lint [run-dir]
/book-genesis style-lint [run-dir] --json
```

### Artifacts

- `foundation/style-profile.md`
- `foundation/style-profile.json`
- `evaluations/style-lint.md`
- `evaluations/style-lint.json`

### Data model

```ts
interface StyleProfile {
  generatedAt: string;
  runId: string;
  sourceArtifacts: string[];
  voicePrinciples: string[];
  sentenceRhythm: string;
  diction: string[];
  povDistance: string;
  dialogueRules: string[];
  bannedPhrases: string[];
  preferredOpenings: string[];
  preferredEndings: string[];
  examples: string[];
}

interface StyleLintFinding {
  severity: "info" | "warning" | "error";
  code: string;
  target: string;
  evidence: string;
  suggestedAction: string;
}
```

### Implementation steps

- [ ] Build style profile from kickoff, foundation, voice DNA, sample chapters, and config.
- [ ] Add deterministic lint checks first:
  - banned phrase frequency
  - repeated generic transitions
  - excessive sentence-length uniformity
  - repeated chapter openings
  - repeated chapter closings
  - dialogue tag overuse
  - weak placeholder phrasing
- [ ] Add profile-to-manuscript drift checks:
  - profile terms absent from manuscript
  - tone mismatch indicators
  - repeated AI-ish phrasing
- [ ] Include style results in `/book-genesis audit`.
- [ ] Make evaluate prompt consult style-lint output when present.
- [ ] Do not block phase completion initially; report warnings first.

### Acceptance criteria

- [ ] Style profile writes Markdown and JSON.
- [ ] Style lint writes Markdown and JSON.
- [ ] Lint detects banned phrases and repeated openings.
- [ ] Audit surfaces top style findings.
- [ ] Tests cover empty manuscript, existing profile, banned phrase detection, and JSON formatting.

---

## Task 4: Add scene map and pacing dashboard

### Purpose

Give authors and agents a structured view of chapter/scene flow, pacing, promises, POV, and escalation.

### Files

- Create `extensions/book-genesis/scenes.ts`
- Modify `extensions/book-genesis/index.ts`
- Modify `extensions/book-genesis/intelligence.ts`
- Modify `extensions/book-genesis/audit.ts`
- Modify `README.md`
- Create `tests/scenes.test.ts`

### Commands

```text
/book-genesis scene-map [run-dir]
/book-genesis scene-map [run-dir] --json
/book-genesis pacing [run-dir]
/book-genesis pacing [run-dir] --json
```

### Artifacts

- `evaluations/scene-map.md`
- `evaluations/scene-map.json`
- `evaluations/pacing-dashboard.md`
- `evaluations/pacing-dashboard.json`

### Data model

```ts
interface SceneEntry {
  chapter: string;
  sceneIndex: number;
  title?: string;
  pov?: string;
  location?: string;
  goal?: string;
  conflict?: string;
  turn?: string;
  wordCount: number;
  emotionalValence?: "positive" | "negative" | "mixed" | "neutral";
  promisesSetup: string[];
  promisesPaidOff: string[];
  continuityRisks: string[];
}

interface PacingDashboard {
  generatedAt: string;
  runId: string;
  totalWords: number;
  chapterCount: number;
  averageChapterWords: number;
  longestChapter: string | null;
  shortestChapter: string | null;
  findings: ManuscriptIntelligenceFinding[];
}
```

### Implementation steps

- [ ] Parse chapter files and derive chapter word counts.
- [ ] Infer scene boundaries from headings, horizontal rules, or blank-line conventions.
- [ ] Support graceful fallback where scene details are unknown.
- [ ] Build Markdown table with columns for chapter, scene, POV, location, goal, conflict, turn, words, promise setup/payoff.
- [ ] Build pacing dashboard with chapter length variance, long/short outliers, POV clustering, repeated settings, and missing payoff warnings.
- [ ] Integrate top findings into manuscript intelligence and audit.

### Acceptance criteria

- [ ] Scene map works with one chapter or many chapters.
- [ ] Pacing dashboard identifies chapter length outliers.
- [ ] JSON output is stable and testable.
- [ ] Commands do not alter run state except writing reports.

---

## Task 5: Add multi-reviewer critique panel

### Purpose

Improve evaluation quality by separating editorial perspectives and detecting reviewer disagreement.

### Files

- Create `extensions/book-genesis/critique.ts`
- Modify `extensions/book-genesis/evaluation.ts`
- Modify `extensions/book-genesis/quality.ts`
- Modify `extensions/book-genesis/index.ts`
- Modify `prompts/book-genesis/evaluate.md`
- Modify `README.md`
- Create `tests/critique.test.ts`

### Command

```text
/book-genesis critique-panel [run-dir]
/book-genesis critique-panel [run-dir] --json
```

### Artifacts

- `evaluations/critique-panel.md`
- `evaluations/critique-panel.json`
- `evaluations/critique-disagreement.md`

### Reviewer defaults

- `developmental-editor`
- `line-editor`
- `target-reader`
- `market-editor`
- `continuity-editor`

### Data model

```ts
interface CritiqueReviewerResult {
  reviewer: string;
  scores: QualityScores;
  topStrengths: string[];
  topConcerns: string[];
  requiredFixes: string[];
  optionalFixes: string[];
}

interface CritiquePanelReport {
  generatedAt: string;
  runId: string;
  reviewers: CritiqueReviewerResult[];
  consensusScores: QualityScores;
  disagreement: {
    comparedDimensions: number;
    meanAbsDelta: number | null;
    highDisagreementDimensions: string[];
  };
  revisionPriorities: string[];
}
```

### Implementation steps

- [ ] Define reviewer persona contracts.
- [ ] Add deterministic aggregation helpers for reviewer scores.
- [ ] Calculate consensus scores by median or trimmed mean.
- [ ] Flag high disagreement dimensions using config threshold.
- [ ] Update evaluate prompt to produce or consume critique-panel artifacts.
- [ ] Add quality-gate option to use consensus scores when critique panel is enabled.
- [ ] Keep independent evaluation support; do not remove existing behavior.

### Acceptance criteria

- [ ] Critique panel report has at least three reviewer perspectives by default.
- [ ] Disagreement calculation is tested.
- [ ] Evaluation still passes existing tests.
- [ ] Quality gate remains deterministic.

---

## Task 6: Add source and claim coverage audit

### Purpose

Make nonfiction, memoir, and narrative nonfiction safer and more credible by mapping claims to supporting sources.

### Files

- Create `extensions/book-genesis/source-audit.ts`
- Modify `extensions/book-genesis/ledger.ts`
- Modify `extensions/book-genesis/intelligence.ts`
- Modify `extensions/book-genesis/audit.ts`
- Modify `extensions/book-genesis/index.ts`
- Modify `prompts/book-genesis/research.md`
- Modify `prompts/book-genesis/write.md`
- Modify `prompts/book-genesis/evaluate.md`
- Modify `README.md`
- Create `tests/source-audit.test.ts`

### Command

```text
/book-genesis source-audit [run-dir]
/book-genesis source-audit [run-dir] --json
```

### Artifacts

- `evaluations/source-audit.md`
- `evaluations/source-audit.json`
- `research/source-coverage-map.md`

### Data model

```ts
interface ClaimEntry {
  id: string;
  chapter?: string;
  claim: string;
  claimType: "statistic" | "historical" | "medical" | "legal" | "financial" | "memoir" | "general";
  sourceTitles: string[];
  supportLevel: "strong" | "partial" | "missing" | "not-required";
  risk: "low" | "medium" | "high";
  suggestedFix: string;
}

interface SourceAuditReport {
  generatedAt: string;
  runId: string;
  mode: BookMode;
  claims: ClaimEntry[];
  findings: HealthCheckResult[];
}
```

### Implementation steps

- [ ] Read source ledger entries.
- [ ] Detect likely claims from manuscript paragraphs using regex and heuristic patterns.
- [ ] Flag statistics, dates, medical/legal/financial claims, and broad authority claims.
- [ ] For memoir, distinguish lived-experience claims from external factual claims.
- [ ] Mark support level based on ledger/source mentions.
- [ ] Add evaluate-phase guidance for high-risk unsupported claims.
- [ ] Add audit integration.

### Acceptance criteria

- [ ] Nonfiction modes warn when claims have no ledger support.
- [ ] Fiction mode does not require source audit by default.
- [ ] Tests cover statistics, date claims, memoir claims, and missing ledger.

---

## Task 7: Add planning variants before outline lock-in

### Purpose

Allow the author/runtime to compare multiple book architectures before committing to one foundation.

### Files

- Create `extensions/book-genesis/variants.ts`
- Modify `extensions/book-genesis/state.ts`
- Modify `extensions/book-genesis/index.ts`
- Modify `extensions/book-genesis/types.ts`
- Modify `prompts/book-genesis/foundation.md`
- Modify `README.md`
- Create `tests/variants.test.ts`

### Commands

```text
/book-genesis variants [run-dir] --count 3
/book-genesis choose-variant [run-dir] 2
```

### Artifacts

- `foundation/variants/variant-01.md`
- `foundation/variants/variant-02.md`
- `foundation/variants/variant-03.md`
- `foundation/variants/variant-comparison.md`
- `foundation/selected-variant.md`
- `foundation/selected-variant.json`

### Implementation steps

- [ ] Add `selectedVariantPath?: string` to `RunState`.
- [ ] Build variant scaffolds for fiction and nonfiction modes.
- [ ] Generate comparison criteria:
  - reader promise fit
  - structure strength
  - originality
  - market clarity
  - drafting risk
  - revision risk
- [ ] `choose-variant` should persist the choice and queue foundation refinement.
- [ ] Foundation prompt should use selected variant when present.
- [ ] Do not force variants for every run; make it optional.

### Acceptance criteria

- [ ] Variant generation writes count-specific files.
- [ ] Choosing a variant validates the requested number exists.
- [ ] Selected variant is included in phase prompt context.
- [ ] Existing foundation flow still works without variants.

---

## Task 8: Add revision-plan-first workflow

### Purpose

Prevent broad reviewer feedback from immediately rewriting the manuscript without a controlled plan.

### Files

- Create `extensions/book-genesis/revision-plan.ts`
- Modify `extensions/book-genesis/state.ts`
- Modify `extensions/book-genesis/index.ts`
- Modify `extensions/book-genesis/types.ts`
- Modify `prompts/book-genesis/revise.md`
- Modify `README.md`
- Create `tests/revision-plan.test.ts`

### Commands

```text
/book-genesis feedback-plan [run-dir] <reviewer feedback>
/book-genesis approve-revision-plan [run-dir]
/book-genesis reject-revision-plan [run-dir] [note]
```

### Artifacts

- `evaluations/revision-plan.md`
- `evaluations/change-impact-map.md`
- `evaluations/revision-risk-register.md`

### Data model

```ts
interface PendingRevisionPlan {
  requestedAt: string;
  feedbackPath: string;
  planPath: string;
  status: "pending" | "approved" | "rejected";
  note?: string;
}
```

### Implementation steps

- [ ] Add pending revision plan to run state.
- [ ] `feedback-plan` records feedback and writes plan artifacts without launching `revise` immediately.
- [ ] `approve-revision-plan` routes to `revise` with the approved plan.
- [ ] `reject-revision-plan` stops the run and records note.
- [ ] Existing `/book-genesis feedback` should continue working.
- [ ] If `revisionPlan.requirePlanBeforeRewrite` is true, guide users toward feedback-plan.

### Acceptance criteria

- [ ] Feedback plan writes all required artifacts.
- [ ] Approving launches revision.
- [ ] Rejection records state and does not launch revision.
- [ ] Tests cover all transitions.

---

## Task 9: Expand promotion into a full launch kit

### Purpose

Turn the current short-story package into a broader author launch package.

### Files

- Create `extensions/book-genesis/launch.ts`
- Modify `extensions/book-genesis/promotion.ts`
- Modify `extensions/book-genesis/audit.ts`
- Modify `extensions/book-genesis/index.ts`
- Modify `prompts/book-genesis/deliver.md`
- Modify `README.md`
- Create `tests/launch.test.ts`

### Command

```text
/book-genesis launch-kit [run-dir]
/book-genesis launch-kit [run-dir] --json
```

### Artifacts

- `promotion/launch-kit/newsletter-sequence.md`
- `promotion/launch-kit/arc-reader-invite.md`
- `promotion/launch-kit/book-club-questions.md`
- `promotion/launch-kit/press-kit.md`
- `promotion/launch-kit/author-q-and-a.md`
- `promotion/launch-kit/retailer-description-variants.md`
- `promotion/launch-kit/launch-social-calendar.md`
- `promotion/launch-kit/website-homepage-copy.md`
- `promotion/launch-kit/launch-kit-manifest.json`

### Implementation steps

- [ ] Build launch kit from delivery artifacts, KDP metadata, synopsis, logline, and package summary.
- [ ] Include fiction/nonfiction mode-specific templates.
- [ ] Add retailer description variants:
  - short description
  - long description
  - high-concept hook
  - reader-transformation angle
  - series angle when configured
- [ ] Add launch social calendar with 14-day, 30-day, and 60-day options.
- [ ] Add audit readiness check for launch kit.

### Acceptance criteria

- [ ] Command writes every launch-kit artifact.
- [ ] Missing delivery assets produce warnings, not crashes.
- [ ] Manifest includes file list and source inputs.
- [ ] Tests cover fiction and nonfiction modes.

---

## Task 10: Add front matter, back matter, and series metadata

### Purpose

Make export outputs closer to publishable interiors.

### Files

- Create `extensions/book-genesis/book-matter.ts`
- Modify `extensions/book-genesis/exports.ts`
- Modify `extensions/book-genesis/kdp.ts`
- Modify `extensions/book-genesis/publishing.ts`
- Modify `extensions/book-genesis/config.ts`
- Modify `extensions/book-genesis/types.ts`
- Modify `README.md`
- Create `tests/book-matter.test.ts`

### New artifacts

- `delivery/front-matter/title-page.md`
- `delivery/front-matter/copyright.md`
- `delivery/front-matter/dedication.md`
- `delivery/back-matter/author-note.md`
- `delivery/back-matter/acknowledgments.md`
- `delivery/back-matter/newsletter-cta.md`
- `delivery/back-matter/also-by.md`
- `delivery/series-metadata.json`

### Implementation steps

- [ ] Generate front/back matter from config and delivery assets.
- [ ] Add series fields:
  - series name
  - book number
  - previous title
  - next title teaser
- [ ] Include front/back matter in Markdown export.
- [ ] Include front/back matter in DOCX and EPUB export where practical.
- [ ] Add KDP metadata awareness for series fields.
- [ ] Add publishing readiness checks for missing copyright/author CTA where configured.

### Acceptance criteria

- [ ] Export includes configured front and back matter.
- [ ] Series metadata is emitted when configured.
- [ ] Existing exports still work when book matter is empty.
- [ ] Tests cover front matter only, back matter only, and series metadata.

---

## Task 11: Add cover asset validation

### Purpose

Validate real cover assets, not just prompts and specs.

### Files

- Create `extensions/book-genesis/cover-check.ts`
- Modify `extensions/book-genesis/kdp.ts`
- Modify `extensions/book-genesis/audit.ts`
- Modify `extensions/book-genesis/index.ts`
- Modify `README.md`
- Create `tests/cover-check.test.ts`

### Commands

```text
/book-genesis cover-check [run-dir] <cover-path>
/book-genesis cover-check [run-dir] <cover-path> --target ebook
/book-genesis cover-check [run-dir] <cover-path> --target paperback
/book-genesis cover-check [run-dir] <cover-path> --json
```

### Artifacts

- `delivery/kdp/cover-check.md`
- `delivery/kdp/cover-check.json`

### Implementation steps

- [ ] Support local paths inside workspace/run directory.
- [ ] Validate file existence and extension.
- [ ] For JPEG/PNG, parse image dimensions using a lightweight dependency or safe built-in parser.
- [ ] Validate ebook minimum size, ideal ratio, and max file size.
- [ ] For paperback PDF, at minimum validate extension and emit checklist warnings if exact PDF inspection is not available.
- [ ] Estimate spine eligibility using current manuscript word/page estimate.
- [ ] Add cover-check summary to KDP preflight.

### Acceptance criteria

- [ ] Missing file reports actionable error.
- [ ] Undersized ebook cover reports error.
- [ ] Correctly sized ebook cover reports OK.
- [ ] Paperback target reports page-count/spine warning.
- [ ] Tests avoid heavyweight binary fixtures where possible.

---

## Task 12: Add archive package command

### Purpose

Create a handoff-ready archive manifest for backups, collaborators, or later publishing operations.

### Files

- Create `extensions/book-genesis/archive.ts`
- Modify `extensions/book-genesis/index.ts`
- Modify `README.md`
- Create `tests/archive.test.ts`

### Command

```text
/book-genesis archive [run-dir]
/book-genesis archive [run-dir] --manifest-only
```

### Artifacts

- `delivery/archive/archive-manifest.json`
- `delivery/archive/archive-readme.md`
- Optional copied bundle folder under `delivery/archive/files/`

### Implementation steps

- [ ] Build manifest including manuscript, chapters, story bible, ledger, config snapshot, delivery assets, evaluations, KDP package, promotion assets, and launch kit.
- [ ] Add checksums if simple and reliable.
- [ ] Do not zip unless a dependency-free approach is available; manifest-only is acceptable for this release.
- [ ] Include missing-file warnings.

### Acceptance criteria

- [ ] Archive manifest is stable and complete.
- [ ] Missing optional artifacts do not crash.
- [ ] Tests cover manifest generation.

---

## Task 13: Add operator polish commands

### Purpose

Make the plugin easier to operate during real author workflows.

### Files

- Modify `extensions/book-genesis/index.ts`
- Modify `extensions/book-genesis/doctor.ts`
- Modify `extensions/book-genesis/audit.ts`
- Create `extensions/book-genesis/stats.ts`
- Modify `README.md`
- Create `tests/operator-commands.test.ts`

### Commands

```text
/book-genesis open [run-dir]
/book-genesis stats [run-dir]
/book-genesis stats [run-dir] --json
/book-genesis doctor --fix
```

### `/book-genesis open`

Should print key paths:

- run root
- run state
- ledger
- story bible
- full manuscript
- latest evaluation
- latest audit
- export manifest
- KDP manifest
- launch kit manifest

### `/book-genesis stats`

Should report:

- status
- phase
- completed phases
- word count
- chapter count
- average chapter length
- longest and shortest chapter
- latest quality gate status
- style findings count
- source-audit warnings count
- KDP readiness errors/warnings
- launch-kit readiness

### `/book-genesis doctor --fix`

Safe fixes only:

- create missing expected workspace directories
- create starter config if absent and mode is provided
- migrate old state if found
- do not delete files
- do not overwrite config without explicit force

### Acceptance criteria

- [ ] Commands work without active run when explicit run-dir is provided.
- [ ] Commands produce useful errors when no run can be resolved.
- [ ] JSON versions are parseable.
- [ ] Doctor fixes are non-destructive.

---

## Task 14: Add prompt-contract tests

### Purpose

Prevent prompt regressions as the runtime adds new feature contracts.

### Files

- Modify `tests/prompts.test.ts`
- Create `tests/prompt-contracts.test.ts`
- Modify prompt files under `prompts/book-genesis/`

### Required checks

- [ ] System prompt requires disk artifacts and phase completion tool.
- [ ] Foundation prompt references selected variants when present.
- [ ] Write prompt requires chapter briefs, continuity report, style profile, and scene-map compatibility.
- [ ] Evaluate prompt requires quality gate, style lint awareness, source audit awareness, critique panel awareness, and revision plan output guidance.
- [ ] Revise prompt respects approved revision plan when present.
- [ ] Deliver prompt includes launch kit, front/back matter, KDP readiness, and promotion package guidance.

### Acceptance criteria

- [ ] Prompt tests fail if required feature contracts are removed.
- [ ] Prompt tests are not brittle around exact prose.
- [ ] Existing prompt behavior remains compatible.

---

## Task 15: Audit integration pass

### Purpose

Make `/book-genesis audit` the single best command for readiness assessment.

### Files

- Modify `extensions/book-genesis/audit.ts`
- Modify `tests/audit.test.ts`

### Add audit sections

- [ ] Artifact validation.
- [ ] Manuscript intelligence.
- [ ] Style lint.
- [ ] Scene map and pacing.
- [ ] Critique panel status.
- [ ] Source audit status.
- [ ] Publishing readiness.
- [ ] KDP readiness.
- [ ] Cover-check readiness.
- [ ] Promotion readiness.
- [ ] Launch-kit readiness.
- [ ] Archive readiness.
- [ ] Next actions prioritized by severity.

### Acceptance criteria

- [ ] Audit still works on incomplete runs.
- [ ] Audit JSON includes all new sections.
- [ ] Audit Markdown remains readable.
- [ ] Top next actions avoid duplicate messages.

---

## Task 16: README and migration notes

### Purpose

Document the release so operators know how to use it.

### Files

- Modify `README.md`
- Optional: Create `docs/releases/2026-04-next-release.md`

### README updates

- [ ] Add command quick reference entries for all new commands.
- [ ] Add recommended operator workflows:
  - first-time setup
  - fiction run
  - nonfiction run
  - reviewer feedback with plan approval
  - KDP packaging and cover validation
  - launch kit generation
- [ ] Add config examples for each book mode.
- [ ] Add troubleshooting for config, cover assets, source audit, and revision plans.
- [ ] Add migration note for existing runs.

### Acceptance criteria

- [ ] README command list matches implemented commands.
- [ ] Examples are copy-pasteable.
- [ ] No stale references to deprecated command names.

---

## Task 17: Final regression and release readiness

### Purpose

Verify the release is stable before merge/tag.

### Steps

- [ ] Run `npm test`.
- [ ] Run `npm run typecheck`.
- [ ] Run a manual smoke test in a temporary workspace:
  - `/book-genesis init-config fiction`
  - `/book-genesis run en a near-future thriller about memory theft`
  - `/book-genesis status`
  - `/book-genesis doctor`
  - `/book-genesis list-runs`
- [ ] Create a synthetic completed run fixture or use test helper fixtures to validate:
  - style profile
  - style lint
  - scene map
  - pacing dashboard
  - critique panel
  - source audit
  - launch kit
  - cover check
  - archive
  - audit
- [ ] Confirm generated artifacts stay inside run directory.
- [ ] Confirm old runs still migrate safely.
- [ ] Confirm README command reference is complete.

### Release checklist

- [ ] Version bump in `package.json`.
- [ ] Changelog or release notes added.
- [ ] All tests pass.
- [ ] Typecheck passes.
- [ ] PR description includes command summary and migration notes.

---

## Suggested implementation order

1. Task 1: Extend config and types.
2. Task 2: Add `init-config`.
3. Task 3: Add style profile/lint.
4. Task 4: Add scene map/pacing dashboard.
5. Task 5: Add critique panel.
6. Task 6: Add source audit.
7. Task 7: Add planning variants.
8. Task 8: Add revision-plan-first workflow.
9. Task 9: Add launch kit.
10. Task 10: Add front/back matter and series metadata.
11. Task 11: Add cover asset validation.
12. Task 12: Add archive command.
13. Task 13: Add operator polish commands.
14. Task 14: Add prompt-contract tests.
15. Task 15: Audit integration pass.
16. Task 16: README and migration notes.
17. Task 17: Final regression and release readiness.

## Notes for agentic implementation

- Use one PR or branch per task if possible. This release is broad enough that isolated branches will reduce merge risk.
- Start each task with tests that fail for the missing behavior.
- Keep deterministic logic in TypeScript modules and use prompts only for generative work.
- Avoid overusing LLM-only validation where simple static checks are enough.
- For binary cover validation, prefer a small, well-maintained dependency only if needed. If dependency risk is high, implement JPEG/PNG header parsing and defer advanced PDF inspection.
- Keep all user-facing commands resilient when the run is incomplete.
- Prioritize clear Markdown reports over clever automation.

## Definition of done

This release is done when an operator can:

1. Initialize a mode-specific config.
2. Start a book run.
3. Generate and choose planning variants.
4. Build a style profile.
5. Draft with chapter briefs and scene awareness.
6. Run style lint, scene map, pacing dashboard, critique panel, and source audit.
7. Request reviewer feedback through an approved revision plan.
8. Export a manuscript with front/back matter and series metadata.
9. Validate cover assets and prepare a KDP package.
10. Generate a launch kit.
11. Archive the run.
12. Use audit/stats/open/doctor to understand readiness at any point.

