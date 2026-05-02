import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { DEFAULT_RUN_CONFIG } from "../extensions/book-genesis/config.js";
import { writeKdpPackage } from "../extensions/book-genesis/kdp.js";
import { writeLayoutProfileReport } from "../extensions/book-genesis/layout-profiles.js";
import { writeMetadataLab } from "../extensions/book-genesis/metadata-lab.js";
import { createRunState } from "../extensions/book-genesis/state.js";

async function withRun(fn: (run: ReturnType<typeof createRunState>) => Promise<void>) {
  const workspace = mkdtempSync(path.join(tmpdir(), "book-genesis-kdp-"));
  try {
    const run = createRunState(workspace, "near-future heist thriller", {
      ...DEFAULT_RUN_CONFIG,
      approvalPhases: [...DEFAULT_RUN_CONFIG.approvalPhases],
      exportFormats: [...DEFAULT_RUN_CONFIG.exportFormats],
      gitCommitPaths: [...DEFAULT_RUN_CONFIG.gitCommitPaths],
      kdp: {
        ...DEFAULT_RUN_CONFIG.kdp,
        formats: [...DEFAULT_RUN_CONFIG.kdp.formats],
        keywords: [...DEFAULT_RUN_CONFIG.kdp.keywords],
        categories: [...DEFAULT_RUN_CONFIG.kdp.categories],
      },
    });
    writeFileSync(path.join(run.rootDir, "manuscript", "full-manuscript.md"), "# Full Manuscript\n\n## Chapter 1\nA clean heist.\n");
    writeFileSync(path.join(run.rootDir, "delivery", "synopsis.md"), "# Synopsis\nA crew plans a dangerous theft.\n");
    writeFileSync(path.join(run.rootDir, "delivery", "logline.md"), "# Logline\nA thief steals memories for profit.\n");
    writeFileSync(path.join(run.rootDir, "delivery", "package-summary.md"), "# Package Summary\nA near-future thriller about memory theft and loyalty.\n");
    await fn(run);
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
}

test("writeKdpPackage creates a KDP delivery package with copied assets and metadata", async () => {
  await withRun(async (run) => {
    run.config.kdp.authorName = "Jane Doe";
    run.config.kdp.trimSize = "6 x 9";
    run.config.kdp.keywords = ["memory theft thriller", "future crime novel"];
    run.config.kdp.categories = ["Thrillers > Crime", "Science Fiction > Cyberpunk"];

    const manifest = await writeKdpPackage(run);
    assert.equal(manifest.files.some((file) => file.endsWith("delivery/kdp/kdp-metadata.json")), true);
    assert.equal(manifest.files.some((file) => file.endsWith("delivery/kdp/kindle-ebook.epub")), true);
    assert.equal(manifest.files.some((file) => file.endsWith("delivery/kdp/paperback-interior.docx")), true);
    assert.equal(manifest.files.some((file) => file.endsWith("delivery/kdp/paperback-interior.pdf")), true);
    assert.equal(manifest.files.some((file) => file.endsWith("delivery/kdp/publishing-readiness.md")), true);
    assert.equal(manifest.files.some((file) => file.endsWith("delivery/kdp/kdp-cover-prompts.md")), true);
    assert.equal(manifest.files.some((file) => file.endsWith("delivery/kdp/kdp-cover-specs.md")), true);
    assert.equal(typeof run.lastKdpPackageManifestPath, "string");

    const metadata = JSON.parse(readFileSync(manifest.metadataJsonPath, "utf8")) as { authorName: string; title: string };
    assert.equal(metadata.authorName, "Jane Doe");
    assert.equal(metadata.title, run.title);

    const coverPrompts = readFileSync(manifest.coverPromptsPath, "utf8");
    assert.match(coverPrompts, /Prompt 1: eBook front cover art/);
    assert.match(coverPrompts, /text-free art plate/);

    const coverSpecs = readFileSync(manifest.coverSpecsPath, "utf8");
    assert.match(coverSpecs, /1600 x 2560 px/);
    assert.match(coverSpecs, /print-ready PDF/);

    const paperbackPdfPath = manifest.files.find((file) => file.endsWith("delivery/kdp/paperback-interior.pdf"));
    const paperbackPdf = readFileSync(paperbackPdfPath!, "latin1");
    assert.match(paperbackPdf, /\/MediaBox \[0 0 432 648\]/);
  });
});

test("writeKdpPackage reports key preflight warnings", async () => {
  await withRun(async (run) => {
    run.config.kdp.description = "x".repeat(4001);
    run.config.kdp.keywords = [
      "one", "two", "three", "four", "five", "six", "seven", "eight",
    ];
    run.config.kdp.categories = [];
    run.config.kdp.trimSize = undefined;

    const manifest = await writeKdpPackage(run);
    const issueCodes = manifest.issues.map((issue) => issue.code);

    assert.equal(issueCodes.includes("missing_author_name"), true);
    assert.equal(issueCodes.includes("description_too_long"), true);
    assert.equal(issueCodes.includes("too_many_keywords"), true);
    assert.equal(issueCodes.includes("missing_categories"), true);
    assert.equal(issueCodes.includes("missing_trim_size"), true);
    assert.equal(issueCodes.includes("spine_text_check"), true);
    assert.equal(issueCodes.includes("generated_cover_brief"), true);
  });
});

test("kdp package includes metadata lab and layout profile artifacts", async () => {
  await withRun(async (run) => {
    run.config.kdp.authorName = "D. Ober";
    run.config.kdp.description = "A commercial near-future thriller about memory theft.";
    run.config.kdp.keywords = ["memory theft thriller"];
    run.config.kdp.categories = ["Fiction / Thrillers / Technological"];
    writeMetadataLab(run);
    writeLayoutProfileReport(run);

    const manifest = await writeKdpPackage(run);
    assert.equal(existsSync(path.join(run.rootDir, "delivery", "kdp", "metadata-lab.md")), true);
    assert.equal(existsSync(path.join(run.rootDir, "delivery", "kdp", "layout-profile.md")), true);
    assert.equal(manifest.files.some((file) => file.endsWith("metadata-lab.md")), true);
  });
});
