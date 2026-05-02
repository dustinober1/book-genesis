# Book Genesis PI Package

PI-native autonomous book generation package built on `@mariozechner/pi-coding-agent`.

## Attribution

This package is a derivative PI-native port of **Book Genesis**, the open-source project created and developed by **Philip Stark**.

- Original project: [Book Genesis on GitLab](https://gitlab.com/philipstark/book-genesis)
- Original contribution being adapted here: the core concept, pipeline shape, prompt assets, and early system development

The PI runtime in this folder is an adaptation layer around that original work, not a claim of independent origin.

## Install

```bash
# From the package directory
pi install .

# From a parent workspace
pi install ./pi-extensions/book-genesis
```

## Slash Commands

Book Genesis exposes two slash-command entry points:

- `/book-genesis` for all run management
- `/book-auto` as a compatibility alias for starting a new run

When a command shows `[run-dir]`, that argument is optional. If you omit it, the runtime tries the active run for the current session first, then falls back to a run marker in recent messages, then falls back to the latest run in `book-projects/`. Use an explicit run directory when you are switching between multiple books.

Command arguments that contain spaces should be quoted. Paths can be absolute or relative to the current workspace.

### Command Quick Reference

| Command | Purpose |
| --- | --- |
| `/book-genesis run` | Start a new autonomous book run. |
| `/book-genesis resume` | Continue the current run or launch the next phase. |
| `/book-genesis status` | Show run state, phase, approval, feedback, and next action. |
| `/book-genesis next` | Recommend the single next operator command. |
| `/book-genesis dashboard` | Write a run dashboard with readiness and next action. |
| `/book-genesis map` | Write a Mermaid project map for the run. |
| `/book-genesis doctor` | Check package, workspace, config, dependencies, and nearby extension health. |
| `/book-genesis doctor-run` | Diagnose one run's state, artifacts, sources, and final readiness. |
| `/book-genesis init-config` | Write a mode-specific starter config and Markdown guide. |
| `/book-genesis stop` | Pause a run cleanly before manual intervention. |
| `/book-genesis approve` | Approve a pending checkpoint and continue. |
| `/book-genesis reject` | Reject a pending checkpoint and stop. |
| `/book-genesis feedback` | Reopen a run for manuscript-level reviewer feedback. |
| `/book-genesis feedback-plan` | Turn reviewer feedback into an approval-ready revision plan. |
| `/book-genesis approve-revision-plan` | Approve the pending revision plan and launch revise. |
| `/book-genesis reject-revision-plan` | Reject the pending revision plan and stop the run. |
| `/book-genesis open` | Print key run paths for the active or explicit run. |
| `/book-genesis stats` | Show run, manuscript, quality, style, source, KDP, and launch stats. |
| `/book-genesis style-profile` | Build author voice/style profile artifacts. |
| `/book-genesis style-lint` | Write deterministic style lint reports. |
| `/book-genesis scene-map` | Write a chapter/scene map. |
| `/book-genesis pacing` | Write a pacing dashboard. |
| `/book-genesis critique-panel` | Write multi-reviewer critique and disagreement reports. |
| `/book-genesis source-audit` | Map nonfiction/memoir claims to source coverage. |
| `/book-genesis source add` | Add a source to the run ledger. |
| `/book-genesis source-pack` | Write source-first planning and source-gap artifacts. |
| `/book-genesis bible-check` | Check manuscript drift against the story bible. |
| `/book-genesis revision-history` | Summarize phase, feedback, quality, and draft-change history. |
| `/book-genesis variants` | Generate optional planning variants before outline lock-in. |
| `/book-genesis choose-variant` | Persist the selected planning variant. |
| `/book-genesis launch-kit` | Generate newsletter, press, book club, social, and retailer copy. |
| `/book-genesis book-matter` | Generate front matter, back matter, and series metadata. |
| `/book-genesis cover-check` | Validate ebook or paperback cover assets. |
| `/book-genesis archive` | Write a handoff-ready archive manifest. |
| `/book-genesis revise-chapter` | Reopen a run for targeted chapter feedback. |
| `/book-genesis inspect-continuity` | Write a manuscript intelligence report without advancing phases. |
| `/book-genesis checkpoint write` | Pause writing for review of a sample chapter set. |
| `/book-genesis compare-drafts` | Compare two draft files and write a comparison report. |
| `/book-genesis short-story` | Brainstorm or package a website lead-magnet short story. |
| `/book-genesis list-runs` | List discovered runs. |
| `/book-genesis series` | Manage a multi-book series above individual book runs. |
| `/book-genesis export` | Generate final manuscript export files. |
| `/book-genesis kdp` | Prepare a manual Amazon KDP submission package. |
| `/book-genesis audit` | Report artifact, manuscript, publishing, KDP, and promotion readiness. |
| `/book-genesis final-check` | Run the final export/KDP readiness gate. |
| `/book-genesis beta-packet` | Write a beta-reader packet and feedback form. |
| `/book-genesis migrate` | Normalize older run-state files to the current state shape. |
| `/book-auto` | Compatibility alias for `/book-genesis run`. |

### `/book-genesis run`

Start a new autonomous book project.

Usage:

- `/book-genesis run [language] <idea>`
- `/book-genesis run --config ./path/to/book-genesis.config.json [language] <idea>`

Examples:

- `/book-genesis run a near-future thriller about memory theft`
- `/book-genesis run en a business book about founder-led sales`
- `/book-genesis run --config ./book-genesis.config.json en a middle-grade mystery set in a museum`

Notes:

- `language` is optional. If omitted, the run uses `auto`.
- `--config` overrides the default workspace `book-genesis.config.json`.
- Starting a run creates a new run under `book-projects/` and launches the `kickoff` phase immediately.
- The run starts by collecting a project brief before it moves into autonomous research.
- If `gitAutoInit` is enabled, Book Genesis initializes git only when no repository exists.
- If `gitAutoCommit` is enabled, later phase completions snapshot changed run files.

### `/book-genesis resume`

Resume a stopped run or launch the next active phase.

Usage:

- `/book-genesis resume [run-dir]`

Examples:

- `/book-genesis resume`
- `/book-genesis resume ./book-projects/2026-04-27T23-45-35-907Z-heist-novel`

Notes:

- If the run is waiting for approval, `resume` will not bypass that gate. Use `approve` or `reject`.
- If the run is already completed, `resume` just shows status.
- If a previous phase failed with a retryable error, `resume` relaunches the current phase with the preserved handoff.

### `/book-genesis status`

Show the current state of a run.

Usage:

- `/book-genesis status [run-dir]`

Examples:

- `/book-genesis status`
- `/book-genesis status ./book-projects/<run-id>`

Status includes the current phase, next action, unresolved issues, approval state, revision cycle, and latest feedback path when present.

### `/book-genesis doctor`

Check whether the local Book Genesis package and workspace are ready to run.

Usage:

- `/book-genesis doctor`
- `/book-genesis doctor --json`

Doctor checks Node.js, package dependencies, config validity, workspace writability, latest run readability, and sibling extension dependency gaps when they can be inspected.

Use `doctor` first when Pi refuses to start, an extension install looks suspicious, or a run cannot be discovered. The JSON form is useful when another tool needs to parse the health report.

Typical output includes:

- package and Node.js health
- missing dependency errors
- invalid config errors
- latest run-state readability
- warnings for broken sibling extensions that may prevent Pi from booting before Book Genesis loads

`/book-genesis doctor --fix fiction` performs only safe fixes: it creates expected workspace directories and writes a starter config if no config exists. It does not delete files or overwrite an existing config.

### `/book-genesis init-config`

Write a mode-specific starter config and a Markdown guide.

Usage:

- `/book-genesis init-config [mode]`
- `/book-genesis init-config fiction --force`
- `/book-genesis init-config fiction --preset thriller`

Supported modes are `fiction`, `memoir`, `prescriptive-nonfiction`, `narrative-nonfiction`, and `childrens`.
Supported genre presets are `thriller`, `memoir`, `business`, `devotional`, `childrens-picture-book`, `middle-grade`, and `romantasy`.

Outputs:

- `book-genesis.config.json`
- `book-genesis.config.guide.md`

Use `--force` only when you intentionally want to replace an existing config.

### `/book-genesis stop`

Pause a running run cleanly.

Usage:

- `/book-genesis stop [run-dir]`

Examples:

- `/book-genesis stop`
- `/book-genesis stop ./book-projects/<run-id>`

Use this before stepping in manually or before sending a completed manuscript back for another review cycle.

Stopping does not delete work. It marks the run as stopped and preserves the next action so `resume`, `feedback`, or `revise-chapter` can pick up from a clear state.

### `/book-genesis approve`

Approve a gated checkpoint and continue the run.

Usage:

- `/book-genesis approve [run-dir]`
- `/book-genesis approve [run-dir] [note]`

Examples:

- `/book-genesis approve`
- `/book-genesis approve ./book-projects/<run-id> "Keep the premise, but sharpen the audience promise."`
- `/book-genesis approve "Keep going, but trim exposition in the opening chapters."`

Notes:

- Use this when the run is `awaiting_approval`.
- An optional note is carried into the next phase prompt as checkpoint feedback.
- If approval was requested after the final phase, approving completes the run.

### `/book-genesis reject`

Reject a gated checkpoint and stop the run.

Usage:

- `/book-genesis reject [run-dir]`
- `/book-genesis reject [run-dir] [note]`

Examples:

- `/book-genesis reject`
- `/book-genesis reject ./book-projects/<run-id> "The structure is off. Rework the outline before drafting."`
- `/book-genesis reject "This needs a clearer reader promise before continuing."`

Notes:

- Rejection stops the run and marks it for manual intervention.
- The optional note is stored on the approval record and visible in run status.
- Use `reject` when the current artifacts need manual edits before the next phase should run.

### `/book-genesis feedback`

Reopen a paused or completed run using reviewer notes from a full manuscript review.

Usage:

- `/book-genesis feedback [run-dir] <reviewer feedback>`

Examples:

- `/book-genesis feedback "The ending works, but chapters 7 through 9 drag and the midpoint needs a stronger turn."`
- `/book-genesis feedback ./book-projects/<run-id> "Reviewer notes: simplify the subplot, reduce repetition, and improve chapter transitions."`

Notes:

- This command writes the feedback to `book-projects/<run-id>/evaluations/reviewer-feedback/`.
- The runtime reopens the run in `revise`, injects the feedback into the next prompt, then routes the book back through `evaluate`.
- Use this after a complete book review when you want the package to rework the reviewer notes.
- If the run is currently active, stop it first with `/book-genesis stop`.

### Revision Plan Commands

Use the revision-plan-first workflow for broad reviewer notes:

- `/book-genesis feedback-plan [run-dir] <reviewer feedback>`
- `/book-genesis approve-revision-plan [run-dir]`
- `/book-genesis reject-revision-plan [run-dir] [note]`

`feedback-plan` writes `evaluations/revision-plan.md`, `evaluations/change-impact-map.md`, and `evaluations/revision-risk-register.md` without launching rewrite work. Approval routes the run to `revise`; rejection stops the run and records the note.

### `/book-genesis revise-chapter`

Reopen a run for a targeted chapter revision.

Usage:

- `/book-genesis revise-chapter [run-dir] <chapter> <notes>`

Examples:

- `/book-genesis revise-chapter 03 "Make the midpoint reveal sharper and cut repeated exposition."`
- `/book-genesis revise-chapter ./book-projects/<run-id> "chapter-07" "Raise the emotional stakes before the final clue."`

The command writes chapter-specific reviewer feedback, routes the run to `revise`, and queues the revision phase.

Use this for narrow fixes when the whole manuscript does not need a broad reviewer pass. The chapter identifier can be a number, a filename-like label, or any short target the next agent can understand.

### `/book-genesis inspect-continuity`

Write a manuscript intelligence report without changing the current phase.

Usage:

- `/book-genesis inspect-continuity [run-dir]`

The report is written to `evaluations/manuscript-intelligence.md` and checks unresolved promises, repeated passages, pacing variance, missing chapter briefs, story-bible drift, source coverage gaps, and delivery payoff consistency.

This command is read-only with respect to run state. It creates or replaces the report file, but it does not advance, stop, resume, approve, or reject the run.

### `/book-genesis checkpoint write`

Pause the write phase for human review of a chapter sample.

Usage:

- `/book-genesis checkpoint write [run-dir] --sample <n>`

Example:

- `/book-genesis checkpoint write --sample 3`

Use this when you want to review the first few chapters before the writing phase continues. The command puts the run into `awaiting_approval` with `write` as the next phase, so `/book-genesis approve` continues writing and `/book-genesis reject` stops for manual intervention.

### `/book-genesis compare-drafts`

Compare two draft files inside a run directory.

Usage:

- `/book-genesis compare-drafts [run-dir] <left-relative-path> <right-relative-path>`

The report is written under `evaluations/draft-comparisons/`. Both paths must stay inside the run directory.

Examples:

- `/book-genesis compare-drafts manuscript/full-manuscript.md manuscript/revised-manuscript.md`
- `/book-genesis compare-drafts ./book-projects/<run-id> drafts/before.md drafts/after.md`

### `/book-genesis short-story`

Brainstorm or package a companion short story for website promotion.

Usage:

- `/book-genesis short-story brainstorm [run-dir] [notes]`
- `/book-genesis short-story package [run-dir] <selected-concept>`

Examples:

- `/book-genesis short-story brainstorm "Feature the lighthouse keeper, but avoid spoilers."`
- `/book-genesis short-story package "The First Signal"`

Use `brainstorm` first. It produces several companion-story concepts with hook, emotional promise, POV, connection to the main book, spoiler risk, website positioning, and a recommended pick. Use `package` with the selected concept title to write the lead-magnet assets.

The default goal is a short story under 15 pages, usually around 2,500-3,750 words, that matches the book's flavor without spoiling the main manuscript. Configure this with the `promotion` settings.

The package command writes:

- `promotion/short-story-package/story.md`
- `promotion/short-story-package/story-brief.md`
- `promotion/short-story-package/landing-page-copy.md`
- `promotion/short-story-package/email-signup-copy.md`
- `promotion/short-story-package/social-posts.md`
- `promotion/short-story-package/seo-notes.md`

### `/book-genesis list-runs`

List all discovered Book Genesis runs in the current workspace.

Usage:

- `/book-genesis list-runs`

Use this when you do not remember a run directory and want to inspect all saved runs. Each listed run includes the same status format used by `/book-genesis status`.

### `/book-genesis series`

Manage an entire book series while keeping each book as a normal Book Genesis run.

Usage:

- `/book-genesis series init <series name> [--books <n>]`
- `/book-genesis series status [series-dir] [--json]`
- `/book-genesis series add-run [series-dir] <run-dir>`
- `/book-genesis series next-book [series-dir] [notes]`
- `/book-genesis series bible [series-dir]`
- `/book-genesis series metadata [series-dir]`
- `/book-genesis series continuity [series-dir] [--json]`

Examples:

- `/book-genesis series init "Memory City" --books 5`
- `/book-genesis series add-run ./book-projects/<run-id>`
- `/book-genesis series next-book "Escalate the city-wide memory conspiracy."`
- `/book-genesis series bible`
- `/book-genesis series metadata`
- `/book-genesis series continuity --json`

Notes:

- Series workspaces are written under `book-series/<series-id>/`.
- Each linked book remains a separate run under `book-projects/<run-id>/`.
- `add-run` updates the linked run's `bookMatter.series` config with the series name and book number.
- `next-book` writes `planning/book-XX/next-book-brief.md` and a starter `book-genesis.config.json`, then prints the `/book-genesis run --config ...` command to launch the next book.
- `bible` writes shared creative planning files under `creative/`, including the series promise, book map, cross-book arcs, open threads, and spinoff or short-story ideas.
- `metadata` writes publishing assets under `publishing/`, including reading order, whole-series metadata, also-by copy, and launch positioning.
- `continuity` writes cross-book checks under `continuity/`, including missing linked runs, series metadata mismatches, open threads, and manuscript word counts.

### `/book-genesis export`

Generate the final export package for a run.

Usage:

- `/book-genesis export [run-dir]`

Examples:

- `/book-genesis export`
- `/book-genesis export ./book-projects/<run-id>`

Notes:

- Export uses the formats configured in `exportFormats`.
- Typical outputs are written under `book-projects/<run-id>/delivery/`.
- Export also writes `delivery/publishing-readiness.md` with manuscript, metadata, cover, KDP, and website-readiness checks.
- Markdown export is always created as `delivery/submission-manuscript.md`.
- DOCX, EPUB, and PDF are generated when present in `exportFormats`.
- PDF export creates a no-bleed paperback interior sized from `kdp.trimSize`; the standard KDP paperback target is `6 x 9`.
- Export requires a full manuscript and a delivery synopsis artifact.
- Export includes configured front matter and back matter in the generated manuscript and writes `delivery/series-metadata.json` when series metadata is configured.

### `/book-genesis kdp`

Prepare a KDP submission package for a run.

Usage:

- `/book-genesis kdp [run-dir]`

Examples:

- `/book-genesis kdp`
- `/book-genesis kdp ./book-projects/<run-id>`

Notes:

- This command does not publish directly to Amazon KDP.
- It generates `delivery/kdp/` files, copies KDP-ready assets, writes a preflight report against the current manual KDP workflow, and includes detailed cover-image prompts plus cover spec notes for eBook and paperback submission.
- eBook packaging requires EPUB output; paperback packaging requires DOCX output and a no-bleed paperback PDF. The command requests those export formats automatically for the KDP package.
- Missing author name, invalid paperback trim size, and missing core metadata are reported in the preflight output.
- Existing `cover-check` findings are included in the KDP preflight output.
- Always review the package manually in KDP before publishing.

### Quality Intelligence Commands

These commands write reports under `evaluations/` or `foundation/` without advancing the run:

- `/book-genesis style-profile [run-dir]`
- `/book-genesis style-lint [run-dir] [--json]`
- `/book-genesis scene-map [run-dir] [--json]`
- `/book-genesis pacing [run-dir] [--json]`
- `/book-genesis critique-panel [run-dir] [--json]`
- `/book-genesis source-audit [run-dir] [--json]`

Use them after drafting and before a serious evaluate/revise cycle. `source-audit` is required by default for memoir, prescriptive nonfiction, and narrative nonfiction, and optional for fiction.

### Planning Variants

Generate and select optional foundation variants before outline lock-in:

- `/book-genesis variants [run-dir] --count 3`
- `/book-genesis choose-variant [run-dir] 2`

The selected variant is written to `foundation/selected-variant.md` and used by the foundation prompt when present.

### Launch, Cover, Matter, And Archive

Publishing and launch-prep commands:

- `/book-genesis launch-kit [run-dir] [--json]`
- `/book-genesis book-matter [run-dir]`
- `/book-genesis cover-check [run-dir] <cover-path> [--target ebook|paperback] [--json]`
- `/book-genesis archive [run-dir] [--manifest-only]`

`launch-kit` writes the newsletter sequence, ARC invite, book club questions, press kit, author Q&A, retailer description variants, social calendar, homepage copy, and manifest under `promotion/launch-kit/`.

`cover-check` validates local cover assets inside the run directory. JPEG and PNG ebook covers get dimension and file-size checks; paperback cover PDFs get extension and spine/page-count guidance.

`archive` writes `delivery/archive/archive-manifest.json` with checksums and a README. It is non-destructive and does not zip by default.

### `/book-genesis open` And `/book-genesis stats`

Use `/book-genesis open [run-dir]` to print key paths for the run root, state, ledger, story bible, manuscript, latest evaluation, audit, export manifest, KDP manifest, and launch kit manifest.

Use `/book-genesis stats [run-dir] [--json]` for parseable manuscript and readiness counts: phase, completed phases, word count, chapter count, average chapter length, latest quality gate, style findings, source audit warnings, KDP issues, and launch-kit readiness.

### Operator Guidance Commands

Use these commands when returning to a run or deciding what to do next:

- `/book-genesis next [run-dir] [--json]`
- `/book-genesis dashboard [run-dir] [--json]`
- `/book-genesis map [run-dir]`
- `/book-genesis doctor-run [run-dir] [--json]`

`next` prints the single recommended operator command. `dashboard` writes `dashboard/run-dashboard.md` and `.json`. `map` writes `dashboard/project-map.md` with a Mermaid phase graph. `doctor-run` diagnoses one run's state, artifacts, source-pack status, and final-check blockers.

### `/book-genesis audit`

Run a combined health check for a run: validates artifact targets for completed/current phases and summarizes manuscript intelligence, export readiness, KDP readiness, and promotion readiness.

Usage:

- `/book-genesis audit [run-dir]`
- `/book-genesis audit [run-dir] --json`

Examples:

- `/book-genesis audit`
- `/book-genesis audit ./book-projects/<run-id>`
- `/book-genesis audit ./book-projects/<run-id> --json`

Audit is the broadest status command. It combines:

- required artifact validation for the current and completed phases
- manuscript intelligence findings
- publishing readiness
- KDP metadata readiness
- cover-check readiness
- promotion readiness for the companion short-story package
- launch-kit readiness
- archive readiness
- next actions inferred from the report

Use `audit` before export, before KDP packaging, and after a large manual edit.

### Final Readiness, Sources, And Beta Readers

Use these commands before final packaging or outside-reader review:

- `/book-genesis source add [run-dir] <title> --summary <text> [--url <url>]`
- `/book-genesis source-pack [run-dir] [--json]`
- `/book-genesis bible-check [run-dir] [--json]`
- `/book-genesis revision-history [run-dir] [--json]`
- `/book-genesis final-check [run-dir] [--json]`
- `/book-genesis beta-packet [run-dir] [--sample full|first-3|first-5]`

`source-pack` writes `research/source-pack.md`, `research/source-pack.json`, and `research/source-gap-plan.md`. `bible-check` writes deterministic story-bible drift reports under `evaluations/`. `final-check` combines audit, style, pacing, source, bible, publishing, cover, launch, and archive readiness; `export` and `kdp` warn when final-check has blockers but do not block packaging. `beta-packet` writes a sample manuscript, instructions, feedback form, and target-reader questions under `evaluations/beta-reader-packet/`.

### `/book-genesis migrate`

Normalize older run-state files to the current state shape.

Usage:

- `/book-genesis migrate [run-dir]`
- `/book-genesis migrate --all`

Examples:

- `/book-genesis migrate`
- `/book-genesis migrate ./book-projects/<run-id>`
- `/book-genesis migrate --all`

Notes:

- Migration is non-destructive. When a state file needs updating, the runtime writes a timestamped `.bak` file beside the original run state before saving the normalized state.
- `--all` scans discovered runs under `book-projects/`.
- If no run is discovered under `book-projects/`, migration also checks whether the current directory itself contains `.book-genesis/run.json`.
- Use this after upgrading the package or when a legacy run cannot be resumed.

### `/book-auto`

Compatibility alias for `/book-genesis run`.

Usage:

- `/book-auto [language] <idea>`
- `/book-auto --config ./path/to/book-genesis.config.json [language] <idea>`

Examples:

- `/book-auto a fantasy romance with political intrigue`
- `/book-auto en a prescriptive nonfiction book about team rituals`

Use `/book-auto` only for older workflows or muscle memory. New examples should prefer `/book-genesis run`.

## Agent Runtime Tools

Book Genesis also registers internal tools for the autonomous agent. Operators normally do not call these directly; they are documented here so you understand what the phase agent is allowed to do.

| Tool | Used by phase agents to |
| --- | --- |
| `book_genesis_complete_kickoff` | Record kickoff intake, write the project brief, and advance to research. |
| `book_genesis_update_story_bible` | Persist durable characters, settings, promises, motifs, timeline facts, and glossary entries. |
| `book_genesis_web_search` | Search the public internet during research. |
| `book_genesis_fetch_url` | Fetch a public URL during research for source inspection. |
| `book_genesis_record_source` | Add research or evaluation sources to the run ledger. |
| `book_genesis_record_decision` | Add durable creative or strategic decisions to the run ledger. |
| `book_genesis_complete_phase` | Mark a phase complete, validate artifacts, write a handoff, and queue the next phase. |
| `book_genesis_report_failure` | Record a failed phase and retry or stop based on the failure type. |
| `book_genesis_compact_context` | Request context compaction with Book Genesis-specific focus, then auto-continue the active phase. |

These tools enforce the runtime contract. For example, the evaluate phase cannot complete without a quality gate, required artifacts must exist before phase completion, and independent evaluation scores must be present when `independentEvaluationPass` is enabled.

### Typical Operator Flow

Common usage looks like this:

1. Start a run with `/book-genesis run ...`
2. Check progress with `/book-genesis status`
3. If a checkpoint pauses, use `/book-genesis approve` or `/book-genesis reject`
4. After a full review, use `/book-genesis feedback ...` to reopen the run for revisions
5. Use `/book-genesis short-story brainstorm` and `/book-genesis short-story package` to create a lead-magnet story for a future website
6. Export the final package with `/book-genesis export`
7. If you plan to publish on Amazon, prepare the KDP package with `/book-genesis kdp`

Production-minded release flow:

1. `/book-genesis init-config fiction`
2. `/book-genesis run en a near-future thriller about memory theft`
3. `/book-genesis variants --count 3`
4. `/book-genesis choose-variant 2`
5. `/book-genesis style-profile`
6. `/book-genesis style-lint`
7. `/book-genesis scene-map`
8. `/book-genesis pacing`
9. `/book-genesis critique-panel`
10. `/book-genesis feedback-plan "Reviewer notes..."`
11. `/book-genesis approve-revision-plan`
12. `/book-genesis export`
13. `/book-genesis cover-check delivery/kdp/front-cover.png`
14. `/book-genesis kdp`
15. `/book-genesis launch-kit`
16. `/book-genesis archive`

## Package Layout

- `extensions/book-genesis/` — PI runtime
- `prompts/book-genesis/` — phase contracts
- `compat/` — notes about the legacy Claude-oriented asset set
- `NOTICE.md` — upstream attribution for package distributions

## Runtime Notes

- orchestration lives in the TypeScript extension
- runs are created under `book-projects/<run-id>/`
- per-run state is stored in `book-projects/<run-id>/.book-genesis/run.json`
- per-run handoffs are stored in `book-projects/<run-id>/.book-genesis/handoffs/`
- macro phases are `kickoff`, `research`, `foundation`, `write`, `evaluate`, `revise`, and `deliver`
- each run can maintain a structured story bible in `foundation/story-bible.md` and `foundation/story-bible.json`
- the write phase now requires chapter briefs and a continuity report before draft completion
- the deliver surface can export markdown, DOCX, and EPUB packages from the finished manuscript
- exports now include publish metadata (`delivery/publish-metadata.json` + `.md`) as a single source of truth for title/author/word count/KDP fields
- the KDP surface packages manual-publish assets under `delivery/kdp/` with metadata scaffolding and preflight checks

## Configuration

Book Genesis reads `book-genesis.config.json` from the workspace root. `--config` can point at a different file.

```json
{
  "maxRetriesPerPhase": 1,
  "chapterBatchSize": 3,
  "qualityThreshold": 85,
  "maxRevisionCycles": 2,
  "researchDepth": "standard",
  "independentEvaluationPass": true,
  "bookMode": "fiction",
  "genrePreset": "thriller",
  "storyBibleEnabled": true,
  "approvalPhases": ["foundation", "write"],
  "sampleChaptersForApproval": 3,
  "exportFormats": ["md", "docx", "epub", "pdf"],
  "targetWordCount": 60000,
  "audience": "adult commercial fiction readers",
  "tone": "propulsive and emotionally grounded",
  "gitAutoInit": true,
  "gitAutoCommit": true,
  "gitCommitPaths": ["book-projects"],
  "kdp": {
    "formats": ["ebook", "paperback"],
    "trimSize": "6 x 9",
    "bleed": false,
    "authorName": "Author Name",
    "keywords": ["heist thriller", "near future crime"],
    "categories": ["Thrillers > Crime", "Science Fiction > Cyberpunk"]
  },
  "promotion": {
    "shortStoryEnabled": true,
    "shortStoryMaxPages": 15,
    "shortStoryPurpose": "lead-magnet"
  },
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

Additional config notes:

- `bookMode` supports `fiction`, `memoir`, `prescriptive-nonfiction`, `narrative-nonfiction`, and `childrens`
- `genrePreset` can tune starter configs for `thriller`, `memoir`, `business`, `devotional`, `childrens-picture-book`, `middle-grade`, or `romantasy`
- `independentEvaluationPass` requires `evaluations/independent-evaluation.md` during evaluate so quality gates get a second-pass read
- `approvalPhases` lets you pause after specific completed phases for human review
- `storyBibleEnabled` keeps durable project memory available to later phases
- `exportFormats` controls which final package files `/book-genesis export` generates
- `kdp` controls the manual Amazon KDP package created by `/book-genesis kdp`
- `promotion` controls companion short-story assets for website lead magnets, world teasers, or content series
- `style`, `sceneMap`, `critiquePanel`, and `sourceAudit` control quality-intelligence reports
- `launchKit`, `bookMatter`, `coverCheck`, `revisionPlan`, and `archive` control publishing, revision, and handoff surfaces

Mode-specific starter configs:

- `/book-genesis init-config fiction`
- `/book-genesis init-config fiction --preset thriller`
- `/book-genesis init-config memoir`
- `/book-genesis init-config prescriptive-nonfiction`
- `/book-genesis init-config narrative-nonfiction`
- `/book-genesis init-config childrens`

Troubleshooting:

- Config errors: run `/book-genesis doctor --json`, then fix the exact field named in the `config_invalid` result.
- Cover assets: keep final covers inside the run directory and run `/book-genesis cover-check <path>` before `/book-genesis kdp`.
- Source audit: for nonfiction and memoir, use `/book-genesis source add`, then `/book-genesis source-pack`, or revise unsupported high-risk claims before final packaging.
- Revision plans: if broad feedback should not immediately rewrite the book, use `/book-genesis feedback-plan` and approve only after the impact map is acceptable.
- Existing runs: run `/book-genesis migrate [run-dir]`; migration writes a timestamped `.bak` before saving normalized state.

## Autonomy Features

- Artifact validation blocks phase completion when required files are missing, empty, outside the run directory, or still contain placeholder text.
- Semantic validation now also checks chapter planning coverage and sequential chapter numbering for draft artifacts.
- Structured ledgers preserve sources and decisions in `book-projects/<run-id>/.book-genesis/ledger.json` so later phases do not have to infer durable context from prose handoffs.
- Structured story bible files preserve characters, settings, promises, timeline facts, and glossary terms across phases.
- Research phases can use `book_genesis_web_search` and `book_genesis_fetch_url` for current internet-backed comp titles, market signals, and source context before recording material sources.
- Session compaction preserves Book Genesis run context and queues an automatic continuation message when the active run is still running.
- Quality gates let the evaluate phase score the manuscript against the configured threshold. Failed gates route automatically to revision, and revision routes back to evaluation until the manuscript passes or reaches `maxRevisionCycles`.
- Quality rubrics are mode-aware, so fiction and nonfiction projects can fail for different reasons.
- When `independentEvaluationPass` is enabled, evaluate completion also expects `evaluations/independent-evaluation.md` to include numeric score lines (for example `marketFit: 88`) that roughly agree with the quality gate scores.
- Optional approval checkpoints let authors review research, foundation, or draft milestones before the next phase launches.
- Reviewer feedback can reopen a paused or completed run, save the notes under `evaluations/reviewer-feedback/`, and route the project back through `revise -> evaluate -> deliver`.
- Companion short-story tools create website-ready lead magnets under `promotion/short-story-package/` without replacing the main manuscript workflow.
- Series tools coordinate multiple normal book runs with shared planning, publishing metadata, next-book briefs, and cross-book continuity reports under `book-series/`.

## Reviewer Feedback Loop

Use reviewer notes in two different ways:

- `/book-genesis approve [run-dir] <note>` to let the next queued phase continue while carrying checkpoint feedback into the next prompt
- `/book-genesis feedback [run-dir] <reviewer feedback>` after a full review or completed delivery to reopen the run in `revise`

When you use `/book-genesis feedback`, the runtime:

- writes the notes to `book-projects/<run-id>/evaluations/reviewer-feedback/`
- injects the latest reviewer feedback into later prompts
- sends the run back through `revise`, then forces a fresh `evaluate` pass before delivery

## Git Hygiene

When `gitAutoInit` is enabled, Book Genesis initializes a repository in the workspace only if one does not already exist. When `gitAutoCommit` is enabled, each completed phase stages `gitCommitPaths` and writes one commit per changed file under those paths. Commit messages use the phase plus the file path, for example `[book-genesis:write] book-projects/<run-id>/manuscript/full-manuscript.md <run-id>`.

## Development

```bash
npm install
npm test
npm run typecheck
```
