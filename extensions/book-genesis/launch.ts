import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import type { RunState } from "./types.js";
import { ensureDir, plainText, readOptional, writeJson, writeMarkdown } from "./run-files.js";

function firstAvailable(run: RunState, relatives: string[]) {
  for (const relative of relatives) {
    const value = readOptional(path.join(run.rootDir, relative));
    if (value.trim()) return plainText(value);
  }
  return "";
}

function template(run: RunState, title: string, body: string) {
  return `# ${title}\n\n- Book: ${run.title}\n- Author: ${run.config.kdp.authorName ?? "TODO"}\n- Mode: ${run.config.bookMode}\n\n${body}\n`;
}

export function writeLaunchKit(run: RunState) {
  const dir = ensureDir(path.join(run.rootDir, "promotion", "launch-kit"));
  const synopsis = firstAvailable(run, ["delivery/package-summary.md", "delivery/synopsis.md", "delivery/one-page-synopsis.md"]) || run.idea;
  const logline = firstAvailable(run, ["delivery/logline.md"]) || run.kickoff?.promise || run.idea;
  const warnings: string[] = [];
  if (!synopsis) warnings.push("Missing synopsis/package summary.");
  if (!run.config.kdp.authorName) warnings.push("Missing kdp.authorName.");

  const files = [
    writeMarkdown(path.join(dir, "newsletter-sequence.md"), template(run, "Newsletter Sequence", `1. Announcement: ${logline}\n2. Behind the book: ${synopsis}\n3. Launch reminder: Invite readers to order, review, and share.`)),
    writeMarkdown(path.join(dir, "arc-reader-invite.md"), template(run, "ARC Reader Invite", "Invite early readers, state expectations, and request honest reviews after launch.")),
    writeMarkdown(path.join(dir, "book-club-questions.md"), template(run, "Book Club Questions", "1. What promise did the book make early?\n2. Which turn changed your interpretation most?\n3. What would you ask the author?")),
    writeMarkdown(path.join(dir, "press-kit.md"), template(run, "Press Kit", `## Short Description\n${logline}\n\n## Long Description\n${synopsis}`)),
    writeMarkdown(path.join(dir, "author-q-and-a.md"), template(run, "Author Q and A", "Q: Why this book now?\nA: Connect the premise to the target reader's current need.")),
    writeMarkdown(path.join(dir, "retailer-description-variants.md"), template(run, "Retailer Description Variants", `## Short\n${logline}\n\n## Long\n${synopsis}\n\n## High-Concept Hook\n${run.title}: ${logline}\n\n## Reader-Transformation Angle\nFor readers who want ${run.kickoff?.promise ?? "a clear payoff"}.\n\n## Series Angle\n${run.config.bookMatter.series ? `${run.config.bookMatter.series.name} book ${run.config.bookMatter.series.bookNumber}` : "No series configured."}`)),
    writeMarkdown(path.join(dir, "launch-social-calendar.md"), template(run, "Launch Social Calendar", "## 14-Day\n- Reveal hook\n- Share excerpt\n- Launch reminder\n\n## 30-Day\n- Cover, quote, excerpt, review prompts\n\n## 60-Day\n- ARC outreach, preorder, launch, review push")),
    writeMarkdown(path.join(dir, "website-homepage-copy.md"), template(run, "Website Homepage Copy", `${logline}\n\n${synopsis}`)),
  ];
  const manifest = {
    generatedAt: new Date().toISOString(),
    runId: run.id,
    files: [...files, path.join(dir, "launch-kit-manifest.json")],
    sourceInputs: ["delivery/package-summary.md", "delivery/synopsis.md", "delivery/logline.md", "kdp config"],
    warnings,
  };
  const manifestPath = writeJson(path.join(dir, "launch-kit-manifest.json"), manifest);
  return { manifest: { ...manifest, files: [...files, manifestPath] }, manifestPath };
}

export function launchKitReady(run: RunState) {
  const manifestPath = path.join(run.rootDir, "promotion", "launch-kit", "launch-kit-manifest.json");
  return existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) as { warnings?: string[] } : null;
}
