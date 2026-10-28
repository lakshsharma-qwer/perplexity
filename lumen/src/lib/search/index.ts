import { activeEngines } from "./engines";
import { domainOf, normalizeUrl } from "../util";
import type { Doc, Focus, SearchHit } from "../types";

const FOCUS_SITES: Partial<Record<Focus, string>> = {
  academic: "(site:arxiv.org OR site:ncbi.nlm.nih.gov OR site:nature.com OR site:sciencedirect.com OR site:semanticscholar.org OR site:acm.org)",
  social: "site:reddit.com",
  video: "site:youtube.com",
};

// Pages that rarely contain readable answers.
const JUNK =
  /(pinterest\.|facebook\.com|instagram\.com|tiktok\.com|linkedin\.com\/(posts|pulse)|quizlet\.com|coursehero\.com|chegg\.com|wikipedia\.org\/wiki\/(Portal|Talk|User|Template|Category|Wikipedia|Special|File|Help)(:|%3A))/i;

const DEADLINE_MS = Number(process.env.SEARCH_DEADLINE_MS || 4500);

/** A slow engine shouldn't hold up the answer: whatever hasn't returned by the deadline is dropped. */
function withDeadline(p: Promise<SearchHit[]>, ms = DEADLINE_MS): Promise<SearchHit[]> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([p, new Promise<SearchHit[]>((r) => (timer = setTimeout(() => r([]), ms)))]).finally(() => clearTimeout(timer));
}

export interface MultiSearchResult {
  docs: Doc[];
  engineCounts: Record<string, number>;
}

/**
 * Runs every query on every active engine in parallel and merges the results with
 * weighted Reciprocal Rank Fusion, so pages that several engines/queries agree on rise.
 */
export async function multiSearch(
  queries: string[],
  opts: { focus?: Focus; excludeDomains?: string[]; signal?: AbortSignal } = {},
): Promise<MultiSearchResult> {
  const focus = opts.focus || "web";
  let engines = activeEngines(focus);
  if (!engines.length) engines = activeEngines("web");
  const suffix = FOCUS_SITES[focus];

  const jobs: Promise<SearchHit[]>[] = [];
  for (const q of queries) {
    for (const e of engines) {
      const fq = e.siteFilters && suffix ? `${q} ${suffix}` : focus === "news" && e.siteFilters ? `${q} news` : q;
      jobs.push(withDeadline(e.search(fq, opts.signal).catch(() => []), e.deadlineMs));
    }
  }
  const all = (await Promise.all(jobs)).flat();
  const weight = Object.fromEntries(engines.map((e) => [e.name, e.weight]));

  const exclude = (opts.excludeDomains || []).map((d) => d.toLowerCase());
  const engineCounts: Record<string, number> = {};
  const merged = new Map<string, Doc>();
  for (const h of all) {
    engineCounts[h.engine] = (engineCounts[h.engine] || 0) + 1;
    const domain = domainOf(h.url);
    if (JUNK.test(h.url) || exclude.some((d) => domain === d || domain.endsWith("." + d) || h.url.includes(d))) continue;
    const key = normalizeUrl(h.url);
    const rrf = (weight[h.engine] ?? 1) / (60 + h.rank);
    const cur = merged.get(key);
    if (cur) {
      cur.fusedScore += rrf;
      if (!cur.engines.includes(h.engine)) cur.engines.push(h.engine);
      if (h.snippet.length > cur.snippet.length) cur.snippet = h.snippet;
      if (!cur.title && h.title) cur.title = h.title;
      if (h.content && !cur.text) cur.text = h.content;
    } else {
      merged.set(key, { url: h.url, title: h.title, domain, snippet: h.snippet, engines: [h.engine], fusedScore: rrf, text: h.content || "" });
    }
  }
  const docs = [...merged.values()].sort((a, b) => b.fusedScore - a.fusedScore);
  return { docs, engineCounts };
}
