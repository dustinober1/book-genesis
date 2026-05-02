# Book Series Layer Design

## Goal

Add first-class book-series support without replacing the existing one-book-per-run workflow.

## Design

Book Genesis will keep each book as a normal run under `book-projects/`. A new series layer will live under `book-series/<series-id>/` and coordinate those runs with shared planning, publishing, and continuity artifacts.

The first version supports three surfaces:

- Practical orchestration: create a series, link book runs, plan the next book, and inspect status.
- Publishing metadata: write reading order, whole-series metadata, also-by copy, and launch positioning.
- Creative planning: write a shared series bible, cross-book arc map, unresolved thread tracker, spinoff ideas, and a continuity report.

## Files

- `extensions/book-genesis/types.ts`: add series state interfaces.
- `extensions/book-genesis/series.ts`: own all series filesystem/state/report behavior.
- `extensions/book-genesis/index.ts`: add `/book-genesis series ...` command routing.
- `tests/series.test.ts`: cover state creation, run linking, next-book planning, and report outputs.
- `README.md`: document the new operator commands.

## Command Contract

- `/book-genesis series init <name> [--books <n>]`: create a series workspace.
- `/book-genesis series status [series-dir] [--json]`: summarize the series.
- `/book-genesis series add-run [series-dir] <run-dir>`: link an existing book run and update its `bookMatter.series` metadata.
- `/book-genesis series next-book [series-dir] [notes]`: write a next-book brief and starter config for the next book number.
- `/book-genesis series bible [series-dir]`: write shared creative planning artifacts.
- `/book-genesis series metadata [series-dir]`: write reading-order and publishing metadata.
- `/book-genesis series continuity [series-dir]`: write cross-book continuity and missing-artifact checks.

## Non-Goals

- Do not merge all books into one giant run.
- Do not auto-publish to KDP.
- Do not rewrite existing book manuscripts when linking them into a series.
