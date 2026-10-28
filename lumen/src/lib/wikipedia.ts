import { politeFetch } from "./util";
import { wikitextToText } from "./wikitext";

const api = (lang = "en") => `https://${lang}.wikipedia.org/w/api.php`;
const API = api();
// Long list articles (episode guides, award winners) keep their answer rows far down the page.
const MAX_CHARS = 120000;

export interface WikiPage {
  title: string;
  url: string;
  text: string;
  rank: number;
}

const textCache = new Map<string, string>();

function toPages(data: { query?: { pages?: { title: string; index?: number; missing?: boolean; revisions?: { slots: { main: { content: string } } }[] }[] } }, lang = "en"): WikiPage[] {
  return (data.query?.pages || [])
    .filter((p) => !p.missing && p.revisions?.[0])
    .map((p) => {
      const raw = p.revisions![0].slots.main.content;
      const text = /^#redirect/i.test(raw) ? "" : wikitextToText(raw).slice(0, MAX_CHARS);
      const url = `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}`;
      textCache.set(url, text);
      return { title: p.title, url, text, rank: p.index ?? 0 };
    })
    .sort((a, b) => a.rank - b.rank);
}

/**
 * Search + full article text in a single API request (instead of 1 search + N page
 * fetches), which keeps us well inside Wikimedia's rate limits.
 */
export async function searchWithContent(q: string, limit = 5, signal?: AbortSignal, retry = true): Promise<WikiPage[]> {
  const url = `${API}?action=query&format=json&formatversion=2&redirects=1&generator=search&gsrlimit=${limit}&gsrsearch=${encodeURIComponent(
    q,
  )}&prop=revisions&rvprop=content&rvslots=main`;
  const res = await politeFetch(url, { signal, timeoutMs: 9000 });
  if (!res.ok) throw new Error(`wikipedia ${res.status}`);
  const pages = toPages(await res.json());
  if (pages.length || retry === false) return pages;
  // Nothing found: the query may misspell a name ("Mereta Mita"), so try Wikipedia's own suggestion once.
  const sug = await politeFetch(`${API}?action=query&format=json&formatversion=2&list=search&srlimit=1&srinfo=suggestion&srsearch=${encodeURIComponent(q)}`, {
    signal,
    timeoutMs: 9000,
  });
  const suggestion: string | undefined = sug.ok ? (await sug.json()).query?.searchinfo?.suggestion : undefined;
  return suggestion && suggestion.toLowerCase() !== q.toLowerCase() ? searchWithContent(suggestion, limit, signal, false) : [];
}

/**
 * Exact-title lookup (redirects followed), for article titles named by the query planner.
 * A "xx:" prefix ("es:Vegachí") reads that language's Wikipedia, which often has local facts
 * the English stub lacks.
 */
export async function lookupTitles(titles: string[], signal?: AbortSignal): Promise<WikiPage[]> {
  const byLang = new Map<string, string[]>();
  for (const t of titles) {
    const m = t.match(/^([a-z]{2,3}):(.+)$/);
    const [lang, title] = m ? [m[1], m[2].trim()] : ["en", t];
    byLang.set(lang, [...(byLang.get(lang) || []), title]);
  }
  const groups = await Promise.all(
    [...byLang].map(async ([lang, ts]) => {
      const res = await politeFetch(
        `${api(lang)}?action=query&format=json&formatversion=2&redirects=1&prop=revisions&rvprop=content&rvslots=main&titles=${encodeURIComponent(ts.slice(0, 20).join("|"))}`,
        { signal, timeoutMs: 9000 },
      ).catch(() => null);
      return res?.ok ? toPages(await res.json(), lang) : [];
    }),
  );
  return groups.flat().filter((p) => p.text.length > 200);
}

/** Full text for up to 50 article URLs in one request. */
export async function fetchArticles(urls: string[], signal?: AbortSignal): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const need: string[] = [];
  for (const u of urls) {
    const hit = textCache.get(u);
    if (hit !== undefined) out.set(u, hit);
    else need.push(u);
  }
  if (!need.length) return out;
  const titleOf = (u: string) => decodeURIComponent(new URL(u).pathname.replace(/^\/wiki\//, "")).replace(/_/g, " ");
  const titles = need.slice(0, 50).map(titleOf);
  const res = await politeFetch(
    `${API}?action=query&format=json&formatversion=2&redirects=1&prop=revisions&rvprop=content&rvslots=main&titles=${encodeURIComponent(titles.join("|"))}`,
    { signal, timeoutMs: 9000 },
  );
  if (!res.ok) return out;
  const data = await res.json();
  const pages = toPages(data);
  // Map normalized/redirected titles back to the URLs we were asked for.
  const alias = new Map<string, string>();
  for (const n of [...(data.query?.normalized || []), ...(data.query?.redirects || [])]) alias.set(n.from, n.to);
  for (const u of need) {
    let t = titleOf(u);
    for (let i = 0; i < 3 && alias.has(t); i++) t = alias.get(t)!;
    const p = pages.find((x) => x.title === t);
    if (p) {
      out.set(u, p.text);
      textCache.set(u, p.text);
    }
  }
  return out;
}

export function isWikipediaUrl(url: string): boolean {
  return /^https?:\/\/en\.(m\.)?wikipedia\.org\/wiki\//.test(url);
}
