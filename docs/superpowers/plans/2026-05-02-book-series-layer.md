# Book Series Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use inline TDD execution in this session. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared series workspace that coordinates multiple normal Book Genesis runs.

**Architecture:** Preserve the existing run state as the unit of manuscript generation. Add `series.ts` as a separate orchestration module that reads/writes `book-series/<id>/.book-genesis/series.json` plus derived creative, continuity, and publishing files.

**Tech Stack:** TypeScript, Node.js filesystem APIs, Node test runner, existing Book Genesis helpers.

---

### Task 1: Series State And Reports

**Files:**
- Modify: `extensions/book-genesis/types.ts`
- Create: `extensions/book-genesis/series.ts`
- Test: `tests/series.test.ts`

- [x] Write failing tests for creating a series, linking a run, planning the next book, and writing reports.
- [x] Run `npm test -- tests/series.test.ts` and confirm the failures are due to missing series support.
- [x] Add series interfaces and implementation.
- [x] Run `npm test -- tests/series.test.ts` and confirm the new tests pass.

### Task 2: Operator Commands

**Files:**
- Modify: `extensions/book-genesis/index.ts`
- Test: `tests/series.test.ts`

- [x] Add command-facing coverage through the series module contract tests.
- [x] Add `/book-genesis series` subcommands using the new module.
- [x] Run targeted tests.

### Task 3: Documentation

**Files:**
- Modify: `README.md`

- [x] Document the series quick-reference command.
- [x] Document each subcommand with examples and outputs.
- [x] Run `npm run typecheck` and `npm test`.
