import { existsSync } from "node:fs";
import path from "node:path";

import type { HealthCheckResult, LayoutProfileId, RunState } from "./types.js";
import { writeJson, writeMarkdown } from "./run-files.js";

export interface LayoutProfile {
  id: LayoutProfileId;
  label: string;
  trimSize: string;
  pdfMediaBox: { widthPoints: number; heightPoints: number };
  margins: { top: number; bottom: number; inside: number; outside: number };
  bodyFont: string;
  bodyFontSize: number;
  lineSpacing: number;
  chapterStart: "new-page" | "same-page";
}

const PROFILES: Record<LayoutProfileId, LayoutProfile> = {
  "fiction-paperback-6x9": {
    id: "fiction-paperback-6x9",
    label: "Fiction Paperback 6 x 9",
    trimSize: "6 x 9",
    pdfMediaBox: { widthPoints: 432, heightPoints: 648 },
    margins: { top: 54, bottom: 54, inside: 63, outside: 54 },
    bodyFont: "Garamond",
    bodyFontSize: 11,
    lineSpacing: 15,
    chapterStart: "new-page",
  },
  "nonfiction-paperback-6x9": {
    id: "nonfiction-paperback-6x9",
    label: "Nonfiction Paperback 6 x 9",
    trimSize: "6 x 9",
    pdfMediaBox: { widthPoints: 432, heightPoints: 648 },
    margins: { top: 54, bottom: 54, inside: 63, outside: 54 },
    bodyFont: "Minion Pro",
    bodyFontSize: 10.5,
    lineSpacing: 15,
    chapterStart: "new-page",
  },
  "devotional-paperback-6x9": {
    id: "devotional-paperback-6x9",
    label: "Devotional Paperback 6 x 9",
    trimSize: "6 x 9",
    pdfMediaBox: { widthPoints: 432, heightPoints: 648 },
    margins: { top: 58, bottom: 58, inside: 64, outside: 56 },
    bodyFont: "Palatino",
    bodyFontSize: 11.5,
    lineSpacing: 17,
    chapterStart: "new-page",
  },
  "childrens-large-square": {
    id: "childrens-large-square",
    label: "Children's Large Square",
    trimSize: "8.5 x 8.5",
    pdfMediaBox: { widthPoints: 612, heightPoints: 612 },
    margins: { top: 54, bottom: 54, inside: 54, outside: 54 },
    bodyFont: "Helvetica",
    bodyFontSize: 14,
    lineSpacing: 20,
    chapterStart: "same-page",
  },
  "large-print-6x9": {
    id: "large-print-6x9",
    label: "Large Print Paperback 6 x 9",
    trimSize: "6 x 9",
    pdfMediaBox: { widthPoints: 432, heightPoints: 648 },
    margins: { top: 58, bottom: 58, inside: 66, outside: 58 },
    bodyFont: "Georgia",
    bodyFontSize: 14,
    lineSpacing: 20,
    chapterStart: "new-page",
  },
};

export function getLayoutProfile(id: LayoutProfileId): LayoutProfile {
  const profile = PROFILES[id];
  if (!profile) {
    throw new Error(`Unsupported layout profile: ${id}`);
  }
  return profile;
}

export function resolveLayoutProfile(run: RunState): LayoutProfile {
  return getLayoutProfile(run.config.layoutProfiles.defaultProfile);
}

export function formatLayoutProfile(profile: LayoutProfile, run: RunState) {
  return [
    "# Interior Layout Profile",
    "",
    `- Run: ${run.id}`,
    `- Profile: ${profile.label}`,
    `- Trim size: ${profile.trimSize}`,
    `- PDF MediaBox: ${profile.pdfMediaBox.widthPoints} x ${profile.pdfMediaBox.heightPoints} pt`,
    `- Body font: ${profile.bodyFont}`,
    `- Body font size: ${profile.bodyFontSize}`,
    `- Line spacing: ${profile.lineSpacing}`,
    `- Margins: top ${profile.margins.top}, bottom ${profile.margins.bottom}, inside ${profile.margins.inside}, outside ${profile.margins.outside}`,
    `- Chapter start: ${profile.chapterStart}`,
    "",
  ].join("\n");
}

export function writeLayoutProfileReport(run: RunState) {
  const profile = resolveLayoutProfile(run);
  const jsonPath = writeJson(path.join(run.rootDir, "delivery", "layout-profile.json"), profile);
  const markdownPath = writeMarkdown(path.join(run.rootDir, "delivery", "layout-profile.md"), formatLayoutProfile(profile, run));
  return { profile, jsonPath, markdownPath };
}

export function layoutProfileReadiness(run: RunState): HealthCheckResult[] {
  if (!run.config.layoutProfiles.enabled) {
    return [{ ok: true, severity: "info", code: "layout_profile_disabled", message: "Layout profiles are disabled for this run." }];
  }
  const reportPath = path.join(run.rootDir, "delivery", "layout-profile.json");
  const required = run.config.layoutProfiles.requireProfileForPaperback && run.config.kdp.formats.includes("paperback");
  if (existsSync(reportPath)) {
    return [{ ok: true, severity: "info", code: "layout_profile_present", message: "Interior layout profile report is present." }];
  }
  return [{
    ok: !required,
    severity: required ? "warning" : "info",
    code: "layout_profile_missing",
    message: "Interior layout profile report has not been generated.",
    remedy: "Run /book-genesis layout-profile.",
  }];
}
