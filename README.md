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
| `/book-genesis doctor` | Check package, workspace, config, dependencies, and nearby extension health. |
| `/book-genesis stop` | Pause a run cleanly before manual intervention. |
| `/book-genesis approve` | Approve a pending checkpoint and continue. |
| `/book-genesis reject` | Reject a pending checkpoint and stop. |
| `/book-genesis feedback` | Reopen a run for manuscript-level reviewer feedback. |
| `/book-genesis revise-chapter` | Reopen a run for targeted chapter feedback. |
| `/book-genesis inspect-continuity` | Write a manuscript intelligence report without advancing phases. |
| `/book-genesis checkpoint write` | Pause writing for review of a sample chapter set. |
| `/book-genesis compare-drafts` | Compare two draft files and write a comparison report. |
| `/book-genesis short-story` | Brainstorm or package a website lead-magnet short story. |
| `/book-genesis list-runs` | List discovered runs. |
| `/book-genesis export` | Generate final manuscript export files. |
| `/book-genesis kdp` | Prepare a manual Amazon KDP submission package. |
| `/book-genesis audit` | Report artifact, manuscript, publishing, KDP, and promotion readiness. |
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
- DOCX and EPUB are generated when present in `exportFormats`.
- Export requires a full manuscript and a delivery synopsis artifact.

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
- eBook packaging requires EPUB output; paperback packaging requires DOCX output. The command requests those export formats automatically for the KDP package.
- Missing author name, invalid paperback trim size, and missing core metadata are reported in the preflight output.
- Always review the package manually in KDP before publishing.

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
- promotion readiness for the companion short-story package
- next actions inferred from the report

Use `audit` before export, before KDP packaging, and after a large manual edit.

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
| `book_genesis_record_source` | Add research or evaluation sources to the run ledger. |
| `book_genesis_record_decision` | Add durable creative or strategic decisions to the run ledger. |
| `book_genesis_complete_phase` | Mark a phase complete, validate artifacts, write a handoff, and queue the next phase. |
| `book_genesis_report_failure` | Record a failed phase and retry or stop based on the failure type. |
| `book_genesis_compact_context` | Request context compaction with Book Genesis-specific focus. |

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
  "storyBibleEnabled": true,
  "approvalPhases": ["foundation", "write"],
  "sampleChaptersForApproval": 3,
  "exportFormats": ["md", "docx", "epub"],
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
  }
}
```

Additional config notes:

- `bookMode` supports `fiction`, `memoir`, `prescriptive-nonfiction`, `narrative-nonfiction`, and `childrens`
- `independentEvaluationPass` requires `evaluations/independent-evaluation.md` during evaluate so quality gates get a second-pass read
- `approvalPhases` lets you pause after specific completed phases for human review
- `storyBibleEnabled` keeps durable project memory available to later phases
- `exportFormats` controls which final package files `/book-genesis export` generates
- `kdp` controls the manual Amazon KDP package created by `/book-genesis kdp`
- `promotion` controls companion short-story assets for website lead magnets, world teasers, or content series

## Autonomy Features

- Artifact validation blocks phase completion when required files are missing, empty, outside the run directory, or still contain placeholder text.
- Semantic validation now also checks chapter planning coverage and sequential chapter numbering for draft artifacts.
- Structured ledgers preserve sources and decisions in `book-projects/<run-id>/.book-genesis/ledger.json` so later phases do not have to infer durable context from prose handoffs.
- Structured story bible files preserve characters, settings, promises, timeline facts, and glossary terms across phases.
- Quality gates let the evaluate phase score the manuscript against the configured threshold. Failed gates route automatically to revision, and revision routes back to evaluation until the manuscript passes or reaches `maxRevisionCycles`.
- Quality rubrics are mode-aware, so fiction and nonfiction projects can fail for different reasons.
- When `independentEvaluationPass` is enabled, evaluate completion also expects `evaluations/independent-evaluation.md` to include numeric score lines (for example `marketFit: 88`) that roughly agree with the quality gate scores.
- Optional approval checkpoints let authors review research, foundation, or draft milestones before the next phase launches.
- Reviewer feedback can reopen a paused or completed run, save the notes under `evaluations/reviewer-feedback/`, and route the project back through `revise -> evaluate -> deliver`.
- Companion short-story tools create website-ready lead magnets under `promotion/short-story-package/` without replacing the main manuscript workflow.

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
