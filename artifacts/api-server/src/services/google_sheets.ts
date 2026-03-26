// Google Sheets integration — uses the Replit Google Sheets connector
// (googleapis package, authenticated via Replit connectors service)
// Connection ID: conn_google-sheet_01KMKXR7H5F99NWQB27KMFM1T9
import { google } from "googleapis";
import { logger } from "../lib/logger";

const DEFAULT_SHEET_NAME = "Lead Review Queue";

// Columns written to the review sheet (in order)
const COLUMNS = [
  "TIMESTAMP",
  "SCORE",
  "STATUS",
  "CONFIDENCE",
  "FIRST_NAME",
  "LAST_NAME",
  "EMAIL",
  "PHONE",
  "ADDRESS",
  "BUSINESS_NAME",
  "RISK_FLAGS",
  "EXPLANATIONS",
  "CERTIFICATE_ID",
  "CERTIFICATE_URL",
  "LEAD_SOURCE",
  "EMPLOYEE_COUNT",
  "CONSENT_DETECTED",
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

// Replit connectors auth — gets a fresh OAuth access token each time
// Never cache this client (tokens expire)
let cachedConnectionSettings: { settings: { expires_at?: string; access_token?: string; oauth?: { credentials?: { access_token?: string } } } } | null = null;

async function getAccessToken(): Promise<string> {
  if (
    cachedConnectionSettings?.settings?.expires_at &&
    new Date(cachedConnectionSettings.settings.expires_at).getTime() > Date.now()
  ) {
    const token = cachedConnectionSettings.settings.access_token ??
      cachedConnectionSettings.settings.oauth?.credentials?.access_token;
    if (token) return token;
  }

  const hostname = process.env["REPLIT_CONNECTORS_HOSTNAME"];
  const xReplitToken = process.env["REPL_IDENTITY"]
    ? "repl " + process.env["REPL_IDENTITY"]
    : process.env["WEB_REPL_RENEWAL"]
      ? "depl " + process.env["WEB_REPL_RENEWAL"]
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      "Replit connector credentials not available (REPLIT_CONNECTORS_HOSTNAME / REPL_IDENTITY). Is the Google Sheets integration connected?",
    );
  }

  const res = await fetch(
    `https://${hostname}/api/v2/connection?include_secrets=true&connector_names=google-sheet`,
    {
      headers: {
        Accept: "application/json",
        "X-Replit-Token": xReplitToken,
      },
    },
  );

  const data = await res.json() as { items?: typeof cachedConnectionSettings[] };
  cachedConnectionSettings = data.items?.[0] ?? null;

  const accessToken =
    cachedConnectionSettings?.settings?.access_token ??
    cachedConnectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!cachedConnectionSettings || !accessToken) {
    throw new Error("Google Sheet not connected — please connect the Google Sheets integration in Replit");
  }

  return accessToken;
}

// Returns a fresh sheets client — never cache this
async function getGoogleSheetsClient() {
  const accessToken = await getAccessToken();
  const oauth2Client = new google.auth.OAuth2();
  oauth2Client.setCredentials({ access_token: accessToken });
  return google.sheets({ version: "v4", auth: oauth2Client });
}

// Get spreadsheet ID — required env var
function getSpreadsheetId(): string | null {
  return process.env["GOOGLE_SHEETS_SPREADSHEET_ID"] ?? null;
}

function getSheetName(): string {
  return process.env["GOOGLE_SHEET_NAME"] ?? DEFAULT_SHEET_NAME;
}

// Ensure the header row exists (idempotent)
async function ensureHeaderRow(
  sheetsClient: ReturnType<typeof google.sheets>,
  spreadsheetId: string,
  sheetName: string,
): Promise<void> {
  try {
    const res = await sheetsClient.spreadsheets.values.get({
      spreadsheetId,
      range: `${sheetName}!A1:Q1`,
    });

    if (res.data.values && res.data.values.length > 0) return; // Header already present

    await sheetsClient.spreadsheets.values.update({
      spreadsheetId,
      range: `${sheetName}!A1:Q1`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [COLUMNS] },
    });
  } catch {
    // Silently skip header check — append will still work
  }
}

export async function append_review_row(
  review_data: ReviewRow,
  certificate_url: string,
): Promise<SheetResult> {
  const spreadsheetId = getSpreadsheetId();

  if (!spreadsheetId) {
    logger.warn(
      "GOOGLE_SHEETS_SPREADSHEET_ID is not set — Google Sheets append skipped. " +
      "Set this env var to the ID from your spreadsheet URL.",
    );
    return {
      success: false,
      row_id: null,
      error: "GOOGLE_SHEETS_SPREADSHEET_ID not configured. Set this to your Google Sheets spreadsheet ID.",
    };
  }

  try {
    const sheetsClient = await getGoogleSheetsClient();
    const sheetName = getSheetName();

    await ensureHeaderRow(sheetsClient, spreadsheetId, sheetName);

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

    const response = await sheetsClient.spreadsheets.values.append({
      spreadsheetId,
      range: `${sheetName}!A:Q`,
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values: [row] },
    });

    const row_id = response.data.updates?.updatedRange ?? null;
    logger.info({ row_id, spreadsheetId }, "Lead appended to Google Sheets review queue");

    return { success: true, row_id, error: null };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    logger.error({ err }, "Google Sheets append failed");
    return { success: false, row_id: null, error: message };
  }
}
