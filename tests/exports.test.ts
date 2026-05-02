import { mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_RUN_CONFIG } from "../extensions/book-genesis/config.js";
import { writeExportPackage } from "../extensions/book-genesis/exports.js";
import { createRunState } from "../extensions/book-genesis/state.js";

async function withRun(fn: (run: ReturnType<typeof createRunState>) => Promise<void>) {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-exports-"));
  try {
    const run = createRunState(workspace, "heist novel", DEFAULT_RUN_CONFIG);
    writeFileSync(path.join(run.rootDir, "manuscript", "full-manuscript.md"), "# Full Manuscript\n\n## Chapter 1\nA clean heist.\n");
    writeFileSync(path.join(run.rootDir, "delivery", "synopsis.md"), "# Synopsis\n");
    writeFileSync(path.join(run.rootDir, "delivery", "logline.md"), "# Logline\n");
    writeFileSync(path.join(run.rootDir, "delivery", "package-summary.md"), "# Package Summary\n");
    await fn(run);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("writeExportPackage always creates a markdown submission package and manifest", async () => {
  await withRun(async (run) => {
    run.config.exportFormats = ["md"];
    const manifest = await writeExportPackage(run);
    assert.equal(manifest.files.some((file) => file.endsWith("submission-manuscript.md")), true);
    assert.equal(manifest.files.some((file) => file.endsWith("export-manifest.json")), true);
    assert.equal(manifest.files.some((file) => file.endsWith("publishing-readiness.md")), true);
    assert.match(readFileSync(manifest.files.find((file) => file.endsWith("submission-manuscript.md"))!, "utf8"), /Full Manuscript/);
  });
});

test("writeExportPackage records configured formats in the manifest", async () => {
  await withRun(async (run) => {
    run.config.exportFormats = ["md", "docx"];
    const manifest = await writeExportPackage(run);
    assert.equal(manifest.formats.includes("docx"), true);
    assert.equal(manifest.files.some((file) => file.endsWith(".docx")), true);
    assert.equal(manifest.layoutProfile?.id, "fiction-paperback-6x9");
  });
});

test("writeExportPackage can create a no-bleed 6 x 9 paperback PDF", async () => {
  await withRun(async (run) => {
    run.config.kdp.trimSize = "6 x 9";
    run.config.exportFormats = ["md", "pdf"];

    const manifest = await writeExportPackage(run);
    const pdfPath = manifest.files.find((file) => file.endsWith("submission-manuscript.pdf"));

    assert.equal(typeof pdfPath, "string");
    const pdf = readFileSync(pdfPath!, "latin1");
    assert.match(pdf, /^%PDF-/);
    assert.match(pdf, /\/MediaBox \[0 0 432 648\]/);
  });
});

test("writeExportPackage uses the mode-specific synopsis artifact for prescriptive nonfiction", async () => {
  await withRun(async (run) => {
    run.config.bookMode = "prescriptive-nonfiction";
    run.config.exportFormats = ["md", "epub"];
    unlinkSync(path.join(run.rootDir, "delivery", "synopsis.md"));
    writeFileSync(path.join(run.rootDir, "delivery", "one-page-synopsis.md"), "# One Page Synopsis\n");

    const manifest = await writeExportPackage(run);
    assert.equal(manifest.files.some((file) => file.endsWith(".epub")), true);
  });
});
