import path from "node:path";

import type { RunState } from "./types.js";
import { readManuscript, writeJson, writeMarkdown } from "./run-files.js";

function author(run: RunState) {
  return run.config.kdp.authorName ?? "TODO Author Name";
}

function matterText(run: RunState, kind: string) {
  switch (kind) {
    case "title-page":
      return `# ${run.title}\n\n${author(run)}\n`;
    case "copyright":
      return `# Copyright\n\nCopyright (c) ${new Date().getFullYear()} ${author(run)}. All rights reserved.\n`;
    case "dedication":
      return "# Dedication\n\nTODO dedication.\n";
    case "author-note":
      return `# Author Note\n\nA note from ${author(run)} about ${run.title}.\n`;
    case "acknowledgments":
      return "# Acknowledgments\n\nTODO acknowledgments.\n";
    case "newsletter-cta":
      return "# Stay Connected\n\nJoin the author's newsletter for updates and bonus material.\n";
    case "also-by":
      return "# Also By\n\nTODO also-by list.\n";
    default:
      return `# ${kind.replace(/-/g, " ")}\n\nTODO.\n`;
  }
}

export function writeBookMatter(run: RunState) {
  const frontDir = path.join(run.rootDir, "delivery", "front-matter");
  const backDir = path.join(run.rootDir, "delivery", "back-matter");
  const frontFiles = run.config.bookMatter.frontMatter.map((kind) => writeMarkdown(path.join(frontDir, `${kind}.md`), matterText(run, kind)));
  const backFiles = run.config.bookMatter.backMatter.map((kind) => writeMarkdown(path.join(backDir, `${kind}.md`), matterText(run, kind)));
  const seriesPath = run.config.bookMatter.series
    ? writeJson(path.join(run.rootDir, "delivery", "series-metadata.json"), run.config.bookMatter.series)
    : null;
  return { frontFiles, backFiles, seriesPath };
}

export function buildMatterWrappedManuscript(run: RunState, manuscript = readManuscript(run)) {
  const front = run.config.bookMatter.frontMatter.map((kind) => matterText(run, kind)).join("\n\n");
  const back = run.config.bookMatter.backMatter.map((kind) => matterText(run, kind)).join("\n\n");
  return [front, manuscript, back].filter((part) => part.trim()).join("\n\n");
}
