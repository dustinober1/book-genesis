import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { writeExportPackage } from "./exports.js";
import type {
  ExportFormat,
  KdpPackageManifest,
  KdpPreflightIssue,
  KdpTargetFormat,
  RunState,
} from "./types.js";

const KDP_DESCRIPTION_CHAR_LIMIT = 4000;
const KDP_KEYWORD_LIMIT = 7;

const KDP_SOURCE_LINKS = [
  "https://kdp.amazon.com/en_US/help/topic/G200641240",
  "https://kdp.amazon.com/en_US/help/topic/G202176900",
  "https://kdp.amazon.com/en_US/help/topic/G201743260",
  "https://kdp.amazon.com/en_US/help/topic/G201189630?lang=en",
  "https://kdp.amazon.com/en_US/help/topic/G201097560",
  "https://kdp.amazon.com/en_US/help/topic/GVBQ3CMEQW3W2VL6",
] as const;

const EBOOK_COVER_IDEAL = "1600 x 2560 px";
const EBOOK_COVER_MIN = "625 x 1000 px";

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

function readOptionalFile(filePath: string) {
  if (!existsSync(filePath)) {
    return null;
  }

  return readFileSync(filePath, "utf8");
}

function getTrimmedMarkdown(run: RunState, relativePath: string) {
  const filePath = path.join(run.rootDir, relativePath);
  const value = readOptionalFile(filePath);
  return value ? markdownToPlainText(value) : "";
}

function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

function estimatePrintPageCount(wordCount: number) {
  if (wordCount <= 0) {
    return 0;
  }

  return Math.max(24, Math.ceil(wordCount / 300));
}

function getCoverBrief(run: RunState) {
  const candidates = [
    getTrimmedMarkdown(run, "delivery/cover-brief.md"),
    getTrimmedMarkdown(run, "delivery/illustrator-brief.md"),
    getTrimmedMarkdown(run, "delivery/package-summary.md"),
    getTrimmedMarkdown(run, "delivery/logline.md"),
    getTrimmedMarkdown(run, "delivery/synopsis.md"),
    run.idea,
  ];

  return candidates.find((candidate) => candidate.length > 0) ?? run.idea;
}

function buildDescription(run: RunState) {
  const configured = run.config.kdp.description?.trim();
  if (configured) {
    return configured;
  }

  const candidates = [
    getTrimmedMarkdown(run, "delivery/package-summary.md"),
    getTrimmedMarkdown(run, "delivery/synopsis.md"),
    getTrimmedMarkdown(run, "delivery/one-page-synopsis.md"),
    run.kickoff?.promise?.trim() ?? "",
    run.idea,
  ];

  return candidates.find((candidate) => candidate.length > 0) ?? "";
}

function unique(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim().replace(/\s+/g, " ").toLowerCase();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(value.trim().replace(/\s+/g, " "));
  }

  return result;
}

function buildSuggestedKeywordSeeds(run: RunState) {
  const candidates = [
    run.kickoff?.genre,
    run.kickoff?.targetReader,
    run.config.audience,
    getTrimmedMarkdown(run, "delivery/logline.md"),
    getTrimmedMarkdown(run, "delivery/synopsis.md"),
    run.idea,
  ]
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0)
    .flatMap((value) => value.split(/[.;,]/))
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .map((value) => value.replace(/\s+/g, " "));

  return unique(candidates).slice(0, KDP_KEYWORD_LIMIT);
}

function buildCoverKeywords(run: RunState) {
  return unique([
    run.kickoff?.genre ?? "",
    run.kickoff?.tone ?? "",
    run.config.tone ?? "",
    run.config.audience ?? "",
    run.config.bookMode.replace(/-/g, " "),
  ]).filter(Boolean);
}

function parseTrimSize(value: string | undefined) {
  if (!value) {
    return null;
  }

  const match = value.match(/^\s*(\d+(?:\.\d+)?)\s*(?:x|×)\s*(\d+(?:\.\d+)?)\s*$/i);
  if (!match) {
    return null;
  }

  return {
    width: Number(match[1]),
    height: Number(match[2]),
  };
}

function formatTrimSize(width: number, height: number) {
  return `${width.toFixed(3).replace(/\.?0+$/, "")} x ${height.toFixed(3).replace(/\.?0+$/, "")} in`;
}

function resolveRequiredExportFormats(targets: KdpTargetFormat[], existingFormats: ExportFormat[]) {
  const required = new Set<ExportFormat>(["md", ...existingFormats]);

  if (targets.includes("ebook")) {
    required.add("epub");
  }

  if (targets.includes("paperback")) {
    required.add("docx");
  }

  return [...required];
}

function buildIssues(run: RunState, description: string, keywords: string[], categories: string[]) {
  const issues: KdpPreflightIssue[] = [];
  const targets = run.config.kdp.formats;
  const manuscript = readOptionalFile(path.join(run.rootDir, "manuscript", "full-manuscript.md")) ?? "";
  const wordCount = countWords(markdownToPlainText(manuscript));
  const estimatedPageCount = estimatePrintPageCount(wordCount);

  if (!run.config.kdp.authorName) {
    issues.push({
      severity: "warning",
      code: "missing_author_name",
      message: "Set kdp.authorName before publishing so the metadata package matches the KDP listing.",
    });
  }

  if (!description) {
    issues.push({
      severity: "warning",
      code: "missing_description",
      message: "No KDP description is available. Add kdp.description or refine delivery/package-summary.md.",
    });
  } else if (description.length > KDP_DESCRIPTION_CHAR_LIMIT) {
    issues.push({
      severity: "warning",
      code: "description_too_long",
      message: `KDP descriptions are limited to ${KDP_DESCRIPTION_CHAR_LIMIT} characters. Current description is ${description.length}.`,
    });
  } else {
    issues.push({
      severity: "info",
      code: "description_length_ok",
      message: `Description length is ${description.length} characters, within the KDP limit of ${KDP_DESCRIPTION_CHAR_LIMIT}.`,
    });
  }

  if (keywords.length === 0) {
    issues.push({
      severity: "warning",
      code: "missing_keywords",
      message: "No explicit kdp.keywords are configured. Fill all seven keyword slots before publishing.",
    });
  } else if (keywords.length > KDP_KEYWORD_LIMIT) {
    issues.push({
      severity: "warning",
      code: "too_many_keywords",
      message: `KDP supports up to ${KDP_KEYWORD_LIMIT} keyword slots. Current config has ${keywords.length}.`,
    });
  } else {
    issues.push({
      severity: "info",
      code: "keyword_count_ok",
      message: `Configured ${keywords.length} keyword slots out of the KDP maximum of ${KDP_KEYWORD_LIMIT}.`,
    });
  }

  for (const keyword of keywords) {
    const wordCount = keyword.split(/\s+/).filter(Boolean).length;
    if (wordCount < 2 || wordCount > 3) {
      issues.push({
        severity: "info",
        code: "keyword_phrase_shape",
        message: `Keyword "${keyword}" is ${wordCount} words. KDP recommends 2-3 word phrases when possible.`,
      });
    }
  }

  if (categories.length === 0) {
    issues.push({
      severity: "warning",
      code: "missing_categories",
      message: "No kdp.categories are configured. Choose categories in KDP before submitting the title.",
    });
  }

  if (targets.includes("paperback")) {
    if (!run.config.kdp.trimSize) {
      issues.push({
        severity: "warning",
        code: "missing_trim_size",
        message: "Paperback packaging is enabled but kdp.trimSize is not set.",
      });
    } else {
      const parsed = parseTrimSize(run.config.kdp.trimSize);
      if (!parsed) {
        issues.push({
          severity: "warning",
          code: "invalid_trim_size",
          message: `Could not parse kdp.trimSize "${run.config.kdp.trimSize}". Use a form like "6 x 9".`,
        });
      } else if (run.config.kdp.bleed) {
        issues.push({
          severity: "info",
          code: "bleed_dimensions",
          message: `Paperback bleed target page size: ${formatTrimSize(parsed.width + 0.125, parsed.height + 0.25)}.`,
        });
      } else {
        issues.push({
          severity: "info",
          code: "trim_size_ok",
          message: `Paperback trim size is set to ${formatTrimSize(parsed.width, parsed.height)} without bleed.`,
        });
      }
    }

    issues.push({
      severity: estimatedPageCount >= 79 ? "info" : "warning",
      code: "spine_text_check",
      message: estimatedPageCount >= 79
        ? `Estimated print length is about ${estimatedPageCount} pages, so spine text may be allowed after final KDP preview confirms the actual page count.`
        : `Estimated print length is about ${estimatedPageCount} pages. KDP requires at least 79 pages before you add spine text to a paperback cover.`,
    });
  }

  if (!readOptionalFile(path.join(run.rootDir, "delivery", "cover-brief.md"))
    && !readOptionalFile(path.join(run.rootDir, "delivery", "illustrator-brief.md"))) {
    issues.push({
      severity: "info",
      code: "generated_cover_brief",
      message: "No explicit delivery cover brief was found, so the KDP package generated cover prompts from the synopsis, package summary, and kickoff data.",
    });
  }

  return issues;
}

function renderChecklist(
  run: RunState,
  descriptionLength: number,
  keywordCount: number,
  suggestedKeywordSeeds: string[],
  estimatedPageCount: number,
) {
  const formatList = run.config.kdp.formats.join(", ");
  const categoryLines = run.config.kdp.categories.length > 0
    ? run.config.kdp.categories.map((entry) => `- ${entry}`).join("\n")
    : "- Choose categories in KDP";
  const keywordLines = run.config.kdp.keywords.length > 0
    ? run.config.kdp.keywords.map((entry) => `- ${entry}`).join("\n")
    : "- Fill all seven KDP keyword slots";
  const seedLines = suggestedKeywordSeeds.length > 0
    ? suggestedKeywordSeeds.map((entry) => `- ${entry}`).join("\n")
    : "- No keyword seeds inferred from the current run";

  return `# KDP Publish Checklist

## Target formats

- ${formatList}

## Metadata

- Title: ${run.title}
- Author name: ${run.config.kdp.authorName ?? "TODO"}
- Description length: ${descriptionLength} characters
- Configured keywords: ${keywordCount}/${KDP_KEYWORD_LIMIT}
- Trim size: ${run.config.kdp.trimSize ?? "TODO"}
- Bleed: ${run.config.kdp.bleed ? "yes" : "no"}
- Estimated print page count: ${estimatedPageCount || "unknown"} pages

## Required operator review

- Confirm title, subtitle, author, and series data in KDP Bookshelf
- Confirm the description reads cleanly after any HTML formatting
- Confirm all keyword slots are intentional and reader-facing
- Confirm categories match the actual book promise
- Generate final cover assets from the included cover prompts and confirm they match KDP specs
- For eBook: upload a separate marketing cover image and include an internal cover image in the manuscript
- For paperback: produce a single wrap PDF with back, spine, and front cover
- Preview the uploaded manuscript in KDP before final publish
- Review pricing, rights, and KDP Select enrollment manually

## Categories

${categoryLines}

## Configured keywords

${keywordLines}

## Suggested keyword seeds

${seedLines}
`;
}

function renderInstructions(run: RunState) {
  const formatLines = run.config.kdp.formats.map((target) => `- ${target}`).join("\n");

  return `# KDP Submission Instructions

This package prepares files for Amazon KDP, but it does not publish directly. KDP still uses a manual Bookshelf flow.

## Current workflow

1. Sign in to https://kdp.amazon.com
2. Open Bookshelf and create a new title or edit the draft title
3. Enter book details, description, keywords, and categories
4. Generate or finalize the cover using kdp-cover-prompts.md and kdp-cover-specs.md
5. Upload the packaged manuscript files and the final cover assets for the target formats below
6. Launch the KDP previewer and review formatting
7. Save and continue through rights and pricing
8. Click Publish in KDP once the manual review looks correct

## Target formats in this package

${formatLines}

## Source references

${KDP_SOURCE_LINKS.map((link) => `- ${link}`).join("\n")}
`;
}

function renderPreflight(issues: KdpPreflightIssue[]) {
  return `# KDP Preflight Report

${issues.map((issue) => `- [${issue.severity.toUpperCase()}] ${issue.code}: ${issue.message}`).join("\n")}
`;
}

function renderCoverSpecs(run: RunState, estimatedPageCount: number) {
  const parsedTrim = parseTrimSize(run.config.kdp.trimSize);
  const trimLine = parsedTrim
    ? `- Paperback trim size target: ${formatTrimSize(parsedTrim.width, parsedTrim.height)}`
    : "- Paperback trim size target: TODO";
  const bleedLine = parsedTrim && run.config.kdp.bleed
    ? `- Paperback page size with bleed: ${formatTrimSize(parsedTrim.width + 0.125, parsedTrim.height + 0.25)}`
    : null;

  return `# KDP Cover Specs

## Kindle eBook cover

- Preferred file types: JPEG or TIFF
- Ideal size: ${EBOOK_COVER_IDEAL}
- Minimum size: ${EBOOK_COVER_MIN}
- Ideal aspect ratio: 1.6:1
- Color profile: RGB
- Max file size: 50 MB
- KDP expects title and author/contributor info on the cover
- Do not include spine, barcode, or back cover on the eBook marketing image
- Avoid placeholder text, watermarks, contradictory metadata, or blurred text

## Paperback cover

- Final upload must be one print-ready PDF containing back cover, spine, and front cover
- Minimum image resolution: 300 DPI
- Preferred print color workflow: CMYK
- Add 0.125 in bleed to top, bottom, and outside edges
- Keep front and back cover text at least 0.125 in inside trim lines
- Spine text needs at least 79 pages after final KDP page-count calculation
- Estimated print page count from current manuscript: ${estimatedPageCount} pages
${trimLine}
${bleedLine ? `${bleedLine}\n` : ""}- Flatten transparencies, embed fonts, remove crop marks, and remove template text before upload

## Operator note

- AI image generation is best used for front-cover art direction and base imagery.
- Final typography, barcode placement, wrap layout, and export to print PDF should still be handled in a design tool before KDP upload.
`;
}

function renderCoverPrompts(run: RunState, description: string, estimatedPageCount: number) {
  const coverBrief = getCoverBrief(run);
  const audience = run.kickoff?.targetReader ?? run.config.audience ?? "the intended KDP audience";
  const tone = run.kickoff?.tone ?? run.config.tone ?? "commercially compelling";
  const author = run.config.kdp.authorName ?? "AUTHOR NAME";
  const keywords = buildCoverKeywords(run);
  const keywordLine = keywords.length > 0 ? keywords.join(", ") : "none specified";
  const synopsis = getTrimmedMarkdown(run, "delivery/synopsis.md") || getTrimmedMarkdown(run, "delivery/one-page-synopsis.md") || run.idea;
  const trimInstruction = run.config.kdp.trimSize
    ? `Trim target for later print layout: ${run.config.kdp.trimSize}.`
    : "Trim target for later print layout: choose in KDP and update the prompt notes.";

  return `# KDP Cover Prompts

These prompts are designed to help generate base cover art and direction. For KDP, the final eBook image and the final paperback wrap still need layout, typography, and export cleanup in a design tool.

## Shared project signals

- Title: ${run.title}
- Author: ${author}
- Mode: ${run.config.bookMode}
- Audience: ${audience}
- Tone: ${tone}
- Cover keywords: ${keywordLine}
- Core brief: ${coverBrief}
- Synopsis anchor: ${synopsis}
- Description anchor: ${description || "No description yet. Use the synopsis and package summary."}

## Prompt 1: eBook front cover art

Use this when generating the main front-cover image for the Kindle eBook marketing cover:

\`\`\`
Create a premium commercial book cover concept for a ${run.config.bookMode.replace(/-/g, " ")} book titled "${run.title}" by ${author}. Audience: ${audience}. Tone: ${tone}. Story / promise: ${coverBrief}. Visual priorities: strong focal subject, clear genre signaling, high contrast, readable silhouette, emotionally specific mood, polished cinematic lighting, professional publishing quality, composition designed for an Amazon KDP cover thumbnail, vertical 1.6:1 aspect ratio, centered hierarchy, room for title and author typography, no watermark, no mockup, no device frame, no barcode, no spine, no back cover, no tiny unreadable details, no distorted anatomy, no extra fingers, no gibberish text. Favor a design that is unmistakable at thumbnail size and commercially legible in the Amazon store. Render as a clean front cover image only.
\`\`\`

## Prompt 2: text-free art plate for later typography

Use this if the image model struggles with typography and you plan to add title/author later in a design tool:

\`\`\`
Create a text-free vertical cover illustration for a ${run.config.bookMode.replace(/-/g, " ")} book. Story / promise: ${coverBrief}. Audience: ${audience}. Tone: ${tone}. The art must support later typography placement, leaving intentional negative space for a title at the top third and author name at the bottom. Make the image commercially strong at Amazon thumbnail size, with one clear focal element, restrained background complexity, strong contrast, and genre-specific visual cues. No text, no letters, no logos, no watermark, no mockup framing, no barcode, no spine, no back cover. High-end publishing art direction, production-ready lighting, crisp edges, print-friendly detail.
\`\`\`

## Prompt 3: paperback front cover art

Use this when you want front-cover art intended to be placed into a later full-wrap paperback design:

\`\`\`
Create front-cover art for a trade paperback book titled "${run.title}" by ${author}. The final cover will be used for Amazon KDP print, so the artwork should support later wrap design and typography. Story / promise: ${coverBrief}. Audience: ${audience}. Tone: ${tone}. Keep the composition strong on the front panel, with safe negative space for title and author. Avoid placing critical details near the outer edges. No text, no barcode, no mockup, no spine, no back cover. Professional bookstore-ready art direction, commercial genre clarity, strong focal point, rich but controlled color, 300-DPI-friendly detail, print-conscious composition.
\`\`\`

## Paperback wrap layout brief

- Final paperback upload must be a single PDF with back cover, spine, and front cover.
- Estimated current print length: ${estimatedPageCount} pages.
- ${trimInstruction}
- If final KDP page count is under 79 pages, do not place spine text.
- Keep text at least 0.125 in inside trim lines.
- Extend background art 0.125 in into bleed.
- Add barcode-safe empty space on the back cover.
- Match title, author, edition, and ISBN exactly to KDP metadata.
`;
}

function renderMetadataMarkdown(data: {
  run: RunState;
  description: string;
  keywords: string[];
  categories: string[];
  suggestedKeywordSeeds: string[];
  copiedAssets: string[];
  exportFormats: ExportFormat[];
  estimatedPageCount: number;
}) {
  return `# KDP Metadata Package

## Core

- Run: ${data.run.id}
- Title: ${data.run.title}
- Language: ${data.run.language}
- Author name: ${data.run.config.kdp.authorName ?? "TODO"}
- Target formats: ${data.run.config.kdp.formats.join(", ")}
- Export formats generated: ${data.exportFormats.join(", ")}
- Estimated print page count: ${data.estimatedPageCount}

## Description

${data.description || "TODO"}

## Configured keywords

${data.keywords.length > 0 ? data.keywords.map((entry) => `- ${entry}`).join("\n") : "- TODO"}

## Suggested keyword seeds

${data.suggestedKeywordSeeds.length > 0 ? data.suggestedKeywordSeeds.map((entry) => `- ${entry}`).join("\n") : "- none"}

## Categories

${data.categories.length > 0 ? data.categories.map((entry) => `- ${entry}`).join("\n") : "- TODO"}

## Files

${data.copiedAssets.map((entry) => `- ${entry}`).join("\n")}
`;
}

export async function writeKdpPackage(run: RunState): Promise<KdpPackageManifest> {
  const targets = run.config.kdp.formats;
  const requiredExportFormats = resolveRequiredExportFormats(targets, run.config.exportFormats as ExportFormat[]);
  await writeExportPackage(run, requiredExportFormats);
  const manuscript = readOptionalFile(path.join(run.rootDir, "manuscript", "full-manuscript.md")) ?? "";
  const estimatedPageCount = estimatePrintPageCount(countWords(markdownToPlainText(manuscript)));

  const kdpDir = path.join(run.rootDir, "delivery", "kdp");
  mkdirSync(kdpDir, { recursive: true });

  const copiedAssets: string[] = [];
  const sourceMarkdownPath = path.join(run.rootDir, "delivery", "submission-manuscript.md");
  const copiedMarkdownPath = path.join(kdpDir, "manuscript-source.md");
  copyFileSync(sourceMarkdownPath, copiedMarkdownPath);
  copiedAssets.push(copiedMarkdownPath);

  if (targets.includes("ebook")) {
    const sourceEpubPath = path.join(run.rootDir, "delivery", "submission-manuscript.epub");
    if (existsSync(sourceEpubPath)) {
      const copiedEpubPath = path.join(kdpDir, "kindle-ebook.epub");
      copyFileSync(sourceEpubPath, copiedEpubPath);
      copiedAssets.push(copiedEpubPath);
    }
  }

  if (targets.includes("paperback")) {
    const sourceDocxPath = path.join(run.rootDir, "delivery", "submission-manuscript.docx");
    if (existsSync(sourceDocxPath)) {
      const copiedDocxPath = path.join(kdpDir, "paperback-interior.docx");
      copyFileSync(sourceDocxPath, copiedDocxPath);
      copiedAssets.push(copiedDocxPath);
    }
  }

  const description = buildDescription(run);
  const keywords = unique(run.config.kdp.keywords);
  const categories = unique(run.config.kdp.categories);
  const suggestedKeywordSeeds = buildSuggestedKeywordSeeds(run);
  const issues = buildIssues(run, description, keywords, categories);

  const metadataPayload = {
    runId: run.id,
    title: run.title,
    language: run.language,
    authorName: run.config.kdp.authorName ?? "",
    targetFormats: targets,
    exportFormats: requiredExportFormats,
    trimSize: run.config.kdp.trimSize ?? "",
    bleed: run.config.kdp.bleed,
    description,
    keywords,
    suggestedKeywordSeeds,
    categories,
    copiedAssets,
    sourceLinks: [...KDP_SOURCE_LINKS],
  };

  const metadataJsonPath = path.join(kdpDir, "kdp-metadata.json");
  writeFileSync(metadataJsonPath, `${JSON.stringify(metadataPayload, null, 2)}\n`, "utf8");

  const metadataMarkdownPath = path.join(kdpDir, "kdp-metadata.md");
  writeFileSync(metadataMarkdownPath, `${renderMetadataMarkdown({
    run,
    description,
    keywords,
    categories,
    suggestedKeywordSeeds,
    copiedAssets,
    exportFormats: requiredExportFormats,
    estimatedPageCount,
  })}\n`, "utf8");

  const preflightPath = path.join(kdpDir, "kdp-preflight.md");
  writeFileSync(preflightPath, `${renderPreflight(issues)}\n`, "utf8");

  const checklistPath = path.join(kdpDir, "kdp-checklist.md");
  writeFileSync(
    checklistPath,
    `${renderChecklist(run, description.length, keywords.length, suggestedKeywordSeeds, estimatedPageCount)}\n`,
    "utf8",
  );

  const instructionsPath = path.join(kdpDir, "kdp-submission-instructions.md");
  writeFileSync(instructionsPath, `${renderInstructions(run)}\n`, "utf8");

  const coverPromptsPath = path.join(kdpDir, "kdp-cover-prompts.md");
  writeFileSync(coverPromptsPath, `${renderCoverPrompts(run, description, estimatedPageCount)}\n`, "utf8");

  const coverSpecsPath = path.join(kdpDir, "kdp-cover-specs.md");
  writeFileSync(coverSpecsPath, `${renderCoverSpecs(run, estimatedPageCount)}\n`, "utf8");

  const manifestPath = path.join(kdpDir, "kdp-manifest.json");
  const manifest: KdpPackageManifest = {
    files: [
      ...copiedAssets,
      metadataJsonPath,
      metadataMarkdownPath,
      preflightPath,
      checklistPath,
      instructionsPath,
      coverPromptsPath,
      coverSpecsPath,
      manifestPath,
    ],
    exportFormats: requiredExportFormats,
    copiedAssets,
    metadataJsonPath,
    metadataMarkdownPath,
    preflightPath,
    checklistPath,
    instructionsPath,
    coverPromptsPath,
    coverSpecsPath,
    issues,
  };
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  run.lastKdpPackageManifestPath = manifestPath;

  return manifest;
}
