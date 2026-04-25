# Book Genesis PI Package

PI-native autonomous book generation package built on `@mariozechner/pi-coding-agent`.

## Attribution

This package is a derivative PI-native port of **Book Genesis**, the open-source project created and developed by **Philip Stark**.

- Original project: [Book Genesis on GitLab](https://gitlab.com/philipstark/book-genesis)
- Original contribution being adapted here: the core concept, pipeline shape, prompt assets, and early system development

The PI runtime in this folder is an adaptation layer around that original work, not a claim of independent origin.

## Install

```bash
# From this repository
gsd install ./pi-extensions/book-genesis
```

## Commands

- `/book-genesis run [language] <idea>`
- `/book-genesis run --config ./path/to/book-genesis.config.json [language] <idea>`
- `/book-genesis resume [run-dir]`
- `/book-genesis status [run-dir]`
- `/book-genesis stop [run-dir]`
- `/book-auto [language] <idea>`

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

## Configuration

Book Genesis reads `book-genesis.config.json` from the workspace root. `--config` can point at a different file.

```json
{
  "maxRetriesPerPhase": 1,
  "chapterBatchSize": 3,
  "qualityThreshold": 85,
  "maxRevisionCycles": 2,
  "researchDepth": "standard",
  "targetWordCount": 60000,
  "audience": "adult commercial fiction readers",
  "tone": "propulsive and emotionally grounded",
  "gitAutoInit": true,
  "gitAutoCommit": true,
  "gitCommitPaths": ["book-projects"]
}
```

## Autonomy Features

- Artifact validation blocks phase completion when required files are missing, empty, outside the run directory, or still contain placeholder text.
- Structured ledgers preserve sources and decisions in `book-projects/<run-id>/.book-genesis/ledger.json` so later phases do not have to infer durable context from prose handoffs.
- Quality gates let the evaluate phase score the manuscript against the configured threshold. Failed gates route automatically to revision, and revision routes back to evaluation until the manuscript passes or reaches `maxRevisionCycles`.

## Git Hygiene

When `gitAutoInit` is enabled, Book Genesis initializes a repository in the workspace only if one does not already exist. When `gitAutoCommit` is enabled, each completed phase stages `gitCommitPaths` and writes a snapshot commit like `[book-genesis:research] snapshot <run-id>`.

## Development

```bash
npm install
npm test
npm run typecheck
```
