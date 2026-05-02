# Changelog

All notable changes to this PI package are documented here.

This project follows a practical release-log format: newest changes first, grouped by release, with user-facing commands and behavior called out before internal implementation details.

## Unreleased

### Added

- Added the publishing workbench release plan and completed implementation checklist for the next package release.

## 6.2.0 PI - Publishing Workbench

### Added

- Added `/book-genesis metadata-lab` for scored marketplace metadata options, including subtitle, description, keyword-chain, category, and scorecard outputs.
- Added `/book-genesis source-vault` for durable source entries, claim links, confidence levels, and bibliography draft output.
- Added `/book-genesis revision-board` for prioritized revision tasks with explicit acceptance criteria.
- Added `/book-genesis layout-profile` for named interior print profiles, including trim size, margins, body typography, and PDF MediaBox settings.
- Added `/book-genesis workbench` for a richer operator console with blockers, artifact status, readiness rows, recent run history, and the next recommended command.
- Added config sections for metadata lab, source vault, revision board, layout profiles, and workbench behavior.
- Added release notes for the publishing workbench release.

### Changed

- Export manifests now include the selected layout profile.
- PDF export now uses the selected layout profile instead of relying only on trim-size parsing.
- KDP packages now include layout profile artifacts.
- KDP packages copy metadata-lab artifacts when they exist.
- Audit and final-check readiness now include metadata lab, revision board, source vault, and layout profile status.
- Prompt contracts now instruct research, evaluate, revise, and deliver phases to preserve the new publishing workbench artifacts.
- README documentation now includes the publishing workbench commands, config sections, and recommended final publishing flow.

### Verified

- `npm test`
- `npm run typecheck`
- `pi install .`
- `pi list`

## 6.1.0 PI - Production Authoring And Launch Prep

### Added

- Added guided starter configs.
- Added style profile and style lint reports.
- Added scene map and pacing dashboard reports.
- Added multi-reviewer critique panel output.
- Added source and claim coverage auditing for memoir and nonfiction modes.
- Added planning variants before foundation lock-in.
- Added revision-plan-first workflow for broad reviewer feedback.
- Added launch kit generation.
- Added front matter, back matter, and series metadata generation.
- Added cover asset validation.
- Added archive manifest generation.
- Added operator polish commands including `open`, `stats`, and `doctor --fix`.

### Changed

- Expanded the package from autonomous manuscript generation toward production-minded authoring, revision, publishing, and launch preparation.

## 6.0.x PI - Book Writing Runtime

### Added

- Added book-mode presets for fiction, memoir, prescriptive nonfiction, narrative nonfiction, and children's books.
- Added story bible support.
- Added checkpoint and approval flow support.
- Added manuscript export support for Markdown, DOCX, EPUB, and PDF.
- Added manual KDP package generation, including no-bleed 6 x 9 paperback PDF output.
- Added research internet-search tooling and continuation helpers for long-running phases.

### Changed

- Migrated older run state into the current normalized run shape.
- Documented the Pi install path and operator command surface.
