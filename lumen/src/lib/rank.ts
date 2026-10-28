import type { Doc, Passage } from "./types";

const STOP = new Set(
  "a an the and or of to in on for with by at from is are was were be been being as that this these those it its into than then what which who whom whose when where why how does did do has have had not no can could would should will shall may might about over under after before between during per via vs".split(
    " ",
  ),
);

/** Light suffix stripping so "suffer"/"suffered" and "stroke"/"strokes" match. */
function stem(t: string): string {
  if (t.length <= 4 || /\d/.test(t)) return t;
  return t.replace(/(ies)$/, "y").replace(/(ing|ed|es|s)$/, (m) => (m === "s" && t.endsWith("ss") ? m : "")).replace(/e$/, "");
}

export function tokenize(s: string): string[] {
  return (s.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").match(/[a-z0-9]+/g) || [])
    .filter((t) => !STOP.has(t) && t.length > 1)
    .map(stem);
}

/** Splits text into overlapping windows of roughly `size` words, respecting paragraph breaks. */
export function chunk(text: string, size = 160, overlap = 40): string[] {
  const paras = text.split(/\n+/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let buf: string[] = [];
  for (const p of paras) {
    const words = p.split(/\s+/);
    if (words.length > size) {
      if (buf.length) chunks.push(buf.join(" "));
      buf = [];
      for (let i = 0; i < words.length; i += size - overlap) {
        chunks.push(words.slice(i, i + size).join(" "));
        if (i + size >= words.length) break;
      }
      continue;
    }
    if (buf.length + words.length > size) {
      chunks.push(buf.join(" "));
      buf = buf.slice(-overlap);
    }
    buf.push(...words);
  }
  if (buf.length) chunks.push(buf.join(" "));
  return chunks;
}

/**
 * BM25 over all passages from all fetched pages, blended with the page's
 * search-engine consensus score. Caps passages per page so one site can't dominate.
 */
export function rankPassages(
  docs: Doc[],
  queries: string[],
  opts: { topK?: number; perDoc?: number } = {},
): Passage[] {
  const { topK = 18, perDoc = 4 } = opts;
  const qTerms = [...new Set(queries.flatMap(tokenize))];
  const numTerms = qTerms.filter((t) => /\d/.test(t));
  const items: { docIndex: number; text: string; toks: string[] }[] = [];
  docs.forEach((d, di) => {
    const body = d.text || d.snippet;
    // Every chunk is scored with its page title, so row 40 of a long table still counts as "Kalinga Prize".
    const titleToks = tokenize(d.title);
    for (const c of chunk(`${d.title}\n${body}`)) items.push({ docIndex: di, text: c, toks: [...new Set(titleToks)].concat(tokenize(c)) });
    // The engine snippet is often the single most relevant sentence.
    if (d.snippet) items.push({ docIndex: di, text: d.snippet, toks: tokenize(d.snippet) });
  });
  if (!items.length) return [];

  const N = items.length;
  const avgdl = items.reduce((s, it) => s + it.toks.length, 0) / N || 1;
  const df = new Map<string, number>();
  for (const it of items) for (const t of new Set(it.toks)) df.set(t, (df.get(t) || 0) + 1);
  const k1 = 1.4;
  const b = 0.7;

  const maxFused = Math.max(...docs.map((d) => d.fusedScore), 1e-9);
  const scored = items.map((it) => {
    const tf = new Map<string, number>();
    for (const t of it.toks) tf.set(t, (tf.get(t) || 0) + 1);
    let s = 0;
    let matched = 0;
    for (const q of qTerms) {
      const f = tf.get(q);
      if (!f) continue;
      matched++;
      const idf = Math.log(1 + (N - (df.get(q) || 0) + 0.5) / ((df.get(q) || 0) + 0.5));
      s += (idf * (f * (k1 + 1))) / (f + k1 * (1 - b + (b * it.toks.length) / avgdl));
    }
    const coverage = qTerms.length ? matched / qTerms.length : 0;
    const authority = docs[it.docIndex].fusedScore / maxFused;
    // Numbers in the question ("in 1987", "season 3") pin down which table row or passage holds the answer.
    const numeric = numTerms.length ? 1 + (1.5 * numTerms.filter((t) => tf.has(t)).length) / numTerms.length : 1;
    return { docIndex: it.docIndex, text: it.text, tf, score: s * (0.6 + 0.4 * coverage) * (0.75 + 0.5 * authority) * numeric };
  });

  scored.sort((a, b2) => b2.score - a.score);
  const perDocCount = new Map<number, number>();
  const seen = new Set<string>();
  const out: Passage[] = [];
  for (const p of scored) {
    if (out.length >= topK) break;
    const n = perDocCount.get(p.docIndex) || 0;
    const sig = p.text.slice(0, 80);
    if (n >= perDoc || seen.has(sig) || p.score <= 0) continue;
    perDocCount.set(p.docIndex, n + 1);
    seen.add(sig);
    out.push(p);
  }
  // Make sure each number in the question appears in at least one passage, even past the per-page cap.
  for (const t of numTerms) {
    if (out.some((p) => tokenize(p.text).includes(t))) continue;
    const best = scored.find((p) => p.tf.has(t) && p.score > 0 && !seen.has(p.text.slice(0, 80)));
    if (best) {
      seen.add(best.text.slice(0, 80));
      out.push(best);
    }
  }
  return out.map(({ docIndex, text, score }) => ({ docIndex, text, score }));
}
