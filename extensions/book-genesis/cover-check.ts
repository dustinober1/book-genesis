import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import type { KdpPreflightIssue, RunState } from "./types.js";
import { assertInsideRun, plainText, readManuscript, writeJson, writeMarkdown } from "./run-files.js";

function pngDimensions(buffer: Buffer) {
  if (buffer.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function jpegDimensions(buffer: Buffer) {
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) return null;
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xc3) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  return null;
}

function estimatePages(run: RunState) {
  const words = plainText(readManuscript(run)).split(/\s+/).filter(Boolean).length;
  return words ? Math.max(24, Math.ceil(words / 300)) : 0;
}

export function checkCoverAsset(run: RunState, coverPath: string, target: "ebook" | "paperback" = "ebook") {
  const resolved = assertInsideRun(run, coverPath);
  const issues: KdpPreflightIssue[] = [];
  if (!existsSync(resolved)) {
    issues.push({ severity: "error", code: "cover_missing", message: `Cover asset not found: ${resolved}` });
    return { generatedAt: new Date().toISOString(), runId: run.id, target, coverPath: resolved, dimensions: null, issues };
  }
  const extension = path.extname(resolved).toLowerCase();
  const buffer = readFileSync(resolved);
  const dimensions = extension === ".png" ? pngDimensions(buffer) : extension === ".jpg" || extension === ".jpeg" ? jpegDimensions(buffer) : null;
  if (target === "ebook") {
    if (![".png", ".jpg", ".jpeg"].includes(extension)) {
      issues.push({ severity: "error", code: "ebook_cover_extension", message: "eBook cover must be JPEG or PNG for this validator." });
    } else if (!dimensions) {
      issues.push({ severity: "error", code: "cover_dimensions_unreadable", message: "Could not read image dimensions." });
    } else {
      if (dimensions.width < run.config.coverCheck.minEbookWidth || dimensions.height < run.config.coverCheck.minEbookHeight) {
        issues.push({ severity: "error", code: "ebook_cover_undersized", message: `Cover is ${dimensions.width}x${dimensions.height}; minimum is ${run.config.coverCheck.minEbookWidth}x${run.config.coverCheck.minEbookHeight}.` });
      } else {
        issues.push({ severity: "info", code: "ebook_cover_size_ok", message: `Cover is ${dimensions.width}x${dimensions.height}.` });
      }
      const ratio = dimensions.height / dimensions.width;
      if (Math.abs(ratio - 1.6) > 0.12) {
        issues.push({ severity: "warning", code: "ebook_cover_ratio", message: `Cover aspect ratio is ${ratio.toFixed(2)}; KDP eBook covers usually target about 1.6.` });
      }
    }
    if (statSync(resolved).size > 50 * 1024 * 1024) {
      issues.push({ severity: "error", code: "ebook_cover_too_large", message: "Cover exceeds 50 MB." });
    }
  } else {
    if (extension !== ".pdf") {
      issues.push({ severity: "warning", code: "paperback_cover_pdf_expected", message: "Paperback covers should be final wrap PDFs." });
    }
    const pages = estimatePages(run);
    issues.push({ severity: pages >= 79 ? "info" : "warning", code: "paperback_spine_eligibility", message: pages >= 79 ? `Estimated ${pages} pages; spine text may be allowed after KDP preview.` : `Estimated ${pages || "unknown"} pages; avoid spine text unless final KDP page count is at least 79.` });
  }
  return { generatedAt: new Date().toISOString(), runId: run.id, target, coverPath: resolved, dimensions, issues };
}

export function writeCoverCheck(run: RunState, coverPath: string, target: "ebook" | "paperback" = "ebook") {
  const report = checkCoverAsset(run, coverPath, target);
  const jsonPath = writeJson(path.join(run.rootDir, "delivery", "kdp", "cover-check.json"), report);
  const mdPath = writeMarkdown(path.join(run.rootDir, "delivery", "kdp", "cover-check.md"), [
    `# Cover Check for ${run.id}`,
    "",
    `- Target: ${target}`,
    `- Cover: ${report.coverPath}`,
    `- Dimensions: ${report.dimensions ? `${report.dimensions.width}x${report.dimensions.height}` : "n/a"}`,
    "",
    ...report.issues.map((issue) => `- [${issue.severity.toUpperCase()}] ${issue.code}: ${issue.message}`),
  ].join("\n"));
  return { report, jsonPath, mdPath };
}
