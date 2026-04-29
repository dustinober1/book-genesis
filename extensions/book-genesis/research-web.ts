import type { RunState } from "./types.js";

export interface ResearchSearchResult {
  title: string;
  url: string;
  snippet: string;
}

function cleanText(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function collectRelatedTopics(value: unknown): ResearchSearchResult[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const results: ResearchSearchResult[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    if (Array.isArray(record.Topics)) {
      results.push(...collectRelatedTopics(record.Topics));
      continue;
    }

    const text = cleanText(record.Text);
    const url = cleanText(record.FirstURL);
    if (text && url) {
      results.push({
        title: text.split(" - ")[0].slice(0, 120),
        url,
        snippet: text,
      });
    }
  }
  return results;
}

export function normalizeSearchResults(payload: unknown): ResearchSearchResult[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }

  const record = payload as Record<string, unknown>;
  const results: ResearchSearchResult[] = [];
  const abstractText = cleanText(record.AbstractText);
  const abstractUrl = cleanText(record.AbstractURL);
  const heading = cleanText(record.Heading) || "DuckDuckGo abstract";

  if (abstractText && abstractUrl) {
    results.push({ title: heading, url: abstractUrl, snippet: abstractText });
  }

  results.push(...collectRelatedTopics(record.RelatedTopics));

  const seen = new Set<string>();
  return results.filter((result) => {
    if (seen.has(result.url)) return false;
    seen.add(result.url);
    return true;
  });
}

export async function searchInternet(query: string, maxResults = 5): Promise<ResearchSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    throw new Error("Search query is required.");
  }

  const url = new URL("https://api.duckduckgo.com/");
  url.searchParams.set("q", trimmed);
  url.searchParams.set("format", "json");
  url.searchParams.set("no_html", "1");
  url.searchParams.set("skip_disambig", "1");

  const response = await fetch(url, {
    headers: {
      "accept": "application/json",
      "user-agent": "Book Genesis PI research tool",
    },
  });
  if (!response.ok) {
    throw new Error(`Internet search failed with HTTP ${response.status}.`);
  }

  return normalizeSearchResults(await response.json()).slice(0, Math.max(1, Math.min(10, maxResults)));
}

export async function fetchResearchUrl(url: string, maxCharacters = 6000) {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http and https URLs can be fetched.");
  }

  const response = await fetch(parsed, {
    headers: {
      "accept": "text/html,text/plain,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.5",
      "user-agent": "Book Genesis PI research tool",
    },
  });
  if (!response.ok) {
    throw new Error(`URL fetch failed with HTTP ${response.status}.`);
  }

  const text = await response.text();
  return text
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, Math.max(500, Math.min(20000, maxCharacters)));
}

export function buildResearchWebGuidance(run: RunState) {
  if (run.currentPhase !== "research") {
    return "";
  }

  return [
    "Internet research tools:",
    "- Use `book_genesis_web_search` for current comp titles, market positioning, audience expectations, nonfiction source context, and publishing/category signals.",
    "- Use `book_genesis_fetch_url` to inspect a specific result when the search snippet is not enough.",
    "- Record every material source with `book_genesis_record_source`, including URL, summary, and why it mattered.",
    "- If web search fails, call `book_genesis_report_failure` with `retryable: true` instead of inventing current market facts.",
  ].join("\n");
}

export function formatSearchResults(results: ResearchSearchResult[]) {
  return results.length
    ? results.map((result, index) => `${index + 1}. ${result.title}\n${result.url}\n${result.snippet}`).join("\n\n")
    : "No search results returned. Try a narrower query with genre, audience, or comparable title terms.";
}
