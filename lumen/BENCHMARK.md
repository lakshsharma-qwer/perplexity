# Benchmark results

Generated 2026-10-27 by `npx tsx eval/report.ts`.

## SimpleQA (OpenAI factuality benchmark)

Seeded random sample from the 4,326-question test set, graded with the official rubric by `claude-code:sonnet`. Pages that republish the dataset (Hugging Face, GitHub, Kaggle, etc.) are blocked during search.

| System | Seed | n | Accuracy | Accuracy when attempted | F-score | Wrong | Not attempted | Median time |
|---|---|---|---|---|---|---|---|---|
| **Lumen pro, all current runs pooled** | 11 + 7 | 200 | 77.5% | 92.3% | **0.842** | 13 | 32 | – |
| **Lumen pro** (auto) | 7 | 100 | 79.0% | 90.8% | **0.845** | 8 | 13 | 112.6s |
| **Lumen pro** (auto) | 11 | 100 | 76.0% | 93.8% | **0.840** | 5 | 19 | 117.4s |
| Lumen pro, first version (before the retrieval fixes below) | 7 | 100 | 66.0% | 97.1% | **0.786** | 2 | 32 | 76.5s |
| Same model, no search (claude-code:sonnet) | 7 | 100 | 45.0% | 54.9% | **0.495** | 37 | 18 | 11.9s |
| Same model, no search (claude-code:sonnet) | 11 | 100 | 35.0% | 43.2% | **0.387** | 46 | 19 | 11.8s |

**Perplexity, as published by Perplexity** (full test set, their own grading): Sonar Pro F-score **0.858**, Sonar **0.773** ([Sonar Pro API announcement](https://www.perplexity.ai/hub/blog/introducing-the-sonar-pro-api)); Deep Research accuracy **93.9%** ([Deep Research announcement](https://www.perplexity.ai/hub/blog/introducing-perplexity-deep-research)).

### Reading these numbers honestly

- Perplexity's figures come from their own runs on the full set; ours are samples with a different grader, so treat differences of a few points as noise. The 95% margin of error is roughly ±7 points for n = 100 and ±5 for the pooled n = 200.
- Seed 7 is the sample the fixes were debugged against. Seed 11 was run only after all fixes were in, so it is the fairer estimate of performance on unseen questions.
- This setup used **only free search engines** (mostly Wikipedia, with no contact email so Wikipedia limited it to 10 requests/min). SimpleQA questions are largely answerable from Wikipedia, which suits that setup; on news and long-tail web questions Perplexity's own index has a clear advantage unless you add a web-search key or SearXNG.
- The first version's misses were nearly all "not attempted" with the answer sitting in a page we had fetched or could have. The fixes, all generic: page titles counted in every chunk's score, light stemming, passages that contain the question's numbers ("1987", "season 3") are guaranteed a slot, nested templates (episode tables, timelines, currency) rendered instead of dropped, headings and reference sections handled correctly, exact Wikipedia title lookups proposed by the planner (including local-language Wikipedias such as `es:Vegachí`), and Wikipedia's spelling suggestion when a search finds nothing.
- "Wrong" is what matters most to users: an answer that says "the sources don't say" scores as not attempted, not as an error.
