// Event parser — works with both text event logs (from the TrustedForm certificate page)
// and JSON payloads returned from the TrustedForm API.
// Uses generalizable patterns derived from real event log samples.

export interface ParsedEvent {
  timestamp: string;
  replay_timestamp: string;
  type: string;
  field_id?: string;
  value?: string;
  raw: string;
}

export interface ParsedLead {
  certificate_id: string;
  certificate_created_at: string;
  submitted_at: string;
  consent_detected: boolean;
  field_map: Record<string, string>;
  raw_events: ParsedEvent[];
  parse_notes: string[];
}

// --- Text log parser ---
// Handles logs like the TrustedForm Certificate of Authenticity event log.
// Line format: "YYYY/MM/DD HH:MM:SS  REPLAY_TS  EVENT_DESCRIPTION"
const TEXT_LINE_RE =
  /^(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})\s+([\d:]+)\s+(.+)$/;

const FIELD_CHANGE_RE = /changed value to '(.+)' in \[(.+?)\]/;
const RADIO_CHOICE_RE = /chose \[(.+?)\] from radio buttons \[(.+?)\]/;
const CERTIFICATE_CREATED_RE = /certificate created/i;
const SUBMITTED_RE = /submitted form/i;
const CONSENT_RE = /consent language detected/i;

// Noise events that are low signal for scoring but still retained in raw_events
const NOISE_PATTERNS = [/resized the window/i, /clicked on \[unnamed heyflow/i];

function is_noise(event_text: string): boolean {
  return NOISE_PATTERNS.some((re) => re.test(event_text));
}

export function parse_trustedform_text(raw_text: string): ParsedLead {
  const lines = raw_text.split("\n").map((l) => l.trim()).filter(Boolean);
  const parse_notes: string[] = [];
  const raw_events: ParsedEvent[] = [];
  const field_map: Record<string, string> = {};

  let certificate_id = "";
  let certificate_created_at = "";
  let submitted_at = "";
  let consent_detected = false;

  // Extract certificate ID from header lines like:
  // "Certificate ID: <hash>"
  for (const line of lines) {
    const certIdMatch = line.match(/certificate\s+id[:\s]+([a-f0-9]{20,})/i);
    if (certIdMatch) {
      certificate_id = certIdMatch[1];
      break;
    }
  }

  for (const line of lines) {
    const lineMatch = line.match(TEXT_LINE_RE);
    if (!lineMatch) continue;

    const [, timestamp, replay_timestamp, event_text] = lineMatch;

    const noise = is_noise(event_text);
    const event: ParsedEvent = {
      timestamp,
      replay_timestamp,
      type: "unknown",
      raw: event_text,
    };

    if (CERTIFICATE_CREATED_RE.test(event_text)) {
      event.type = "certificate_created";
      certificate_created_at = timestamp;
    } else if (SUBMITTED_RE.test(event_text)) {
      event.type = "form_submitted";
      submitted_at = timestamp;
    } else if (CONSENT_RE.test(event_text)) {
      event.type = "consent_detected";
      consent_detected = true;
    } else {
      const changeMatch = event_text.match(FIELD_CHANGE_RE);
      if (changeMatch) {
        const [, value, field_id] = changeMatch;
        event.type = "field_changed";
        event.field_id = field_id;
        event.value = value;
        // Keep only the most recent (last) value for each field
        field_map[field_id] = value;
      } else {
        const radioMatch = event_text.match(RADIO_CHOICE_RE);
        if (radioMatch) {
          const [, choice_id, group_id] = radioMatch;
          event.type = "radio_selected";
          event.field_id = group_id;
          event.value = choice_id;
          field_map[group_id] = choice_id;
        } else if (!noise) {
          event.type = "other";
        } else {
          event.type = "noise";
        }
      }
    }

    raw_events.push(event);
  }

  if (!certificate_id) {
    parse_notes.push("certificate_id not found in text");
  }
  if (!certificate_created_at) {
    parse_notes.push("certificate_created_at not found");
  }
  if (!submitted_at) {
    parse_notes.push("submitted_at not found — form submission event missing");
  }
  if (!consent_detected) {
    parse_notes.push("consent language detected event not found");
  }

  return {
    certificate_id,
    certificate_created_at,
    submitted_at,
    consent_detected,
    field_map,
    raw_events,
    parse_notes,
  };
}

// --- JSON payload parser ---
// Handles structured JSON returned from the TrustedForm claim API.
// The shape can vary; we extract what we can defensively.
export function parse_trustedform_payload(payload: Record<string, unknown>): ParsedLead {
  const parse_notes: string[] = [];
  const field_map: Record<string, string> = {};
  const raw_events: ParsedEvent[] = [];

  // Extract top-level fields
  const certificate_id =
    (payload["id"] as string) ??
    (payload["certificate_id"] as string) ??
    "";

  const certificate_created_at =
    (payload["created_at"] as string) ??
    (payload["certificate_created_at"] as string) ??
    "";

  const submitted_at =
    (payload["submitted_at"] as string) ?? "";

  const consent_detected =
    !!(payload["consent_language_detected"] ?? payload["consent_detected"]);

  // Extract field snapshots if present under common keys
  const fields = payload["fields"] ?? payload["field_values"] ?? payload["answers"];
  if (fields && typeof fields === "object" && !Array.isArray(fields)) {
    for (const [k, v] of Object.entries(fields)) {
      field_map[k] = String(v ?? "");
    }
  }

  // Extract raw event array if present
  const events = payload["events"];
  if (Array.isArray(events)) {
    for (const e of events) {
      if (typeof e === "object" && e !== null) {
        const ev = e as Record<string, unknown>;
        raw_events.push({
          timestamp: String(ev["at"] ?? ev["timestamp"] ?? ""),
          replay_timestamp: String(ev["offset"] ?? ""),
          type: String(ev["type"] ?? "unknown"),
          field_id: ev["field"] ? String(ev["field"]) : undefined,
          value: ev["value"] !== undefined ? String(ev["value"]) : undefined,
          raw: JSON.stringify(e),
        });
      }
    }
  }

  // If the payload contained a raw_text field (our fallback), parse it
  if (typeof payload["raw_text"] === "string" && payload["raw_text"].length > 0) {
    parse_notes.push("Fell back to raw_text parsing from JSON payload");
    return parse_trustedform_text(payload["raw_text"] as string);
  }

  if (!certificate_id) parse_notes.push("certificate_id missing from payload");
  if (!submitted_at) parse_notes.push("submitted_at missing from payload");

  return {
    certificate_id,
    certificate_created_at,
    submitted_at,
    consent_detected,
    field_map,
    raw_events,
    parse_notes,
  };
}
