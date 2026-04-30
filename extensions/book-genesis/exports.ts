import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

import type { ExportManifest, ExportFormat, RunState } from "./types.js";
import { writePublishingReadinessReport } from "./publishing.js";
import { buildMatterWrappedManuscript, writeBookMatter } from "./book-matter.js";

const require = createRequire(import.meta.url);
const Epub = require("epub-gen");

function resolveAuthorName(run: RunState) {
  return run.config.kdp.authorName?.trim() || "Book Genesis";
}

function markdownToPlainText(markdown: string) {
  return markdown
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^[*-]\s+/gm, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\r?\n+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function parseTrimSize(value: string | undefined) {
  if (!value) {
    return { width: 6, height: 9 };
  }

  const match = value.match(/^\s*(\d+(?:\.\d+)?)\s*(?:x|×)\s*(\d+(?:\.\d+)?)\s*$/i);
  if (!match) {
    return { width: 6, height: 9 };
  }

  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

function writePublishMetadata(run: RunState, deliveryDir: string, manuscriptMarkdown: string) {
  const manuscriptWords = countWords(markdownToPlainText(manuscriptMarkdown));
  const synopsisPath = (() => {
    try {
      return resolveSynopsisPath(run);
    } catch {
      return null;
    }
  })();
  const synopsis = synopsisPath && existsSync(synopsisPath) ? readFileSync(synopsisPath, "utf8") : "";

  const metadata = {
    runId: run.id,
    title: run.title,
    language: run.language,
    authorName: resolveAuthorName(run),
    bookMode: run.config.bookMode,
    audience: run.config.audience ?? null,
    tone: run.config.tone ?? run.kickoff?.tone ?? null,
    targetWordCount: run.config.targetWordCount ?? null,
    manuscriptWordCount: manuscriptWords,
    synopsis: synopsis ? markdownToPlainText(synopsis) : null,
    kdp: {
      formats: run.config.kdp.formats,
      trimSize: run.config.kdp.trimSize ?? null,
      bleed: run.config.kdp.bleed,
      description: run.config.kdp.description ?? null,
      keywords: run.config.kdp.keywords,
      categories: run.config.kdp.categories,
    },
    series: run.config.bookMatter.series,
    exportedAt: new Date().toISOString(),
  };

  const jsonPath = path.join(deliveryDir, "publish-metadata.json");
  writeFileSync(jsonPath, `${JSON.stringify(metadata, null, 2)}\n`, "utf8");

  const mdPath = path.join(deliveryDir, "publish-metadata.md");
  const md = [
    "# Publish Metadata",
    "",
    `- Run: ${metadata.runId}`,
    `- Title: ${metadata.title}`,
    `- Author: ${metadata.authorName}`,
    `- Language: ${metadata.language}`,
    `- Book mode: ${metadata.bookMode}`,
    `- Manuscript word count: ${metadata.manuscriptWordCount}`,
    `- Target word count: ${metadata.targetWordCount ?? "not set"}`,
    "",
    "## KDP",
    "",
    `- Formats: ${metadata.kdp.formats.join(", ")}`,
    `- Trim size: ${metadata.kdp.trimSize ?? "not set"}`,
    `- Bleed: ${metadata.kdp.bleed ? "yes" : "no"}`,
    `- Keywords: ${metadata.kdp.keywords.length}/7`,
    `- Categories: ${metadata.kdp.categories.length > 0 ? metadata.kdp.categories.length : "none"}`,
    "",
    "## Synopsis (Plain Text)",
    "",
    metadata.synopsis ?? "(missing)",
    "",
  ].join("\n");
  writeFileSync(mdPath, md, "utf8");

  return { jsonPath, mdPath };
}

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

  const flushParagraph = (buffer: string[]) => {
    const text = buffer.join(" ").trim();
    if (!text) {
      return;
    }
    paragraphs.push(new Paragraph({ children: textToRuns(text) }));
  };

  let inCodeFence = false;
  let codeFenceLang = "";
  let codeBuffer: string[] = [];
  let paragraphBuffer: string[] = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, "  ");
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (!inCodeFence) {
        flushParagraph(paragraphBuffer);
        paragraphBuffer = [];
        inCodeFence = true;
        codeFenceLang = trimmed.slice(3).trim();
        codeBuffer = [];
        continue;
      }

      // Closing fence.
      inCodeFence = false;
      const codeText = codeBuffer.join("\n").replace(/\s+$/, "");
      if (codeText) {
        paragraphs.push(new Paragraph({ text: codeFenceLang ? `${codeFenceLang}:` : "Code:", heading: HeadingLevel.HEADING_3 }));
        for (const codeLine of codeText.split(/\r?\n/)) {
          paragraphs.push(new Paragraph({
            children: [
              new TextRun({
                text: codeLine,
                font: "Courier New",
              }),
            ],
          }));
        }
      }
      codeFenceLang = "";
      codeBuffer = [];
      continue;
    }

    if (inCodeFence) {
      codeBuffer.push(line);
      continue;
    }

    if (!trimmed) {
      flushParagraph(paragraphBuffer);
      paragraphBuffer = [];
      continue;
    }

    if (trimmed.startsWith("# ")) {
      flushParagraph(paragraphBuffer);
      paragraphBuffer = [];
      paragraphs.push(new Paragraph({ text: trimmed.slice(2).trim(), heading: HeadingLevel.HEADING_1 }));
      continue;
    }

    if (trimmed.startsWith("## ")) {
      flushParagraph(paragraphBuffer);
      paragraphBuffer = [];
      paragraphs.push(new Paragraph({ text: trimmed.slice(3).trim(), heading: HeadingLevel.HEADING_2 }));
      continue;
    }

    if (trimmed.startsWith("### ")) {
      flushParagraph(paragraphBuffer);
      paragraphBuffer = [];
      paragraphs.push(new Paragraph({ text: trimmed.slice(4).trim(), heading: HeadingLevel.HEADING_3 }));
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*+]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph(paragraphBuffer);
      paragraphBuffer = [];
      paragraphs.push(new Paragraph({
        bullet: { level: 0 },
        children: textToRuns(bulletMatch[1].trim()),
      }));
      continue;
    }

    const orderedMatch = trimmed.match(/^(\d+)\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph(paragraphBuffer);
      paragraphBuffer = [];
      paragraphs.push(new Paragraph({
        children: textToRuns(`${orderedMatch[1]}. ${orderedMatch[2].trim()}`),
      }));
      continue;
    }

    const quoteMatch = trimmed.match(/^>\s*(.+)$/);
    if (quoteMatch) {
      flushParagraph(paragraphBuffer);
      paragraphBuffer = [];
      paragraphs.push(new Paragraph({
        children: [new TextRun({ text: quoteMatch[1].trim(), italics: true })],
      }));
      continue;
    }

    paragraphBuffer.push(trimmed);
  }

  flushParagraph(paragraphBuffer);
  return paragraphs;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderInlineHtml(value: string) {
  // Links: [text](url)
  let result = escapeHtml(value);
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, text, url) => {
    const safeText = escapeHtml(String(text));
    const safeUrl = escapeHtml(String(url));
    return `<a href="${safeUrl}">${safeText}</a>`;
  });
  // Inline code: `code`
  result = result.replace(/`([^`]+)`/g, (_match, code) => `<code>${escapeHtml(String(code))}</code>`);
  // Bold then italic.
  result = result.replace(/\*\*([^*]+)\*\*/g, (_match, text) => `<strong>${escapeHtml(String(text))}</strong>`);
  result = result.replace(/\*([^*]+)\*/g, (_match, text) => `<em>${escapeHtml(String(text))}</em>`);
  return result;
}

function markdownToHtml(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const out: string[] = [];

  let inCodeFence = false;
  let codeBuffer: string[] = [];
  let paragraphBuffer: string[] = [];
  let listType: "ul" | "ol" | null = null;
  let listItems: string[] = [];

  const flushParagraph = () => {
    const text = paragraphBuffer.join(" ").trim();
    paragraphBuffer = [];
    if (text) {
      out.push(`<p>${renderInlineHtml(text)}</p>`);
    }
  };

  const flushList = () => {
    if (!listType) {
      return;
    }
    const items = listItems.map((item) => `<li>${renderInlineHtml(item)}</li>`).join("");
    out.push(listType === "ul" ? `<ul>${items}</ul>` : `<ol>${items}</ol>`);
    listType = null;
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\t/g, "  ");
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      flushParagraph();
      flushList();
      if (!inCodeFence) {
        inCodeFence = true;
        codeBuffer = [];
      } else {
        inCodeFence = false;
        const code = escapeHtml(codeBuffer.join("\n").replace(/\s+$/, ""));
        out.push(`<pre><code>${code}</code></pre>`);
        codeBuffer = [];
      }
      continue;
    }

    if (inCodeFence) {
      codeBuffer.push(line);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }

    if (trimmed.startsWith("# ")) {
      flushParagraph();
      flushList();
      out.push(`<h1>${renderInlineHtml(trimmed.slice(2).trim())}</h1>`);
      continue;
    }
    if (trimmed.startsWith("## ")) {
      flushParagraph();
      flushList();
      out.push(`<h2>${renderInlineHtml(trimmed.slice(3).trim())}</h2>`);
      continue;
    }
    if (trimmed.startsWith("### ")) {
      flushParagraph();
      flushList();
      out.push(`<h3>${renderInlineHtml(trimmed.slice(4).trim())}</h3>`);
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*+]\s+(.+)$/);
    if (bulletMatch) {
      flushParagraph();
      if (listType && listType !== "ul") {
        flushList();
      }
      listType ??= "ul";
      listItems.push(bulletMatch[1].trim());
      continue;
    }

    const orderedMatch = trimmed.match(/^\d+\.\s+(.+)$/);
    if (orderedMatch) {
      flushParagraph();
      if (listType && listType !== "ol") {
        flushList();
      }
      listType ??= "ol";
      listItems.push(orderedMatch[1].trim());
      continue;
    }

    const quoteMatch = trimmed.match(/^>\s*(.+)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      out.push(`<blockquote>${renderInlineHtml(quoteMatch[1].trim())}</blockquote>`);
      continue;
    }

    paragraphBuffer.push(trimmed);
  }

  flushParagraph();
  flushList();

  return out.join("\n");
}

function stripLinkMarkup(text: string) {
  return text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
}

function textToRuns(text: string) {
  const normalized = stripLinkMarkup(text);
  const runs: TextRun[] = [];

  let i = 0;
  while (i < normalized.length) {
    const rest = normalized.slice(i);

    if (rest.startsWith("`")) {
      const end = rest.indexOf("`", 1);
      if (end > 0) {
        const value = rest.slice(1, end);
        runs.push(new TextRun({ text: value, font: "Courier New" }));
        i += end + 1;
        continue;
      }
    }

    if (rest.startsWith("**")) {
      const end = rest.indexOf("**", 2);
      if (end > 1) {
        const value = rest.slice(2, end);
        runs.push(new TextRun({ text: value, bold: true }));
        i += end + 2;
        continue;
      }
    }

    if (rest.startsWith("*")) {
      const end = rest.indexOf("*", 1);
      if (end > 0) {
        const value = rest.slice(1, end);
        runs.push(new TextRun({ text: value, italics: true }));
        i += end + 1;
        continue;
      }
    }

    const nextMarkers = [
      rest.indexOf("`", 1),
      rest.indexOf("**", 1),
      rest.indexOf("*", 1),
    ].filter((value) => value >= 0);
    const next = nextMarkers.length > 0 ? Math.min(...nextMarkers) : -1;
    const chunk = next === -1 ? rest : rest.slice(0, next);
    runs.push(new TextRun({ text: chunk }));
    i += chunk.length;
  }

  return runs;
}

function tryReadChapterFiles(run: RunState) {
  const chapterDir = path.join(run.rootDir, "manuscript", "chapters");
  if (!existsSync(chapterDir)) {
    return [];
  }

  const names = readdirSync(chapterDir).filter((entry) => entry.endsWith(".md")).sort();

  return names.map((name) => {
    const filePath = path.join(chapterDir, name);
    const markdown = readFileSync(filePath, "utf8");
    const lines = markdown.split(/\r?\n/);
    const firstHeadingIndex = lines.findIndex((line) => line.trim().startsWith("# "));
    const firstHeading = firstHeadingIndex >= 0 ? lines[firstHeadingIndex].trim() : "";
    const title = firstHeading
      ? firstHeading.replace(/^#\s+/, "").trim()
      : name.replace(/^\d+-/, "").replace(/\.md$/, "");

    const bodyMarkdown = firstHeadingIndex >= 0
      ? [...lines.slice(0, firstHeadingIndex), ...lines.slice(firstHeadingIndex + 1)].join("\n").trim()
      : markdown.trim();

    return { title, markdown: bodyMarkdown };
  });
}

async function writeDocxExport(run: RunState, outputPath: string, manuscript: string) {
  const titlePage = [
    new Paragraph({ text: run.title, heading: HeadingLevel.TITLE }),
    new Paragraph({ text: resolveAuthorName(run) }),
    new Paragraph({ text: "" }),
  ];

  const chapters = tryReadChapterFiles(run);
  const body = chapters.length > 0
    ? chapters.flatMap((chapter) => [
        new Paragraph({ text: chapter.title, heading: HeadingLevel.HEADING_1 }),
        ...markdownToParagraphs(chapter.markdown),
      ])
    : markdownToParagraphs(manuscript);

  const doc = new Document({
    sections: [
      {
        children: [...titlePage, ...body],
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
  const chapters = tryReadChapterFiles(run);
  const options = {
    title: run.title,
    author: resolveAuthorName(run),
    output: outputPath,
    lang: run.language === "auto" ? "en" : run.language,
    content: [
      { title: "Synopsis", data: markdownToHtml(synopsis) },
      ...(chapters.length > 0
        ? chapters.map((chapter) => ({ title: chapter.title, data: markdownToHtml(chapter.markdown) }))
        : [{ title: "Manuscript", data: markdownToHtml(manuscript) }]),
    ],
  };

  await new Epub(options, outputPath).promise;
  return outputPath;
}

function pdfEscape(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)")
    .replace(/\r?\n/g, " ");
}

function markdownToPdfBlocks(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const blocks: string[] = [];
  let buffer: string[] = [];
  let inCodeFence = false;

  const flush = () => {
    const text = buffer.join(" ").replace(/\s+/g, " ").trim();
    buffer = [];
    if (text) {
      blocks.push(markdownToPlainText(text));
    }
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (trimmed.startsWith("```")) {
      flush();
      inCodeFence = !inCodeFence;
      continue;
    }

    if (inCodeFence) {
      buffer.push(rawLine);
      continue;
    }

    if (!trimmed) {
      flush();
      blocks.push("");
      continue;
    }

    if (/^#{1,6}\s+/.test(trimmed)) {
      flush();
      blocks.push(markdownToPlainText(trimmed));
      blocks.push("");
      continue;
    }

    const bulletMatch = trimmed.match(/^[-*+]\s+(.+)$/);
    if (bulletMatch) {
      flush();
      blocks.push(`- ${markdownToPlainText(bulletMatch[1])}`);
      continue;
    }

    buffer.push(trimmed);
  }

  flush();
  return blocks;
}

function wrapPdfLine(text: string, maxCharacters: number) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxCharacters) {
      current = candidate;
      continue;
    }

    if (current) {
      lines.push(current);
    }

    current = word;
  }

  if (current) {
    lines.push(current);
  }

  return lines.length > 0 ? lines : [""];
}

function buildPdfContentPages(markdown: string, pageWidth: number, pageHeight: number) {
  const margin = 54;
  const fontSize = 11;
  const lineHeight = 15;
  const usableWidth = pageWidth - margin * 2;
  const maxCharacters = Math.max(28, Math.floor(usableWidth / (fontSize * 0.5)));
  const bottomY = margin;
  const topY = pageHeight - margin;
  const pages: string[][] = [[]];
  let y = topY;

  const addLine = (line: string) => {
    if (y < bottomY) {
      pages.push([]);
      y = topY;
    }

    pages[pages.length - 1].push(`BT /F1 ${fontSize} Tf ${margin} ${y} Td (${pdfEscape(line)}) Tj ET`);
    y -= lineHeight;
  };

  for (const block of markdownToPdfBlocks(markdown)) {
    if (!block) {
      y -= lineHeight;
      continue;
    }

    for (const line of wrapPdfLine(block, maxCharacters)) {
      addLine(line);
    }
    y -= lineHeight;
  }

  return pages.filter((page) => page.length > 0);
}

function buildPdfDocument(pageWidth: number, pageHeight: number, pages: string[][]) {
  const objects: string[] = [];
  const addObject = (body: string) => {
    objects.push(body);
    return objects.length;
  };

  const pageCount = Math.max(1, pages.length);
  const pageObjectIds: number[] = [];

  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = addObject("");
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  for (let index = 0; index < pageCount; index += 1) {
    const content = `${pages[index]?.join("\n") ?? ""}\n`;
    const contentId = addObject(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}endstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageObjectIds.push(pageId);
  }

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageCount} >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  for (const [index, body] of objects.entries()) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  for (let index = 1; index <= objects.length; index += 1) {
    pdf += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return pdf;
}

async function writePdfExport(run: RunState, outputPath: string, manuscript: string) {
  const trimSize = parseTrimSize(run.config.kdp.trimSize);
  const pageWidth = Math.round(trimSize.width * 72);
  const pageHeight = Math.round(trimSize.height * 72);
  const pages = buildPdfContentPages(manuscript, pageWidth, pageHeight);
  writeFileSync(outputPath, buildPdfDocument(pageWidth, pageHeight, pages), "latin1");
  return outputPath;
}

export async function writeExportPackage(
  run: RunState,
  requestedFormats: ExportFormat[] = run.config.exportFormats as ExportFormat[],
): Promise<ExportManifest> {
  const deliveryDir = path.join(run.rootDir, "delivery");
  mkdirSync(deliveryDir, { recursive: true });

  const manuscript = readFileSync(path.join(run.rootDir, "manuscript", "full-manuscript.md"), "utf8");
  const matter = writeBookMatter(run);
  const wrappedManuscript = buildMatterWrappedManuscript(run, manuscript);
  const files: string[] = [];

  const markdownPath = path.join(deliveryDir, "submission-manuscript.md");
  writeFileSync(markdownPath, wrappedManuscript, "utf8");
  files.push(markdownPath, ...matter.frontFiles, ...matter.backFiles);
  if (matter.seriesPath) {
    files.push(matter.seriesPath);
  }

  const publishMetadata = writePublishMetadata(run, deliveryDir, manuscript);
  files.push(publishMetadata.jsonPath, publishMetadata.mdPath);
  files.push(writePublishingReadinessReport(run));

  for (const format of requestedFormats) {
    if (format === "md") {
      continue;
    }

    if (format === "docx") {
    files.push(await writeDocxExport(run, path.join(deliveryDir, "submission-manuscript.docx"), wrappedManuscript));
      continue;
    }

    if (format === "epub") {
      files.push(await writeEpubExport(run, path.join(deliveryDir, "submission-manuscript.epub"), wrappedManuscript));
      continue;
    }

    if (format === "pdf") {
      files.push(await writePdfExport(run, path.join(deliveryDir, "submission-manuscript.pdf"), wrappedManuscript));
    }
  }

  const manifestPath = path.join(deliveryDir, "export-manifest.json");
  const manifest: ExportManifest = {
    formats: requestedFormats,
    files: [...files, manifestPath],
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  run.lastExportManifestPath = manifestPath;

  return manifest;
}
