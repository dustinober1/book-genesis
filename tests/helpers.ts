import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { DEFAULT_RUN_CONFIG } from "../extensions/book-genesis/config.js";
import { createRunState, writeRunState } from "../extensions/book-genesis/state.js";
import type { RunConfig, RunState } from "../extensions/book-genesis/types.js";

export function withWorkspace(fn: (workspace: string) => void | Promise<void>) {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-next-"));
  const result = Promise.resolve(fn(workspace));
  return result.finally(() => rmSync(workspace, { recursive: true, force: true }));
}

export function makeRun(workspace: string, config: Partial<RunConfig> = {}) {
  const run = createRunState(workspace, "en a near-future thriller about memory theft", {
    ...DEFAULT_RUN_CONFIG,
    ...config,
    kdp: { ...DEFAULT_RUN_CONFIG.kdp, ...config.kdp },
    promotion: { ...DEFAULT_RUN_CONFIG.promotion, ...config.promotion },
    style: { ...DEFAULT_RUN_CONFIG.style, ...config.style },
    sceneMap: { ...DEFAULT_RUN_CONFIG.sceneMap, ...config.sceneMap },
    critiquePanel: { ...DEFAULT_RUN_CONFIG.critiquePanel, ...config.critiquePanel },
    sourceAudit: { ...DEFAULT_RUN_CONFIG.sourceAudit, ...config.sourceAudit },
    launchKit: { ...DEFAULT_RUN_CONFIG.launchKit, ...config.launchKit },
    bookMatter: { ...DEFAULT_RUN_CONFIG.bookMatter, ...config.bookMatter },
    coverCheck: { ...DEFAULT_RUN_CONFIG.coverCheck, ...config.coverCheck },
    revisionPlan: { ...DEFAULT_RUN_CONFIG.revisionPlan, ...config.revisionPlan },
    archive: { ...DEFAULT_RUN_CONFIG.archive, ...config.archive },
  });
  writeRunState(run);
  return run;
}

export function writeBasicManuscript(run: RunState) {
  mkdirSync(path.join(run.rootDir, "manuscript", "chapters"), { recursive: true });
  writeFileSync(path.join(run.rootDir, "manuscript", "chapters", "01-opening.md"), "# Opening\n\nSuddenly the thief promised to return the stolen memory. TODO\n", "utf8");
  writeFileSync(path.join(run.rootDir, "manuscript", "chapters", "02-ending.md"), "# Ending\n\nIn 2024, research showed 42% of memories could be indexed. Finally the debt was resolved.\n", "utf8");
  writeFileSync(path.join(run.rootDir, "manuscript", "full-manuscript.md"), "# Opening\n\nSuddenly the thief promised to return the stolen memory. TODO\n\n# Ending\n\nIn 2024, research showed 42% of memories could be indexed. Finally the debt was resolved.\n", "utf8");
  mkdirSync(path.join(run.rootDir, "delivery"), { recursive: true });
  writeFileSync(path.join(run.rootDir, "delivery", "synopsis.md"), "# Synopsis\n\nA memory theft thriller.", "utf8");
  writeFileSync(path.join(run.rootDir, "delivery", "logline.md"), "A thief must return a stolen memory before a city forgets itself.", "utf8");
  writeFileSync(path.join(run.rootDir, "delivery", "package-summary.md"), "A commercial thriller package.", "utf8");
}
