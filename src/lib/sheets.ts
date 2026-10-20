/** Google Sheets export via a service account (server only). */
import { GoogleAuth, type JWTInput } from "google-auth-library";
import { EXPORT_COLUMNS, type Place } from "./types";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

/** Credentials come from GOOGLE_SERVICE_ACCOUNT_JSON (inline, for hosting) or GOOGLE_SERVICE_ACCOUNT_FILE (path). */
function getAuth(): GoogleAuth {
  const scopes = ["https://www.googleapis.com/auth/spreadsheets"];
  const inline = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (inline) return new GoogleAuth({ credentials: JSON.parse(inline) as JWTInput, scopes });
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_FILE;
  if (keyFile) return new GoogleAuth({ keyFile, scopes });
  throw new Error("Google Sheets is not configured. Set GOOGLE_SERVICE_ACCOUNT_FILE in .env.local (see README).");
}

export function sheetsConfigured(): boolean {
  return Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_FILE);
}

function cellValue(place: Place, key: keyof Place): string | number {
  const v = place[key];
  if (key === "googleMapsUrl") return v ? `=HYPERLINK("${String(v).replace(/"/g, "%22")}", "Open in Google Maps")` : "";
  return v ?? "";
}

/** Adds a new tab to an existing sheet and writes the places into it. Returns the tab URL. */
export async function exportToGoogleSheet(places: Place[], sheetUrl: string, tabName: string): Promise<string> {
  const id = sheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/)?.[1];
  if (!id) throw new Error("That doesn't look like a Google Sheets URL.");
  const client = await getAuth().getClient();
  const title = tabName.slice(0, 100);

  const added = await client.request<{ replies: { addSheet: { properties: { sheetId: number } } }[] }>({
    url: `${SHEETS_API}/${id}:batchUpdate`,
    method: "POST",
    data: { requests: [{ addSheet: { properties: { title, gridProperties: { frozenRowCount: 1 } } } }] },
  });
  const sheetId = added.data.replies[0].addSheet.properties.sheetId;

  const values = [EXPORT_COLUMNS.map((c) => c.header), ...places.map((p) => EXPORT_COLUMNS.map((c) => cellValue(p, c.key)))];
  await client.request({
    url: `${SHEETS_API}/${id}/values/${encodeURIComponent(`'${title.replace(/'/g, "''")}'!A1`)}?valueInputOption=USER_ENTERED`,
    method: "PUT",
    data: { values },
  });

  await client.request({
    url: `${SHEETS_API}/${id}:batchUpdate`,
    method: "POST",
    data: {
      requests: [
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: "userEnteredFormat.textFormat.bold",
          },
        },
        { autoResizeDimensions: { dimensions: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: EXPORT_COLUMNS.length } } },
      ],
    },
  });
  return `https://docs.google.com/spreadsheets/d/${id}/edit#gid=${sheetId}`;
}
