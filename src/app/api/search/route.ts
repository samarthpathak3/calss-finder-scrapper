import { findClasses } from "@/lib/search";
import type { SearchEvent, SearchRequest } from "@/lib/types";

// Free OpenStreetMap searches can take 1-2 minutes
export const maxDuration = 300;

/** Streams newline-delimited JSON SearchEvents: progress lines, then a result (or error). */
export async function POST(request: Request) {
  const body = (await request.json()) as Partial<SearchRequest>;
  const zip = String(body.zip ?? "").trim();
  if (!/^[A-Za-z0-9 -]{3,10}$/.test(zip)) {
    return Response.json({ error: "Please enter a valid zip / postal code." }, { status: 400 });
  }
  const req: SearchRequest = {
    zip,
    country: String(body.country ?? "us").toLowerCase().slice(0, 2),
    radiusMiles: Math.min(30, Math.max(1, Number(body.radiusMiles) || 5)),
    categories: Array.isArray(body.categories) ? body.categories.map(String) : [],
    keywords: Array.isArray(body.keywords) ? body.keywords.map(String).filter((k) => k.trim()).slice(0, 10) : [],
    // A key typed in the browser wins over the server's key from .env.local
    apiKey: body.apiKey?.trim() || process.env.GOOGLE_MAPS_API_KEY || undefined,
  };
  if (!req.categories.length && !req.keywords.length) {
    return Response.json({ error: "Pick at least one category or enter a keyword." }, { status: 400 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SearchEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        const { label, places } = await findClasses(req, (message) => send({ type: "progress", message }));
        send({ type: "result", label, places });
      } catch (e) {
        send({ type: "error", message: e instanceof Error ? e.message : String(e) });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
}
