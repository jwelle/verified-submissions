import { logger } from "../lib/logger";

// Google Sheets review queue integration.
// Uses the Google Sheets API v4 via a service account or OAuth token.
//
// Required environment variables (set via Replit Secrets or Google Sheets integration):
//   GOOGLE_SHEETS_SPREADSHEET_ID  — the ID portion of the spreadsheet URL
//   GOOGLE_SHEETS_ACCESS_TOKEN    — OAuth 2.0 access token (set by Replit Google integration)
//   GOOGLE_SHEET_NAME             — optional tab name, defaults to "Lead Review Queue"

const SHEETS_API_BASE = "https://sheets.googleapis.com/v4/spreadsheets";
const DEFAULT_SHEET_NAME = "Lead Review Queue";

// Columns written to the review sheet (in order)
const COLUMNS = [
  "timestamp",
  "score",
  "status",
  "confidence",
  "first_name",
  "last_name",
  "email",
  "phone",
  "address",
  "business_name",
  "risk_flags",
  "explanations",
  "certificate_id",
  "certificate_url",
  "lead_source",
  "employee_count",
  "consent_detected",
];

export interface ReviewRow {
  score: number;
  status: string;
  confidence: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  business_name: string;
  risk_flags: string[];
  explanations: string[];
  certificate_id: string;
  certificate_url: string;
  lead_source?: string;
  employee_count?: number | null;
  consent_detected?: boolean;
}

export interface SheetResult {
  success: boolean;
  row_id: string | null;
  error: string | null;
}

function get_credentials(): {
  spreadsheet_id: string;
  access_token: string;
  sheet_name: string;
} | null {
  const spreadsheet_id = process.env["GOOGLE_SHEETS_SPREADSHEET_ID"];
  const access_token = process.env["GOOGLE_SHEETS_ACCESS_TOKEN"];

  if (!spreadsheet_id || !access_token) {
    return null;
  }

  return {
    spreadsheet_id,
    access_token,
    sheet_name:
      process.env["GOOGLE_SHEET_NAME"] ?? DEFAULT_SHEET_NAME,
  };
}

// Ensure the header row exists in the sheet (idempotent — skips if already present)
async function ensure_header_row(
  spreadsheet_id: string,
  sheet_name: string,
  access_token: string,
): Promise<void> {
  const range = encodeURIComponent(`${sheet_name}!A1:Q1`);
  const readUrl = `${SHEETS_API_BASE}/${spreadsheet_id}/values/${range}`;

  const res = await fetch(readUrl, {
    headers: { Authorization: `Bearer ${access_token}` },
  });

  if (!res.ok) return; // silently skip if we can't read

  const data = (await res.json()) as { values?: string[][] };
  if (data.values && data.values.length > 0) return; // header already present

  // Write header row
  const writeUrl = `${SHEETS_API_BASE}/${spreadsheet_id}/values/${range}?valueInputOption=USER_ENTERED`;
  await fetch(writeUrl, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ values: [COLUMNS.map((c) => c.toUpperCase())] }),
  });
}

export async function append_review_row(
  review_data: ReviewRow,
  certificate_url: string,
): Promise<SheetResult> {
  const creds = get_credentials();

  if (!creds) {
    logger.warn(
      "Google Sheets credentials not configured — GOOGLE_SHEETS_SPREADSHEET_ID and GOOGLE_SHEETS_ACCESS_TOKEN required",
    );
    return {
      success: false,
      row_id: null,
      error:
        "Google Sheets not configured. Set GOOGLE_SHEETS_SPREADSHEET_ID and connect the Google Sheets integration.",
    };
  }

  try {
    await ensure_header_row(
      creds.spreadsheet_id,
      creds.sheet_name,
      creds.access_token,
    );

    const row = [
      new Date().toISOString(),
      review_data.score,
      review_data.status,
      review_data.confidence,
      review_data.first_name,
      review_data.last_name,
      review_data.email,
      review_data.phone,
      review_data.address,
      review_data.business_name,
      review_data.risk_flags.join(", "),
      review_data.explanations.join("; "),
      review_data.certificate_id,
      certificate_url,
      review_data.lead_source ?? "",
      review_data.employee_count ?? "",
      review_data.consent_detected ? "YES" : "NO",
    ];

    const range = encodeURIComponent(`${creds.sheet_name}!A:Q`);
    const url = `${SHEETS_API_BASE}/${creds.spreadsheet_id}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${creds.access_token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ values: [row] }),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error(
        { status: response.status, body },
        "Google Sheets append failed",
      );
      return {
        success: false,
        row_id: null,
        error: `Sheets API error ${response.status}: ${body}`,
      };
    }

    const result = (await response.json()) as { updates?: { updatedRange?: string } };
    const row_id = result.updates?.updatedRange ?? null;

    logger.info({ row_id }, "Lead appended to Google Sheets review queue");
    return { success: true, row_id, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err }, "Google Sheets append threw");
    return { success: false, row_id: null, error: message };
  }
}
