/** Google Places API (New) Text Search - best data quality, needs an API key. */
import { googleMapsLink } from "./geo";
import type { Place } from "./types";

const ENDPOINT = "https://places.googleapis.com/v1/places:searchText";
const FIELD_MASK = [
  "places.id", "places.displayName", "places.formattedAddress", "places.location",
  "places.googleMapsUri", "places.nationalPhoneNumber", "places.websiteUri",
  "places.rating", "places.userRatingCount", "places.businessStatus", "nextPageToken",
].join(",");

interface GooglePlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location?: { latitude: number; longitude: number };
  googleMapsUri?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  rating?: number;
  userRatingCount?: number;
  businessStatus?: string;
}

/** All places for one query, following pagination (20 per page, max 60). */
async function textSearch(apiKey: string, query: string, lat: number, lng: number, radiusM: number): Promise<GooglePlace[]> {
  const body: Record<string, unknown> = {
    textQuery: query,
    pageSize: 20,
    locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: Math.min(radiusM, 50_000) } },
  };
  const places: GooglePlace[] = [];
  for (let page = 0; page < 3; page++) {
    const res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": FIELD_MASK, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Google Places API error ${res.status}: ${data?.error?.message ?? res.statusText}`);
    places.push(...(data.places ?? []));
    if (!data.nextPageToken) break;
    body.pageToken = data.nextPageToken;
    await new Promise((r) => setTimeout(r, 1000)); // next page token needs a moment to become valid
  }
  return places;
}

export async function searchGoogle(
  apiKey: string, category: string, queries: string[], zip: string, lat: number, lng: number, radiusM: number,
): Promise<Place[]> {
  const batches = await Promise.all(queries.map((q) => textSearch(apiKey, `${q} near ${zip}`, lat, lng, radiusM)));
  return batches.flat()
    .filter((p) => p.businessStatus !== "CLOSED_PERMANENTLY")
    .map((p) => {
      const name = p.displayName?.text ?? "";
      const address = p.formattedAddress ?? "";
      return {
        category,
        name,
        address,
        phone: p.nationalPhoneNumber ?? "",
        website: p.websiteUri ?? "",
        rating: p.rating ?? null,
        reviews: p.userRatingCount ?? null,
        distanceMiles: null,
        latitude: p.location?.latitude ?? null,
        longitude: p.location?.longitude ?? null,
        googleMapsUrl: p.googleMapsUri || googleMapsLink(name, address, null, null, p.id),
        source: "Google Places" as const,
        key: p.id,
      };
    });
}
