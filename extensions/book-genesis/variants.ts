import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { RunState } from "./types.js";
import { ensureDir, writeJson, writeMarkdown } from "./run-files.js";

function variantContent(run: RunState, index: number) {
  const flavor = run.config.bookMode === "fiction"
    ? ["character-pressure", "mystery-reveal", "world-escalation"][index % 3]
    : ["problem-solution", "journey-framework", "case-study-led"][index % 3];
  return [
    `# Variant ${index + 1}: ${flavor}`,
    "",
    `- Reader promise fit: ${run.kickoff?.promise ?? run.idea}`,
    `- Structure strength: ${flavor}`,
    "- Originality: Make the central promise visibly different from comparable books.",
    "- Market clarity: Tie chapter movement to the target reader's buying reason.",
    "- Drafting risk: Medium",
    "- Revision risk: Medium",
  ].join("\n");
}

export function generateVariants(run: RunState, count = 3) {
  if (!Number.isInteger(count) || count < 1 || count > 9) {
    throw new Error("--count must be an integer from 1 to 9.");
  }
  const dir = ensureDir(path.join(run.rootDir, "foundation", "variants"));
  const files: string[] = [];
  for (let index = 0; index < count; index += 1) {
    files.push(writeMarkdown(path.join(dir, `variant-${String(index + 1).padStart(2, "0")}.md`), variantContent(run, index)));
  }
  const comparisonPath = writeMarkdown(path.join(dir, "variant-comparison.md"), [
    "# Variant Comparison",
    "",
    "| Variant | Reader promise fit | Structure strength | Originality | Market clarity | Drafting risk | Revision risk |",
    "| --- | --- | --- | --- | --- | --- | --- |",
    ...files.map((file, index) => `| ${index + 1} | strong | medium-high | medium | clear | medium | medium |`),
  ].join("\n"));
  return { files, comparisonPath };
}

export function chooseVariant(run: RunState, index: number) {
  const source = path.join(run.rootDir, "foundation", "variants", `variant-${String(index).padStart(2, "0")}.md`);
  if (!existsSync(source)) {
    throw new Error(`Variant ${index} does not exist. Run /book-genesis variants first.`);
  }
  const selectedPath = writeMarkdown(path.join(run.rootDir, "foundation", "selected-variant.md"), readFileSync(source, "utf8"));
  const jsonPath = writeJson(path.join(run.rootDir, "foundation", "selected-variant.json"), {
    selectedAt: new Date().toISOString(),
    selectedVariant: index,
    selectedVariantPath: selectedPath,
  });
  run.selectedVariantPath = selectedPath;
  run.nextAction = "Refine foundation using the selected planning variant.";
  return { selectedPath, jsonPath };
}
