import path from "node:path";

import type { ManuscriptIntelligenceFinding, PacingDashboard, RunState, SceneEntry } from "./types.js";
import { countWords, listChapterFiles, plainText, writeJson, writeMarkdown } from "./run-files.js";

function splitScenes(markdown: string) {
  const chunks = markdown
    .split(/\n(?:-{3,}|\*{3,}|#{2,}\s+.+)\n/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean);
  return chunks.length > 0 ? chunks : [markdown.trim()].filter(Boolean);
}

function valence(text: string): SceneEntry["emotionalValence"] {
  const lower = text.toLowerCase();
  const positive = (lower.match(/\b(hope|joy|relief|love|win|safe|trust)\b/g) ?? []).length;
  const negative = (lower.match(/\b(fear|loss|danger|betray|fail|dead|panic)\b/g) ?? []).length;
  if (positive > 0 && negative > 0) return "mixed";
  if (positive > negative) return "positive";
  if (negative > positive) return "negative";
  return "neutral";
}

export function buildSceneMap(run: RunState) {
  const chapters = listChapterFiles(run);
  const scenes: SceneEntry[] = [];
  for (const chapter of chapters) {
    splitScenes(chapter.markdown).forEach((scene, index) => {
      const text = plainText(scene);
      scenes.push({
        chapter: chapter.title,
        sceneIndex: index + 1,
        title: scene.match(/^#{2,}\s+(.+)$/m)?.[1]?.trim(),
        wordCount: countWords(text),
        emotionalValence: run.config.sceneMap.includeEmotionalValence ? valence(text) : undefined,
        promisesSetup: run.config.sceneMap.includePromiseTracking && /\b(promise|vow|must|will)\b/i.test(text) ? [text.slice(0, 120)] : [],
        promisesPaidOff: run.config.sceneMap.includePromiseTracking && /\b(finally|paid off|resolved|revealed)\b/i.test(text) ? [text.slice(0, 120)] : [],
        continuityRisks: /\b(TODO|TBD|placeholder)\b/i.test(text) ? ["Placeholder text appears in scene."] : [],
      });
    });
  }
  return { generatedAt: new Date().toISOString(), runId: run.id, scenes };
}

export function buildPacingDashboard(run: RunState): PacingDashboard {
  const chapters = listChapterFiles(run);
  const totalWords = chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0);
  const averageChapterWords = chapters.length ? Math.round(totalWords / chapters.length) : 0;
  const sorted = [...chapters].sort((a, b) => a.wordCount - b.wordCount);
  const findings: ManuscriptIntelligenceFinding[] = [];
  for (const chapter of chapters) {
    if (averageChapterWords > 0 && chapter.wordCount > averageChapterWords * 1.75) {
      findings.push({ severity: "warning", code: "long_chapter_outlier", target: chapter.title, evidence: `${chapter.wordCount} words vs ${averageChapterWords} average.`, suggestedAction: "Split or tighten this chapter unless the pacing spike is intentional." });
    }
    if (averageChapterWords > 0 && chapter.wordCount < averageChapterWords * 0.45) {
      findings.push({ severity: "info", code: "short_chapter_outlier", target: chapter.title, evidence: `${chapter.wordCount} words vs ${averageChapterWords} average.`, suggestedAction: "Confirm the short beat has enough turn/payoff." });
    }
  }
  if (chapters.length === 0) {
    findings.push({ severity: "info", code: "no_chapters", target: "manuscript/chapters", evidence: "No chapter files found.", suggestedAction: "Draft chapter files before running pacing analysis." });
  }
  return {
    generatedAt: new Date().toISOString(),
    runId: run.id,
    totalWords,
    chapterCount: chapters.length,
    averageChapterWords,
    longestChapter: sorted.at(-1)?.title ?? null,
    shortestChapter: sorted[0]?.title ?? null,
    findings,
  };
}

export function writeSceneMap(run: RunState) {
  const report = buildSceneMap(run);
  const jsonPath = writeJson(path.join(run.rootDir, "evaluations", "scene-map.json"), report);
  const rows = report.scenes.map((scene) => `| ${scene.chapter} | ${scene.sceneIndex} | ${scene.title ?? ""} | ${scene.wordCount} | ${scene.emotionalValence ?? ""} | ${scene.promisesSetup.length} | ${scene.promisesPaidOff.length} |`);
  const mdPath = writeMarkdown(path.join(run.rootDir, "evaluations", "scene-map.md"), [
    `# Scene Map for ${run.id}`,
    "",
    "| Chapter | Scene | Title | Words | Valence | Setups | Payoffs |",
    "| --- | ---: | --- | ---: | --- | ---: | ---: |",
    ...(rows.length ? rows : ["| none | 0 | | 0 | | 0 | 0 |"]),
  ].join("\n"));
  return { report, jsonPath, mdPath };
}

export function writePacingDashboard(run: RunState) {
  const report = buildPacingDashboard(run);
  const jsonPath = writeJson(path.join(run.rootDir, "evaluations", "pacing-dashboard.json"), report);
  const mdPath = writeMarkdown(path.join(run.rootDir, "evaluations", "pacing-dashboard.md"), [
    `# Pacing Dashboard for ${run.id}`,
    "",
    `- Total words: ${report.totalWords}`,
    `- Chapters: ${report.chapterCount}`,
    `- Average chapter words: ${report.averageChapterWords}`,
    `- Longest chapter: ${report.longestChapter ?? "none"}`,
    `- Shortest chapter: ${report.shortestChapter ?? "none"}`,
    "",
    "## Findings",
    ...(report.findings.length ? report.findings.map((finding) => `- [${finding.severity.toUpperCase()}] ${finding.code}: ${finding.evidence} ${finding.suggestedAction}`) : ["- none"]),
  ].join("\n"));
  return { report, jsonPath, mdPath };
}
