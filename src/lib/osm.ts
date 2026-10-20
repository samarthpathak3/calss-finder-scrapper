/**
 * Free OpenStreetMap search - no API key needed, smaller coverage than Google.
 *
 * Two OSM services are combined:
 *   - Photon (komoot) keyword search: fast, returns full street addresses.
 *   - Overpass tag search: finds places tagged e.g. amenity=dojo whose names lack keywords.
 *     The public Overpass servers are often overloaded, so it is best-effort.
 */
import { GENERIC_WORDS } from "./categories";
import { USER_AGENT, googleMapsLink, mapLimit } from "./geo";
import type { Place } from "./types";

const PHOTON_URL = "https://photon.komoot.io/api/";
const OVERPASS_URLS = ["https://overpass-api.de/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
const OVERPASS_TIMEOUT_S = 45;

// Name matches of these kinds are never classes (e.g. "Kung Fu Tea", "Pottery Barn")
const EXCLUDED_KEYS = new Set(["shop", "highway", "place", "railway", "boundary", "landuse", "office"]);
const EXCLUDED_VALUES = new Set([
  "restaurant", "cafe", "fast_food", "bar", "pub", "nightclub", "cinema",
  "bank", "place_of_worship", "parking", "hotel", "museum", "gallery", "artwork",
]);

function makePlace(category: string, name: string, address: string, tags: Record<string, string>,
  lat: number, lng: number, key: string): Place {
  return {
    category,
    name,
    address,
    phone: tags.phone || tags["contact:phone"] || "",
    website: tags.website || tags["contact:website"] || "",
    rating: null,
    reviews: null,
    distanceMiles: null,
    latitude: lat,
    longitude: lng,
    googleMapsUrl: googleMapsLink(name, address, lat, lng),
    source: "OpenStreetMap",
    key,
  };
}

function joinAddress(houseNumber?: string, street?: string, city?: string, state?: string, postcode?: string): string {
  const streetLine = [houseNumber, street].filter(Boolean).join(" ");
  if (!streetLine) return ""; // a bare city/zip is useless; search.ts looks up the real street address
  return [streetLine, city, [state, postcode].filter(Boolean).join(" ")].filter(Boolean).join(", ");
}

// ---------- Photon keyword search ----------

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function nameMatcher(keywords: string[]): (name: string) => boolean {
  const phrases = keywords.map((k) => k.toLowerCase());
  const words = [...new Set(phrases.flatMap((p) => p.split(/\s+/)).filter((w) => w && !GENERIC_WORDS.has(w)))];
  const wordRe = words.length ? new RegExp(`\\b(${words.map(escapeRe).join("|")})`, "i") : null;
  return (name) => {
    const low = name.toLowerCase();
    return phrases.some((p) => low.includes(p)) || (wordRe?.test(low) ?? false);
  };
}

interface PhotonFeature {
  geometry: { coordinates: [number, number] };
  properties: Record<string, string | number | undefined>;
}

async function photon(keyword: string, lat: number, lng: number, bbox: number[]): Promise<PhotonFeature[]> {
  const url = new URL(PHOTON_URL);
  url.search = new URLSearchParams({
    q: keyword, lat: String(lat), lon: String(lng), limit: "50", lang: "en",
    bbox: bbox.map((v) => v.toFixed(5)).join(","),
  }).toString();
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT }, signal: AbortSignal.timeout(40_000) });
  if (!res.ok) throw new Error(`Photon search failed (${res.status})`);
  return (await res.json()).features ?? [];
}

export async function photonSearch(category: string, keywords: string[], osmTags: Record<string, string[]>,
  lat: number, lng: number, radiusM: number): Promise<Place[]> {
  const dLat = radiusM / 111_320;
  const dLng = dLat / Math.max(0.1, Math.abs(Math.cos((lat * Math.PI) / 180)));
  const bbox = [lng - dLng, lat - dLat, lng + dLng, lat + dLat];
  const matches = nameMatcher(keywords);
  const batches = await mapLimit(keywords, 4, (kw) => photon(kw, lat, lng, bbox));

  const places: Place[] = [];
  for (const f of batches.flat()) {
    const p = f.properties as Record<string, string | undefined>;
    if (!p.name) continue;
    if (EXCLUDED_KEYS.has(p.osm_key ?? "") || EXCLUDED_VALUES.has(p.osm_value ?? "")) continue;
    const tagged = (osmTags[p.osm_key ?? ""] ?? []).includes(p.osm_value ?? "");
    if (!tagged && !matches(p.name)) continue; // fuzzy hit like "Arepas" for "art"
    const [plng, plat] = f.geometry.coordinates;
    const address = joinAddress(p.housenumber, p.street, p.city || p.district, p.state, p.postcode);
    places.push(makePlace(category, p.name, address, {}, plat, plng, `${p.osm_type}/${p.osm_id}`));
  }
  return places;
}

// ---------- Overpass tag search ----------

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/** One combined query for all categories. categoryTags: {category: {tagKey: [values]}}. */
export async function overpassSearch(categoryTags: Record<string, Record<string, string[]>>,
  lat: number, lng: number, radiusM: number): Promise<Place[]> {
  const byKey: Record<string, Set<string>> = {};
  for (const tags of Object.values(categoryTags))
    for (const [k, vals] of Object.entries(tags)) vals.forEach((v) => (byKey[k] ??= new Set()).add(v));
  if (!Object.keys(byKey).length) return [];

  const around = `(around:${Math.round(radiusM)},${lat},${lng})`;
  const filters = Object.entries(byKey)
    .map(([k, vals]) => `nwr["${k}"~"^(${[...vals].sort().join("|")})$"]${around};`)
    .join("");
  const query = `[out:json][timeout:${OVERPASS_TIMEOUT_S}];(${filters});out center tags;`;

  let elements: OverpassElement[] | null = null;
  let lastErr: unknown;
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout((OVERPASS_TIMEOUT_S + 10) * 1000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      elements = (await res.json()).elements ?? [];
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!elements) throw new Error(`Overpass busy: ${lastErr}`);

  const typeLetter = { node: "N", way: "W", relation: "R" } as const;
  const places: Place[] = [];
  for (const el of elements) {
    const tags = el.tags ?? {};
    if (!tags.name) continue;
    const plat = el.lat ?? el.center?.lat;
    const plng = el.lon ?? el.center?.lon;
    if (plat == null || plng == null) continue;
    const address = joinAddress(tags["addr:housenumber"], tags["addr:street"], tags["addr:city"],
      tags["addr:state"], tags["addr:postcode"]);
    for (const [category, catTags] of Object.entries(categoryTags)) {
      if (Object.entries(catTags).some(([k, vals]) => vals.includes(tags[k])))
        places.push(makePlace(category, tags.name, address, tags, plat, plng, `${typeLetter[el.type]}/${el.id}`));
    }
  }
  return places;
}
