import { multiSearch } from "./search";
import { extractPage } from "./extract";
import { fetchArticles, isWikipediaUrl, lookupTitles } from "./wikipedia";
import { rankPassages, tokenize } from "./rank";
import { candidates, complete, fastSibling, streamWithFallback, type Resolved } from "./llm/registry";
import { answerSystem, answerUser, followupSystem, parseJson, plannerSystem, reflectSystem } from "./prompts";
import { domainOf, faviconOf, mapLimit, todayISO } from "./util";
import type { Doc, Mode, RunMeta, SearchOptions, Source, StreamEvent } from "./types";

const PROFILE: Record<Mode, { queries: number; fetch: number; topK: number; perDoc: number; rounds: number; maxTokens: number }> = {
  quick: { queries: 1, fetch: 6, topK: 16, perDoc: 5, rounds: 1, maxTokens: 2048 },
  pro: { queries: 3, fetch: 12, topK: 30, perDoc: 6, rounds: 1, maxTokens: 4096 },
  deep: { queries: 4, fetch: 10, topK: 60, perDoc: 8, rounds: 3, maxTokens: 8192 },
};

export interface RunResult {
  answer: string;
  sources: Source[];
  followups: string[];
  meta: RunMeta;
}

/** Free second query for quick mode: the question without filler words. */
function keywordize(q: string): string {
  return q.split(/\s+/).filter((w) => tokenize(w).length).join(" ").replace(/[?!.]+$/, "");
}

interface Plan {
  queries: string[];
  titles: string[];
}

async function planQueries(fast: Resolved[], question: string, opts: SearchOptions, n: number, date: string): Promise<Plan> {
  const history = opts.history || [];
  if (n === 1 && history.length === 0) return { queries: [...new Set([question, keywordize(question)])].filter(Boolean), titles: [] };
  const convo = history
    .slice(-4)
    .map((m) => `${m.role}: ${m.content.slice(0, 600)}`)
    .join("\n");
  try {
    const raw = await complete(fast, {
      system: plannerSystem(date, n),
      messages: [{ role: "user", content: `${convo ? `Conversation so far:\n${convo}\n\n` : ""}Question: ${question}` }],
      maxTokens: 300,
      temperature: 0,
      signal: opts.signal,
    });
    const plan = parseJson<{ queries?: unknown[]; titles?: unknown[] }>(raw);
    const clean = (xs?: unknown[]) => [...new Set((xs || []).filter((x): x is string => typeof x === "string" && !!x.trim()).map((x) => x.trim()))];
    const qs = clean(plan?.queries);
    if (qs.length) return { queries: qs.slice(0, n), titles: clean(plan?.titles).slice(0, 4) };
  } catch {}
  return { queries: [question], titles: [] };
}

/**
 * Pulls in the Wikipedia articles the planner named. Full-text search misses these surprisingly
 * often (misspelled names, small articles outranked by big ones), but an exact title lookup doesn't.
 */
async function addTitleDocs(docMap: Map<string, Doc>, titles: string[], opts: SearchOptions): Promise<number> {
  if (!titles.length || !["web", "wiki", undefined].includes(opts.focus)) return 0;
  if ((process.env.DISABLE_ENGINES || "").split(",").includes("wikipedia")) return 0;
  const pages = await lookupTitles(titles, opts.signal).catch(() => []);
  const top = Math.max(0, ...[...docMap.values()].map((d) => d.fusedScore));
  for (const p of pages) {
    const existing = docMap.get(p.url);
    if (existing) {
      existing.fusedScore = Math.max(existing.fusedScore, top);
      if (!existing.text) existing.text = p.text;
      continue;
    }
    const first = p.text.split("\n").find((l) => l.length > 80 && !l.includes(": ")) || "";
    docMap.set(p.url, {
      url: p.url,
      title: p.title,
      domain: domainOf(p.url),
      snippet: first.slice(0, 300),
      engines: ["wikipedia"],
      fusedScore: top || 1,
      text: p.text,
    });
  }
  return pages.length;
}

/**
 * A page whose title is fully named in the question (e.g. "Coppa Italia Serie C") is
 * very likely the right one, even when engines rank it lower than broader pages.
 */
function boostTitles(docs: Doc[], texts: string[]) {
  const terms = new Set(texts.flatMap(tokenize));
  for (const d of docs) {
    const t = tokenize(d.title.replace(/\s[-–|—].*$/, ""));
    if (!t.length) continue;
    const share = t.filter((x) => terms.has(x)).length / t.length;
    d.fusedScore *= 1 + 2 * share * share;
  }
  docs.sort((a, b) => b.fusedScore - a.fusedScore);
}

async function readDocs(docs: Doc[], signal?: AbortSignal): Promise<number> {
  let ok = docs.filter((d) => d.text.length > 200).length;
  const wiki = docs.filter((d) => !d.text && isWikipediaUrl(d.url));
  if (wiki.length) {
    const texts = await fetchArticles(wiki.map((d) => d.url), signal).catch(() => new Map<string, string>());
    for (const d of wiki) {
      d.text = texts.get(d.url) || "";
      if (d.text.length > 200) ok++;
    }
  }
  await mapLimit(docs.filter((d) => !d.text && !isWikipediaUrl(d.url)), 8, async (d) => {
    if (d.text) return;
    try {
      d.text = await extractPage(d.url, signal, 6000);
      if (d.text.length > 200) ok++;
    } catch {
      d.text = "";
    }
  });
  return ok;
}

function buildContext(docs: Doc[], question: string, queries: string[], topK: number, perDoc: number) {
  const passages = rankPassages(docs, [question, ...queries], { topK, perDoc });
  const order: number[] = [];
  for (const p of passages) if (!order.includes(p.docIndex)) order.push(p.docIndex);
  const sources: Source[] = order.map((di, i) => ({
    id: i + 1,
    url: docs[di].url,
    title: docs[di].title || docs[di].domain,
    domain: docs[di].domain,
    snippet: docs[di].snippet,
    engines: docs[di].engines,
    favicon: faviconOf(docs[di].url),
  }));
  const context = order
    .map((di, i) => {
      const body = passages.filter((p) => p.docIndex === di).map((p) => p.text).join("\n…\n");
      return `[${i + 1}] ${docs[di].title} (${docs[di].url})\n${body}`;
    })
    .join("\n\n");
  return { sources, context };
}

/**
 * The full answer-engine pipeline: plan → multi-engine search → read pages →
 * rank passages → stream a cited answer (+ follow-up questions).
 */
export async function runSearch(question: string, opts: SearchOptions, emit: (e: StreamEvent) => void = () => {}): Promise<RunResult> {
  const t0 = Date.now();
  const prof = PROFILE[opts.mode];
  const date = todayISO();
  const main = await candidates(opts.model);
  if (!main.length) throw new Error("No language model available. Add an API key in .env.local, run Ollama, or log in to Claude Code.");
  const fast = [await fastSibling(main[0]), ...main.slice(1)];

  emit({ type: "status", message: prof.queries > 1 ? "Planning searches" : "Searching the web" });
  const plan = await planQueries(fast, question, opts, prof.queries, date);
  let queries = plan.queries;
  emit({ type: "queries", queries });

  const docMap = new Map<string, Doc>();
  const engineCounts: Record<string, number> = {};
  let pagesRead = 0;
  const allQueries: string[] = [];

  for (let round = 0; round < prof.rounds; round++) {
    allQueries.push(...queries);
    emit({ type: "status", message: `Searching ${queries.length > 1 ? `${queries.length} queries` : "the web"} across engines` });
    let { docs, engineCounts: ec } = await multiSearch(queries, { focus: opts.focus, excludeDomains: opts.excludeDomains, signal: opts.signal });
    if (!docs.length && !opts.signal?.aborted) {
      emit({ type: "status", message: "No results yet, retrying search" });
      ({ docs, engineCounts: ec } = await multiSearch([question], { focus: opts.focus, excludeDomains: opts.excludeDomains, signal: opts.signal }));
    }
    for (const [k, v] of Object.entries(ec)) engineCounts[k] = (engineCounts[k] || 0) + v;
    boostTitles(docs, [question, ...allQueries]);
    const fresh = docs.filter((d) => !docMap.has(d.url)).slice(0, prof.fetch);
    for (const d of docs) if (!docMap.has(d.url)) docMap.set(d.url, d);
    emit({ type: "status", message: `Reading ${fresh.length} pages` });
    const [read, direct] = await Promise.all([readDocs(fresh, opts.signal), round === 0 ? addTitleDocs(docMap, plan.titles, opts) : 0]);
    pagesRead += read + direct;

    if (round + 1 >= prof.rounds) break;
    const { context } = buildContext([...docMap.values()], question, allQueries, 16, 2);
    try {
      const raw = await complete(fast, {
        system: reflectSystem(date),
        messages: [{ role: "user", content: `Question: ${question}\n\nNotes:\n${context.slice(0, 12000)}` }],
        maxTokens: 300,
        temperature: 0,
        signal: opts.signal,
      });
      const r = parseJson<{ done: boolean; queries?: string[] }>(raw);
      if (!r || r.done || !r.queries?.length) break;
      queries = r.queries.filter((q) => !allQueries.includes(q)).slice(0, 3);
      if (!queries.length) break;
      emit({ type: "queries", queries });
    } catch {
      break;
    }
  }

  const docs = [...docMap.values()].sort((a, b) => b.fusedScore - a.fusedScore).slice(0, prof.fetch * prof.rounds + 10);
  const { sources, context } = buildContext(docs, question, allQueries, prof.topK, prof.perDoc);
  emit({ type: "sources", sources });
  emit({ type: "status", message: "Writing answer" });

  const followupsP: Promise<string[]> =
    opts.followups === false
      ? Promise.resolve([])
      : complete(fast, {
          system: followupSystem(),
          messages: [{ role: "user", content: `Question: ${question}\nSources: ${sources.map((s) => s.title).join("; ")}` }],
          maxTokens: 300,
          temperature: 0.5,
          signal: opts.signal,
        })
          .then((raw) => (parseJson<string[]>(raw) || []).filter((s) => typeof s === "string").slice(0, 4))
          .catch(() => []);

  const messages = [
    ...(opts.history || []).slice(-6).map((m) => ({ role: m.role, content: m.content.slice(0, 4000) })),
    { role: "user" as const, content: answerUser(question, context || "(no sources found)") },
  ];
  let usedModel = main[0].id;
  let answer = "";
  for await (const t of streamWithFallback(
    main,
    { system: answerSystem(date, opts.mode), messages, maxTokens: prof.maxTokens, temperature: 0.2, signal: opts.signal },
    (id) => (usedModel = id),
  )) {
    answer += t;
    emit({ type: "token", text: t });
  }

  const followups = await followupsP;
  if (followups.length) emit({ type: "followups", items: followups });
  const meta: RunMeta = { model: usedModel, mode: opts.mode, queries: allQueries, engines: engineCounts, pagesRead, ms: Date.now() - t0 };
  emit({ type: "done", meta });
  return { answer, sources, followups, meta };
}

/** Closed-book baseline: the same model answering without any retrieval (used by the benchmark). */
export async function runNoSearch(question: string, model?: string, signal?: AbortSignal): Promise<string> {
  const main = await candidates(model);
  return complete(main, {
    system: `Answer the question concisely and directly. Today's date is ${todayISO()}. If you are not sure, say so.`,
    messages: [{ role: "user", content: question }],
    maxTokens: 1024,
    temperature: 0,
    signal,
  });
}
