/** Browser-side Excel (.xlsx) and CSV downloads. */
import { EXPORT_COLUMNS, type Place } from "./types";

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement("a"), { href: url, download: filename });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Formatted workbook: colored bold header, frozen top row, filters, clickable map and website links. */
export async function downloadExcel(places: Place[], filename: string) {
  const { default: ExcelJS } = await import("exceljs");
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Classes", { views: [{ state: "frozen", ySplit: 1 }] });
  ws.columns = EXPORT_COLUMNS.map((c) => ({ header: c.header, key: c.key, width: c.width }));

  for (const p of places) {
    const row = ws.addRow(Object.fromEntries(EXPORT_COLUMNS.map((c) => [c.key, p[c.key] ?? ""])));
    if (p.googleMapsUrl)
      row.getCell("googleMapsUrl").value = { text: "Open in Google Maps", hyperlink: p.googleMapsUrl };
    if (p.website) row.getCell("website").value = { text: p.website, hyperlink: p.website };
    for (const key of ["googleMapsUrl", "website"])
      if (p[key as keyof Place]) row.getCell(key).font = { color: { argb: "FF0563C1" }, underline: true };
  }

  const header = ws.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F4E78" } };
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: EXPORT_COLUMNS.length } };

  const buffer = await wb.xlsx.writeBuffer();
  download(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename);
}

export function downloadCsv(places: Place[], filename: string) {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [
    EXPORT_COLUMNS.map((c) => esc(c.header)).join(","),
    ...places.map((p) => EXPORT_COLUMNS.map((c) => esc(p[c.key])).join(",")),
  ];
  // BOM so Excel opens UTF-8 names correctly
  download(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), filename);
}
