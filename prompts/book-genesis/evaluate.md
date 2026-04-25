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
- avoid rewriting the book in this phase
- before calling `book_genesis_complete_phase`, include `quality_gate` using the run config quality threshold
- `quality_gate.scores` must be integers from 1 to 100 for marketFit, structure, prose, consistency, and deliveryReadiness
- if any score is below threshold, write a concrete `quality_gate.repairBrief` the revise phase can execute
