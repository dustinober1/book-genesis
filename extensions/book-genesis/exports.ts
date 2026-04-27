import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

import type { ExportManifest, ExportFormat, RunState } from "./types.js";

const require = createRequire(import.meta.url);
const Epub = require("epub-gen");

function resolveSynopsisPath(run: RunState) {
  const candidates = run.config.bookMode === "prescriptive-nonfiction"
    ? ["one-page-synopsis.md", "synopsis.md"]
    : ["synopsis.md", "one-page-synopsis.md"];

  for (const candidate of candidates) {
    const filePath = path.join(run.rootDir, "delivery", candidate);
    if (existsSync(filePath)) {
      return filePath;
    }
  }

  throw new Error(`Export requires a synopsis artifact in delivery/. Checked: ${candidates.join(", ")}`);
}

function markdownToParagraphs(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const paragraphs: Paragraph[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith("# ")) {
      paragraphs.push(new Paragraph({ text: trimmed.slice(2), heading: HeadingLevel.HEADING_1 }));
      continue;
    }

    if (trimmed.startsWith("## ")) {
      paragraphs.push(new Paragraph({ text: trimmed.slice(3), heading: HeadingLevel.HEADING_2 }));
      continue;
    }

    paragraphs.push(new Paragraph({ children: [new TextRun(trimmed)] }));
  }

  return paragraphs;
}

function markdownToHtml(markdown: string) {
  return markdown
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return "";
      }
      if (trimmed.startsWith("# ")) {
        return `<h1>${trimmed.slice(2)}</h1>`;
      }
      if (trimmed.startsWith("## ")) {
        return `<h2>${trimmed.slice(3)}</h2>`;
      }
      return `<p>${trimmed}</p>`;
    })
    .join("\n");
}

async function writeDocxExport(outputPath: string, manuscript: string) {
  const doc = new Document({
    sections: [
      {
        children: markdownToParagraphs(manuscript),
      },
    ],
  });

  const buffer = await Packer.toBuffer(doc);
  writeFileSync(outputPath, buffer);
  return outputPath;
}

async function writeEpubExport(run: RunState, outputPath: string, manuscript: string) {
  const synopsisPath = resolveSynopsisPath(run);
  const synopsis = readFileSync(synopsisPath, "utf8");
  const options = {
    title: run.title,
    author: "Book Genesis",
    output: outputPath,
    lang: run.language === "auto" ? "en" : run.language,
    content: [
      { title: "Synopsis", data: markdownToHtml(synopsis) },
      { title: "Manuscript", data: markdownToHtml(manuscript) },
    ],
  };

  await new Epub(options, outputPath).promise;
  return outputPath;
}

export async function writeExportPackage(run: RunState): Promise<ExportManifest> {
  const deliveryDir = path.join(run.rootDir, "delivery");
  mkdirSync(deliveryDir, { recursive: true });

  const manuscript = readFileSync(path.join(run.rootDir, "manuscript", "full-manuscript.md"), "utf8");
  const files: string[] = [];

  const markdownPath = path.join(deliveryDir, "submission-manuscript.md");
  writeFileSync(markdownPath, manuscript, "utf8");
  files.push(markdownPath);

  for (const format of run.config.exportFormats) {
    if (format === "md") {
      continue;
    }

    if (format === "docx") {
      files.push(await writeDocxExport(path.join(deliveryDir, "submission-manuscript.docx"), manuscript));
      continue;
    }

    if (format === "epub") {
      files.push(await writeEpubExport(run, path.join(deliveryDir, "submission-manuscript.epub"), manuscript));
    }
  }

  const manifestPath = path.join(deliveryDir, "export-manifest.json");
  const manifest: ExportManifest = {
    formats: run.config.exportFormats as ExportFormat[],
    files: [...files, manifestPath],
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  run.lastExportManifestPath = manifestPath;

  return manifest;
}
