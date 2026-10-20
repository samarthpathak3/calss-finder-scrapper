"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { CATEGORY_NAMES } from "@/lib/categories";
import { downloadCsv, downloadExcel } from "@/lib/exportFiles";
import type { Place, SearchEvent } from "@/lib/types";

const ResultsMap = dynamic(() => import("./ResultsMap"), {
  ssr: false,
  loading: () => <div className="h-[420px] animate-pulse rounded-xl bg-slate-100" />,
});

const COUNTRIES = [
  ["us", "United States"], ["ca", "Canada"], ["gb", "United Kingdom"], ["in", "India"],
  ["au", "Australia"], ["de", "Germany"], ["fr", "France"],
];

const CATEGORY_ICONS: Record<string, string> = {
  "Karate / Martial Arts": "🥋", "Art Classes": "🎨", "Dance Classes": "💃", "Afterschool Programs": "📚",
};

interface Props {
  hasServerKey: boolean;
  sheetsReady: boolean;
  defaultSheetUrl: string;
}

export default function ClassFinder({ hasServerKey, sheetsReady, defaultSheetUrl }: Props) {
  const [zip, setZip] = useState("");
  const [country, setCountry] = useState("us");
  const [radius, setRadius] = useState(5);
  const [categories, setCategories] = useState<string[]>(CATEGORY_NAMES);
  const [keywords, setKeywords] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [result, setResult] = useState<{ label: string; zip: string; places: Place[] } | null>(null);

  const [filterCats, setFilterCats] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [showMap, setShowMap] = useState(true);

  const [sheetUrl, setSheetUrl] = useState(defaultSheetUrl);
  const [sheetStatus, setSheetStatus] = useState<{ kind: "ok" | "error" | "busy"; text: string; url?: string } | null>(null);

  const usingGoogle = Boolean(apiKey.trim()) || hasServerKey;

  async function search(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setProgress([]);
    setSheetStatus(null);
    setSearching(true);
    try {
      const res = await fetch("/api/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zip, country, radiusMiles: radius, categories,
          keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
          apiKey: apiKey.trim() || undefined,
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Search failed (${res.status})`);
      }
      // The response is a stream of JSON lines: progress messages, then the result
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) {
          const event = JSON.parse(line) as SearchEvent;
          if (event.type === "progress") setProgress((p) => [...p, event.message]);
          else if (event.type === "error") throw new Error(event.message);
          else {
            setResult({ label: event.label, zip: zip.trim(), places: event.places });
            setFilterCats([]);
            setQuery("");
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  }

  const resultCats = useMemo(
    () => [...new Set(result?.places.flatMap((p) => p.category.split(", ")) ?? [])].sort(),
    [result],
  );

  const visible = useMemo(() => {
    if (!result) return [];
    const q = query.trim().toLowerCase();
    return result.places.filter(
      (p) =>
        (!filterCats.length || p.category.split(", ").some((c) => filterCats.includes(c))) &&
        (!q || `${p.name} ${p.address}`.toLowerCase().includes(q)),
    );
  }, [result, filterCats, query]);

  const fileStem = result ? `classes_${result.zip}_${new Date().toISOString().slice(0, 10)}` : "classes";

  async function exportSheet() {
    setSheetStatus({ kind: "busy", text: "Exporting to Google Sheets..." });
    try {
      const res = await fetch("/api/sheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          places: visible,
          sheetUrl,
          tabName: `Zip ${result?.zip} ${new Date().toLocaleString("en-US", { dateStyle: "short", timeStyle: "short" })}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSheetStatus({ kind: "ok", text: `Exported ${visible.length} rows.`, url: data.url });
    } catch (err) {
      setSheetStatus({ kind: "error", text: err instanceof Error ? err.message : String(err) });
    }
  }

  const toggle = (list: string[], item: string) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:py-12">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Kids Class Finder</h1>
        <p className="mt-2 text-slate-600">
          Enter a zip code to find karate, art, dance and afterschool classes nearby — with addresses, map links and
          Excel / Google Sheets export.
        </p>
      </header>

      {/* ---------- Search form ---------- */}
      <form onSubmit={search} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="grid gap-4 sm:grid-cols-[1fr_1fr_1.4fr]">
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Zip code</span>
            <input
              value={zip}
              onChange={(e) => setZip(e.target.value)}
              placeholder="e.g. 94539"
              required
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-lg outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">Country</span>
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 outline-none focus:border-rose-500"
            >
              {COUNTRIES.map(([code, name]) => (
                <option key={code} value={code}>{name}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-slate-700">
              Radius: <strong>{radius} miles</strong>
            </span>
            <input
              type="range" min={1} max={30} value={radius}
              onChange={(e) => setRadius(Number(e.target.value))}
              className="mt-4 w-full accent-rose-600"
            />
          </label>
        </div>

        <fieldset className="mt-5">
          <legend className="text-sm font-medium text-slate-700">Categories</legend>
          <div className="mt-2 flex flex-wrap gap-2">
            {CATEGORY_NAMES.map((c) => {
              const on = categories.includes(c);
              return (
                <button
                  type="button" key={c} onClick={() => setCategories(toggle(categories, c))} aria-pressed={on}
                  className={`rounded-full border px-4 py-1.5 text-sm transition ${
                    on ? "border-rose-600 bg-rose-600 text-white" : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
                  }`}
                >
                  {CATEGORY_ICONS[c]} {c}
                </button>
              );
            })}
          </div>
        </fieldset>

        <label className="mt-5 block">
          <span className="text-sm font-medium text-slate-700">Extra keywords (comma separated, optional)</span>
          <input
            value={keywords}
            onChange={(e) => setKeywords(e.target.value)}
            placeholder="e.g. swimming lessons, piano lessons, chess club"
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 outline-none focus:border-rose-500 focus:ring-2 focus:ring-rose-100"
          />
        </label>

        <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3">
          <button
            type="submit" disabled={searching}
            className="rounded-lg bg-rose-600 px-6 py-2.5 font-semibold text-white shadow-sm hover:bg-rose-700 disabled:cursor-wait disabled:opacity-60"
          >
            {searching ? "Searching…" : "Search"}
          </button>
          <span className="text-sm text-slate-500">
            Data source: <strong>{usingGoogle ? "Google Places" : "OpenStreetMap (free)"}</strong>
          </span>
          <button type="button" onClick={() => setShowSettings(!showSettings)} className="text-sm text-rose-700 underline-offset-2 hover:underline">
            {showSettings ? "Hide settings" : "Settings"}
          </button>
        </div>

        {showSettings && (
          <div className="mt-4 rounded-xl bg-slate-50 p-4">
            <label className="block">
              <span className="text-sm font-medium text-slate-700">Google Places API key (optional)</span>
              <input
                type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)}
                placeholder={hasServerKey ? "Using the key from .env.local" : "Paste a key for Google Maps data"}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 outline-none focus:border-rose-500"
              />
            </label>
            <p className="mt-2 text-xs text-slate-500">
              With a key you get Google Maps data (best coverage, phone numbers, ratings). Without one, free OpenStreetMap
              data is used, which is slower and has fewer listings.
            </p>
          </div>
        )}
      </form>

      {/* ---------- Progress / errors ---------- */}
      {(searching || progress.length > 0) && !error && (
        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
          {progress.map((m, i) => (
            <div key={i} className="py-0.5">✓ {m}</div>
          ))}
          {searching && <div className="animate-pulse py-0.5 text-rose-700">Working… free searches can take 1–2 minutes.</div>}
        </div>
      )}
      {error && <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>}

      {/* ---------- Results ---------- */}
      {result && !searching && (
        <section className="mt-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold">{result.places.length} places near {result.label}</h2>
              {visible.length !== result.places.length && <p className="text-sm text-slate-500">Showing {visible.length}</p>}
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => downloadExcel(visible, `${fileStem}.xlsx`)} disabled={!visible.length}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                ⬇ Excel (.xlsx)
              </button>
              <button
                onClick={() => downloadCsv(visible, `${fileStem}.csv`)} disabled={!visible.length}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50"
              >
                ⬇ CSV
              </button>
            </div>
          </div>

          {result.places.length === 0 ? (
            <p className="mt-4 rounded-2xl bg-white p-6 text-slate-600">
              No results. Try a bigger radius, more categories, or add a Google Places API key in Settings.
            </p>
          ) : (
            <>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {resultCats.map((c) => (
                  <button
                    key={c} onClick={() => setFilterCats(toggle(filterCats, c))}
                    className={`rounded-full border px-3 py-1 text-xs ${
                      filterCats.includes(c) ? "border-slate-800 bg-slate-800 text-white" : "border-slate-300 bg-white text-slate-600"
                    }`}
                  >
                    {CATEGORY_ICONS[c] ?? "🔎"} {c}
                  </button>
                ))}
                <input
                  value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by name or address…"
                  className="ml-auto w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none sm:w-64"
                />
              </div>

              {/* Google Sheets export */}
              <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center">
                <span className="text-sm font-medium whitespace-nowrap">📤 Google Sheets</span>
                <input
                  value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none"
                />
                <button
                  onClick={exportSheet} disabled={!sheetsReady || !sheetUrl || sheetStatus?.kind === "busy" || !visible.length}
                  className="rounded-lg bg-slate-800 px-4 py-1.5 text-sm font-semibold text-white hover:bg-slate-900 disabled:opacity-50"
                >
                  {sheetStatus?.kind === "busy" ? "Exporting…" : "Export"}
                </button>
              </div>
              {!sheetsReady && (
                <p className="mt-1 text-xs text-slate-500">
                  Google Sheets export needs a service account — see README. Or download the CSV and use File → Import in Google Sheets.
                </p>
              )}
              {sheetStatus && sheetStatus.kind !== "busy" && (
                <p className={`mt-2 text-sm ${sheetStatus.kind === "ok" ? "text-emerald-700" : "text-red-700"}`}>
                  {sheetStatus.text}{" "}
                  {sheetStatus.url && (
                    <a href={sheetStatus.url} target="_blank" rel="noopener" className="font-semibold underline">Open sheet</a>
                  )}
                </p>
              )}

              <div className="mt-4">
                <button onClick={() => setShowMap(!showMap)} className="text-sm text-rose-700 hover:underline">
                  {showMap ? "Hide map" : "Show map"}
                </button>
                {showMap && (
                  <div className="mt-2 overflow-hidden rounded-xl border border-slate-200">
                    <ResultsMap places={visible} />
                  </div>
                )}
              </div>

              <div className="mt-4 overflow-x-auto rounded-2xl border border-slate-200 bg-white">
                <table className="w-full min-w-[820px] text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Address</th>
                      <th className="px-4 py-3">Phone</th>
                      <th className="px-4 py-3 text-right">Miles</th>
                      <th className="px-4 py-3">Links</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visible.map((p) => (
                      <tr key={p.key} className="align-top hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="font-semibold">{p.name}</div>
                          <div className="mt-0.5 text-xs text-slate-500">
                            {p.category}
                            {p.rating != null && <> · ★ {p.rating} ({p.reviews ?? 0})</>}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{p.address || "—"}</td>
                        <td className="px-4 py-3 whitespace-nowrap text-slate-600">{p.phone || "—"}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{p.distanceMiles?.toFixed(1) ?? "—"}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <a href={p.googleMapsUrl} target="_blank" rel="noopener" className="text-rose-700 hover:underline">📍 Map</a>
                          {p.website && (
                            <a href={p.website} target="_blank" rel="noopener" className="ml-3 text-rose-700 hover:underline">🌐 Site</a>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>
      )}
    </main>
  );
}
