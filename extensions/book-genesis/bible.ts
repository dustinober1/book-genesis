import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import type {
  RunState,
  StoryBible,
  StoryBibleCharacter,
  StoryBibleGlossaryEntry,
  StoryBibleRelationship,
  StoryBibleSetting,
  StoryBibleTimelineEvent,
  StoryBibleUpdate,
} from "./types.js";
import { ensureRunDirectories } from "./state.js";

function biblePaths(run: RunState) {
  return {
    markdownPath: path.join(run.rootDir, "foundation", "story-bible.md"),
    jsonPath: path.join(run.rootDir, "foundation", "story-bible.json"),
  };
}

function emptyStoryBible(): StoryBible {
  return {
    premise: "",
    themes: [],
    characters: [],
    relationships: [],
    settings: [],
    timeline: [],
    promises: [],
    motifs: [],
    glossary: [],
  };
}

function dedupeStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function mergeByKey<T>(current: T[], incoming: T[], keyFor: (item: T) => string) {
  const merged = new Map<string, T>();

  for (const item of current) {
    const key = keyFor(item).trim();
    if (key) {
      merged.set(key, item);
    }
  }

  for (const item of incoming) {
    const key = keyFor(item).trim();
    if (key) {
      merged.set(key, item);
    }
  }

  return Array.from(merged.values());
}

function cleanCharacter(item: StoryBibleCharacter): StoryBibleCharacter {
  return {
    id: item.id.trim(),
    name: item.name.trim(),
    role: item.role.trim(),
    desire: item.desire.trim(),
    fear: item.fear?.trim(),
    notes: item.notes ? dedupeStrings(item.notes) : undefined,
  };
}

function cleanRelationship(item: StoryBibleRelationship): StoryBibleRelationship {
  return {
    from: item.from.trim(),
    to: item.to.trim(),
    dynamic: item.dynamic.trim(),
    pressure: item.pressure?.trim(),
  };
}

function cleanSetting(item: StoryBibleSetting): StoryBibleSetting {
  return {
    name: item.name.trim(),
    function: item.function.trim(),
    rules: dedupeStrings(item.rules),
  };
}

function cleanTimelineEvent(item: StoryBibleTimelineEvent): StoryBibleTimelineEvent {
  return {
    point: item.point.trim(),
    event: item.event.trim(),
    consequence: item.consequence?.trim(),
  };
}

function cleanGlossaryEntry(item: StoryBibleGlossaryEntry): StoryBibleGlossaryEntry {
  return {
    term: item.term.trim(),
    definition: item.definition.trim(),
  };
}

function renderStringList(values: string[]) {
  return values.length > 0 ? values.map((value) => `- ${value}`).join("\n") : "- none";
}

function renderCharacterList(values: StoryBibleCharacter[]) {
  return values.length > 0
    ? values.map((item) => `- ${item.name} (${item.role}): wants ${item.desire}`).join("\n")
    : "- none";
}

function renderRelationshipList(values: StoryBibleRelationship[]) {
  return values.length > 0
    ? values.map((item) => `- ${item.from} -> ${item.to}: ${item.dynamic}`).join("\n")
    : "- none";
}

function renderSettingList(values: StoryBibleSetting[]) {
  return values.length > 0
    ? values.map((item) => `- ${item.name}: ${item.function} | rules: ${item.rules.join(", ") || "none"}`).join("\n")
    : "- none";
}

function renderTimeline(values: StoryBibleTimelineEvent[]) {
  return values.length > 0
    ? values.map((item) => `- ${item.point}: ${item.event}`).join("\n")
    : "- none";
}

function renderGlossary(values: StoryBibleGlossaryEntry[]) {
  return values.length > 0
    ? values.map((item) => `- ${item.term}: ${item.definition}`).join("\n")
    : "- none";
}

export function renderStoryBibleMarkdown(bible: StoryBible) {
  return [
    "# Story Bible",
    "",
    "## Premise",
    bible.premise || "None recorded yet.",
    "",
    "## Themes",
    renderStringList(bible.themes),
    "",
    "## Characters",
    renderCharacterList(bible.characters),
    "",
    "## Relationships",
    renderRelationshipList(bible.relationships),
    "",
    "## Settings",
    renderSettingList(bible.settings),
    "",
    "## Timeline",
    renderTimeline(bible.timeline),
    "",
    "## Promises",
    renderStringList(bible.promises),
    "",
    "## Motifs",
    renderStringList(bible.motifs),
    "",
    "## Glossary",
    renderGlossary(bible.glossary),
    "",
  ].join("\n");
}

export function readStoryBible(run: RunState): StoryBible {
  const { jsonPath } = biblePaths(run);
  if (!existsSync(jsonPath)) {
    return emptyStoryBible();
  }

  return JSON.parse(readFileSync(jsonPath, "utf8")) as StoryBible;
}

export function summarizeStoryBible(run: RunState) {
  const bible = readStoryBible(run);
  return [
    `Premise: ${bible.premise || "none"}`,
    `Themes: ${bible.themes.join(", ") || "none"}`,
    `Characters: ${bible.characters.map((item) => item.name).join(", ") || "none"}`,
    `Promises: ${bible.promises.join("; ") || "none"}`,
  ].join("\n");
}

export function upsertStoryBible(run: RunState, update: StoryBibleUpdate) {
  ensureRunDirectories(run.rootDir);

  const current = readStoryBible(run);
  const next: StoryBible = {
    premise: update.premise?.trim() || current.premise,
    themes: dedupeStrings([...(current.themes ?? []), ...(update.themes ?? [])]),
    characters: mergeByKey(current.characters, (update.characters ?? []).map(cleanCharacter), (item) => item.id || item.name),
    relationships: mergeByKey(current.relationships, (update.relationships ?? []).map(cleanRelationship), (item) =>
      `${item.from}:${item.to}:${item.dynamic}`),
    settings: mergeByKey(current.settings, (update.settings ?? []).map(cleanSetting), (item) => item.name),
    timeline: mergeByKey(current.timeline, (update.timeline ?? []).map(cleanTimelineEvent), (item) => `${item.point}:${item.event}`),
    promises: dedupeStrings([...(current.promises ?? []), ...(update.promises ?? [])]),
    motifs: dedupeStrings([...(current.motifs ?? []), ...(update.motifs ?? [])]),
    glossary: mergeByKey(current.glossary, (update.glossary ?? []).map(cleanGlossaryEntry), (item) => item.term),
  };

  const { markdownPath, jsonPath } = biblePaths(run);
  writeFileSync(jsonPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  writeFileSync(markdownPath, renderStoryBibleMarkdown(next), "utf8");

  run.storyBiblePath = markdownPath;
  run.storyBibleJsonPath = jsonPath;

  return { markdownPath, jsonPath, bible: next };
}
