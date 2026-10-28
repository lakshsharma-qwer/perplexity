/**
 * SimpleQA benchmark (OpenAI, 2024): short fact-seeking questions with one gold answer.
 * Usage: npx tsx eval/simpleqa.ts            (env: N, SEED, MODE, MODEL, GRADER, VARIANT=lumen|closed, CONCURRENCY)
 * Results are appended to eval/results/<run>.jsonl so an interrupted run resumes where it stopped.
 */
import fs from "node:fs";
import path from "node:path";
import { runSearch, runNoSearch } from "../src/lib/pipeline";
import { candidates, complete } from "../src/lib/llm/registry";
import { mapLimit } from "../src/lib/util";
import type { Mode } from "../src/lib/types";

try {
  process.loadEnvFile(".env.local");
} catch {}

const N = Number(process.env.N || 50);
const SEED = Number(process.env.SEED || 7);
const MODE = (process.env.MODE || "pro") as Mode;
const MODEL = process.env.MODEL || "auto";
const GRADER = process.env.GRADER || "claude-code:sonnet";
const VARIANT = process.env.VARIANT || "lumen";
const CONCURRENCY = Number(process.env.CONCURRENCY || 4);

// Sites that republish the benchmark itself; blocked so answers can't be looked up from the dataset.
const LEAKS = ["huggingface.co", "github.com", "kaggle.com", "openai.com", "paperswithcode.com", "simple_qa", "simpleqa", "simple-evals"];

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') q = false;
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) rows.push([...row, field]);
  return rows;
}

function seeded(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Condensed version of the official SimpleQA grader prompt (simple-evals/simpleqa_eval.py).
const GRADER_PROMPT = `Your job is to look at a question, a gold target, and a predicted answer, and then assign a grade of either ["CORRECT", "INCORRECT", "NOT_ATTEMPTED"].

CORRECT: the predicted answer fully contains the important information in the gold target and contains no statement that contradicts it. Hedging is fine as long as the gold target is given and nothing contradictory is asserted. Minor spelling differences of names, and rounding consistent with the gold target, are fine. The answer only needs to contain the key information asked for; extra correct detail is fine.
INCORRECT: any statement in the answer contradicts the gold target, or it gives a different answer (even if hedged, e.g. "I think it's X but might be Y" where X is wrong). Listing several candidate answers where one is correct is INCORRECT.
NOT_ATTEMPTED: the important information of the gold target is not in the answer, and nothing contradicts it (e.g. "I don't know", "the sources don't say", or an answer that avoids the question).

Numbers must be correct to the last significant figure of the gold target. If the question asks for something the gold target partially answers (e.g. year only), giving that is enough.

Question: {question}
Gold target: {target}
Predicted answer: {predicted}

Reply with just one letter:
A: CORRECT
B: INCORRECT
C: NOT_ATTEMPTED`;

type Grade = "CORRECT" | "INCORRECT" | "NOT_ATTEMPTED";

async function grade(question: string, target: string, predicted: string): Promise<Grade> {
  const cands = await candidates(GRADER);
  const out = await complete(cands, {
    system: "You are a strict, careful grader.",
    messages: [{ role: "user", content: GRADER_PROMPT.replace("{question}", question).replace("{target}", target).replace("{predicted}", predicted.slice(0, 6000)) }],
    maxTokens: 10,
    temperature: 0,
  });
  const m = out.trim().match(/[ABC]/);
  return m?.[0] === "A" ? "CORRECT" : m?.[0] === "B" ? "INCORRECT" : "NOT_ATTEMPTED";
}

interface Row {
  i: number;
  topic: string;
  question: string;
  target: string;
  predicted: string;
  grade: Grade;
  ms: number;
  sources?: string[];
  model?: string;
  error?: string;
}

async function main() {
  const csv = parseCsv(fs.readFileSync(path.join(__dirname, "data/simple_qa_test_set.csv"), "utf8")).slice(1).filter((r) => r.length >= 3);
  const rand = seeded(SEED);
  const idx = csv.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  const sample = idx.slice(0, N).map((i) => ({ i, meta: csv[i][0], question: csv[i][1], target: csv[i][2] }));

  const runName = `simpleqa-${VARIANT}-${VARIANT === "lumen" ? MODE + "-" : ""}${MODEL.replace(/[:/]/g, "_")}-n${N}-s${SEED}`;
  const outDir = path.join(__dirname, "results");
  fs.mkdirSync(outDir, { recursive: true });
  const jsonl = path.join(outDir, `${runName}.jsonl`);
  const done = new Map<number, Row>();
  if (fs.existsSync(jsonl)) {
    for (const line of fs.readFileSync(jsonl, "utf8").split("\n").filter(Boolean)) {
      const r = JSON.parse(line) as Row;
      if (!r.error) done.set(r.i, r);
    }
  }
  console.log(`${runName}: ${sample.length} questions (${done.size} already done)`);

  let finished = done.size;
  const rows = await mapLimit(sample, CONCURRENCY, async (s): Promise<Row> => {
    const prev = done.get(s.i);
    if (prev) return prev;
    const topic = /'topic': '([^']+)'/.exec(s.meta)?.[1] || "";
    const t0 = Date.now();
    let row: Row;
    try {
      let predicted: string;
      let sources: string[] | undefined;
      let model: string | undefined;
      if (VARIANT === "closed") {
        predicted = await runNoSearch(s.question, MODEL);
      } else {
        const r = await runSearch(s.question, { mode: MODE, model: MODEL, followups: false, excludeDomains: LEAKS });
        predicted = r.answer;
        sources = r.sources.map((x) => x.url);
        model = r.meta.model;
      }
      const g = await grade(s.question, s.target, predicted);
      row = { i: s.i, topic, question: s.question, target: s.target, predicted, grade: g, ms: Date.now() - t0, sources, model };
    } catch (e) {
      row = { i: s.i, topic, question: s.question, target: s.target, predicted: "", grade: "NOT_ATTEMPTED", ms: Date.now() - t0, error: String(e) };
    }
    fs.appendFileSync(jsonl, JSON.stringify(row) + "\n");
    finished++;
    const mark = row.error ? "ERR" : row.grade === "CORRECT" ? "✓" : row.grade === "INCORRECT" ? "✗" : "–";
    console.log(`[${finished}/${sample.length}] ${mark} ${(row.ms / 1000).toFixed(0)}s  ${s.question.slice(0, 70)}  → gold: ${s.target}`);
    return row;
  });

  const valid = rows.filter((r) => !r.error);
  const c = valid.filter((r) => r.grade === "CORRECT").length;
  const inc = valid.filter((r) => r.grade === "INCORRECT").length;
  const na = valid.length - c - inc;
  const acc = c / valid.length;
  const accAttempted = c / Math.max(1, c + inc);
  const f = (2 * acc * accAttempted) / Math.max(1e-9, acc + accAttempted);
  const summary = {
    run: runName,
    n: valid.length,
    errors: rows.length - valid.length,
    correct: c,
    incorrect: inc,
    notAttempted: na,
    accuracy: +acc.toFixed(3),
    accuracyGivenAttempted: +accAttempted.toFixed(3),
    fScore: +f.toFixed(3),
    medianSeconds: +(valid.map((r) => r.ms).sort((a, b) => a - b)[Math.floor(valid.length / 2)] / 1000).toFixed(1),
    grader: GRADER,
    date: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(outDir, `${runName}.summary.json`), JSON.stringify(summary, null, 2));
  console.log("\n" + JSON.stringify(summary, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
