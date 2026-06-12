// Normalizes inbound Lead Prosper pre-ping payloads into the shape the shared
// score-and-route pipeline expects. Lead Prosper (and the publishers feeding it)
// send the TrustedForm certificate under many different field names, so we accept
// any of the known variants and also tolerate a bare certificate token.

const TRUSTED_FORM_DOMAIN = "https://cert.trustedform.com";

// Certificate URL field-name variants, in priority order.
const CERTIFICATE_KEYS = [
  "certificate_url",
  "trustedform_cert_url",
  "trustedform_cert",
  "trustedform_url",
  "xxTrustedFormCertUrl",
  "xxTrustedFormToken",
  "tf_cert_url",
  "tf_cert",
] as const;

// Optional context fields preserved (when present) for logging/reporting.
const CONTEXT_KEYS = [
  "lp_lead_id",
  "lp_campaign_id",
  "lp_supplier_id",
  "lp_buyer_id",
  "campaign_id",
  "supplier_id",
  "buyer_id",
  "email",
  "phone",
  "first_name",
  "last_name",
  "address",
  "zip",
  "state",
  "lead_source",
  "vertical",
] as const;

const TOKEN_RE = /^[a-f0-9]{40}$/i;

export interface NormalizedLeadProsperPayload {
  // Resolved TrustedForm certificate URL, or null if none could be found.
  certificate_url: string | null;
  // Preserved optional context fields.
  context: Record<string, unknown>;
  // The original request body, passed through untouched for audit/evidence.
  raw_payload: Record<string, unknown>;
}

function resolve_certificate_url(body: Record<string, unknown>): string | null {
  for (const key of CERTIFICATE_KEYS) {
    const value = body[key];
    if (typeof value === "string" && value.trim().length > 0) {
      const candidate = value.trim();
      if (/^https?:\/\//i.test(candidate)) return candidate;
      // A bare 40-char hex token (e.g. xxTrustedFormToken) — build the cert URL.
      if (TOKEN_RE.test(candidate)) return `${TRUSTED_FORM_DOMAIN}/${candidate}`;
      // Unknown shape — hand it downstream and let validation reject it.
      return candidate;
    }
  }
  return null;
}

export function normalizeLeadProsperPayload(
  body: Record<string, unknown>,
): NormalizedLeadProsperPayload {
  const source = body ?? {};

  const context: Record<string, unknown> = {};
  for (const key of CONTEXT_KEYS) {
    if (source[key] !== undefined && source[key] !== null && source[key] !== "") {
      context[key] = source[key];
    }
  }

  return {
    certificate_url: resolve_certificate_url(source),
    context,
    raw_payload: source,
  };
}
