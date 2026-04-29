# Book Genesis 6.1.0 PI Release Notes

## Summary

This release expands Book Genesis from autonomous draft generation into a production-minded authoring, revision, publishing, and launch-prep runtime.

## Added

- Mode-specific `/book-genesis init-config` starter configs.
- Style profile and deterministic style lint reports.
- Scene map and pacing dashboard reports.
- Multi-reviewer critique panel with consensus and disagreement output.
- Source/claim coverage audit for memoir and nonfiction modes.
- Optional planning variants and selected-variant foundation lock-in.
- Revision-plan-first workflow for broad reviewer feedback.
- Full launch kit generation under `promotion/launch-kit/`.
- Front matter, back matter, and series metadata generation with export integration.
- Cover asset validation for ebook images and paperback PDF readiness.
- Archive manifest generation with checksums.
- Operator polish commands: `open`, `stats`, and `doctor --fix`.
- Prompt-contract tests covering the new runtime expectations.

## Migration Notes

Existing runs remain compatible. `readRunState()` normalizes missing nested config defaults and `/book-genesis migrate [run-dir]` still writes a timestamped backup before saving a normalized state file.

New config sections are optional because defaults are supplied for every release feature. Operators can generate a complete starter file with `/book-genesis init-config <mode>`.

## Validation

- `npm test`
- `npm run typecheck`
