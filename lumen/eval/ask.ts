import { runSearch } from "../src/lib/pipeline";
import type { Mode } from "../src/lib/types";

try {
  process.loadEnvFile(".env.local");
} catch {}

const [mode = "quick", ...rest] = process.argv.slice(2);
const q = rest.join(" ") || "Who are the founders of Perplexity AI?";
runSearch(q, { mode: mode as Mode, model: process.env.MODEL }, (e) => {
  if (e.type === "token") process.stdout.write(e.text);
  else if (e.type === "sources") console.log("\nSOURCES:\n" + e.sources.map((s) => `[${s.id}] ${s.title} — ${s.url} (${s.engines.join(",")})`).join("\n") + "\n");
  else if (e.type === "done") console.log("\n\nMETA", JSON.stringify(e.meta));
  else console.log(`· ${e.type}: ${JSON.stringify((e as any).message ?? (e as any).queries ?? (e as any).items)}`);
}).catch((e) => { console.error("ERR", e); process.exit(1); });
