import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { RunState, ShortStoryBrainstorm, ShortStoryConcept, ShortStoryPackageManifest } from "./types.js";

function clean(value: string | undefined, fallback: string) {
  return value?.trim() || fallback;
}

function targetWordsForPages(maxPages: number) {
  const upper = Math.min(maxPages * 250, 3750);
  const lower = Math.max(1200, Math.min(2500, upper - 750));
  return `${lower}-${upper}`;
}

function renderConcept(concept: ShortStoryConcept) {
  return [
    `## ${concept.recommended ? "Recommended: " : ""}${concept.title}`,
    "",
    `- Hook: ${concept.hook}`,
    `- Emotional promise: ${concept.emotionalPromise}`,
    `- Protagonist / POV: ${concept.protagonistPov}`,
    `- Connection to the book: ${concept.connectionToBook}`,
    `- Spoiler risk: ${concept.spoilerRisk}`,
    `- Website positioning: ${concept.websitePositioning}`,
  ].join("\n");
}

export function buildShortStoryBrainstorm(run: RunState, notes = ""): ShortStoryBrainstorm {
  const genre = clean(run.kickoff?.genre, run.config.bookMode.replace(/-/g, " "));
  const tone = clean(run.kickoff?.tone ?? run.config.tone, "commercial and emotionally specific");
  const audience = clean(run.kickoff?.targetReader ?? run.config.audience, "future readers of the book");
  const promise = clean(run.kickoff?.promise, run.idea);
  const maxPages = run.config.promotion.shortStoryMaxPages;
  const targetWords = targetWordsForPages(maxPages);
  const noteSignal = notes.trim() ? ` Use this extra direction: ${notes.trim()}` : "";
  const baseConnection = `Shares the ${genre} flavor, ${tone} tone, and reader promise without spoiling the main book.`;
  const concepts: ShortStoryConcept[] = [
    {
      title: `The First Signal`,
      hook: `A small incident reveals the emotional rules behind ${run.title}.`,
      emotionalPromise: promise,
      protagonistPov: "A side character or early witness with a complete mini-arc.",
      connectionToBook: baseConnection,
      spoilerRisk: "low",
      websitePositioning: `Best free starter for ${audience}; includes a clear invitation to read the full book later.`,
      recommended: true,
    },
    {
      title: `Before the Door Opens`,
      hook: "A prequel moment shows the cost of saying yes before the main plot begins.",
      emotionalPromise: `A concentrated dose of ${tone} tension and payoff.`,
      protagonistPov: "Close third or first person from a character adjacent to the main conflict.",
      connectionToBook: "Builds appetite for the book world while keeping the central reveal untouched.",
      spoilerRisk: "low",
      websitePositioning: "Use as an email signup incentive with a direct bridge into the coming book.",
      recommended: false,
    },
    {
      title: `The Rule Everyone Breaks`,
      hook: "A compact story dramatizes one world rule, social rule, or emotional rule from the book.",
      emotionalPromise: "Readers understand the stakes fast and feel the genre promise land.",
      protagonistPov: "A new character who can win or lose without affecting manuscript continuity.",
      connectionToBook: "Teaches the book's flavor through action instead of exposition.",
      spoilerRisk: "low",
      websitePositioning: "Strong homepage teaser because it explains the premise through story.",
      recommended: false,
    },
    {
      title: `A Favor Paid in Secrets`,
      hook: "A favor turns into a reveal that changes how the protagonist sees the world.",
      emotionalPromise: "Mystery, intimacy, and a clean final turn.",
      protagonistPov: "A minor ally, mentor, witness, or future antagonist.",
      connectionToBook: "Adds texture to the book's emotional ecosystem without resolving the main plot.",
      spoilerRisk: "medium",
      websitePositioning: "Good bonus for readers who already know the premise.",
      recommended: false,
    },
    {
      title: `One Night in the Margins`,
      hook: "A single-night episode captures the mood, stakes, and hidden longing of the larger book.",
      emotionalPromise: `A self-contained ${genre} experience under ${maxPages} pages.`,
      protagonistPov: "A character with one clear desire and one meaningful obstacle.",
      connectionToBook: baseConnection,
      spoilerRisk: "low",
      websitePositioning: "Ideal as a downloadable PDF or serialized blog post.",
      recommended: false,
    },
  ];

  if (run.config.promotion.shortStoryPurpose === "content-series") {
    concepts.push({
      title: `Three Doors Into ${run.title}`,
      hook: "A set of linked flash-length incidents introduces three angles on the book world.",
      emotionalPromise: "Recurring website content with a shared final question.",
      protagonistPov: "Rotating POVs from three non-spoiler characters.",
      connectionToBook: "Creates a repeatable content series without draining main-book scenes.",
      spoilerRisk: "medium",
      websitePositioning: "Publish as three website posts with one signup CTA.",
      recommended: false,
    });
  }

  const markdown = [
    "# Companion Short Story Brainstorm",
    "",
    `- Run: ${run.id}`,
    `- Purpose: ${run.config.promotion.shortStoryPurpose}`,
    `- Max pages: ${maxPages}`,
    `- Target words: ${targetWords}`,
    `- Audience: ${audience}`,
    `- Notes: ${notes.trim() || "none"}`,
    "",
    ...concepts.map(renderConcept),
    "",
    `All concepts are designed to stay under ${maxPages} pages.${noteSignal}`,
    "",
  ].join("\n");

  return {
    runId: run.id,
    purpose: run.config.promotion.shortStoryPurpose,
    maxPages,
    targetWords,
    concepts,
    markdown,
  };
}

function selectedConcept(run: RunState, title: string) {
  const brainstorm = buildShortStoryBrainstorm(run);
  return brainstorm.concepts.find((concept) => concept.title.toLowerCase() === title.trim().toLowerCase())
    ?? {
      ...brainstorm.concepts[0],
      title: title.trim() || brainstorm.concepts[0].title,
      recommended: true,
    };
}

export function writeShortStoryPackage(run: RunState, selectedTitle: string): ShortStoryPackageManifest {
  if (!run.config.promotion.shortStoryEnabled) {
    throw new Error("Short-story promotion is disabled for this run.");
  }

  const concept = selectedConcept(run, selectedTitle);
  const dir = path.join(run.rootDir, "promotion", "short-story-package");
  mkdirSync(dir, { recursive: true });
  const maxPages = run.config.promotion.shortStoryMaxPages;
  const targetWords = targetWordsForPages(maxPages);
  const audience = clean(run.kickoff?.targetReader ?? run.config.audience, "future readers");
  const promise = clean(run.kickoff?.promise, run.idea);
  const tone = clean(run.kickoff?.tone ?? run.config.tone, "book-matched");

  const files = [
    path.join(dir, "story.md"),
    path.join(dir, "story-brief.md"),
    path.join(dir, "landing-page-copy.md"),
    path.join(dir, "email-signup-copy.md"),
    path.join(dir, "social-posts.md"),
    path.join(dir, "seo-notes.md"),
  ];

  writeFileSync(files[0], [
    `# ${concept.title}`,
    "",
    `Author note: This companion short story is designed as a ${run.config.promotion.shortStoryPurpose} for ${run.title}. It must stay under ${maxPages} pages, with a target length of ${targetWords} words.`,
    "",
    "## Story Draft",
    "",
    `The story opens with ${concept.protagonistPov.toLowerCase()} facing a smaller version of the central promise: ${promise}`,
    "",
    `The middle should lean into a ${tone} flavor, giving readers a complete turn while preserving the main book's larger reveals.`,
    "",
    `The ending resolves this short-story conflict and points emotionally toward ${run.title} without spoiling it.`,
    "",
  ].join("\n"), "utf8");

  writeFileSync(files[1], [
    "# Short Story Brief",
    "",
    `- Concept: ${concept.title}`,
    `- Hook: ${concept.hook}`,
    `- Emotional promise: ${concept.emotionalPromise}`,
    `- POV: ${concept.protagonistPov}`,
    `- Connection: ${concept.connectionToBook}`,
    `- Spoiler risk: ${concept.spoilerRisk}`,
    `- Target length: ${targetWords} words, under ${maxPages} pages`,
    "",
  ].join("\n"), "utf8");

  writeFileSync(files[2], [
    "# Landing Page Copy",
    "",
    "## Lead Magnet Headline",
    `Read "${concept.title}", a free companion short story for ${run.title}.`,
    "",
    "## Signup Promise",
    `Get a ${tone} standalone story built for ${audience}, with the same flavor as the upcoming book and no major spoilers.`,
    "",
    "## Call To Action",
    "Send me the free story.",
    "",
  ].join("\n"), "utf8");

  writeFileSync(files[3], [
    "# Email Signup Copy",
    "",
    `Get the free companion story for ${run.title} by email.`,
    "",
    `This short read gives you the flavor of the book in under ${maxPages} pages.`,
    "",
  ].join("\n"), "utf8");

  writeFileSync(files[4], [
    "# Social Posts",
    "",
    `1. Want the first taste of ${run.title}? Read the free companion story "${concept.title}".`,
    `2. A ${tone} short story for ${audience}, built to stand alone before the book arrives.`,
    "3. Sign up for the free story and get the world, mood, and promise without spoilers.",
    "",
  ].join("\n"), "utf8");

  writeFileSync(files[5], [
    "# SEO Notes",
    "",
    `- Primary angle: free ${run.config.bookMode.replace(/-/g, " ")} short story`,
    `- Audience: ${audience}`,
    `- Search promise: companion short story for readers interested in ${run.title}`,
    "- Internal CTA: invite readers from story page to book updates.",
    "",
  ].join("\n"), "utf8");

  return {
    files,
    selectedConcept: concept.title,
    maxPages,
  };
}
