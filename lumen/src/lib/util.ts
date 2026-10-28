/** Honest, identifiable user agent (Wikipedia's API policy requires one). */
export const UA =
  process.env.LUMEN_USER_AGENT ||
  `LumenBot/0.1 (self-hosted open-source answer engine; user-initiated fetch${process.env.LUMEN_CONTACT ? `; ${process.env.LUMEN_CONTACT}` : ""})`;

export async function fetchWithTimeout(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const { timeoutMs = 8000, signal, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    return await fetch(url, {
      ...rest,
      signal: ctrl.signal,
      headers: { "User-Agent": UA, "Accept-Language": "en-US,en;q=0.9", ...(rest.headers || {}) },
      redirect: "follow",
    });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function faviconOf(url: string): string {
  return `https://www.google.com/s2/favicons?domain=${domainOf(url)}&sz=64`;
}

/** Canonical form used to dedupe the same page returned by different engines. */
export function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    u.hash = "";
    for (const p of [...u.searchParams.keys()]) {
      if (/^(utm_|fbclid|gclid|ref$|ref_src)/.test(p)) u.searchParams.delete(p);
    }
    let s = u.toString().replace(/^http:/, "https:").replace("://www.", "://");
    if (s.endsWith("/")) s = s.slice(0, -1);
    return s.replace("://en.m.wikipedia.org", "://en.wikipedia.org");
  } catch {
    return url;
  }
}

export function cleanText(s: string): string {
  return s
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n+/g, "\n\n")
    .trim();
}

export async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T, i: number) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const hostSlots = new Map<string, { active: number; queue: (() => void)[] }>();
const HOST_LIMIT: Record<string, number> = { wikipedia: 3 };

/** All Wikipedia language editions share one limit (Wikimedia counts per client, not per wiki). */
function limitKey(host: string): string {
  return /(^|\.)wikipedia\.org$/.test(host) ? "wikipedia" : host;
}

/** Caps concurrent requests per host so we stay inside sites' rate limits. */
export async function withHostLimit<T>(url: string, fn: () => Promise<T>): Promise<T> {
  const host = limitKey(new URL(url).hostname);
  const limit = HOST_LIMIT[host] ?? 4;
  let slot = hostSlots.get(host);
  if (!slot) hostSlots.set(host, (slot = { active: 0, queue: [] }));
  if (slot.active >= limit) await new Promise<void>((r) => slot!.queue.push(r));
  slot.active++;
  try {
    return await fn();
  } finally {
    slot.active--;
    slot.queue.shift()?.();
  }
}

// Requests per minute. Wikimedia allows 10/min for clients without contact info and
// 200/min when the User-Agent includes one (LUMEN_CONTACT).
const RATE_PER_MIN: Record<string, () => number> = {
  wikipedia: () => (process.env.LUMEN_CONTACT ? 150 : 9),
};
const buckets = new Map<string, { tokens: number; at: number; chain: Promise<void> }>();

async function takeToken(hostname: string) {
  const host = limitKey(hostname);
  const rate = RATE_PER_MIN[host]?.();
  if (!rate) return;
  let b = buckets.get(host);
  if (!b) buckets.set(host, (b = { tokens: Math.min(rate, 9), at: Date.now(), chain: Promise.resolve() }));
  const bucket = b;
  // Serialize waiters so tokens are handed out in order.
  const turn = bucket.chain.then(async () => {
    for (;;) {
      const now = Date.now();
      bucket.tokens = Math.min(Math.min(rate, 9), bucket.tokens + ((now - bucket.at) / 60000) * rate);
      bucket.at = now;
      if (bucket.tokens >= 1) {
        bucket.tokens -= 1;
        return;
      }
      await new Promise((r) => setTimeout(r, ((1 - bucket.tokens) * 60000) / rate));
    }
  });
  bucket.chain = turn.catch(() => {});
  await turn;
}

/** fetchWithTimeout + per-host limit + polite retry on 429/503 honoring Retry-After. */
export async function politeFetch(url: string, init: RequestInit & { timeoutMs?: number } = {}, retries = 2): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    await takeToken(new URL(url).hostname);
    const res = await withHostLimit(url, () => fetchWithTimeout(url, init));
    if ((res.status !== 429 && res.status !== 503) || attempt >= retries || init.signal?.aborted) return res;
    const ra = Number(res.headers.get("retry-after"));
    await new Promise((r) => setTimeout(r, Math.min(Number.isFinite(ra) && ra > 0 ? ra * 1000 : 800 * 2 ** attempt, 15000)));
  }
}
