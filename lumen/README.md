# Lumen: a free, open-source answer engine

Lumen is a self-hosted alternative to Perplexity. You ask a question; it plans searches, queries several search engines at once, reads the pages, ranks the passages most relevant to the question, and streams back an answer with numbered, clickable citations and suggested follow-ups.

It works with any model you have: **Claude Code** (your local `claude` login, no API key), **Anthropic, OpenAI, Gemini, xAI, DeepSeek, Mistral, Groq, OpenRouter** (including all of its `:free` models) and **local Ollama** models. If one provider fails, it falls back to the next.

## Quick start

```bash
npm install
cp .env.example .env.local   # optional: add any keys you have
npm run dev                  # http://localhost:3000
```

With no keys at all it still runs: answers come from your Claude Code login (or Ollama), and search uses the free engines.

**Set `LUMEN_CONTACT`** (an email or URL) in `.env.local`. Wikipedia allows 200 requests/minute to clients that identify themselves and only 10/minute to anonymous ones, so this is the single biggest speed-up for the free setup.

## Features

| | |
|---|---|
| Modes | **Quick** (1 search round, fastest), **Pro** (LLM plans 3 queries, reads ~12 pages), **Deep** (up to 3 research rounds; the model checks what's missing and searches again, then writes a report) |
| Focus | Web, Academic (arXiv, OpenAlex), Discussions (Hacker News, Stack Overflow, Reddit via keyed engines), News, Video, Wikipedia |
| Answers | Streamed Markdown, inline citation chips, source cards, "Related" follow-ups, threaded follow-up questions with conversation memory |
| History | Stored locally in your browser; nothing leaves your machine except the searches and model calls |
| Models | Every provider above, with automatic fallback; pick per question or use **Auto** |

## How it works

```
question
  └─ plan        fast model writes 1–4 keyword queries plus likely Wikipedia titles, incl. local-language
                 ones like "es:Vegachí" (Pro/Deep), or the question + a keyword form (Quick)
  └─ search      all queries × all active engines in parallel, 4.5 s deadline per engine (longer for
                 rate-limited Wikipedia); misspelled names retried with Wikipedia's suggestion
  └─ fuse        weighted Reciprocal Rank Fusion + boost pages whose title is named in the question
  └─ read        Wikipedia via batched API (search + full text in one request), other pages via Readability;
                 robots.txt respected, per-host concurrency + rate limits, 30-min page cache
  └─ rank        BM25 (stemmed, page title counted in every passage) over ~160-word passages, tables kept
                 as "a | b | c" rows, blended with engine consensus; passages holding the question's numbers
                 are boosted and guaranteed a slot; capped per page for diversity
  └─ answer      main model, strict citation prompt, streamed; follow-ups generated in parallel
```

Code map: `src/lib/pipeline.ts` (orchestration), `src/lib/search/` (engines + fusion), `src/lib/extract.ts`, `src/lib/wikipedia.ts`, `src/lib/wikitext.ts`, `src/lib/rank.ts`, `src/lib/llm/` (providers, registry, fallback), `src/lib/prompts.ts`, `src/app/` (UI + `/api/search` NDJSON stream, `/api/models`).

## Search engines

Free, no key, always on: **Wikipedia**, **DuckDuckGo Instant Answers**, **Marginalia**, **Hacker News**, **Stack Exchange**, **arXiv**, **OpenAlex**.

Turn on by setting a key (most have free tiers): **Tavily**, **Serper** (Google results), **Brave Search API**, **Exa**, **Jina**, **Google Programmable Search**, **Perplexity Search API**, or a self-hosted **SearXNG** (`docker compose up -d searxng`, then `SEARXNG_URL=http://localhost:8888`).

Lumen only uses official, documented APIs. It doesn't scrape search result pages, it identifies itself honestly (`LumenBot`), and it respects robots.txt for the pages it reads.

> The free engines are strong on encyclopedic and technical questions but can't match a full web index for news and long-tail pages. Add one web-search key (Tavily or Serper free tiers are enough for personal use) or run SearXNG to close that gap.

## Benchmark

`npm run bench` runs [SimpleQA](https://openai.com/index/introducing-simpleqa/) (OpenAI's factuality benchmark, the one Perplexity reports) on a seeded random sample, grades every answer with the official rubric (correct / incorrect / not attempted), and blocks sites that republish the dataset so answers can't leak. Results go to `eval/results/`.

```bash
N=100 SEED=7 MODE=pro npm run bench                              # Lumen
N=100 SEED=7 MODEL=claude-code:sonnet npm run bench:closed       # same model, no search
```

See [BENCHMARK.md](BENCHMARK.md) for the latest results and how they compare with Perplexity's published numbers.

There is also an end-to-end UI test (`npx tsx eval/e2e.ts http://localhost:3000`) that drives Chrome through a question and a follow-up, and a CLI: `npm run ask -- pro "your question"`.

## Configuration

All settings live in `.env.local`; see [.env.example](.env.example) for the full list (model keys, search keys, `FAST_MODEL`, per-provider model pins, `DISABLE_ENGINES`, `SEARCH_DEADLINE_MS`, `CLAUDE_CODE_CONCURRENCY`).
