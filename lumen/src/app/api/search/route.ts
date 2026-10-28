import { runSearch } from "@/lib/pipeline";
import type { ChatMessage, Focus, Mode, StreamEvent } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MODES: Mode[] = ["quick", "pro", "deep"];
const FOCUSES: Focus[] = ["web", "academic", "social", "video", "news", "wiki"];

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const query = String(body.query || "").trim().slice(0, 2000);
  if (!query) return Response.json({ error: "query is required" }, { status: 400 });
  const mode: Mode = MODES.includes(body.mode) ? body.mode : "pro";
  const focus: Focus = FOCUSES.includes(body.focus) ? body.focus : "web";
  const history: ChatMessage[] = Array.isArray(body.history)
    ? body.history
        .filter((m: ChatMessage) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
        .slice(-8)
    : [];

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (e: StreamEvent) => {
        try {
          controller.enqueue(enc.encode(JSON.stringify(e) + "\n"));
        } catch {}
      };
      try {
        await runSearch(query, { mode, focus, history, model: body.model, signal: req.signal }, send);
      } catch (err) {
        if (!req.signal.aborted) send({ type: "error", message: err instanceof Error ? err.message : String(err) });
      } finally {
        try {
          controller.close();
        } catch {}
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}
