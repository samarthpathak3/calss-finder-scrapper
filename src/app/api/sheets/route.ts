import { exportToGoogleSheet } from "@/lib/sheets";
import type { Place } from "@/lib/types";

export async function POST(request: Request) {
  const { places, sheetUrl, tabName } = (await request.json()) as { places: Place[]; sheetUrl?: string; tabName?: string };
  const url = sheetUrl?.trim() || process.env.GOOGLE_SHEET_URL;
  if (!url) return Response.json({ error: "Enter your Google Sheet URL first." }, { status: 400 });
  if (!Array.isArray(places) || !places.length) return Response.json({ error: "Nothing to export." }, { status: 400 });
  try {
    const tabUrl = await exportToGoogleSheet(places, url, tabName || `Classes ${new Date().toISOString().slice(0, 16)}`);
    return Response.json({ url: tabUrl });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return Response.json({ error: `Google Sheets export failed: ${message}` }, { status: 500 });
  }
}
