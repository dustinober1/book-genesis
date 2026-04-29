import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const promptDir = path.join(process.cwd(), "prompts", "book-genesis");

function prompt(name: string) {
  return readFileSync(path.join(promptDir, `${name}.md`), "utf8");
}

test("system prompt requires disk artifacts and phase completion tool", () => {
  assert.match(prompt("system"), /Write concrete artifacts to disk/);
  assert.match(prompt("system"), /book_genesis_complete_phase/);
});

test("foundation prompt references selected variants", () => {
  assert.match(prompt("foundation"), /selected-variant\.md/);
});

test("write prompt requires chapter briefs, continuity report, style profile, and scene-map compatibility", () => {
  const text = prompt("write");
  assert.match(text, /chapter-briefs/);
  assert.match(text, /continuity-report/);
  assert.match(text, /style-profile/);
  assert.match(text, /scene-map/);
});

test("evaluate prompt requires quality gate and new review awareness", () => {
  const text = prompt("evaluate");
  assert.match(text, /quality_gate/);
  assert.match(text, /style-lint/);
  assert.match(text, /source-audit/);
  assert.match(text, /critique-panel/);
  assert.match(text, /revision-plan/);
});

test("revise and deliver prompts include release contracts", () => {
  assert.match(prompt("revise"), /approved revision plan/);
  const deliver = prompt("deliver");
  assert.match(deliver, /launch-kit/);
  assert.match(deliver, /front\/back matter/);
  assert.match(deliver, /KDP readiness/);
  assert.match(deliver, /promotion package/);
});
