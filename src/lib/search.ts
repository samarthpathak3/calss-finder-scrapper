/** Orchestrates a search: zip -> coordinates -> each category -> one clean list. */
import { CATEGORIES, type CategorySpec } from "./categories";
import { geocodeZip, googleMapsLink, haversineMiles, reverseGeocode } from "./geo";
import { searchGoogle } from "./googlePlaces";
import { overpassSearch, photonSearch } from "./osm";
import type { Place, SearchRequest } from "./types";

const MAX_REVERSE_LOOKUPS = 40;

/** Same place found by several queries/categories -> one entry, merged category names. */
function mergeDuplicates(places: Place[]): Place[] {
  const byKey = new Map<string, Place>();
  for (const p of places) {
    const existing = byKey.get(p.key);
    if (!existing) {
      byKey.set(p.key, { ...p });
      continue;
    }
    const cats = new Set(existing.category.split(", "));
    cats.add(p.category);
    existing.category = [...cats].join(", ");
    // Fill blanks from the duplicate (e.g. Overpass has a phone, Photon has the address)
    for (const field of ["address", "phone", "website"] as const) {
      if (!existing[field] && p[field]) existing[field] = p[field];
    }
    if (!existing.address && p.address) existing.googleMapsUrl = p.googleMapsUrl;
  }
  return [...byKey.values()];
}

export async function findClasses(req: SearchRequest, progress: (msg: string) => void): Promise<{ label: string; places: Place[] }> {
  const { lat, lng, label } = await geocodeZip(req.zip, req.country);
  progress(`Located ${req.zip}: ${label}`);
  const radiusM = req.radiusMiles * 1609.34;
  const useGoogle = Boolean(req.apiKey);

  const jobs: [string, CategorySpec][] = req.categories
    .filter((c) => c in CATEGORIES)
    .map((c) => [c, CATEGORIES[c]]);
  for (const raw of req.keywords) {
    const kw = raw.trim();
    // Custom keyword: searched as typed on both sources
    if (kw) jobs.push([kw.replace(/\b\w/g, (c) => c.toUpperCase()), { googleQueries: [kw], keywords: [kw], osmTags: {} }]);
  }

  let places: Place[] = [];
  if (useGoogle) {
    for (const [category, spec] of jobs) {
      progress(`Searching ${category} (Google Places)...`);
      places.push(...(await searchGoogle(req.apiKey!, category, spec.googleQueries, req.zip, lat, lng, radiusM)));
    }
  } else {
    // The tag search can be slow, so it runs in the background while keyword searches run
    const tagJob = overpassSearch(
      Object.fromEntries(jobs.filter(([, s]) => Object.keys(s.osmTags).length).map(([c, s]) => [c, s.osmTags])),
      lat, lng, radiusM,
    ).catch(() => null);
    for (const [category, spec] of jobs) {
      progress(`Searching ${category} (OpenStreetMap)...`);
      places.push(...(await photonSearch(category, spec.keywords, spec.osmTags, lat, lng, radiusM)));
    }
    progress("Searching OpenStreetMap tags (dojos, dance schools, childcare)...");
    const tagged = await tagJob;
    if (tagged) places.push(...tagged);
    else progress("OpenStreetMap tag search is busy right now - using keyword results only.");
  }

  for (const p of places) {
    if (p.latitude != null && p.longitude != null)
      p.distanceMiles = Math.round(haversineMiles(lat, lng, p.latitude, p.longitude) * 100) / 100;
  }
  // Google's "near" bias can return far-away places; keep only those inside the radius
  places = mergeDuplicates(places.filter((p) => p.distanceMiles == null || p.distanceMiles <= req.radiusMiles));

  if (!useGoogle) {
    const missing = places.filter((p) => !p.address && p.latitude != null).slice(0, MAX_REVERSE_LOOKUPS);
    if (missing.length) progress(`Looking up ${missing.length} missing street addresses...`);
    for (const p of missing) {
      p.address = await reverseGeocode(p.latitude!, p.longitude!);
      p.googleMapsUrl = googleMapsLink(p.name, p.address, p.latitude, p.longitude);
    }
  }

  places.sort((a, b) => (a.distanceMiles ?? 1e9) - (b.distanceMiles ?? 1e9) || a.name.localeCompare(b.name));
  return { label, places };
}
