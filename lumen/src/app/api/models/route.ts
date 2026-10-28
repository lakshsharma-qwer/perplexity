import { listModels, candidates } from "@/lib/llm/registry";
import { ENGINES } from "@/lib/search/engines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [models, auto] = await Promise.all([listModels(), candidates()]);
  return Response.json({
    models,
    defaultModel: auto[0]?.id || null,
    engines: ENGINES.map((e) => ({ name: e.name, enabled: e.enabled(), focuses: e.focuses })),
  });
}
