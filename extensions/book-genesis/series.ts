import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { DEFAULT_RUN_CONFIG } from "./config.js";
import { countWords, plainText, readManuscript, writeJson, writeMarkdown } from "./run-files.js";
import { readRunState, slugify, writeRunState } from "./state.js";
import type { RunConfig, RunState, SeriesBookEntry, SeriesState } from "./types.js";

const SERIES_DIRNAME = "book-series";
const STATE_DIRNAME = ".book-genesis";
const SERIES_STATE_FILE = "series.json";

function nowIso() {
  return new Date().toISOString();
}

function ensureSeriesDirectories(rootDir: string) {
  const dirs = [
    rootDir,
    path.join(rootDir, STATE_DIRNAME),
    path.join(rootDir, "planning"),
    path.join(rootDir, "creative"),
    path.join(rootDir, "publishing"),
    path.join(rootDir, "continuity"),
  ];
  for (const dir of dirs) {
    mkdirSync(dir, { recursive: true });
  }
}

function normalizeBookStatus(run: RunState): SeriesBookEntry["status"] {
  if (run.status === "completed") {
    return "completed";
  }
  if (run.status === "running" || run.status === "awaiting_approval") {
    return "drafting";
  }
  return "planned";
}

function sortedBooks(series: Pick<SeriesState, "books">) {
  return [...series.books].sort((a, b) => a.bookNumber - b.bookNumber);
}

function previousTitle(series: SeriesState, bookNumber: number) {
  return sortedBooks(series).find((book) => book.bookNumber === bookNumber - 1)?.title;
}

function nextTeaser(series: SeriesState, bookNumber: number) {
  return bookNumber < series.plannedBookCount ? `Book ${bookNumber + 1} in ${series.name}` : undefined;
}

function nextBookNumber(series: SeriesState) {
  const planned = sortedBooks(series).find((book) => !book.runDir && book.status === "planned");
  if (planned) {
    return planned.bookNumber;
  }
  return Math.max(0, ...series.books.map((book) => book.bookNumber)) + 1;
}

function quoteCommandArg(value: string) {
  return value.includes(" ") ? `"${value.replace(/"/g, '\\"')}"` : value;
}

function formatBookLine(book: SeriesBookEntry) {
  const run = book.runDir ? ` (${book.runDir})` : "";
  return `- Book ${book.bookNumber}: ${book.title} [${book.status}]${run}`;
}

export function isSeriesDirectory(candidate: string) {
  const resolved = path.resolve(candidate);
  return existsSync(path.join(resolved, STATE_DIRNAME, SERIES_STATE_FILE));
}

export function createSeriesState(workspaceRoot: string, name: string, options: { plannedBookCount?: number } = {}): SeriesState {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error("A series name is required.");
  }
  const slugBase = slugify(trimmed);
  const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${slugBase}`;
  const rootDir = path.join(workspaceRoot, SERIES_DIRNAME, id);
  const statePath = path.join(rootDir, STATE_DIRNAME, SERIES_STATE_FILE);
  ensureSeriesDirectories(rootDir);

  const plannedBookCount = options.plannedBookCount && Number.isInteger(options.plannedBookCount) && options.plannedBookCount > 0
    ? options.plannedBookCount
    : 3;

  return {
    version: 1,
    id,
    slug: id,
    name: trimmed,
    workspaceRoot,
    rootDir,
    statePath,
    status: "planning",
    plannedBookCount,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    books: [],
    creative: {
      seriesPromise: `${trimmed} follows an escalating multi-book promise that should pay off across the full reading order.`,
      recurringCharacters: [],
      crossBookArcs: [
        "Book 1 establishes the central promise and main cast.",
        `The final book resolves the core ${trimmed} promise.`,
      ],
      unresolvedThreads: [],
      spinoffIdeas: [
        `A short prequel that introduces the world of ${trimmed}.`,
        "A side-character story that works as a newsletter lead magnet.",
      ],
    },
    publishing: {
      seriesName: trimmed,
      readingOrderNote: `Read ${trimmed} in numbered publication order.`,
      keywords: [],
      categories: [],
      launchPositioning: `${trimmed} is positioned as a connected book series with clear reading order and recurring story payoffs.`,
    },
  };
}

export function readSeriesState(seriesDir: string) {
  const resolved = path.resolve(seriesDir);
  const statePath = path.join(resolved, STATE_DIRNAME, SERIES_STATE_FILE);
  if (!existsSync(statePath)) {
    throw new Error(`Series state not found at ${statePath}`);
  }
  const raw = JSON.parse(readFileSync(statePath, "utf8")) as SeriesState;
  return {
    ...raw,
    rootDir: raw.rootDir || resolved,
    statePath,
    books: Array.isArray(raw.books) ? raw.books : [],
    plannedBookCount: Number.isInteger(raw.plannedBookCount) && raw.plannedBookCount > 0 ? raw.plannedBookCount : 3,
  };
}

export function writeSeriesState(series: SeriesState) {
  ensureSeriesDirectories(series.rootDir);
  series.updatedAt = nowIso();
  writeFileSync(series.statePath, `${JSON.stringify(series, null, 2)}\n`, "utf8");
}

export function listSeriesDirs(workspaceRoot: string) {
  const root = path.join(workspaceRoot, SERIES_DIRNAME);
  if (!existsSync(root)) {
    return [];
  }
  return readdirSync(root)
    .map((entry) => path.join(root, entry))
    .filter((entryPath) => isSeriesDirectory(entryPath))
    .sort()
    .reverse();
}

export function findLatestSeriesDir(workspaceRoot: string) {
  return listSeriesDirs(workspaceRoot)[0] ?? null;
}

export function addRunToSeries(seriesDir: string, runDir: string) {
  const series = readSeriesState(seriesDir);
  const run = readRunState(path.resolve(runDir));
  const existing = series.books.find((book) => book.runDir === run.rootDir || book.runId === run.id);
  const bookNumber = existing?.bookNumber ?? run.config.bookMatter.series?.bookNumber ?? nextBookNumber(series);
  const entry: SeriesBookEntry = {
    bookNumber,
    title: run.title,
    status: normalizeBookStatus(run),
    premise: run.idea,
    role: `Book ${bookNumber} of ${series.plannedBookCount} in ${series.name}`,
    runDir: run.rootDir,
    runId: run.id,
    linkedAt: existing?.linkedAt ?? nowIso(),
  };

  run.config = {
    ...run.config,
    bookMatter: {
      ...run.config.bookMatter,
      series: {
        name: series.name,
        bookNumber,
        ...(previousTitle(series, bookNumber) ? { previousTitle: previousTitle(series, bookNumber) } : {}),
        ...(nextTeaser(series, bookNumber) ? { nextTitleTeaser: nextTeaser(series, bookNumber) } : {}),
      },
    },
  };
  writeRunState(run);

  series.books = [
    ...series.books.filter((book) => book.bookNumber !== bookNumber && book.runDir !== run.rootDir && book.runId !== run.id),
    entry,
  ].sort((a, b) => a.bookNumber - b.bookNumber);
  series.status = series.books.some((book) => book.status === "drafting") ? "drafting" : series.status;
  writeSeriesState(series);
  return series;
}

function buildNextBookConfig(series: SeriesState, bookNumber: number): RunConfig {
  return {
    ...DEFAULT_RUN_CONFIG,
    bookMatter: {
      ...DEFAULT_RUN_CONFIG.bookMatter,
      series: {
        name: series.name,
        bookNumber,
        ...(previousTitle(series, bookNumber) ? { previousTitle: previousTitle(series, bookNumber) } : {}),
        ...(nextTeaser(series, bookNumber) ? { nextTitleTeaser: nextTeaser(series, bookNumber) } : {}),
      },
    },
    promotion: {
      ...DEFAULT_RUN_CONFIG.promotion,
      shortStoryPurpose: "content-series",
    },
  };
}

export function planNextSeriesBook(seriesDir: string, notes = "") {
  const series = readSeriesState(seriesDir);
  const bookNumber = nextBookNumber(series);
  const title = `Book ${bookNumber} in ${series.name}`;
  const planningDir = path.join(series.rootDir, "planning", `book-${String(bookNumber).padStart(2, "0")}`);
  const config = buildNextBookConfig(series, bookNumber);
  const configPath = writeJson(path.join(planningDir, "book-genesis.config.json"), config);
  const idea = `${series.name} book ${bookNumber}: ${notes.trim() || series.creative.seriesPromise}`;
  const brief = [
    `# ${title} Brief`,
    "",
    `- Series: ${series.name}`,
    `- Book number: ${bookNumber}`,
    `- Planned series length: ${series.plannedBookCount}`,
    `- Previous title: ${previousTitle(series, bookNumber) ?? "none"}`,
    `- Series promise: ${series.creative.seriesPromise}`,
    `- Operator notes: ${notes.trim() || "Use the series bible and prior book run artifacts to shape this book."}`,
    "",
    "## Required Continuity Checks",
    "",
    "- Preserve recurring cast facts from the series bible.",
    "- Resolve or intentionally advance open threads.",
    "- Keep the book readable as its numbered entry in the series.",
  ].join("\n");
  const briefPath = writeMarkdown(path.join(planningDir, "next-book-brief.md"), brief);
  const command = `/book-genesis run --config ${quoteCommandArg(configPath)} en ${quoteCommandArg(idea)}`;

  if (!series.books.some((book) => book.bookNumber === bookNumber)) {
    series.books.push({
      bookNumber,
      title,
      status: "planned",
      premise: idea,
      role: `Planned next entry in ${series.name}`,
    });
    series.books.sort((a, b) => a.bookNumber - b.bookNumber);
    writeSeriesState(series);
  }

  return { bookNumber, briefPath, configPath, command };
}

export function buildSeriesStatus(series: SeriesState) {
  return {
    seriesId: series.id,
    name: series.name,
    status: series.status,
    plannedBookCount: series.plannedBookCount,
    linkedBookCount: series.books.filter((book) => book.runDir).length,
    plannedOnlyCount: series.books.filter((book) => !book.runDir).length,
    books: sortedBooks(series),
    nextBookNumber: nextBookNumber(series),
  };
}

export function formatSeriesStatus(series: SeriesState) {
  const status = buildSeriesStatus(series);
  return [
    `Book Genesis series: ${status.name}`,
    "",
    `- Status: ${status.status}`,
    `- Planned books: ${status.plannedBookCount}`,
    `- Linked book runs: ${status.linkedBookCount}`,
    `- Planned-only entries: ${status.plannedOnlyCount}`,
    `- Next book number: ${status.nextBookNumber}`,
    "",
    "## Books",
    "",
    status.books.length ? status.books.map(formatBookLine).join("\n") : "No books linked yet.",
  ].join("\n");
}

export function writeSeriesBible(seriesDir: string) {
  const series = readSeriesState(seriesDir);
  const books = sortedBooks(series);
  const bible = {
    series: series.name,
    promise: series.creative.seriesPromise,
    books,
    recurringCharacters: series.creative.recurringCharacters,
    crossBookArcs: series.creative.crossBookArcs,
    unresolvedThreads: series.creative.unresolvedThreads,
    spinoffIdeas: series.creative.spinoffIdeas,
  };
  const markdown = [
    `# ${series.name} Series Bible`,
    "",
    "## Series Promise",
    "",
    series.creative.seriesPromise,
    "",
    "## Book Map",
    "",
    books.length ? books.map(formatBookLine).join("\n") : "- No books linked yet.",
    "",
    "## Cross-Book Arcs",
    "",
    series.creative.crossBookArcs.map((arc) => `- ${arc}`).join("\n") || "- No arcs recorded yet.",
    "",
    "## Recurring Characters",
    "",
    series.creative.recurringCharacters.map((character) => `- ${character}`).join("\n") || "- No recurring characters recorded yet.",
    "",
    "## Open Threads",
    "",
    series.creative.unresolvedThreads.map((thread) => `- ${thread.description} (${thread.status})`).join("\n") || "- No open threads recorded yet.",
    "",
    "## Spinoff And Short-Story Ideas",
    "",
    series.creative.spinoffIdeas.map((idea) => `- ${idea}`).join("\n") || "- No spinoff ideas recorded yet.",
  ].join("\n");
  return {
    markdownPath: writeMarkdown(path.join(series.rootDir, "creative", "series-bible.md"), markdown),
    jsonPath: writeJson(path.join(series.rootDir, "creative", "series-bible.json"), bible),
    bible,
  };
}

export function writeSeriesPublishingMetadata(seriesDir: string) {
  const series = readSeriesState(seriesDir);
  const books = sortedBooks(series);
  const metadata = {
    seriesName: series.publishing.seriesName,
    plannedBookCount: series.plannedBookCount,
    readingOrder: books.map((book) => ({
      bookNumber: book.bookNumber,
      title: book.title,
      status: book.status,
      runDir: book.runDir,
    })),
    keywords: series.publishing.keywords,
    categories: series.publishing.categories,
    launchPositioning: series.publishing.launchPositioning,
  };
  const readingOrder = [
    `# ${series.name} Reading Order`,
    "",
    series.publishing.readingOrderNote,
    "",
    books.length ? books.map((book) => `${book.bookNumber}. Book ${book.bookNumber}: ${book.title} (${book.status})`).join("\n") : "No books linked yet.",
  ].join("\n");
  const alsoBy = [
    "# Also By",
    "",
    `## ${series.name}`,
    "",
    books.length ? books.map((book) => `- Book ${book.bookNumber}: ${book.title}`).join("\n") : "- More books coming soon.",
  ].join("\n");
  const launch = [
    `# ${series.name} Launch Positioning`,
    "",
    series.publishing.launchPositioning,
    "",
    "## Series Metadata",
    "",
    `- Series name: ${series.publishing.seriesName}`,
    `- Planned books: ${series.plannedBookCount}`,
    `- Reading order: ${series.publishing.readingOrderNote}`,
  ].join("\n");
  return {
    metadataPath: writeJson(path.join(series.rootDir, "publishing", "series-metadata.json"), metadata),
    readingOrderPath: writeMarkdown(path.join(series.rootDir, "publishing", "reading-order.md"), readingOrder),
    alsoByPath: writeMarkdown(path.join(series.rootDir, "publishing", "also-by.md"), alsoBy),
    launchPositioningPath: writeMarkdown(path.join(series.rootDir, "publishing", "launch-positioning.md"), launch),
    metadata,
  };
}

export function writeSeriesContinuityReport(seriesDir: string) {
  const series = readSeriesState(seriesDir);
  const duplicateBookNumbers = series.books
    .map((book) => book.bookNumber)
    .filter((bookNumber, index, values) => values.indexOf(bookNumber) !== index);
  const missingLinkedRuns = series.books
    .filter((book) => book.runDir && !existsSync(book.runDir))
    .map((book) => ({ bookNumber: book.bookNumber, title: book.title, runDir: book.runDir }));
  const missingSeriesMetadata: Array<{ bookNumber: number; title: string; issue: string }> = [];
  const manuscriptWordCounts: Array<{ bookNumber: number; title: string; wordCount: number }> = [];

  for (const book of series.books) {
    if (!book.runDir || !existsSync(book.runDir)) {
      continue;
    }
    const run = readRunState(book.runDir);
    if (run.config.bookMatter.series?.name !== series.name || run.config.bookMatter.series.bookNumber !== book.bookNumber) {
      missingSeriesMetadata.push({ bookNumber: book.bookNumber, title: book.title, issue: "Run bookMatter.series does not match series state." });
    }
    manuscriptWordCounts.push({
      bookNumber: book.bookNumber,
      title: book.title,
      wordCount: countWords(plainText(readManuscript(run))),
    });
  }

  const openThreads = series.creative.unresolvedThreads.filter((thread) => thread.status === "open");
  const report = {
    seriesName: series.name,
    duplicateBookNumbers: Array.from(new Set(duplicateBookNumbers)),
    missingLinkedRuns,
    missingSeriesMetadata,
    openThreads,
    manuscriptWordCounts,
  };
  const markdown = [
    `# ${series.name} Continuity Report`,
    "",
    "## Structural Checks",
    "",
    `- Duplicate book numbers: ${report.duplicateBookNumbers.join(", ") || "none"}`,
    `- Missing linked runs: ${report.missingLinkedRuns.length}`,
    `- Series metadata mismatches: ${report.missingSeriesMetadata.length}`,
    "",
    "## Open Threads",
    "",
    openThreads.map((thread) => `- ${thread.description}`).join("\n") || "- No open threads recorded yet.",
    "",
    "## Manuscript Word Counts",
    "",
    manuscriptWordCounts.map((book) => `- Book ${book.bookNumber}: ${book.wordCount} words`).join("\n") || "- No linked manuscripts found.",
  ].join("\n");
  return {
    markdownPath: writeMarkdown(path.join(series.rootDir, "continuity", "continuity-report.md"), markdown),
    jsonPath: writeJson(path.join(series.rootDir, "continuity", "continuity-report.json"), report),
    report,
  };
}
