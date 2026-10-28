"use client";

import { useEffect, useRef } from "react";
import type { Focus, Mode } from "@/lib/types";

export interface ModelOption {
  id: string;
  label: string;
  provider: string;
  free: boolean;
}

const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: "quick", label: "Quick", hint: "Fast answer from top results" },
  { id: "pro", label: "Pro", hint: "Plans several searches, reads more pages" },
  { id: "deep", label: "Deep", hint: "Multi-round research report" },
];

const FOCUSES: { id: Focus; label: string }[] = [
  { id: "web", label: "Web" },
  { id: "academic", label: "Academic" },
  { id: "social", label: "Discussions" },
  { id: "news", label: "News" },
  { id: "video", label: "Video" },
  { id: "wiki", label: "Wikipedia" },
];

export function Composer(props: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onStop?: () => void;
  busy?: boolean;
  mode: Mode;
  setMode: (m: Mode) => void;
  focus: Focus;
  setFocus: (f: Focus) => void;
  model: string;
  setModel: (m: string) => void;
  models: ModelOption[];
  placeholder?: string;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 220) + "px";
  }, [props.value]);

  const groups = props.models.reduce<Record<string, ModelOption[]>>((acc, m) => {
    (acc[m.provider] ||= []).push(m);
    return acc;
  }, {});

  return (
    <div className="rounded-2xl border border-line bg-card shadow-[0_1px_0_rgba(0,0,0,0.02),0_8px_24px_-12px_rgba(0,0,0,0.12)] focus-within:border-accent/60">
      <textarea
        ref={ref}
        autoFocus={props.autoFocus}
        rows={props.compact ? 1 : 2}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            if (!props.busy && props.value.trim()) props.onSubmit();
          }
        }}
        placeholder={props.placeholder || "Ask anything…"}
        aria-label="Ask a question"
        className="block w-full resize-none bg-transparent px-4 pt-4 pb-2 text-[1.02rem] outline-none placeholder:text-muted"
      />
      <div className="flex flex-wrap items-center gap-2 px-3 pb-3">
        <div className="flex rounded-lg bg-panel p-0.5" role="radiogroup" aria-label="Search mode">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={props.mode === m.id}
              title={m.hint}
              onClick={() => props.setMode(m.id)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                props.mode === m.id ? "bg-card text-fg shadow-sm" : "text-muted hover:text-fg"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <select
          aria-label="Focus"
          value={props.focus}
          onChange={(e) => props.setFocus(e.target.value as Focus)}
          className="rounded-lg bg-panel px-2 py-1.5 text-xs text-muted outline-none hover:text-fg"
        >
          {FOCUSES.map((f) => (
            <option key={f.id} value={f.id}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Model"
          value={props.model}
          onChange={(e) => props.setModel(e.target.value)}
          className="max-w-[14rem] truncate rounded-lg bg-panel px-2 py-1.5 text-xs text-muted outline-none hover:text-fg"
        >
          <option value="auto">Auto (best available)</option>
          {Object.entries(groups).map(([provider, ms]) => (
            <optgroup key={provider} label={provider}>
              {ms.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.id.slice(provider.length + 1)}
                  {m.free ? " · free" : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <div className="ml-auto">
          {props.busy ? (
            <button
              type="button"
              onClick={props.onStop}
              aria-label="Stop"
              className="grid h-9 w-9 place-items-center rounded-full bg-fg text-bg transition hover:opacity-80"
            >
              <span className="block h-3 w-3 rounded-[2px] bg-bg" />
            </button>
          ) : (
            <button
              type="button"
              onClick={props.onSubmit}
              disabled={!props.value.trim()}
              aria-label="Search"
              className="grid h-9 w-9 place-items-center rounded-full bg-accent text-white transition hover:opacity-90 disabled:opacity-30"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
