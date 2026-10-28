import { PROVIDERS, type LLMRequest, type ModelInfo, type Provider } from "./providers";

export interface Resolved {
  provider: Provider;
  model: string;
  id: string;
}

const BEST: Record<string, RegExp> = {
  anthropic: /sonnet/,
  openai: /^(?!.*(mini|nano)).*/,
  gemini: /pro/,
  "claude-code": /^sonnet$/,
};

export async function listModels(): Promise<ModelInfo[]> {
  const rows = await Promise.all(
    PROVIDERS.map(async (p) => {
      if (!(await p.available().catch(() => false))) return [];
      const models = await p.models().catch(() => []);
      return models.map((m) => ({ id: `${p.id}:${m}`, provider: p.id, model: m, label: `${p.label} · ${m}`, free: p.free }));
    }),
  );
  return rows.flat();
}

/** Candidate (provider, model) pairs in preference order, starting with the requested one. */
export async function candidates(requested?: string): Promise<Resolved[]> {
  const out: Resolved[] = [];
  if (requested && requested !== "auto") {
    const i = requested.indexOf(":");
    const provider = PROVIDERS.find((p) => p.id === requested.slice(0, i));
    if (provider) out.push({ provider, model: requested.slice(i + 1), id: requested });
  }
  for (const p of PROVIDERS) {
    if (!(await p.available().catch(() => false))) continue;
    const models = await p.models().catch(() => []);
    if (!models.length) continue;
    const best = models.find((m) => BEST[p.id]?.test(m)) || models[0];
    const id = `${p.id}:${best}`;
    if (!out.some((r) => r.id === id)) out.push({ provider: p, model: best, id });
  }
  return out;
}

/** The fast sibling of a model (e.g. sonnet → haiku) for cheap planning calls. */
export async function fastSibling(r: Resolved): Promise<Resolved> {
  if (process.env.FAST_MODEL) {
    const [c] = await candidates(process.env.FAST_MODEL);
    if (c) return c;
  }
  const models = await r.provider.models().catch(() => []);
  const model = r.provider.fastModel(models) || r.model;
  return { provider: r.provider, model, id: `${r.provider.id}:${model}` };
}

/**
 * Streams from the first candidate that works. Falls through to the next provider
 * only if a provider fails before producing any output.
 */
export async function* streamWithFallback(
  cands: Resolved[],
  req: LLMRequest,
  onModel?: (id: string) => void,
): AsyncGenerator<string> {
  let lastErr: unknown;
  for (const c of cands) {
    let yielded = false;
    try {
      for await (const t of c.provider.stream(c.model, req)) {
        if (!yielded) onModel?.(c.id);
        yielded = true;
        yield t;
      }
      if (yielded) return;
    } catch (e) {
      if (yielded || req.signal?.aborted) throw e;
      lastErr = e;
    }
  }
  throw lastErr || new Error("No language model available. Add an API key in .env.local, run Ollama, or log in to Claude Code.");
}

export async function complete(cands: Resolved[], req: LLMRequest): Promise<string> {
  let s = "";
  for await (const t of streamWithFallback(cands, req)) s += t;
  return s;
}
