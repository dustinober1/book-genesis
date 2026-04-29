import path from "node:path";

import type { RunState } from "./types.js";
import { listChapterFiles, readManuscript, writeJson, writeMarkdown } from "./run-files.js";

export type BetaSampleMode = "full" | "first-3" | "first-5";

function sampleManuscript(run: RunState, mode: BetaSampleMode) {
  if (mode === "full") {
    return readManuscript(run);
  }
  const count = mode === "first-3" ? 3 : 5;
  const chapters = listChapterFiles(run).slice(0, count);
  return chapters.length ? chapters.map((chapter) => chapter.markdown).join("\n\n") : readManuscript(run);
}

export function buildBetaReaderPacket(run: RunState, sampleMode: BetaSampleMode = "full") {
  const instructions = [
    "# Beta Reader Instructions",
    "",
    "Read for clarity, momentum, emotional payoff, and confusion points.",
    "Avoid copyediting unless a repeated pattern distracts you.",
    "Mark spoilers only in the spoiler section of the feedback form.",
    "",
    `When feedback is returned, ingest it with: /book-genesis feedback-plan "${run.rootDir}" <reviewer feedback>`,
    "",
  ].join("\n");
  const feedbackForm = [
    "# Beta Reader Feedback Form",
    "",
    "## Non-Spoiler",
    "- What pulled you forward?",
    "- Where did attention dip?",
    "- Which promise felt clearest?",
    "- What confused you?",
    "",
    "## Spoilers",
    "- Which reveal or payoff landed best?",
    "- Which ending or turn needs more setup?",
    "- What should change before publication?",
    "",
  ].join("\n");
  const targetQuestions = [
    "# Target Reader Questions",
    "",
    `- Did this feel right for: ${run.kickoff?.targetReader ?? run.config.audience ?? "the intended reader"}?`,
    `- Did the book deliver this promise: ${run.kickoff?.promise ?? run.idea}?`,
    "- Would you recommend it to a reader in this category?",
    "",
  ].join("\n");

  return {
    generatedAt: new Date().toISOString(),
    runId: run.id,
    sampleMode,
    manuscriptSample: sampleManuscript(run, sampleMode),
    instructions,
    feedbackForm,
    targetQuestions,
  };
}

export function writeBetaReaderPacket(run: RunState, sampleMode: BetaSampleMode = "full") {
  const packet = buildBetaReaderPacket(run, sampleMode);
  const base = path.join(run.rootDir, "evaluations", "beta-reader-packet");
  const files = [
    writeMarkdown(path.join(base, "manuscript-sample.md"), packet.manuscriptSample),
    writeMarkdown(path.join(base, "instructions.md"), packet.instructions),
    writeMarkdown(path.join(base, "feedback-form.md"), packet.feedbackForm),
    writeMarkdown(path.join(base, "target-reader-questions.md"), packet.targetQuestions),
  ];
  const jsonPath = writeJson(path.join(base, "beta-reader-packet.json"), { ...packet, manuscriptSample: "See manuscript-sample.md" });
  return { packet, files, jsonPath };
}
