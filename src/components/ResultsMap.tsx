"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { Place } from "@/lib/types";

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** OpenStreetMap map with one pin per place. Loaded client-side only (see ClassFinder). */
export default function ResultsMap({ places }: { places: Place[] }) {
  const container = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!container.current) return;
    const map = L.map(container.current, { scrollWheelZoom: false });
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19,
      attribution: "&copy; OpenStreetMap contributors",
    }).addTo(map);

    const points: L.LatLngTuple[] = [];
    for (const p of places) {
      if (p.latitude == null || p.longitude == null) continue;
      points.push([p.latitude, p.longitude]);
      // Circle markers avoid Leaflet's default image icons, which bundlers break
      L.circleMarker([p.latitude, p.longitude], { radius: 7, color: "#fff", weight: 2, fillColor: "#e11d48", fillOpacity: 0.9 })
        .bindPopup(
          `<strong>${escapeHtml(p.name)}</strong><br>${escapeHtml(p.address)}<br>` +
            `<a href="${escapeHtml(p.googleMapsUrl)}" target="_blank" rel="noopener">Open in Google Maps</a>`,
        )
        .addTo(map);
    }
    if (points.length) map.fitBounds(points, { padding: [30, 30], maxZoom: 15 });
    else map.setView([39.8, -98.6], 4);
    return () => {
      map.remove();
    };
  }, [places]);

  return <div ref={container} className="h-[420px] w-full rounded-xl" />;
}
