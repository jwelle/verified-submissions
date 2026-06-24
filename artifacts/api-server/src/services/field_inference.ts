import { ParsedLead } from "./event_parser.js";

// Manual overrides — these map known TrustedForm field IDs to semantic roles.
// Update this map to match the specific form you are integrating with.
const FIELD_OVERRIDES: Record<string, string> = {
  "input-6417e977": "email",
  "phone-input-id-9bc36538": "phone",
  "address-fd904f8b": "address_full",
  "input-10bf0565": "business_name",
  "input-13c9ba29": "first_name",
  "input-041bc24c": "last_name",
  "slider-5c5a48ae-numeric": "employee_count",
  "slider-5c5a48ae": "employee_count_slider",
  "input-a4ad7fac": "lead_source",
};

// Heuristic regex patterns for field role inference when no override exists
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_RE = /^[\+\d\s\-().]{7,20}$/;
const ADDRESS_RE = /\d+\s+\w+.*(street|st|ave|avenue|lane|ln|rd|road|blvd|dr|drive|way|court|ct|circle|cir|place|pl)/i;
const LEAD_SOURCE_VALUES = new Set(["facebook", "google", "instagram", "tiktok", "website", "referral", "email", "sms", "youtube", "linkedin"]);
const SHORT_NAME_RE = /^[A-Z][a-z]{1,20}$/;

export interface InferredFields {
  email?: string;
  phone?: string;
  address_full?: string;
  business_name?: string;
  first_name?: string;
  last_name?: string;
  employee_count?: string;
  lead_source?: string;
  [key: string]: string | undefined;
}

export interface NormalizedSubmission {
  certificate_id: string;
  certificate_created_at: string;
  submitted_at: string;
  consent_detected: boolean;
  lead_source: string;
  business_name: string;
  address_full: string;
  email: string;
  phone: string;
  first_name: string;
  last_name: string;
  employee_count: number | null;
  raw_events: ParsedLead["raw_events"];
  field_map: Record<string, string>;
  parse_notes: string[];
  status: "parsed" | "partial" | "error";
}

export function infer_field_roles(field_map: Record<string, string>): InferredFields {
  const inferred: InferredFields = {};

  for (const [field_id, value] of Object.entries(field_map)) {
    const trimmed = value.trim();
    if (!trimmed) continue;

    // Override takes priority
    if (FIELD_OVERRIDES[field_id]) {
      const role = FIELD_OVERRIDES[field_id];
      // Don't overwrite already assigned roles with lower-confidence slider variant
      if (role === "employee_count_slider" && inferred["employee_count"]) continue;
      inferred[role === "employee_count_slider" ? "employee_count" : role] = trimmed;
      continue;
    }

    // Heuristic inference for unknown field IDs
    if (!inferred["email"] && EMAIL_RE.test(trimmed)) {
      inferred["email"] = trimmed;
      continue;
    }

    if (!inferred["phone"] && PHONE_RE.test(trimmed)) {
      inferred["phone"] = trimmed;
      continue;
    }

    if (!inferred["address_full"] && ADDRESS_RE.test(trimmed)) {
      inferred["address_full"] = trimmed;
      continue;
    }

    if (!inferred["lead_source"] && LEAD_SOURCE_VALUES.has(trimmed.toLowerCase())) {
      inferred["lead_source"] = trimmed.toLowerCase();
      continue;
    }

    if (!inferred["employee_count"] && /^\d+$/.test(trimmed) && Number(trimmed) > 0 && Number(trimmed) < 100_000) {
      inferred["employee_count"] = trimmed;
      continue;
    }

    // Short capitalized words likely names
    if (!inferred["first_name"] && SHORT_NAME_RE.test(trimmed)) {
      inferred["first_name"] = trimmed;
      continue;
    }

    if (!inferred["last_name"] && SHORT_NAME_RE.test(trimmed)) {
      inferred["last_name"] = trimmed;
      continue;
    }

    // Longer mixed-case text that doesn't match other patterns — likely a business name
    if (!inferred["business_name"] && trimmed.length > 4 && /\s/.test(trimmed)) {
      inferred["business_name"] = trimmed;
      continue;
    }
  }

  return inferred;
}

export function normalize_submission(
  parsed_data: ParsedLead,
  inferred_fields: InferredFields,
): NormalizedSubmission {
  const employee_count_raw = inferred_fields["employee_count"];
  const employee_count = employee_count_raw
    ? Number(employee_count_raw)
    : null;

  const result: NormalizedSubmission = {
    certificate_id: parsed_data.certificate_id,
    certificate_created_at: parsed_data.certificate_created_at,
    submitted_at: parsed_data.submitted_at,
    consent_detected: parsed_data.consent_detected,
    lead_source: inferred_fields["lead_source"] ?? "",
    business_name: inferred_fields["business_name"] ?? "",
    address_full: inferred_fields["address_full"] ?? "",
    email: inferred_fields["email"] ?? "",
    phone: inferred_fields["phone"] ?? "",
    first_name: inferred_fields["first_name"] ?? "",
    last_name: inferred_fields["last_name"] ?? "",
    employee_count: isNaN(employee_count as number) ? null : employee_count,
    raw_events: parsed_data.raw_events,
    field_map: parsed_data.field_map,
    parse_notes: [...parsed_data.parse_notes],
    status: "parsed",
  };

  // Determine parse status
  const key_fields = [result.email, result.phone, result.first_name, result.last_name];
  const filled = key_fields.filter(Boolean).length;

  if (filled === 0) {
    result.status = "error";
    result.parse_notes.push("No key contact fields could be extracted");
  } else if (filled < 2) {
    result.status = "partial";
    result.parse_notes.push("Only partial contact fields extracted");
  }

  return result;
}
