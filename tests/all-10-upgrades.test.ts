import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { buildBibleCheck, writeBibleCheck } from "../extensions/book-genesis/bible-check.js";
import { buildBetaReaderPacket, writeBetaReaderPacket } from "../extensions/book-genesis/beta-packet.js";
import { buildRunDashboard, recommendNextAction, writeRunDashboard } from "../extensions/book-genesis/dashboard.js";
import { buildRunDoctorReport } from "../extensions/book-genesis/doctor-run.js";
import { buildFinalCheck, formatFinalCheck } from "../extensions/book-genesis/final-check.js";
import { buildProjectMap, writeProjectMap } from "../extensions/book-genesis/project-map.js";
import { buildAutoContinuePrompt } from "../extensions/book-genesis/continuation.js";
import { buildResearchWebGuidance, normalizeSearchResults } from "../extensions/book-genesis/research-web.js";
import { buildRevisionHistory, writeRevisionHistory } from "../extensions/book-genesis/revision-history.js";
import { addSourceToLedger, buildSourcePack, writeSourcePack } from "../extensions/book-genesis/source-pack.js";
import { buildStarterConfig } from "../extensions/book-genesis/config-init.js";
import { normalizeRunConfig } from "../extensions/book-genesis/config.js";
import { upsertStoryBible } from "../extensions/book-genesis/bible.js";
import { buildPhasePrompt } from "../extensions/book-genesis/prompts.js";
import { makeRun, withWorkspace, writeBasicManuscript } from "./helpers.js";

test("next action prioritizes approval gates before other readiness suggestions", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    run.status = "awaiting_approval";
    run.approval = {
      phase: "foundation",
      requestedAt: new Date().toISOString(),
      reason: "Review foundation.",
      status: "pending",
      nextPhase: "write",
    };

    const next = recommendNextAction(run);
    assert.equal(next.command, "/book-genesis approve");
    assert.match(next.reason, /waiting for approval/i);
  });
});

test("dashboard writes stable markdown and JSON with recommended next command", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    writeBasicManuscript(run);
    const dashboard = buildRunDashboard(run);
    assert.equal(dashboard.runId, run.id);
    assert.equal(dashboard.stats.chapterCount, 2);
    assert.match(dashboard.next.command, /^\/book-genesis/);

    const written = writeRunDashboard(run);
    assert.equal(existsSync(written.jsonPath), true);
    assert.equal(JSON.parse(readFileSync(written.jsonPath, "utf8")).runId, run.id);
    assert.match(readFileSync(written.markdownPath, "utf8"), /Recommended Next Action/);
  });
});

test("revision history aggregates history, quality gates, feedback, and comparisons", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    writeBasicManuscript(run);
    run.history.push({
      phase: "evaluate",
      attempt: 1,
      status: "completed",
      startedAt: new Date().toISOString(),
      endedAt: new Date().toISOString(),
      summary: "Evaluation complete.",
      artifacts: ["evaluations/genesis-score.md"],
      unresolvedIssues: [],
    });
    run.qualityGates.push({
      phase: "evaluate",
      threshold: 80,
      scores: { marketFit: 90, structure: 88, prose: 85, consistency: 80, deliveryReadiness: 70 },
      repairBrief: "Improve delivery readiness.",
      passed: true,
      failedDimensions: [],
      recordedAt: new Date().toISOString(),
    });
    run.reviewerFeedback.push({
      id: "review-1",
      phase: "completed",
      note: "Tighten the ending.",
      artifactPath: path.join(run.rootDir, "evaluations", "reviewer-feedback", "review.md"),
      recordedAt: new Date().toISOString(),
    });
    const comparisonDir = path.join(run.rootDir, "evaluations", "draft-comparisons");
    mkdirSync(comparisonDir, { recursive: true });
    writeFileSync(path.join(comparisonDir, "comparison.md"), "# Draft Comparison\n\n- Added lines: 2\n- Removed lines: 1\n", "utf8");

    const history = buildRevisionHistory(run);
    assert.equal(history.phaseEvents.length > 0, true);
    assert.equal(history.feedback.length, 1);
    assert.equal(history.qualityGates.length, 1);
    assert.equal(history.draftComparisons.length, 1);
    assert.equal(existsSync(writeRevisionHistory(run).jsonPath), true);
  });
});

test("bible check flags missing promises, glossary terms, and characters", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    writeBasicManuscript(run);
    upsertStoryBible(run, {
      promises: ["the archive will reveal the city founder"],
      glossary: [{ term: "mnemonic vault", definition: "Memory storage system." }],
      characters: [{ id: "mara", name: "Mara", role: "detective", desire: "truth" }],
    });

    const check = buildBibleCheck(run);
    assert.equal(check.findings.some((finding) => finding.code === "promise_missing"), true);
    assert.equal(check.findings.some((finding) => finding.code === "glossary_term_missing"), true);
    assert.equal(check.findings.some((finding) => finding.code === "character_missing"), true);
    assert.equal(existsSync(writeBibleCheck(run).jsonPath), true);
  });
});

test("phase prompts reference story-bible enforcement and bible-check", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    run.currentPhase = "write";
    const prompt = buildPhasePrompt(run);
    assert.match(prompt, /Story bible enforcement/);
    assert.match(prompt, /\/book-genesis bible-check/);
  });
});

test("research prompt exposes internet search tooling", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    run.currentPhase = "research";
    const guidance = buildResearchWebGuidance(run);
    assert.match(guidance, /book_genesis_web_search/);
    assert.match(guidance, /book_genesis_fetch_url/);
    assert.match(buildPhasePrompt(run), /book_genesis_web_search/);
  });
});

test("web search result normalization is compact and source-recording friendly", () => {
  const results = normalizeSearchResults({
    AbstractText: "A useful abstract.",
    AbstractURL: "https://example.com/abstract",
    RelatedTopics: [
      { Text: "First result", FirstURL: "https://example.com/one" },
      { Text: "Second result", FirstURL: "https://example.com/two" },
    ],
  });
  assert.equal(results.length, 3);
  assert.equal(results[0].url, "https://example.com/abstract");
});

test("auto-continue prompt resumes active phase after compaction", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    run.currentPhase = "research";
    run.status = "running";
    const prompt = buildAutoContinuePrompt(run, "context compacted");
    assert.match(prompt, /Continue the active Book Genesis research phase/);
    assert.match(prompt, new RegExp(run.rootDir.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });
});

test("source pack exposes source gaps for nonfiction modes", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace, { bookMode: "memoir" });
    writeBasicManuscript(run);
    let pack = buildSourcePack(run);
    assert.equal(pack.required, true);
    assert.equal(pack.gaps.some((gap) => gap.code === "source_pack_empty"), true);

    addSourceToLedger(run, { title: "Interview with author", summary: "Memory theft research context.", url: "https://example.com" });
    pack = buildSourcePack(run);
    assert.equal(pack.sources.length, 1);
    assert.equal(existsSync(writeSourcePack(run).jsonPath), true);
  });
});

test("final check combines readiness reports and fails when release blockers remain", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace, { bookMode: "memoir" });
    writeBasicManuscript(run);
    const finalCheck = buildFinalCheck(run);
    assert.equal(finalCheck.ok, false);
    assert.equal(finalCheck.results.some((item) => item.code === "source_pack_required"), true);
    assert.match(formatFinalCheck(finalCheck), /Book Genesis final check/);
  });
});

test("beta reader packet writes sample, instructions, and feedback form", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    writeBasicManuscript(run);
    const packet = buildBetaReaderPacket(run, "first-3");
    assert.equal(packet.sampleMode, "first-3");
    assert.match(packet.feedbackForm, /What pulled you forward/);

    const written = writeBetaReaderPacket(run, "first-3");
    assert.equal(written.files.length, 4);
    assert.equal(existsSync(path.join(run.rootDir, "evaluations", "beta-reader-packet", "manuscript-sample.md")), true);
  });
});

test("genre presets normalize through config and tune starter configs", () => {
  const thriller = buildStarterConfig("fiction", "thriller");
  assert.equal(thriller.genrePreset, "thriller");
  assert.equal(thriller.approvalPhases.includes("foundation"), true);

  const devotional = buildStarterConfig("prescriptive-nonfiction", "devotional");
  assert.equal(devotional.genrePreset, "devotional");
  assert.equal(devotional.sourceAudit.requiredForModes.includes("prescriptive-nonfiction"), true);

  assert.throws(() => normalizeRunConfig({ genrePreset: "space-opera" } as any), /genrePreset/);
});

test("project map writes mermaid phase graph", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    const map = buildProjectMap(run);
    assert.match(map.markdown, /```mermaid/);
    assert.match(map.markdown, /kickoff/);
    assert.equal(existsSync(writeProjectMap(run).markdownPath), true);
  });
});

test("run doctor reports source and final-check diagnostics", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace, { bookMode: "memoir" });
    writeBasicManuscript(run);
    const report = buildRunDoctorReport(run);
    assert.equal(report.ok, false);
    assert.equal(report.results.some((item) => item.code === "source_pack_missing"), true);
    assert.equal(report.results.some((item) => item.code === "final_check_blocked"), true);
  });
});
