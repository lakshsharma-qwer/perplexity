"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Source } from "@/lib/types";

/** Turns "[1]", "[1, 3]" and "[1][2]" into citation links the renderer turns into chips. */
function linkCitations(md: string): string {
  return md.replace(/\[(\d{1,2}(?:\s*[,;]\s*\d{1,2})*)\](?!\()/g, (_, g: string) =>
    g
      .split(/\s*[,;]\s*/)
      .map((n) => `[${n}](#cite-${n})`)
      .join(""),
  );
}

export function Markdown({ text, sources, streaming }: { text: string; sources: Source[]; streaming?: boolean }) {
  return (
    <div className={`prose-answer ${streaming ? "cursor-blink" : ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children }) {
            if (href?.startsWith("#cite-")) {
              const n = Number(href.slice(6));
              const s = sources.find((x) => x.id === n);
              if (!s) return null;
              return (
                <a
                  href={s.url}
                  target="_blank"
                  rel="noreferrer"
                  title={`${s.title} — ${s.domain}`}
                  className="cite mx-[1px] inline-flex h-[1.15rem] min-w-[1.15rem] -translate-y-[1px] items-center justify-center rounded-full bg-accent-soft px-1 align-middle text-[0.68rem] font-semibold text-accent no-underline hover:bg-accent hover:text-white"
                >
                  {n}
                </a>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {linkCitations(text)}
      </ReactMarkdown>
    </div>
  );
}
