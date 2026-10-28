"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Composer, type ModelOption } from "@/components/Composer";
import { Markdown } from "@/components/Markdown";
import type { Focus, Mode, RunMeta, Source, StreamEvent } from "@/lib/types";

interface Turn {
  id: string;
  query: string;
  mode: Mode;
  status: string;
  queries: string[];
  sources: Source[];
  answer: string;
  followups: string[];
  meta?: RunMeta;
  error?: string;
  done: boolean;
}

interface Thread {
  id: string;
  title: string;
  createdAt: number;
  turns: Turn[];
}

const STORE = "lumen.threads.v1";
const PREFS = "lumen.prefs.v1";
const uid = () => Math.random().toString(36).slice(2, 10);

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {}
}

const SUGGESTIONS = [
  "What did Perplexity launch in 2026?",
  "Explain retrieval-augmented generation like I'm new to AI",
  "Compare the latest Claude, GPT and Gemini models",
  "What's the James Webb telescope's most important discovery so far?",
];

export default function Home() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [mode, setMode] = useState<Mode>("pro");
  const [focus, setFocus] = useState<Focus>("web");
  const [model, setModel] = useState("auto");
  const [models, setModels] = useState<ModelOption[]>([]);
  const [defaultModel, setDefaultModel] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setThreads(load<Thread[]>(STORE, []));
    const p = load<{ mode?: Mode; focus?: Focus; model?: string }>(PREFS, {});
    if (p.mode) setMode(p.mode);
    if (p.focus) setFocus(p.focus);
    if (p.model) setModel(p.model);
    fetch("/api/models")
      .then((r) => r.json())
      .then((d) => {
        setModels(d.models || []);
        setDefaultModel(d.defaultModel);
      })
      .catch(() => {});
  }, []);

  useEffect(() => save(PREFS, { mode, focus, model }), [mode, focus, model]);

  const persist = useCallback((next: Thread[]) => {
    // Keep stored history bounded.
    save(STORE, next.slice(0, 60));
  }, []);

  const active = threads.find((t) => t.id === activeId) || null;

  const updateTurn = useCallback((threadId: string, turnId: string, fn: (t: Turn) => Turn) => {
    setThreads((prev) => {
      const next = prev.map((th) => (th.id === threadId ? { ...th, turns: th.turns.map((tu) => (tu.id === turnId ? fn(tu) : tu)) } : th));
      return next;
    });
  }, []);

  const ask = useCallback(
    async (q: string) => {
      const query = q.trim();
      if (!query || busy) return;
      setInput("");
      const turn: Turn = { id: uid(), query, mode, status: "Starting", queries: [], sources: [], answer: "", followups: [], done: false };
      let threadId = activeId;
      let history: { role: "user" | "assistant"; content: string }[] = [];
      if (active) {
        history = active.turns.filter((t) => t.done && t.answer).flatMap((t) => [
          { role: "user" as const, content: t.query },
          { role: "assistant" as const, content: t.answer },
        ]);
        setThreads((prev) => prev.map((th) => (th.id === active.id ? { ...th, turns: [...th.turns, turn] } : th)));
      } else {
        threadId = uid();
        const th: Thread = { id: threadId, title: query.slice(0, 80), createdAt: Date.now(), turns: [turn] };
        setThreads((prev) => [th, ...prev]);
        setActiveId(threadId);
      }
      const tid = threadId!;
      setBusy(true);
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const res = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ query, mode, focus, model, history }),
          signal: ctrl.signal,
        });
        if (!res.ok || !res.body) throw new Error((await res.text()) || `HTTP ${res.status}`);
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf("\n")) >= 0) {
            const line = buf.slice(0, i);
            buf = buf.slice(i + 1);
            if (!line.trim()) continue;
            const ev = JSON.parse(line) as StreamEvent;
            updateTurn(tid, turn.id, (t) => {
              switch (ev.type) {
                case "status":
                  return { ...t, status: ev.message };
                case "queries":
                  return { ...t, queries: [...t.queries, ...ev.queries] };
                case "sources":
                  return { ...t, sources: ev.sources };
                case "token":
                  return { ...t, answer: t.answer + ev.text };
                case "followups":
                  return { ...t, followups: ev.items };
                case "done":
                  return { ...t, meta: ev.meta, done: true };
                case "error":
                  return { ...t, error: ev.message, done: true };
              }
            });
          }
        }
      } catch (e) {
        const aborted = ctrl.signal.aborted;
        updateTurn(tid, turn.id, (t) => ({ ...t, error: aborted ? undefined : e instanceof Error ? e.message : String(e), done: true }));
      } finally {
        updateTurn(tid, turn.id, (t) => ({ ...t, done: true }));
        setBusy(false);
        abortRef.current = null;
        setThreads((prev) => {
          persist(prev);
          return prev;
        });
      }
    },
    [active, activeId, busy, focus, mode, model, persist, updateTurn],
  );

  useEffect(() => {
    if (busy) bottomRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [active?.turns.length, busy]);

  const composer = (compact: boolean) => (
    <Composer
      value={input}
      onChange={setInput}
      onSubmit={() => ask(input)}
      onStop={() => abortRef.current?.abort()}
      busy={busy}
      mode={mode}
      setMode={setMode}
      focus={focus}
      setFocus={setFocus}
      model={model}
      setModel={setModel}
      models={models}
      autoFocus
      compact={compact}
      placeholder={compact ? "Ask a follow-up…" : "Ask anything…"}
    />
  );

  return (
    <div className="flex min-h-dvh">
      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 shrink-0 border-r border-line bg-panel p-3 transition-transform md:sticky md:top-0 md:h-dvh md:translate-x-0 ${
          sidebar ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-2 py-2">
          <span className="font-serif text-2xl tracking-tight">Lumen</span>
          <button className="text-muted md:hidden" onClick={() => setSidebar(false)} aria-label="Close menu">
            ✕
          </button>
        </div>
        <button
          onClick={() => {
            setActiveId(null);
            setSidebar(false);
          }}
          className="mt-2 flex w-full items-center gap-2 rounded-lg border border-line bg-card px-3 py-2 text-sm hover:border-accent/50"
        >
          <span className="text-accent">＋</span> New thread
        </button>
        <div className="mt-5 px-2 text-[0.7rem] font-medium tracking-wide text-muted uppercase">History</div>
        <nav className="mt-1 flex max-h-[calc(100dvh-13rem)] flex-col gap-0.5 overflow-y-auto">
          {threads.length === 0 && <p className="px-2 py-1 text-sm text-muted">Your searches appear here.</p>}
          {threads.map((t) => (
            <div key={t.id} className="group flex items-center">
              <button
                onClick={() => {
                  setActiveId(t.id);
                  setSidebar(false);
                }}
                className={`flex-1 truncate rounded-md px-2 py-1.5 text-left text-sm ${t.id === activeId ? "bg-card font-medium" : "text-muted hover:bg-card/60 hover:text-fg"}`}
              >
                {t.title}
              </button>
              <button
                aria-label="Delete thread"
                onClick={() => {
                  const next = threads.filter((x) => x.id !== t.id);
                  setThreads(next);
                  persist(next);
                  if (activeId === t.id) setActiveId(null);
                }}
                className="px-1.5 text-xs text-muted opacity-0 group-hover:opacity-100 hover:text-fg"
              >
                ✕
              </button>
            </div>
          ))}
        </nav>
        <div className="absolute inset-x-3 bottom-3 px-2 text-[0.7rem] leading-relaxed text-muted">
          {defaultModel ? (
            <>
              Default model: <span className="text-fg">{defaultModel}</span>
              <br />
              {models.length} models available
            </>
          ) : (
            "No model configured: see README"
          )}
        </div>
      </aside>
      {sidebar && <div className="fixed inset-0 z-20 bg-black/30 md:hidden" onClick={() => setSidebar(false)} />}

      <main className="min-w-0 flex-1">
        <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-line bg-bg/90 px-4 py-2 backdrop-blur md:hidden">
          <button onClick={() => setSidebar(true)} aria-label="Open menu" className="text-lg">
            ☰
          </button>
          <span className="font-serif text-xl">Lumen</span>
        </div>

        {!active ? (
          <div className="mx-auto flex min-h-[calc(100dvh-3rem)] max-w-2xl flex-col justify-center px-4 pb-24 md:min-h-dvh">
            <h1 className="text-center font-serif text-5xl tracking-tight md:text-6xl">Where knowledge begins, freely.</h1>
            <p className="mt-3 mb-8 text-center text-muted">Every model. Every engine. Cited answers, no paywall.</p>
            {composer(false)}
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  onClick={() => ask(s)}
                  className="rounded-xl border border-line px-3 py-2.5 text-left text-sm text-muted transition hover:border-accent/50 hover:text-fg"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl px-4 pt-6 pb-48">
            {active.turns.map((t, idx) => (
              <TurnView key={t.id} turn={t} last={idx === active.turns.length - 1} onAsk={ask} />
            ))}
            <div ref={bottomRef} />
            <div className="fixed inset-x-0 bottom-0 z-10 bg-gradient-to-t from-bg via-bg/95 to-transparent pt-8 pb-4 md:left-64">
              <div className="mx-auto max-w-3xl px-4">{composer(true)}</div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function TurnView({ turn, last, onAsk }: { turn: Turn; last: boolean; onAsk: (q: string) => void }) {
  const [allSources, setAllSources] = useState(false);
  const [copied, setCopied] = useState(false);
  const shown = allSources ? turn.sources : turn.sources.slice(0, 4);
  const streaming = !turn.done && turn.answer.length > 0;

  return (
    <section className="border-b border-line py-6 first:pt-0 last:border-0">
      <h2 className="text-2xl font-semibold tracking-tight md:text-[1.7rem]">{turn.query}</h2>

      {turn.queries.length > 0 && (
        <details className="mt-3 text-sm text-muted">
          <summary className="cursor-pointer select-none">
            {turn.done ? `Searched ${turn.queries.length} ${turn.queries.length === 1 ? "query" : "queries"}` : turn.status}
            {turn.meta && ` · read ${turn.meta.pagesRead} pages · ${(turn.meta.ms / 1000).toFixed(1)}s`}
          </summary>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {turn.queries.map((q, i) => (
              <span key={i} className="rounded-full bg-panel px-2.5 py-1 text-xs">
                🔍 {q}
              </span>
            ))}
          </div>
        </details>
      )}
      {!turn.done && turn.queries.length === 0 && <p className="mt-3 animate-pulse text-sm text-muted">{turn.status}…</p>}

      {turn.sources.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-sm font-medium text-muted">Sources</h3>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {shown.map((s) => (
              <a
                key={s.id}
                href={s.url}
                target="_blank"
                rel="noreferrer"
                title={s.snippet}
                className="flex min-h-[4.5rem] flex-col justify-between rounded-xl bg-panel p-2.5 text-xs transition hover:bg-accent-soft"
              >
                <span className="line-clamp-2 font-medium text-fg">{s.title}</span>
                <span className="mt-1.5 flex items-center gap-1.5 text-muted">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.favicon} alt="" width={14} height={14} className="rounded-sm" loading="lazy" />
                  <span className="truncate">{s.domain}</span>
                  <span className="ml-auto shrink-0 tabular-nums">{s.id}</span>
                </span>
              </a>
            ))}
          </div>
          {turn.sources.length > 4 && (
            <button onClick={() => setAllSources((v) => !v)} className="mt-2 text-xs text-accent hover:underline">
              {allSources ? "Show fewer" : `Show all ${turn.sources.length} sources`}
            </button>
          )}
        </div>
      )}

      {(turn.answer || turn.error) && (
        <div className="mt-6">
          <h3 className="mb-1 flex items-center gap-2 text-sm font-medium text-muted">
            <span className="inline-block h-2 w-2 rounded-full bg-accent" /> Answer
          </h3>
          {turn.answer && <Markdown text={turn.answer} sources={turn.sources} streaming={streaming} />}
          {turn.error && <p className="mt-2 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-600 dark:text-red-400">{turn.error}</p>}
        </div>
      )}

      {turn.done && turn.answer && (
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted">
          <button
            onClick={() => {
              navigator.clipboard?.writeText(turn.answer).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              });
            }}
            className="rounded-md px-2 py-1 hover:bg-panel hover:text-fg"
          >
            {copied ? "Copied" : "Copy"}
          </button>
          {turn.meta && (
            <span>
              {turn.meta.model} · {turn.meta.mode} · engines: {Object.keys(turn.meta.engines).join(", ") || "none"}
            </span>
          )}
        </div>
      )}

      {last && turn.followups.length > 0 && (
        <div className="mt-6">
          <h3 className="mb-1 text-sm font-medium text-muted">Related</h3>
          <ul className="divide-y divide-line">
            {turn.followups.map((f) => (
              <li key={f}>
                <button onClick={() => onAsk(f)} className="flex w-full items-center justify-between py-2.5 text-left text-[0.95rem] hover:text-accent">
                  {f}
                  <span className="text-accent">＋</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
