import { Suspense } from "react";
import { connection } from "next/server";
import ClassFinder from "@/components/ClassFinder";
import { sheetsConfigured } from "@/lib/sheets";

/** Reads server configuration per request (not at build time) so .env.local changes apply on restart. */
async function ConfiguredClassFinder() {
  await connection();
  return (
    <ClassFinder
      hasServerKey={Boolean(process.env.GOOGLE_MAPS_API_KEY)}
      sheetsReady={sheetsConfigured()}
      defaultSheetUrl={process.env.GOOGLE_SHEET_URL ?? ""}
    />
  );
}

export default function Home() {
  return (
    <Suspense fallback={<main className="mx-auto w-full max-w-6xl px-4 py-12 text-slate-500">Loading…</main>}>
      <ConfiguredClassFinder />
    </Suspense>
  );
}
