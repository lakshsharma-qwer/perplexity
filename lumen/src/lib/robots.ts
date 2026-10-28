import { fetchWithTimeout } from "./util";

type Rules = { allow: string[]; disallow: string[] };
const cache = new Map<string, Promise<Rules>>();
const AGENT = "lumenbot";

function parse(txt: string): Rules {
  const groups: { agents: string[]; rules: Rules }[] = [];
  let cur: { agents: string[]; rules: Rules } | null = null;
  let lastWasAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const [, k, v] = m;
    const key = k.toLowerCase();
    if (key === "user-agent") {
      if (!cur || !lastWasAgent) groups.push((cur = { agents: [], rules: { allow: [], disallow: [] } }));
      cur.agents.push(v.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!cur) continue;
      if (key === "disallow" && v) cur.rules.disallow.push(v);
      if (key === "allow" && v) cur.rules.allow.push(v);
    }
  }
  const mine = groups.find((g) => g.agents.some((a) => a !== "*" && AGENT.includes(a)));
  return (mine || groups.find((g) => g.agents.includes("*")))?.rules || { allow: [], disallow: [] };
}

function matches(path: string, pattern: string): boolean {
  const re = new RegExp("^" + pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
  return re.test(path);
}

/** True if robots.txt lets LumenBot fetch this URL. Unreachable robots.txt means allowed. */
export async function robotsAllowed(url: string): Promise<boolean> {
  if (process.env.IGNORE_ROBOTS === "1") return true;
  const u = new URL(url);
  let p = cache.get(u.origin);
  if (!p) {
    p = fetchWithTimeout(`${u.origin}/robots.txt`, { timeoutMs: 2500 })
      .then(async (r) => (r.ok ? parse(await r.text()) : { allow: [], disallow: [] }))
      .catch(() => ({ allow: [], disallow: [] }));
    cache.set(u.origin, p);
  }
  const rules = await p;
  const path = u.pathname + u.search;
  // Longest matching rule wins, as in Google's spec.
  const longest = (list: string[]) => Math.max(-1, ...list.filter((r) => matches(path, r)).map((r) => r.length));
  return longest(rules.allow) >= longest(rules.disallow);
}
