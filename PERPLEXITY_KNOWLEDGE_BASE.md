# Perplexity AI — End-to-End Knowledge Base

> Compiled 2026-10-27. Sources: Perplexity docs/blog, Wikipedia, Vespa case study, VentureBeat, Bloomberg, legal trackers (links at bottom).
> Confidence tags: **[confirmed]** = official or multiple reliable sources · **[reported]** = press/secondary, may be off · **[estimate]** = conflicting figures.

---

## 1. What Perplexity is (one paragraph)

Perplexity is an **"answer engine"**: you ask a question in natural language, it searches the live web, reads the most relevant passages, and an LLM writes a direct answer with **inline numbered citations** to its sources. It has grown from a search box (2022) into a stack of products: a consumer answer engine, an AI browser (**Comet**), a general-purpose task agent (**Computer**), enterprise search, and a developer API platform. Its core technique is **Retrieval-Augmented Generation (RAG)** at web scale.

---

## 2. Company timeline (start → today)

### Founding (2022)
| Item | Detail |
|---|---|
| Founded | **Aug 22, 2022**, San Francisco **[confirmed]** |
| Founders | **Aravind Srinivas** (CEO; ex-OpenAI, Google DeepMind research; PhD UC Berkeley), **Denis Yarats** (CTO; ex-Meta AI research, PhD NYU), **Johnny Ho** (ex-Quora engineer, competitive programmer), **Andy Konwinski** (co-founder of Databricks) |
| Original idea | Early experiments were text-to-SQL over structured data (e.g., Twitter data). Pivoted to general web Q&A when ChatGPT-style LLMs made "search + summarize with citations" viable |
| Launch | **Dec 7, 2022** — first public answer engine (one week after ChatGPT launched) |

### Growth milestones
| Date | Event |
|---|---|
| Feb 2023 | ~2M unique visitors |
| Mar–Apr 2023 | $26M Series A (NEA, Elad Gil, Nat Friedman, Databricks); iOS app; later Android + Chrome extension |
| 2023 | **Perplexity Pro** ($20/mo) — pick models (GPT-4, Claude), Copilot/Pro Search, file uploads |
| Nov 2023 | **pplx-api** launched; online models `pplx-7b-online`/`pplx-70b-online` (fresh web data) |
| Jan 2024 | $73.6M Series B @ ~$520M — Nvidia, **Jeff Bezos**, IVP |
| Apr 2024 | ~$63M more @ >$1B (unicorn); **Enterprise Pro** launched |
| May 2024 | **Pages** (turn research into shareable articles) |
| Jun 2024 | Forbes/Wired plagiarism & robots.txt controversy |
| Jul 2024 | **Publishers' Program** (rev share with TIME, Der Spiegel, Fortune, etc.) |
| Oct–Nov 2024 | Finance features; Internal Knowledge Search; **Shopping** hub with "Buy with Pro"; ads pilot (sponsored follow-up questions) |
| Dec 2024 | Round closing at **$9B** valuation |
| Jan 2025 | **Sonar** API relaunch (Sonar / Sonar Pro); **Perplexity Assistant** on Android; TikTok US merger proposal |
| Feb 2025 | **Deep Research** launched; **R1 1776** (open-weight DeepSeek-R1 post-trained to remove CCP censorship) |
| Apr 2025 | Search index brought in-house on **Vespa.ai** |
| Mid 2025 | $500M @ **$14B**; Samsung deal reported; Motorola preload; Airtel (India) free Pro for ~360M users **[reported]**; PayPal/Venmo checkout partnerships |
| Jul 2025 | **Comet** browser launched (Max-only first) |
| Jul 2025 | **Perplexity Max** ($200/mo) tier |
| Aug 2025 | Unsolicited **$34.5B bid for Google Chrome** (not accepted); Cloudflare "stealth crawler" accusation |
| Sep 2025 | Valuation **$20B**; **Search API** for developers; Comet Plus (publisher rev-share subscription, $5/mo) |
| Oct 2025 | **Comet made free** for everyone; Reddit lawsuit |
| Nov 2025 | Amazon sues over Comet's shopping agent; Comet on Android |
| Dec 2025 | Cristiano Ronaldo stake + brand partnership |
| Jan 2026 | Series E-6 ~**$21–23B** **[estimate]**; **$750M / 3-yr Microsoft Azure + Foundry deal** (AWS stays primary cloud) |
| Feb 2026 | **Dropped ads**, moved to subscription-first model; **Perplexity Computer** launched (Feb 25, Max-only) |
| Mar 2026 | Computer to Pro/Enterprise + Slack app; Comet on iOS; Galaxy S26 ships with Perplexity integration (Bixby hand-off) **[reported]** |
| Apr 2026 | **Personal Computer** (Computer running on local device) |
| May 2026 | CNN lawsuit |
| Aug 4, 2026 | **9th Circuit vacates Amazon's injunction** vs Comet — ruled that the *user*, not the AI agent, "accesses" the site under the CFAA (landmark for agentic AI). En banc rehearing denied Sep 10 |
| Late Aug 2026 | Nvidia reportedly in talks to invest at **>$30B** (not closed) **[reported]** |
| Sep 2026 | Sonar Chat Completions API retired (~Sep 27) → **Agent API**; **Automations** for Computer (Sep 29) |
| Oct 2026 | Interactive charts in Computer + GPT-6.1 Sol (Oct 5); shared Projects workspaces (Oct 12); **SPACE** sandbox open-sourced (Oct 15); **Computer fully local on Mac** (Oct 20); old OpenAI model IDs dropped from Agent/Orchestrator APIs (Oct 24) |

---

## 3. Business snapshot

| Metric | Value |
|---|---|
| Valuation | ~$21–23B (Jan 2026); talks at >$30B (Aug 2026) **[estimate]** |
| Total raised | ~$1.7B equity across ~9 rounds **[reported]** |
| ARR | ~$232M end-2025 → ~$750M Aug 2026 **[estimate, conflicting]** |
| Usage | 100M+ queries/week (2025, Vespa); 780M queries/month (May 2025, CEO); ~30–45M MAU **[estimate]** |
| Key investors | Nvidia, Jeff Bezos, IVP, NEA, SoftBank Vision Fund 2, Databricks, Tobi Lütke, Nat Friedman, Elad Gil, Yann LeCun, Accel, 1789 Capital, Samsung (reported) |
| Cloud | AWS (primary), Microsoft Azure (models via Foundry) |
| IPO | Speculation of ~2028; nothing confirmed |

### Revenue model
1. **Consumer subscriptions** (primary since Feb 2026) — Pro, Max, Education.
2. **Enterprise** — Enterprise Pro / Enterprise Max (SSO, data retention controls, internal file search, connectors).
3. **API** — pay-per-use (Agent, Search, Embeddings, Orchestrator, Decisions).
4. **Distribution deals** — telcos & OEMs bundle Pro (Airtel, SoftBank, Deutsche Telekom, Samsung, Motorola, PayPal).
5. **Publisher rev share** — Comet Plus pool (80% to publishers, reported).
6. ~~Ads~~ — piloted 2024, abandoned Feb 2026.

### Pricing (Oct 2026, verify on perplexity.ai)
| Plan | Price | Highlights |
|---|---|---|
| Free | $0 | Unlimited basic search, limited Pro searches, Comet |
| Pro | $20/mo ($17/mo annual) | Frontier model choice, Pro/Deep Research, file uploads, Labs, Computer weekly allowance + 4,000 bonus credits |
| Max | $200/mo ($167/mo annual) | Top models (e.g., Claude Opus, GPT-6.x), 10,000 Computer credits/mo + 35,000 bonus, early access |
| Enterprise Pro / Max | per seat | Admin, SSO, SOC 2, no training on data, connectors |
| Computer credits | ~$1 per 100 credits **[reported]** | |

---

## 4. Product catalog

### Consumer
- **Answer engine (perplexity.ai)** — modes: Quick/Auto, **Pro Search** (multi-step search planning), **Reasoning**, **Deep Research** (dozens of searches, reads hundreds of sources, writes a report in minutes; now runs inside Computer), **Labs** (builds spreadsheets, dashboards, mini-apps).
- **Focus/sources** — Web, Academic, Social (Reddit), Finance, SEC filings.
- **Spaces / Projects** — persistent collections with custom instructions + files; since Oct 2026 shared by people and agents.
- **Pages** — research → publishable article.
- **Discover** — curated news feed.
- **Finance** — real-time stock/crypto data, earnings, charts.
- **Shopping** — product cards, Buy with Pro, PayPal checkout.
- **Assistant** — mobile assistant (Android, iOS) that takes actions across apps.
- **Comet** — Chromium AI browser: sidebar assistant that sees the page, summarizes, and runs agentic tasks (fill forms, shop, email, calendar). Free; desktop, Android, iOS.
- **Computer** — general-purpose agent: breaks a goal into subtasks, orchestrates ~19–20+ models, runs code in a secure sandbox, uses connectors, delivers finished work (docs, sites, analyses). Has **Automations** (scheduled/event triggers), **Computer in Email**, **Slack app**, **Personal/local Computer on Mac**.
- **Integrations** — WhatsApp, Telegram, X bot (@AskPerplexity), Samsung Galaxy, Motorola.

### Developer platform (docs.perplexity.ai, console.perplexity.ai)
| API | Purpose |
|---|---|
| **Agent API** (`POST /v1/agent`) | Web-grounded answers with citations in one call; or third-party models (OpenAI, Anthropic, Google, xAI) + web search tools with effort levels. Successor to Sonar Chat Completions |
| **Search API** | Raw ranked web results, filters (domain, recency, date), real-time data — build your own RAG |
| **Embeddings API** | Standard + contextualized embeddings for semantic search / RAG |
| **Orchestrator API** | OpenAI-compatible endpoint for Perplexity-hosted open-weight models (e.g., `perplexity/kimi-k3`); chat completions, responses, messages formats |
| **Decisions API** | Typed answers with probabilities for yes/no, multiple-choice, rubric questions (`pplx-decider-v1.2`, `pplx-decider-flash-v1.2`) |
| Others | Batch, Files, Skills, Auth tokens, Analytics |
| Open source | **SPACE** (agent sandbox, Oct 2026), **R1 1776** model |

**Legacy Sonar family (for reference):** `sonar`, `sonar-pro`, `sonar-reasoning`, `sonar-reasoning-pro`, `sonar-deep-research` — OpenAI-compatible `/chat/completions` at `https://api.perplexity.ai`, returned `citations`/`search_results`. Built on Llama 3.3 70B post-trained for factuality, served on Cerebras for ~1,200 tok/s. Migrating → Agent API effort levels.

---

## 5. How Perplexity works — technical architecture

```
User query
   │
   ▼
[1] Query understanding ── classify intent, rewrite/expand, decide # of searches,
   │                      pick vertical (web/news/finance/academic), safety
   ▼
[2] Retrieval (in-house index on Vespa)
   │   • hybrid: lexical BM25 + dense vector (semantic) + structured filters
   │   • PASSAGE-level retrieval (chunks, not whole pages)
   │   • real-time indexing of fresh content; + live fetch/crawl (PerplexityBot)
   │   • partner/licensed data feeds (finance, maps, shopping, etc.)
   ▼
[3] Multi-stage ranking
   │   • cheap first-phase rank over large candidate set
   │   • neural re-rankers (cross-encoders) on top-k
   │   • signals: relevance, authority/trust, freshness, diversity
   ▼
[4] Context assembly ── top passages + metadata, numbered [1][2]..., dedup, token budget
   ▼
[5] Generation ── LLM (in-house Sonar or user-chosen frontier model) with prompt:
   │              "answer only from sources, cite each claim with [n]"
   ▼
[6] Post-processing ── citation linking, related follow-up questions, images/videos,
   │                   answer cards (stocks, weather, products)
   ▼
Stream to UI (SSE) — sources shown first, answer streams token by token
```

### Key engineering facts
- **Search infra:** In April 2025 moved to **Vespa.ai** to unify retrieval, ranking, filtering, real-time indexing, and ML inference in one distributed engine instead of separate DB + vector store + ranker + model server. Before that, relied heavily on third-party search APIs (Bing/Google results) plus its own crawler.
- **Crawler:** `PerplexityBot` (indexing) and `Perplexity-User` (user-triggered fetches; Perplexity argues it acts like a user and so isn't bound by robots.txt the same way — the source of the Cloudflare/Wired disputes).
- **Models:** Model-agnostic orchestration. In-house: Sonar (Llama-based), R1 1776, pplx-embed / decider models. Third-party: OpenAI GPT, Anthropic Claude, Google Gemini, xAI Grok, Kimi, DeepSeek, etc. Routers pick models per subtask.
- **Inference:** Uses **NVIDIA TensorRT-LLM** + H100/Blackwell GPUs on AWS; Cerebras for fast Sonar; built its own inference engine and published work on MoE kernels / disaggregated serving.
- **Agents (Computer/Comet):** planner → subtasks → tool calls (browser, code sandbox **SPACE**, connectors like Gmail/Slack/Drive/GitHub) → verifier → final artifact. Sandbox enforces network/credential controls and session recovery.
- **Latency tricks:** parallel search calls, streaming sources before answer, speculative decoding, caching of popular queries, small models for routing/rewriting, big models only for final synthesis.
- **Product principle (Srinivas):** "Every sentence should have a citation" — like an academic paper; the user should be able to verify.

---

## 6. Competitive landscape

| Competitor | Angle vs Perplexity |
|---|---|
| **Google** (AI Overviews, AI Mode, Gemini) | Owns the index, distribution (Android/Chrome default), ads money |
| **OpenAI** (ChatGPT Search, Atlas browser, agents) | Biggest consumer AI user base |
| **Anthropic Claude** (web search, Claude for Chrome) | Model + agentic tools |
| **Microsoft** (Copilot / Bing) | Bing index, Windows/Edge distribution; also a Perplexity cloud partner |
| **xAI Grok**, **You.com**, **Brave Search/Leo**, **Kagi**, **Exa**, **Tavily** | Search APIs and alt engines |
| Browsers: **Arc/Dia (Atlassian)**, **Opera Neon**, **Atlas** | vs Comet |

**Moat thesis:** speed + UX + citations + model neutrality + fast shipping; **risks:** dependence on others' models, publisher lawsuits, Google/OpenAI copying features, compute costs.

---

## 7. Legal & controversy tracker (as of Oct 2026)

| Case / issue | Status |
|---|---|
| Forbes / Wired plagiarism, robots.txt (2024) | Reputational; led to Publishers' Program |
| Dow Jones & NY Post (Oct 2024) — copyright + hallucinated quotes | Active |
| NYT (C&D 2024; suit later) + Chicago Tribune | Motion to dismiss counts II–V filed Apr 2026; pending |
| Perplexity Solved Solutions — trademark (Jan 2025) | — |
| Yomiuri, Asahi, Nikkei (Japan, Aug 2025) | Active |
| Britannica & Merriam-Webster (Sep 2025) | Court ordered more data production Sep 2026 |
| Reddit (Oct 2025) — scraping via proxies (with SerpApi, Oxylabs, AWMProxy) | Motions to dismiss largely denied Jul 2026; active |
| **Amazon v. Perplexity** (Nov 2025) — Comet shopping agent, CFAA | Injunction **vacated by 9th Cir. Aug 4, 2026**; back in district court |
| CNN (May 2026) | Partial MTD filed Aug 2026 |
| Cloudflare "stealth crawler" report (Aug 2025) | Disputed by Perplexity |
| No settlements reported as of Sep 30, 2026 | |

---

## 8. Building a Perplexity-style clone (practical blueprint)

### Minimum viable stack
| Layer | Options |
|---|---|
| Frontend | Next.js + Tailwind + shadcn/ui; streaming UI (Vercel AI SDK `useChat`), markdown + citation chips |
| Backend | Next.js route handlers / FastAPI / Node; SSE streaming |
| Search | Tavily, Exa, Brave Search API, SerpAPI, Bing (retired 2025) / Google CSE, **Perplexity Search API**, or self-hosted SearXNG |
| Scrape/clean | Jina Reader (`r.jina.ai`), Firecrawl, Readability + Cheerio, Playwright for JS pages |
| Chunk + rank | Split into ~300–500-token passages → embed (OpenAI / Voyage / Perplexity embeddings) → cosine + BM25 hybrid → re-rank (Cohere/Jina/Voyage rerank) |
| LLM | Claude (Sonnet/Haiku 5.5), GPT, Gemini, or Groq/Cerebras open models for speed |
| Storage | Postgres (Supabase/Neon) for threads, users; Redis for cache/rate limits; pgvector or Vespa/Qdrant if you build an index |
| Auth/payments | Clerk / NextAuth / Supabase Auth; Stripe |

### Request pipeline
1. `POST /api/search {query, history}`
2. **Rewrite** the query with a small LLM (resolve follow-ups using history; produce 1–5 sub-queries).
3. **Search** sub-queries in parallel → take top ~8–15 URLs, dedupe by domain.
4. **Fetch + extract** text in parallel with timeouts (≈3s each); drop failures.
5. **Chunk + rank** passages vs the query; keep top ~10–20 within the token budget.
6. **Stream sources** to the client immediately (title, url, favicon).
7. **Generate** with a system prompt like:
   ```
   You are an answer engine. Answer using ONLY the numbered sources below.
   Cite every factual sentence with [n]. If sources disagree, say so.
   If sources don't answer the question, say you don't know.
   Use markdown, be concise, lead with the direct answer.
   Sources:
   [1] {title} ({url}): {passage}
   ...
   ```
8. **Stream tokens** via SSE; client renders `[n]` as clickable chips.
9. **Follow-ups:** separate cheap call → 3–5 related questions.
10. Persist thread (query, sources, answer) for sharing and history.

### Features to add progressively
Pro Search (multi-step planner loop) → Focus modes (academic, Reddit, YouTube, finance) → image/video results → file upload (PDF RAG) → Spaces with custom instructions → Deep Research (agent loop: plan → search → read → reflect → repeat N times → write report) → shareable Pages → Discover feed → agentic browsing (Playwright) → mobile app.

### Gotchas
- Latency budget: aim for first source <1s, first token <2s.
- Hallucinated citations: validate that each `[n]` exists; consider a verification pass.
- Respect robots.txt and API ToS; cache results to cut search API cost.
- Rate-limit + abuse protection on free tier.
- Prompt injection from scraped pages — treat page text as data, never instructions.

### Open-source references
Perplexica (ItzCrazyKns), Morphic (miurla), LLM Answer Engine (developersdigest), Farfalle, OpenPerplex, Scira (formerly MiniPerplx), Vercel AI SDK templates.

---

## 9. Key people
- **Aravind Srinivas** — CEO, public face, very active on X.
- **Denis Yarats** — CTO.
- **Johnny Ho** — Chief Strategy Officer (early product/engineering lead).
- **Andy Konwinski** — co-founder (also Databricks, Laude Institute).
- **Dmitry Shevelenko** — Chief Business Officer (partnerships: Samsung, telcos, publishers).

---

## 10. Sources
- [Wikipedia — Perplexity AI](https://en.wikipedia.org/wiki/Perplexity_AI)
- [Perplexity Docs](https://docs.perplexity.ai) · [llms.txt](https://docs.perplexity.ai/llms.txt) · [Changelog](https://docs.perplexity.ai/docs/resources/changelog)
- [Perplexity Blog](https://www.perplexity.ai/hub/blog)
- [Vespa case study](https://vespa.ai/case-studies/perplexity/) · [Vespa partnership PR](https://vespa.ai/perplexity-partners-with-vespa-ai/)
- [VentureBeat — Perplexity Computer launch](https://venturebeat.com/technology/perplexity-launches-computer-ai-agent-that-coordinates-19-models-priced-at)
- [Bloomberg — Samsung deal](https://www.bloomberg.com/news/articles/2025-06-01/samsung-nears-wide-ranging-deal-with-perplexity-for-ai-features)
- [Cooley — 9th Circuit Amazon v. Perplexity](https://www.cooley.com/news/insight/2026/2026-08-06-ninth-circuit-rules-on-ai-agent-access-to-third-party-websites-under-cfaa)
- [AI Lawsuit Tracker — Perplexity](https://ailawsuittracker.com/companies/perplexity/)
- [Revenue Memo — funding history](https://www.revenuememo.com/p/perplexity-funding) · [Tracxn profile](https://tracxn.com/d/companies/perplexity/__V2BE-5ihMWJ1hNb2_u1W7Gry25JzPFCBg-iNWi94XI8)
- [The Daily Star — SPACE open-source](https://www.thedailystar.net/news/technology/news/perplexity-gives-developers-new-tool-build-safe-ai-agents-4302416)
- [Releasebot — Perplexity release notes](https://releasebot.io/updates/perplexity-ai)
