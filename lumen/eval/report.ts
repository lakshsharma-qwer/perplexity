/** Builds BENCHMARK.md from eval/results/*.summary.json. Usage: npx tsx eval/report.ts */
import fs from "node:fs";
import path from "node:path";

const dir = path.join(__dirname, "results");
const rows = fs
  .readdirSync(dir)
  .filter((f) => f.endsWith(".summary.json") && !f.includes("-n5-"))
  .map((f) => JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")));

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const label = (run: string) =>
  run.startsWith("simpleqa-closed")
    ? `Same model, no search (${run.match(/closed-(.+?)-n/)?.[1].replace(/_/g, ":")})`
    : run.endsWith("-v1")
      ? `Lumen ${run.match(/lumen-(\w+)-/)?.[1]}, first version (before the retrieval fixes below)`
      : `**Lumen ${run.match(/lumen-(\w+)-/)?.[1]}** (${run.match(/lumen-\w+-(.+?)-n/)?.[1].replace(/_/g, ":")})`;

const seed = (run: string) => run.match(/-s(\d+)/)?.[1];
const line = (name: string, r: { n: number; accuracy: number; accuracyGivenAttempted: number; fScore: number; incorrect: number; notAttempted: number; medianSeconds?: number }, sd = "") =>
  `| ${name} | ${sd} | ${r.n} | ${pct(r.accuracy)} | ${pct(r.accuracyGivenAttempted)} | **${r.fScore.toFixed(3)}** | ${r.incorrect} | ${r.notAttempted} | ${r.medianSeconds ? `${r.medianSeconds}s` : "–"} |`;

// Pool the current Lumen runs across seeds: one bigger sample, smaller margin of error.
const current = rows.filter((r) => r.run.startsWith("simpleqa-lumen") && !r.run.endsWith("-v1"));
const pooled = (() => {
  const n = current.reduce((s, r) => s + r.n, 0);
  const c = current.reduce((s, r) => s + r.correct, 0);
  const inc = current.reduce((s, r) => s + r.incorrect, 0);
  const acc = c / n;
  const aga = c / (c + inc);
  return { n, accuracy: acc, accuracyGivenAttempted: aga, fScore: (2 * acc * aga) / (acc + aga), incorrect: inc, notAttempted: n - c - inc };
})();

const table = [
  ...(current.length > 1 ? [line(`**Lumen pro, all current runs pooled**`, pooled, current.map((r) => seed(r.run)).join(" + "))] : []),
  ...rows.sort((a, b) => b.fScore - a.fScore).map((r) => line(label(r.run), r, seed(r.run))),
].join("\n");

const md = `# Benchmark results

Generated ${new Date().toISOString().slice(0, 10)} by \`npx tsx eval/report.ts\`.

## SimpleQA (OpenAI factuality benchmark)

Seeded random sample from the 4,326-question test set, graded with the official rubric by \`${rows[0]?.grader}\`. Pages that republish the dataset (Hugging Face, GitHub, Kaggle, etc.) are blocked during search.

| System | Seed | n | Accuracy | Accuracy when attempted | F-score | Wrong | Not attempted | Median time |
|---|---|---|---|---|---|---|---|---|
${table}

**Perplexity, as published by Perplexity** (full test set, their own grading): Sonar Pro F-score **0.858**, Sonar **0.773** ([Sonar Pro API announcement](https://www.perplexity.ai/hub/blog/introducing-the-sonar-pro-api)); Deep Research accuracy **93.9%** ([Deep Research announcement](https://www.perplexity.ai/hub/blog/introducing-perplexity-deep-research)).

### Reading these numbers honestly

- Perplexity's figures come from their own runs on the full set; ours are samples with a different grader, so treat differences of a few points as noise. The 95% margin of error is roughly ±7 points for n = 100 and ±5 for the pooled n = 200.
- Seed 7 is the sample the fixes were debugged against. Seed 11 was run only after all fixes were in, so it is the fairer estimate of performance on unseen questions.
- This setup used **only free search engines** (mostly Wikipedia, with no contact email so Wikipedia limited it to 10 requests/min). SimpleQA questions are largely answerable from Wikipedia, which suits that setup; on news and long-tail web questions Perplexity's own index has a clear advantage unless you add a web-search key or SearXNG.
- The first version's misses were nearly all "not attempted" with the answer sitting in a page we had fetched or could have. The fixes, all generic: page titles counted in every chunk's score, light stemming, passages that contain the question's numbers ("1987", "season 3") are guaranteed a slot, nested templates (episode tables, timelines, currency) rendered instead of dropped, headings and reference sections handled correctly, exact Wikipedia title lookups proposed by the planner (including local-language Wikipedias such as \`es:Vegachí\`), and Wikipedia's spelling suggestion when a search finds nothing.
- "Wrong" is what matters most to users: an answer that says "the sources don't say" scores as not attempted, not as an error.
`;

fs.writeFileSync(path.join(__dirname, "..", "BENCHMARK.md"), md);
console.log(md);
