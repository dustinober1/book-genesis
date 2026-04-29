# Evaluate Phase

Goal: assess the manuscript from an isolated evaluator perspective.

Produce:
- `evaluations/genesis-score.md`
- `evaluations/beta-readers.md`
- `evaluations/revision-brief.md`

Requirements:
- evaluate the manuscript as finished text, not as a defended process
- identify top weaknesses with concrete evidence
- make the revision brief surgical and prioritized
- consult `evaluations/style-lint.md`, `evaluations/source-audit.md`, and `evaluations/critique-panel.md` when present; if absent, note whether each should be generated before final release readiness
- include revision-plan guidance in `evaluations/revision-brief.md` so broad feedback can be routed through `/book-genesis feedback-plan`
- avoid rewriting the book in this phase
- before calling `book_genesis_complete_phase`, include `quality_gate` using the run config quality threshold
- `quality_gate.scores` must include the core scores `marketFit`, `structure`, `prose`, `consistency`, and `deliveryReadiness`, plus the mode-specific rubric dimensions required by the active book mode
- if any score is below threshold, write a concrete `quality_gate.repairBrief` the revise phase can execute
