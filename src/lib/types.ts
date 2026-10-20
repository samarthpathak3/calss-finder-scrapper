export type Source = "Google Places" | "OpenStreetMap";

export interface Place {
  category: string;
  name: string;
  address: string;
  phone: string;
  website: string;
  rating: number | null;
  reviews: number | null;
  distanceMiles: number | null;
  latitude: number | null;
  longitude: number | null;
  googleMapsUrl: string;
  source: Source;
  /** Unique id from the data source, used to merge duplicates. */
  key: string;
}

export interface SearchRequest {
  zip: string;
  country: string;
  radiusMiles: number;
  categories: string[];
  keywords: string[];
  apiKey?: string;
}

/** One line of the newline-delimited JSON stream returned by /api/search. */
export type SearchEvent =
  | { type: "progress"; message: string }
  | { type: "result"; label: string; places: Place[] }
  | { type: "error"; message: string };

/** Columns shared by the table, Excel, CSV and Google Sheets exports. */
export const EXPORT_COLUMNS: { key: keyof Place; header: string; width: number }[] = [
  { key: "category", header: "Category", width: 24 },
  { key: "name", header: "Name", width: 36 },
  { key: "address", header: "Address", width: 50 },
  { key: "phone", header: "Phone", width: 16 },
  { key: "website", header: "Website", width: 32 },
  { key: "rating", header: "Rating", width: 8 },
  { key: "reviews", header: "Reviews", width: 9 },
  { key: "distanceMiles", header: "Distance (mi)", width: 13 },
  { key: "latitude", header: "Latitude", width: 12 },
  { key: "longitude", header: "Longitude", width: 12 },
  { key: "googleMapsUrl", header: "Google Maps Location", width: 24 },
  { key: "source", header: "Source", width: 15 },
];
