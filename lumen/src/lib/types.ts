export type Mode = "quick" | "pro" | "deep";
export type Focus = "web" | "academic" | "social" | "video" | "news" | "wiki";

export interface SearchHit {
  url: string;
  title: string;
  snippet: string;
  engine: string;
  rank: number;
  /** Full page text when the engine already returned it (e.g. Wikipedia). */
  content?: string;
}

export interface Source {
  id: number;
  url: string;
  title: string;
  domain: string;
  snippet: string;
  engines: string[];
  favicon: string;
}

export interface Doc {
  url: string;
  title: string;
  domain: string;
  snippet: string;
  engines: string[];
  fusedScore: number;
  text: string;
}

export interface Passage {
  docIndex: number;
  text: string;
  score: number;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export type StreamEvent =
  | { type: "status"; message: string }
  | { type: "queries"; queries: string[] }
  | { type: "sources"; sources: Source[] }
  | { type: "token"; text: string }
  | { type: "followups"; items: string[] }
  | { type: "done"; meta: RunMeta }
  | { type: "error"; message: string };

export interface RunMeta {
  model: string;
  mode: Mode;
  queries: string[];
  engines: Record<string, number>;
  pagesRead: number;
  ms: number;
}

export interface SearchOptions {
  mode: Mode;
  model?: string;
  focus?: Focus;
  history?: ChatMessage[];
  followups?: boolean;
  excludeDomains?: string[];
  signal?: AbortSignal;
}
