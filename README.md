# Kids Class Finder (Next.js)

Enter a zip code → finds **karate / martial arts, art, dance and afterschool** classes nearby →
shows **name, address, phone, website, distance and a Google Maps location link** on a table and a map →
export to **Excel (.xlsx)**, **CSV** or **Google Sheets**.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:3000. For production: `npm run build && npm start`.

## Data sources

| Source | Setup | Quality |
|---|---|---|
| **OpenStreetMap** (default) | None, free | Fewer listings, 1–2 minutes per search; missing street addresses are looked up automatically |
| **Google Places API** | API key | Same data as Google Maps: full address, phone, rating, reviews; a few seconds per search |

### Google Places API key (recommended)

1. https://console.cloud.google.com/ → create a project.
2. **APIs & Services → Library** → enable **Places API (New)**.
3. **APIs & Services → Credentials → Create credentials → API key**.
4. Copy `.env.example` to `.env.local` and set `GOOGLE_MAPS_API_KEY=...`, then restart `npm run dev`.
   (You can also paste a key under **Settings** in the app.)

## Google Sheets export

1. In the same Google Cloud project, enable **Google Sheets API**.
2. **IAM & Admin → Service Accounts → Create service account** → **Keys → Add key → JSON**.
   Save it in this folder as `service_account.json` (it is git-ignored).
3. Set `GOOGLE_SERVICE_ACCOUNT_FILE=./service_account.json` in `.env.local`
   (or put the whole JSON in `GOOGLE_SERVICE_ACCOUNT_JSON` when hosting, e.g. on Vercel).
4. Create a Google Sheet and **Share** it (Editor) with the service account email
   (`name@project.iam.gserviceaccount.com`). Paste the sheet URL in the app, or set `GOOGLE_SHEET_URL`.

Each export adds a new tab named after the zip code and time.
No setup? Download the CSV and use *File → Import* in Google Sheets.

## Project layout

```
src/app/page.tsx                  page (reads server config)
src/components/ClassFinder.tsx    search form, results table, filters, export buttons
src/components/ResultsMap.tsx     Leaflet map of the results
src/app/api/search/route.ts       POST search, streams progress as JSON lines
src/app/api/sheets/route.ts       POST export to Google Sheets
src/lib/categories.ts             what to search for (edit to add categories)
src/lib/search.ts                 runs the search, merges duplicates, sorts by distance
src/lib/googlePlaces.ts           Google Places API source
src/lib/osm.ts                    OpenStreetMap (Photon + Overpass) source
src/lib/geo.ts                    zip → coordinates, distance, Google Maps links
src/lib/sheets.ts                 Google Sheets writer
src/lib/exportFiles.ts            Excel / CSV downloads (in the browser)
```

## Hosting note

Free OpenStreetMap searches take 1–2 minutes, which exceeds the default time limit on many
serverless hosts (the search route asks for up to 300s via `maxDuration`). With a Google API key,
searches finish in seconds and work anywhere.
