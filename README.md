# Book Genesis PI Package

PI-native autonomous book generation package built on `@mariozechner/pi-coding-agent`.

## Attribution

This package is a derivative PI-native port of **Book Genesis**, the open-source project created and developed by **Philip Stark**.

- Original project: [Book Genesis on GitLab](https://gitlab.com/philipstark/book-genesis)
- Original contribution being adapted here: the core concept, pipeline shape, prompt assets, and early system development

The PI runtime in this folder is an adaptation layer around that original work, not a claim of independent origin.

## Install

```bash
# From the monorepo root
gsd install ./pi-extensions/book-genesis

# Or, from this package directory
gsd install .
```

## Slash Commands

Book Genesis exposes two slash-command entry points:

- `/book-genesis` for all run management
- `/book-auto` as a compatibility alias for starting a new run

When a command shows `[run-dir]`, that argument is optional. If you omit it, the runtime tries the active run for the current session first, then falls back to the latest run in `book-projects/`.

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
- Starting a run creates `book-projects/<run-id>/` and launches the `kickoff` phase immediately.

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

### `/book-genesis status`

Show the current state of a run.

Usage:

- `/book-genesis status [run-dir]`

Examples:

- `/book-genesis status`
- `/book-genesis status ./book-projects/<run-id>`

Status includes the current phase, next action, unresolved issues, approval state, revision cycle, and latest feedback path when present.

### `/book-genesis stop`

Pause a running run cleanly.

Usage:

- `/book-genesis stop [run-dir]`

Examples:

- `/book-genesis stop`
- `/book-genesis stop ./book-projects/<run-id>`

Use this before stepping in manually or before sending a completed manuscript back for another review cycle.

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

### `/book-genesis list-runs`

List all discovered Book Genesis runs in the current workspace.

Usage:

- `/book-genesis list-runs`

Use this when you do not remember a run directory and want to inspect all saved runs.

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

### `/book-auto`

Compatibility alias for `/book-genesis run`.

Usage:

- `/book-auto [language] <idea>`
- `/book-auto --config ./path/to/book-genesis.config.json [language] <idea>`

Examples:

- `/book-auto a fantasy romance with political intrigue`
- `/book-auto en a prescriptive nonfiction book about team rituals`

### Typical Operator Flow

Common usage looks like this:

1. Start a run with `/book-genesis run ...`
2. Check progress with `/book-genesis status`
3. If a checkpoint pauses, use `/book-genesis approve` or `/book-genesis reject`
4. After a full review, use `/book-genesis feedback ...` to reopen the run for revisions
5. Export the final package with `/book-genesis export`
6. If you plan to publish on Amazon, prepare the KDP package with `/book-genesis kdp`

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
  }
}
```

Additional config notes:

- `bookMode` supports `fiction`, `memoir`, `prescriptive-nonfiction`, `narrative-nonfiction`, and `childrens`
- `approvalPhases` lets you pause after specific completed phases for human review
- `storyBibleEnabled` keeps durable project memory available to later phases
- `exportFormats` controls which final package files `/book-genesis export` generates
- `kdp` controls the manual Amazon KDP package created by `/book-genesis kdp`

## Autonomy Features

- Artifact validation blocks phase completion when required files are missing, empty, outside the run directory, or still contain placeholder text.
- Semantic validation now also checks chapter planning coverage and sequential chapter numbering for draft artifacts.
- Structured ledgers preserve sources and decisions in `book-projects/<run-id>/.book-genesis/ledger.json` so later phases do not have to infer durable context from prose handoffs.
- Structured story bible files preserve characters, settings, promises, timeline facts, and glossary terms across phases.
- Quality gates let the evaluate phase score the manuscript against the configured threshold. Failed gates route automatically to revision, and revision routes back to evaluation until the manuscript passes or reaches `maxRevisionCycles`.
- Quality rubrics are mode-aware, so fiction and nonfiction projects can fail for different reasons.
- Optional approval checkpoints let authors review research, foundation, or draft milestones before the next phase launches.
- Reviewer feedback can reopen a paused or completed run, save the notes under `evaluations/reviewer-feedback/`, and route the project back through `revise -> evaluate -> deliver`.

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
