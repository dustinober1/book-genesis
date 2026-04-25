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
- run state is stored in `.book-genesis/run.json`
- handoffs are stored in `.book-genesis/handoffs/`
- macro phases are `research`, `foundation`, `write`, `evaluate`, `revise`, and `deliver`
