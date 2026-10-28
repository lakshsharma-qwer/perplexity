import { parseHTML } from "linkedom";
import { Readability } from "@mozilla/readability";
import { politeFetch, cleanText } from "./util";
import { robotsAllowed } from "./robots";
import { fetchArticles, isWikipediaUrl } from "./wikipedia";

const MAX_CHARS = 40000;

const BLOCK = new Set(["P", "DIV", "SECTION", "ARTICLE", "LI", "H1", "H2", "H3", "H4", "H5", "H6", "BLOCKQUOTE", "PRE", "DD", "DT", "FIGCAPTION", "BR", "HR"]);

/** HTML → plain text that keeps paragraph breaks and flattens table rows to "a | b | c". */
function nodeToText(root: Element): string {
  const out: string[] = [];
  const walk = (n: Node) => {
    if (n.nodeType === 3) {
      out.push(n.textContent || "");
      return;
    }
    if (n.nodeType !== 1) return;
    const el = n as Element;
    const tag = el.tagName;
    if (["SCRIPT", "STYLE", "NOSCRIPT", "SVG"].includes(tag)) return;
    // Wikipedia citation markers like [12] and "edit" links are noise for the model.
    if (el.classList?.contains("mw-editsection") || el.classList?.contains("reference")) return;
    if (tag === "TR") {
      const cells = [...el.querySelectorAll("th,td")].map((c) => cleanText(c.textContent || "").replace(/\n+/g, " "));
      if (cells.some(Boolean)) out.push("\n" + cells.filter(Boolean).join(" | ") + "\n");
      return;
    }
    if (BLOCK.has(tag)) out.push("\n");
    if (/^H[1-6]$/.test(tag)) out.push("## ");
    el.childNodes.forEach(walk);
    if (BLOCK.has(tag)) out.push("\n");
  };
  walk(root);
  return cleanText(out.join(""));
}

const pageCache = new Map<string, { at: number; text: string }>();
const CACHE_MS = 30 * 60_000;

/** Fetches a page and returns readable text, cached for 30 minutes. */
export async function extractPage(url: string, signal?: AbortSignal, timeoutMs = 8000): Promise<string> {
  const hit = pageCache.get(url);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.text;
  const text = await extractUncached(url, signal, timeoutMs);
  if (pageCache.size > 500) pageCache.delete(pageCache.keys().next().value!);
  pageCache.set(url, { at: Date.now(), text });
  return text;
}

async function extractUncached(url: string, signal?: AbortSignal, timeoutMs = 8000): Promise<string> {
  if (isWikipediaUrl(url)) {
    const text = (await fetchArticles([url], signal)).get(url);
    if (text === undefined) throw new Error("wikipedia: not found");
    return text;
  }
  if (!(await robotsAllowed(url))) throw new Error("disallowed by robots.txt");
  const res = await politeFetch(url, { signal, timeoutMs, headers: { Accept: "text/html,application/xhtml+xml" } });
  const type = res.headers.get("content-type") || "";
  if (!res.ok || !type.includes("html")) throw new Error(`skip ${res.status} ${type}`);
  const html = (await res.text()).slice(0, 2_000_000);
  const { document } = parseHTML(html);
  // Readability mutates the doc, so read tables like infoboxes first.
  const infobox = document.querySelector("table.infobox");
  const infoText = infobox ? nodeToText(infobox as Element) : "";
  let body = "";
  try {
    const article = new Readability(document as unknown as Document, { charThreshold: 300 }).parse();
    if (article?.content) {
      const { document: d2 } = parseHTML(`<html><body>${article.content}</body></html>`);
      body = nodeToText(d2.body as unknown as Element);
    }
  } catch {}
  if (body.length < 400) {
    const { document: raw } = parseHTML(html);
    raw.querySelectorAll("nav,header,footer,aside,form,script,style").forEach((e: Element) => e.remove());
    body = nodeToText(raw.body as unknown as Element);
  }
  return cleanText(`${infoText}\n\n${body}`).slice(0, MAX_CHARS);
}
