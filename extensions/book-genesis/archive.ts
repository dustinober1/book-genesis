import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { RunState } from "./types.js";
import { ensureDir, writeJson, writeMarkdown } from "./run-files.js";

function walkFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walkFiles(full) : [full];
  });
}

function checksum(filePath: string) {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

export function buildArchiveManifest(run: RunState) {
  const roots = [
    "manuscript",
    "foundation",
    "research",
    "evaluations",
    "delivery",
    "promotion",
    ...(run.config.archive.includeState ? [".book-genesis"] : []),
  ];
  const files = roots.flatMap((root) => walkFiles(path.join(run.rootDir, root)))
    .filter((file) => run.config.archive.includeLedger || !file.endsWith("ledger.json"))
    .sort()
    .map((file) => ({ path: path.relative(run.rootDir, file).replace(/\\/g, "/"), sha256: checksum(file) }));
  return {
    generatedAt: new Date().toISOString(),
    runId: run.id,
    files,
    warnings: files.length === 0 ? ["No files found to archive."] : [],
  };
}

export function writeArchive(run: RunState, manifestOnly = true) {
  const dir = ensureDir(path.join(run.rootDir, "delivery", "archive"));
  const manifest = buildArchiveManifest(run);
  const manifestPath = writeJson(path.join(dir, "archive-manifest.json"), manifest);
  const readmePath = writeMarkdown(path.join(dir, "archive-readme.md"), [
    `# Archive for ${run.id}`,
    "",
    `- Manifest: ${manifestPath}`,
    `- Mode: ${manifestOnly ? "manifest only" : "manifest plus operator-selected files"}`,
    `- Files listed: ${manifest.files.length}`,
    "",
    "This archive command is non-destructive and does not zip or delete run files.",
  ].join("\n"));
  return { manifest, manifestPath, readmePath };
}
