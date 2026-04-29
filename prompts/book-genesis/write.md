# Write Phase

Goal: produce the manuscript from the foundation package.

Produce:
- `manuscript/chapter-briefs/` with one brief per chapter before prose drafting
- `manuscript/chapters/` with numbered chapter files
- `manuscript/full-manuscript.md`
- `manuscript/write-report.md`
- `manuscript/continuity-report.md`

Requirements:
- follow the outline, but allow local discovery if it improves the book
- preserve strong voice separation and continuity
- draft each chapter from an explicit chapter brief so the manuscript does not outrun the plan
- consult `foundation/style-profile.md` when present and keep the prose compatible with `evaluations/scene-map.md` and `evaluations/pacing-dashboard.md` when those reports exist
- keep `full-manuscript.md` updated as the assembled manuscript
- in `write-report.md`, capture chapter count, word-count progress, and any unresolved continuity risks
- use `continuity-report.md` to track open continuity risks after each batch of chapters
- do not complete the phase unless chapter briefs, drafted chapters, continuity report, and assembled manuscript agree on chapter count
- call `book_genesis_compact_context` when context pressure rises or after each batch of roughly three chapters
- record any major continuity, structure, or voice decision with `book_genesis_record_decision`
