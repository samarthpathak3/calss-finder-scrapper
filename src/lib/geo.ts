/** Zip code -> coordinates, distances and Google Maps links (server only). */

export const USER_AGENT = "class-finder-next/1.0 (local tool)";

// Nominatim allows 1 request/second: calls are chained through this queue.
let nominatimQueue: Promise<unknown> = Promise.resolve();

function nominatim<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const run = nominatimQueue.then(async () => {
    const url = new URL(`https://nominatim.openstreetmap.org/${path}`);
    for (const [k, v] of Object.entries({ ...params, format: "jsonv2" })) url.searchParams.set(k, String(v));
    try {
      const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(20_000) });
      if (!res.ok) throw new Error(`Nominatim error ${res.status}`);
      return (await res.json()) as T;
    } finally {
      await new Promise((r) => setTimeout(r, 1100));
    }
  });
  nominatimQueue = run.catch(() => undefined);
  return run;
}

export async function geocodeZip(zip: string, country = "us"): Promise<{ lat: number; lng: number; label: string }> {
  zip = zip.trim();
  try {
    const res = await fetch(`https://api.zippopotam.us/${country.toLowerCase()}/${encodeURIComponent(zip)}`, {
      signal: AbortSignal.timeout(15_000),
    });
    if (res.ok) {
      const data = await res.json();
      const p = data.places[0];
      const state = p["state abbreviation"] || p.state || "";
      return { lat: Number(p.latitude), lng: Number(p.longitude), label: `${p["place name"]}, ${state} ${zip}`.trim() };
    }
  } catch {
    // fall through to Nominatim
  }
  const results = await nominatim<{ lat: string; lon: string; display_name: string }[]>("search", {
    postalcode: zip,
    countrycodes: country.toLowerCase(),
    limit: 1,
  });
  if (!results.length) throw new Error(`Could not find zip code "${zip}" in country ${country.toUpperCase()}`);
  return { lat: Number(results[0].lat), lng: Number(results[0].lon), label: results[0].display_name };
}

/** Best-effort street address for a coordinate (OpenStreetMap). */
export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const data = await nominatim<{ display_name?: string }>("reverse", { lat, lon: lng, zoom: 18, addressdetails: 1 });
    return data.display_name ?? "";
  } catch {
    return "";
  }
}

export function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dp = rad(lat2 - lat1);
  const dl = rad(lng2 - lng1);
  const a = Math.sin(dp / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dl / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(a));
}

/** A Google Maps URL that opens the business (or its exact pin). */
export function googleMapsLink(name: string, address: string, lat?: number | null, lng?: number | null, placeId?: string): string {
  const base = "https://www.google.com/maps/search/?api=1&query=";
  if (placeId) return `${base}${encodeURIComponent(name)}&query_place_id=${placeId}`;
  if (address) return base + encodeURIComponent(`${name}, ${address}`);
  return `${base}${lat},${lng}`;
}

/** Run fn over items with at most `limit` in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}
