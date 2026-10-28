import { parseHTML } from "linkedom";
import { fetchWithTimeout, politeFetch, cleanText } from "../util";
import type { Focus, SearchHit } from "../types";
import { searchWithContent } from "../wikipedia";

/**
 * Every engine here is an official API or open-source metasearch the user runs
 * themselves. Free, no-key engines are always on; keyed ones switch on when their
 * env var is set (most have a free tier).
 */
export interface Engine {
  name: string;
  /** Multiplier on its Reciprocal Rank Fusion contribution. */
  weight: number;
  focuses: Focus[];
  /** Per-engine deadline override; Wikipedia waits in our own rate limiter, so it gets longer. */
  deadlineMs?: number;
  /** Whether a "site:" filter in the query is understood. */
  siteFilters?: boolean;
  enabled: () => boolean;
  search: (q: string, signal?: AbortSignal) => Promise<SearchHit[]>;
}

const strip = (s = "") => cleanText(s.replace(/<[^>]+>/g, " ").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&#39;/g, "'"));
const ALL: Focus[] = ["web", "academic", "social", "video", "news"];

type Row = { url: string; title?: string; snippet?: string };
const toHits = (name: string, rows: Row[]): SearchHit[] =>
  rows.filter((r) => r.url?.startsWith("http")).map((r, i) => ({ url: r.url, title: strip(r.title || r.url), snippet: strip(r.snippet), engine: name, rank: i + 1 }));

async function getJson(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const res = await politeFetch(url, { timeoutMs: 7000, ...init }, 1);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// ---------- free, no key ----------

const wikipedia: Engine = {
  name: "wikipedia",
  weight: 1,
  focuses: ["web", "academic", "news", "wiki"],
  deadlineMs: 60_000,
  enabled: () => true,
  async search(q, signal) {
    const pages = await searchWithContent(q.replace(/site:\S+|\(|\)|\bOR\b/g, " ").trim(), 5, signal);
    return pages.map((p, i) => ({
      url: p.url,
      title: p.title,
      snippet: (p.text.split("\n").find((l) => l.length > 80 && !/^[\w ]{1,30}:/.test(l) && !l.includes(" | ")) || p.text).slice(0, 280),
      engine: "wikipedia",
      rank: i + 1,
      content: p.text,
    }));
  },
};

const ddgInstant: Engine = {
  name: "duckduckgo",
  weight: 1,
  focuses: ["web"],
  enabled: () => true,
  async search(q, signal) {
    const d = await getJson(`https://api.duckduckgo.com/?format=json&no_html=1&skip_disambig=1&q=${encodeURIComponent(q)}`, { signal });
    const rows: Row[] = [];
    if (d.AbstractURL && d.AbstractText) rows.push({ url: d.AbstractURL, title: d.Heading, snippet: d.AbstractText });
    for (const r of d.Results || []) rows.push({ url: r.FirstURL, title: r.Text, snippet: r.Text });
    return toHits("duckduckgo", rows);
  },
};

const marginalia: Engine = {
  name: "marginalia",
  weight: 0.6,
  focuses: ["web"],
  enabled: () => process.env.DISABLE_MARGINALIA !== "1",
  async search(q, signal) {
    const key = process.env.MARGINALIA_API_KEY || "public";
    const d = await getJson(`https://api.marginalia.nu/${key}/search/${encodeURIComponent(q)}?count=10`, { signal, timeoutMs: 5000 });
    return toHits("marginalia", (d.results || []).map((r: { url: string; title: string; description: string }) => ({ url: r.url, title: r.title, snippet: r.description })));
  },
};

const hackernews: Engine = {
  name: "hackernews",
  weight: 0.5,
  focuses: ["web", "social", "news"],
  enabled: () => true,
  async search(q, signal) {
    const d = await getJson(`https://hn.algolia.com/api/v1/search?tags=story&hitsPerPage=8&query=${encodeURIComponent(q)}`, { signal });
    return toHits(
      "hackernews",
      (d.hits || []).map((h: { url?: string; title: string; objectID: string; story_text?: string }) => ({
        url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        title: h.title,
        snippet: h.story_text?.slice(0, 300),
      })),
    );
  },
};

const stackexchange: Engine = {
  name: "stackexchange",
  weight: 0.5,
  focuses: ["social"],
  enabled: () => true,
  async search(q, signal) {
    const d = await getJson(
      `https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&site=stackoverflow&pagesize=6&accepted=True&q=${encodeURIComponent(q)}${
        process.env.STACKEXCHANGE_KEY ? `&key=${process.env.STACKEXCHANGE_KEY}` : ""
      }`,
      { signal },
    );
    return toHits("stackexchange", (d.items || []).map((r: { link: string; title: string }) => ({ url: r.link, title: r.title })));
  },
};

const arxiv: Engine = {
  name: "arxiv",
  weight: 1,
  focuses: ["academic"],
  enabled: () => true,
  async search(q, signal) {
    const res = await fetchWithTimeout(`https://export.arxiv.org/api/query?max_results=6&search_query=all:${encodeURIComponent(q)}`, { signal, timeoutMs: 8000 });
    const { document } = parseHTML(await res.text());
    const rows: Row[] = [];
    document.querySelectorAll("entry").forEach((e: Element) => {
      rows.push({
        url: (e.querySelector("id")?.textContent || "").replace("http://", "https://"),
        title: e.querySelector("title")?.textContent || "",
        snippet: e.querySelector("summary")?.textContent || "",
      });
    });
    return toHits("arxiv", rows);
  },
};

const openalex: Engine = {
  name: "openalex",
  weight: 0.8,
  focuses: ["academic"],
  enabled: () => true,
  async search(q, signal) {
    const mail = process.env.OPENALEX_EMAIL ? `&mailto=${encodeURIComponent(process.env.OPENALEX_EMAIL)}` : "";
    const d = await getJson(`https://api.openalex.org/works?per-page=6&search=${encodeURIComponent(q)}${mail}`, { signal });
    return toHits(
      "openalex",
      (d.results || []).map((w: { doi?: string; id: string; display_name: string; publication_year?: number }) => ({
        url: w.doi || w.id,
        title: w.display_name,
        snippet: w.publication_year ? `Published ${w.publication_year}` : "",
      })),
    );
  },
};

// ---------- self-hosted metasearch ----------

const searxng: Engine = {
  name: "searxng",
  weight: 1.2,
  focuses: ALL,
  siteFilters: true,
  enabled: () => !!process.env.SEARXNG_URL,
  async search(q, signal) {
    const d = await getJson(`${process.env.SEARXNG_URL}/search?format=json&q=${encodeURIComponent(q)}`, { signal });
    return toHits("searxng", (d.results || []).slice(0, 15).map((r: { url: string; title: string; content?: string }) => ({ url: r.url, title: r.title, snippet: r.content })));
  },
};

// ---------- keyed web search APIs (free tiers available) ----------

function keyed(name: string, envKey: string, call: (q: string, key: string, signal?: AbortSignal) => Promise<Row[]>, weight = 1.2): Engine {
  return {
    name,
    weight,
    focuses: ALL,
    siteFilters: true,
    enabled: () => !!process.env[envKey],
    search: async (q, signal) => toHits(name, await call(q, process.env[envKey]!, signal)),
  };
}

const json = (body: unknown, headers: Record<string, string>) => ({
  method: "POST",
  headers: { "Content-Type": "application/json", ...headers },
  body: JSON.stringify(body),
});

const braveApi = keyed("brave", "BRAVE_API_KEY", async (q, key, signal) => {
  const d = await getJson(`https://api.search.brave.com/res/v1/web/search?count=15&q=${encodeURIComponent(q)}`, {
    headers: { "X-Subscription-Token": key, Accept: "application/json" },
    signal,
  });
  return (d.web?.results || []).map((r: { url: string; title: string; description: string }) => ({ url: r.url, title: r.title, snippet: r.description }));
});

const tavily = keyed("tavily", "TAVILY_API_KEY", async (q, key, signal) => {
  const d = await getJson("https://api.tavily.com/search", { ...json({ query: q, max_results: 10 }, { Authorization: `Bearer ${key}` }), signal });
  return (d.results || []).map((r: { url: string; title: string; content: string }) => ({ url: r.url, title: r.title, snippet: r.content }));
});

const exa = keyed("exa", "EXA_API_KEY", async (q, key, signal) => {
  const d = await getJson("https://api.exa.ai/search", { ...json({ query: q, numResults: 10, contents: { highlights: true } }, { "x-api-key": key }), signal });
  return (d.results || []).map((r: { url: string; title: string; highlights?: string[] }) => ({ url: r.url, title: r.title, snippet: (r.highlights || []).join(" … ") }));
});

const serper = keyed("serper", "SERPER_API_KEY", async (q, key, signal) => {
  const d = await getJson("https://google.serper.dev/search", { ...json({ q, num: 10 }, { "X-API-KEY": key }), signal });
  return (d.organic || []).map((r: { link: string; title: string; snippet: string }) => ({ url: r.link, title: r.title, snippet: r.snippet }));
});

const googleCse = keyed("google", "GOOGLE_CSE_KEY", async (q, key, signal) => {
  const cx = process.env.GOOGLE_CSE_ID;
  if (!cx) return [];
  const d = await getJson(`https://www.googleapis.com/customsearch/v1?num=10&key=${key}&cx=${cx}&q=${encodeURIComponent(q)}`, { signal });
  return (d.items || []).map((r: { link: string; title: string; snippet: string }) => ({ url: r.link, title: r.title, snippet: r.snippet }));
});

const jina = keyed("jina", "JINA_API_KEY", async (q, key, signal) => {
  const d = await getJson(`https://s.jina.ai/?q=${encodeURIComponent(q)}`, {
    headers: { Authorization: `Bearer ${key}`, Accept: "application/json", "X-Respond-With": "no-content" },
    signal,
    timeoutMs: 10000,
  });
  return (d.data || []).map((r: { url: string; title: string; description: string }) => ({ url: r.url, title: r.title, snippet: r.description }));
});

const perplexitySearch = keyed("perplexity", "PERPLEXITY_API_KEY", async (q, key, signal) => {
  const d = await getJson("https://api.perplexity.ai/search", { ...json({ query: q, max_results: 10 }, { Authorization: `Bearer ${key}` }), signal });
  return (d.results || []).map((r: { url: string; title: string; snippet: string }) => ({ url: r.url, title: r.title, snippet: r.snippet }));
});

export const ENGINES: Engine[] = [
  wikipedia,
  ddgInstant,
  marginalia,
  hackernews,
  stackexchange,
  arxiv,
  openalex,
  searxng,
  braveApi,
  tavily,
  exa,
  serper,
  googleCse,
  jina,
  perplexitySearch,
];

export function activeEngines(focus: Focus = "web"): Engine[] {
  const disabled = (process.env.DISABLE_ENGINES || "").split(",").map((s) => s.trim());
  return ENGINES.filter((e) => e.enabled() && e.focuses.includes(focus) && !disabled.includes(e.name));
}
