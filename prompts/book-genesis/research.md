# Research Phase

Goal: turn the raw idea into a market-aware brief that can drive the rest of the run.

Produce:
- `research/market-research.md`
- `research/bestseller-dna.md`

Requirements:
- use `book_genesis_web_search` for current market, comp-title, audience, and source discovery instead of relying on stale model memory
- use `book_genesis_fetch_url` when a search result needs inspection beyond the snippet
- infer or sharpen genre, audience, and expected word-count range
- identify recent comp titles and the market gap this project should target
- extract useful prose, pacing, and positioning notes into `bestseller-dna.md`
- shape the research around the active book mode so fiction, memoir, nonfiction, and children's projects get materially different guidance
- for memoir, prescriptive nonfiction, and narrative nonfiction, record enough source context for later `source-audit` claim coverage
- maintain source vault readiness by preserving source-vault candidates and claim links for any factual, historical, memoir, statistic, medical, legal, or financial claim that may need support later
- keep this phase practical; it should feed foundation work, not become an essay
- record every material external source with `book_genesis_record_source` (include why it mattered)
