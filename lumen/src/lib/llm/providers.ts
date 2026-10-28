import { spawn, spawnSync } from "node:child_process";
import os from "node:os";
import type { ChatMessage } from "../types";

export interface LLMRequest {
  system: string;
  messages: ChatMessage[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

export interface ModelInfo {
  id: string; // "provider:model"
  provider: string;
  model: string;
  label: string;
  free: boolean;
}

export interface Provider {
  id: string;
  label: string;
  free: boolean;
  available(): Promise<boolean>;
  models(): Promise<string[]>;
  /** Cheapest/fastest model of this provider, used for query planning and follow-ups. */
  fastModel(models: string[]): string | undefined;
  stream(model: string, req: LLMRequest): AsyncGenerator<string>;
}

async function* sseLines(res: Response): AsyncGenerator<string> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line.startsWith("data:")) yield line.slice(5).trim();
    }
  }
}

const cache = new Map<string, { at: number; value: string[] }>();
async function cached(key: string, fn: () => Promise<string[]>): Promise<string[]> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.value;
  try {
    const value = await fn();
    cache.set(key, { at: Date.now(), value });
    return value;
  } catch {
    return hit?.value || [];
  }
}

// ---------- OpenAI-compatible (OpenAI, Gemini, Groq, OpenRouter, Mistral, DeepSeek, xAI, Ollama…) ----------

interface CompatConfig {
  id: string;
  label: string;
  baseUrl: () => string;
  key?: () => string | undefined;
  free: boolean;
  include?: RegExp;
  exclude?: RegExp;
  defaults?: string[];
  fast?: RegExp;
  maxTokensField?: "max_tokens" | "max_completion_tokens";
  noTemperature?: boolean;
  listModels?: () => Promise<string[]>;
}

function envList(name: string): string[] {
  return (process.env[name] || "").split(",").map((s) => s.trim()).filter(Boolean);
}

function compat(cfg: CompatConfig): Provider {
  const key = () => cfg.key?.();
  return {
    id: cfg.id,
    label: cfg.label,
    free: cfg.free,
    async available() {
      if (cfg.key) return !!key();
      return (await this.models()).length > 0;
    },
    async models() {
      const pinned = envList(`${cfg.id.toUpperCase().replace(/-/g, "_")}_MODELS`);
      if (pinned.length) return pinned;
      if (cfg.key && !key()) return [];
      return cached(cfg.id, async () => {
        const ids = cfg.listModels
          ? await cfg.listModels()
          : await fetch(`${cfg.baseUrl()}/models`, {
              headers: key() ? { Authorization: `Bearer ${key()}` } : {},
              signal: AbortSignal.timeout(5000),
            })
              .then((r) => r.json())
              .then((d) => (d.data || []).map((m: { id: string }) => m.id.replace(/^models\//, "")));
        const filtered = ids
          .filter((m: string) => (!cfg.include || cfg.include.test(m)) && !(cfg.exclude && cfg.exclude.test(m)))
          .sort()
          .reverse();
        const preferred = (cfg.defaults || []).filter((d) => filtered.includes(d));
        return [...new Set([...preferred, ...filtered])].slice(0, 15);
      });
    },
    fastModel(models) {
      return (cfg.fast && models.find((m) => cfg.fast!.test(m))) || models[0];
    },
    async *stream(model, req) {
      const body: Record<string, unknown> = {
        model,
        stream: true,
        messages: [{ role: "system", content: req.system }, ...req.messages],
        [cfg.maxTokensField || "max_tokens"]: req.maxTokens || 4096,
      };
      if (!cfg.noTemperature && req.temperature !== undefined) body.temperature = req.temperature;
      const res = await fetch(`${cfg.baseUrl()}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(key() ? { Authorization: `Bearer ${key()}` } : {}) },
        body: JSON.stringify(body),
        signal: req.signal,
      });
      if (!res.ok) throw new Error(`${cfg.label} ${res.status}: ${(await res.text()).slice(0, 300)}`);
      for await (const data of sseLines(res)) {
        if (data === "[DONE]") return;
        try {
          const delta = JSON.parse(data).choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {}
      }
    },
  };
}

const ollamaUrl = () => process.env.OLLAMA_URL || "http://localhost:11434";

export const openai = compat({
  id: "openai",
  label: "OpenAI",
  baseUrl: () => "https://api.openai.com/v1",
  key: () => process.env.OPENAI_API_KEY,
  free: false,
  include: /^(gpt-[4-9]|o[1-9]|chatgpt)/,
  exclude: /(audio|realtime|image|tts|transcribe|search|embedding|instruct|preview-\d|\d{4}-\d{2}-\d{2})/,
  fast: /mini|nano/,
  maxTokensField: "max_completion_tokens",
  noTemperature: true,
});

export const gemini = compat({
  id: "gemini",
  label: "Google Gemini",
  baseUrl: () => "https://generativelanguage.googleapis.com/v1beta/openai",
  key: () => process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY,
  free: true, // generous free tier on AI Studio keys
  include: /^gemini-/,
  exclude: /(embedding|image|tts|audio|live|aqa|vision|exp-\d|\d{3}$)/,
  fast: /flash/,
});

export const groq = compat({
  id: "groq",
  label: "Groq",
  baseUrl: () => "https://api.groq.com/openai/v1",
  key: () => process.env.GROQ_API_KEY,
  free: true,
  exclude: /(whisper|guard|tts|playai|distil)/,
  fast: /(instant|8b|mini|scout)/,
});

export const openrouter = compat({
  id: "openrouter",
  label: "OpenRouter (free models)",
  baseUrl: () => "https://openrouter.ai/api/v1",
  key: () => process.env.OPENROUTER_API_KEY,
  free: true,
  include: /:free$/,
  fast: /(flash|mini|8b|small)/,
});

export const mistral = compat({
  id: "mistral",
  label: "Mistral",
  baseUrl: () => "https://api.mistral.ai/v1",
  key: () => process.env.MISTRAL_API_KEY,
  free: true,
  include: /latest$/,
  exclude: /(embed|moderation|ocr|codestral)/,
  fast: /small/,
});

export const deepseek = compat({
  id: "deepseek",
  label: "DeepSeek",
  baseUrl: () => "https://api.deepseek.com",
  key: () => process.env.DEEPSEEK_API_KEY,
  free: false,
  fast: /chat/,
});

export const xai = compat({
  id: "xai",
  label: "xAI Grok",
  baseUrl: () => "https://api.x.ai/v1",
  key: () => process.env.XAI_API_KEY,
  free: false,
  include: /^grok/,
  exclude: /(image|vision)/,
  fast: /(mini|fast)/,
});

export const ollama = compat({
  id: "ollama",
  label: "Ollama (local)",
  baseUrl: () => `${ollamaUrl()}/v1`,
  free: true,
  exclude: /(embed|uncensored)/,
  defaults: ["qwen2.5:7b", "gemma4:latest"],
  fast: /(qwen2\.5|e2b|3b|1b)/,
  listModels: async () => {
    const r = await fetch(`${ollamaUrl()}/api/tags`, { signal: AbortSignal.timeout(2000) });
    return ((await r.json()).models || []).map((m: { name: string }) => m.name);
  },
});

// ---------- Anthropic (native Messages API) ----------

export const anthropic: Provider = {
  id: "anthropic",
  label: "Anthropic Claude",
  free: false,
  async available() {
    return !!process.env.ANTHROPIC_API_KEY;
  },
  async models() {
    if (!process.env.ANTHROPIC_API_KEY) return [];
    const pinned = envList("ANTHROPIC_MODELS");
    if (pinned.length) return pinned;
    return cached("anthropic", async () => {
      const r = await fetch("https://api.anthropic.com/v1/models?limit=50", {
        headers: { "x-api-key": process.env.ANTHROPIC_API_KEY!, "anthropic-version": "2023-06-01" },
        signal: AbortSignal.timeout(5000),
      });
      const ids: string[] = ((await r.json()).data || []).map((m: { id: string }) => m.id);
      return ids.length ? ids : ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"];
    });
  },
  fastModel(models) {
    return models.find((m) => m.includes("haiku")) || models[0];
  },
  async *stream(model, req) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        system: req.system,
        messages: req.messages,
        max_tokens: req.maxTokens || 4096,
        stream: true,
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      }),
      signal: req.signal,
    });
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 300)}`);
    for await (const data of sseLines(res)) {
      try {
        const ev = JSON.parse(data);
        if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") yield ev.delta.text;
      } catch {}
    }
  },
};

// ---------- Claude Code CLI (uses the local `claude` login / subscription, no API key) ----------

let claudeBin: string | null | undefined;
function findClaude(): string | null {
  if (claudeBin !== undefined) return claudeBin;
  if (process.env.DISABLE_CLAUDE_CODE === "1") return (claudeBin = null);
  const r = spawnSync("which", [process.env.CLAUDE_BIN || "claude"], { encoding: "utf8" });
  claudeBin = r.status === 0 ? r.stdout.trim() : null;
  return claudeBin;
}

let running = 0;
const queue: (() => void)[] = [];
const MAX_CC = Number(process.env.CLAUDE_CODE_CONCURRENCY || 4);
async function acquire() {
  if (running < MAX_CC) {
    running++;
    return;
  }
  await new Promise<void>((r) => queue.push(r));
  running++;
}
function release() {
  running--;
  queue.shift()?.();
}

function flatten(messages: ChatMessage[]): string {
  if (messages.length === 1) return messages[0].content;
  return messages.map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.content}`).join("\n\n") + "\n\nAssistant:";
}

export const claudeCode: Provider = {
  id: "claude-code",
  label: "Claude Code (local login)",
  free: true,
  async available() {
    return !!findClaude();
  },
  async models() {
    return findClaude() ? ["sonnet", "opus", "haiku"] : [];
  },
  fastModel() {
    return "haiku";
  },
  async *stream(model, req) {
    const bin = findClaude();
    if (!bin) throw new Error("claude CLI not found");
    await acquire();
    const env = { ...process.env };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_ENTRYPOINT;
    const child = spawn(
      bin,
      [
        "-p",
        "--model", model,
        "--system-prompt", req.system,
        "--tools", "",
        "--strict-mcp-config",
        "--setting-sources", "",
        "--no-session-persistence",
        "--output-format", "stream-json",
        "--verbose",
        "--include-partial-messages",
      ],
      { cwd: os.tmpdir(), env, stdio: ["pipe", "pipe", "pipe"] },
    );
    const kill = () => child.kill("SIGTERM");
    req.signal?.addEventListener("abort", kill);
    child.stdin.end(flatten(req.messages));
    let stderr = "";
    child.stderr.on("data", (d) => (stderr += d));
    let buf = "";
    let gotText = false;
    let resultError: string | null = null;
    try {
      for await (const chunk of child.stdout) {
        buf += chunk.toString();
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          if (!line.trim()) continue;
          let ev;
          try {
            ev = JSON.parse(line);
          } catch {
            continue;
          }
          if (ev.type === "stream_event" && ev.event?.type === "content_block_delta" && ev.event.delta?.type === "text_delta") {
            gotText = true;
            yield ev.event.delta.text as string;
          } else if (ev.type === "result" && ev.is_error) {
            resultError = String(ev.result || ev.subtype);
          }
        }
      }
      const code: number = await new Promise((r) => (child.exitCode !== null ? r(child.exitCode) : child.on("close", r)));
      if (!gotText && (code !== 0 || resultError)) throw new Error(`claude CLI failed: ${resultError || stderr.slice(0, 300)}`);
    } finally {
      req.signal?.removeEventListener("abort", kill);
      if (child.exitCode === null) kill();
      release();
    }
  },
};

export const PROVIDERS: Provider[] = [anthropic, openai, gemini, xai, deepseek, mistral, groq, openrouter, claudeCode, ollama];
