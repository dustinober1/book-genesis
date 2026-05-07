# Series Showrunner Design

## Goal

Add a higher-level automation layer that can plan, supervise, and update a multi-book series while preserving the existing one-book-per-run workflow.

Book Genesis should keep each individual title as a normal run under `book-projects/`. The series layer should become the source of truth for long-range creative planning, continuity, publishing order, and next-book automation. The result should feel less like manually managing separate books and more like operating a showrunner room that keeps the whole series coherent.

## Design

The next series release adds a `series showrunner` surface above the existing `/book-genesis series` commands. The showrunner owns a durable series memory under `book-series/<series-id>/showrunner/` and reads linked book runs when it needs evidence.

The first implementation should focus on five automation loops:

- **Architect the series**: generate or refresh a series premise, book-by-book promise ladder, recurring cast ledger, cross-book arc map, timeline, unresolved-thread ledger, and payoff plan.
- **Prepare the next book**: write a next-book production packet with the book's standalone promise, required continuity, threads to open, threads to advance, threads to pay off, prohibited contradictions, KDP positioning notes, and a ready-to-run Book Genesis config.
- **Sync completed runs**: ingest a linked book's manuscript, story bible, book matter, scene map, pacing dashboard, launch kit, and KDP metadata into the series memory after completion.
- **Audit the series**: report timeline conflicts, unresolved promises, duplicate book roles, missing payoffs, cast drift, metadata gaps, weak standalone arcs, and launch-order risks.
- **Plan publishing continuity**: keep reading order, also-by copy, per-book metadata hints, lead-magnet opportunities, preorder teasers, and launch cadence aligned across the series.

This is not a replacement for individual run phases. It is an orchestration layer that writes better briefs and constraints before a run starts, then absorbs evidence after a run finishes.

## Command Contract

Extend `/book-genesis series` with these subcommands:

- `/book-genesis series showrunner [series-dir]`: write or refresh the full showrunner dashboard.
- `/book-genesis series architect [series-dir] [notes]`: generate the series architecture artifacts from current state and operator notes.
- `/book-genesis series prep-book [series-dir] [--book <n>] [notes]`: write a production packet and run config for the next or specified book.
- `/book-genesis series sync-run [series-dir] <run-dir>`: link or refresh one book run and update series memory from its artifacts.
- `/book-genesis series audit-deep [series-dir]`: run a stricter cross-book audit and write machine-readable plus Markdown reports.
- `/book-genesis series launch-roadmap [series-dir]`: write release-order, metadata, lead-magnet, and launch-copy artifacts across all books.

The existing commands remain valid. `series next-book` can either stay as the lightweight version or delegate internally to `prep-book` once the showrunner artifacts exist.

## State And Artifacts

Add showrunner state to `SeriesState` without breaking old `series.json` files. Missing showrunner fields should normalize to empty defaults when read.

New artifacts should live under:

- `showrunner/series-architecture.md`
- `showrunner/series-architecture.json`
- `showrunner/thread-ledger.md`
- `showrunner/timeline.md`
- `showrunner/cast-ledger.md`
- `showrunner/payoff-map.md`
- `planning/book-XX/production-packet.md`
- `planning/book-XX/book-genesis.config.json`
- `continuity/deep-audit.md`
- `continuity/deep-audit.json`
- `publishing/launch-roadmap.md`
- `publishing/series-metadata-roadmap.json`

The JSON artifacts are for deterministic tests and future automation. The Markdown artifacts are for operators and writers.

## Data Flow

`architect` starts from the existing `SeriesState`, linked run summaries, and optional notes. It writes the canonical showrunner artifacts but does not start a book run.

`prep-book` reads the architecture, current thread ledger, prior linked runs, and publishing plan. It creates a production packet that becomes the next book's source brief. The packet should include a command the operator can run, but the first version should not auto-launch unless a later config explicitly enables that behavior.

`sync-run` reads one completed or in-progress run and updates the series with evidence: title, book number, premise, word count, manuscript summary, important cast changes, opened/resolved threads, timeline facts, metadata hints, and publishing assets. If the run has incomplete artifacts, sync should write warnings instead of failing the whole command.

`audit-deep` reads all linked runs and showrunner artifacts. It should distinguish hard errors from creative warnings. Missing linked run directories, duplicate book numbers, and mismatched `bookMatter.series` are hard errors. Possible drift, pacing imbalance, or weak payoff are warnings.

`launch-roadmap` reads the publishing plan plus linked run outputs. It writes reader-facing continuity assets without attempting to publish anywhere.

## Error Handling

Commands should be safe to rerun. They should overwrite generated showrunner artifacts, not manuscripts.

All commands should tolerate older series state. If `SeriesState.showrunner` is absent, initialize it in memory and persist it only when the command writes state.

Commands should return clear operator-facing remedies for:

- no series directory found
- duplicate book numbers
- missing linked run directory
- run state cannot be read
- run is linked to a different series name or book number
- production packet cannot choose a next book number
- required architecture artifacts are missing before `prep-book`

No command should rewrite a completed manuscript, delete a linked run, auto-publish, or silently modify unrelated files.

## Testing

Add tests around deterministic behavior instead of model output quality:

- old `series.json` files normalize with no showrunner field
- `architect` writes architecture, thread, timeline, cast, and payoff artifacts
- `prep-book` writes a production packet and config with correct series metadata
- `sync-run` updates a series from a linked run and preserves existing book entries
- `audit-deep` detects duplicate book numbers, missing runs, metadata mismatches, and open threads
- `launch-roadmap` writes reading-order and per-book publishing roadmap artifacts
- command routing prints useful paths and does not require absolute series directories

Keep the implementation aligned with the existing pattern: focused helper module behavior in `extensions/book-genesis/series.ts` or a new `series-showrunner.ts`, command wiring in `index.ts`, type changes in `types.ts`, config normalization in `config.ts` only if needed, tests under `tests/series.test.ts` or a new `tests/series-showrunner.test.ts`, and README command docs.

## Non-Goals

- Do not merge all books into one giant run.
- Do not auto-launch multiple full books in sequence in the first version.
- Do not auto-publish to KDP or retailers.
- Do not rewrite prior manuscripts during sync.
- Do not require existing series users to migrate manually.

## Recommended Implementation Shape

Build this as a deterministic state/artifact layer first. The highest leverage first slice is `architect` plus `prep-book`, because better next-book packets reduce downstream drift before more automation is added.

After that, add `sync-run` so completed books update the series memory, then `audit-deep` and `launch-roadmap` so the operator can trust the series as it grows.
