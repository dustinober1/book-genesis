import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { RunState } from "./types.js";

export function ensureDir(dir: string) {
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeJson(filePath: string, value: unknown) {
  ensureDir(path.dirname(filePath));
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  return filePath;
}

export function writeMarkdown(filePath: string, value: string) {
  ensureDir(path.dirname(filePath));
  writeFileSync(filePath, value.endsWith("\n") ? value : `${value}\n`, "utf8");
  return filePath;
}

export function readOptional(filePath: string) {
  return existsSync(filePath) ? readFileSync(filePath, "utf8") : "";
}

export function plainText(markdown: string) {
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

export function countWords(value: string) {
  return value.trim().split(/\s+/).filter(Boolean).length;
}

export function listChapterFiles(run: RunState) {
  const chapterDir = path.join(run.rootDir, "manuscript", "chapters");
  if (!existsSync(chapterDir)) {
    return [];
  }

  return readdirSync(chapterDir)
    .filter((entry) => entry.endsWith(".md"))
    .sort()
    .map((entry) => {
      const filePath = path.join(chapterDir, entry);
      const markdown = readFileSync(filePath, "utf8");
      const heading = markdown.match(/^#\s+(.+)$/m)?.[1]?.trim();
      return {
        name: entry,
        path: filePath,
        title: heading || entry.replace(/\.md$/, "").replace(/^\d+[-_]/, ""),
        markdown,
        text: plainText(markdown),
        wordCount: countWords(plainText(markdown)),
      };
    });
}

export function readManuscript(run: RunState) {
  const fullPath = path.join(run.rootDir, "manuscript", "full-manuscript.md");
  if (existsSync(fullPath)) {
    return readFileSync(fullPath, "utf8");
  }

  return listChapterFiles(run).map((chapter) => chapter.markdown).join("\n\n");
}

export function relativeToRun(run: RunState, filePath: string) {
  return path.relative(run.rootDir, filePath).replace(/\\/g, "/");
}

export function assertInsideRun(run: RunState, candidate: string) {
  const resolved = path.isAbsolute(candidate) ? candidate : path.resolve(run.rootDir, candidate);
  const relative = path.relative(run.rootDir, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error("Path must stay inside the active run directory.");
  }
  return resolved;
}
