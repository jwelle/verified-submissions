import { NormalizedSubmission } from "./field_inference";
import { ParsedEvent } from "./event_parser";
import * as rules from "../config/scoring_rules";

// ---------------------------------- Types ----------------------------------

export interface SessionMetrics {
  session_seconds: number | null;
  meaningful_event_count: number;
  resize_event_count: number;
  repeated_field_edit_count: number;
  slider_change_count: number;
}

export interface BehaviorSignals {
  has_input_instability: boolean;
  has_erratic_slider: boolean;
  has_excessive_resize: boolean;
  has_non_progress_clicking: boolean;
}

export interface ScoreResult {
  value: number;
  status: "approved" | "review" | "reject";
  confidence: "high" | "medium" | "low";
  risk_flags: string[];
  explanations: string[];
  metrics: SessionMetrics;
}

// ----------------------------- Helpers -----------------------------------

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUSPICIOUS_EMAIL_RE = /^(test|fake|noreply|no-reply|admin|spam|junk|example|dummy|donotreply)[^@]*@/i;
const PHONE_DIGITS_RE = /\d/g;

function parse_date(ts: string): Date | null {
  if (!ts) return null;
  // Support format: "2026/03/25 18:13:29" and ISO
  const normalized = ts.replace(/\//g, "-");
  const d = new Date(normalized);
  return isNaN(d.getTime()) ? null : d;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

// ---------------------- Session metrics computation ----------------------

export function calculate_session_metrics(
  raw_events: ParsedEvent[],
  created_at: string,
  submitted_at: string,
): SessionMetrics {
  const start = parse_date(created_at);
  const end = parse_date(submitted_at);

  const session_seconds =
    start && end ? (end.getTime() - start.getTime()) / 1000 : null;

  let meaningful_event_count = 0;
  let resize_event_count = 0;
  let slider_change_count = 0;

  // Track field_id -> number of changes to detect instability
  const field_change_counts: Record<string, number> = {};

  for (const event of raw_events) {
    switch (event.type) {
      case "field_changed":
      case "radio_selected":
        meaningful_event_count++;
        if (event.field_id) {
          field_change_counts[event.field_id] =
            (field_change_counts[event.field_id] ?? 0) + 1;
        }
        if (event.field_id?.includes("slider")) {
          slider_change_count++;
        }
        break;
      case "noise":
        if (/resized/i.test(event.raw)) resize_event_count++;
        break;
      case "consent_detected":
      case "form_submitted":
        meaningful_event_count++;
        break;
    }
  }

  // Count repeated edits: how many total edits on fields with > threshold changes
  const repeated_field_edit_count = Object.values(field_change_counts).reduce(
    (sum, count) =>
      count > rules.REPEATED_FIELD_EDIT_THRESHOLD ? sum + count : sum,
    0,
  );

  return {
    session_seconds,
    meaningful_event_count,
    resize_event_count,
    repeated_field_edit_count,
    slider_change_count,
  };
}

// ---------------------- Behavioral signal detection ----------------------

export function detect_behavior_signals(raw_events: ParsedEvent[]): BehaviorSignals {
  const field_change_counts: Record<string, number> = {};
  let resize_count = 0;
  let non_progress_clicks = 0;

  // Detect slider direction reversals
  const slider_values: number[] = [];
  let slider_reversals = 0;

  for (const event of raw_events) {
    if (event.type === "field_changed" || event.type === "radio_selected") {
      if (event.field_id) {
        field_change_counts[event.field_id] =
          (field_change_counts[event.field_id] ?? 0) + 1;
      }
      // Track slider numeric changes
      if (event.field_id?.includes("slider") && event.value) {
        const num = Number(event.value);
        if (!isNaN(num)) {
          slider_values.push(num);
        }
      }
    }

    if (event.type === "noise" && /resized/i.test(event.raw)) {
      resize_count++;
    }

    // Repeated wrapper clicks without a field interaction following = non-progress
    if (event.type === "other" && /heyflow-wrapper/i.test(event.raw)) {
      non_progress_clicks++;
    }
  }

  // Count direction reversals in slider
  for (let i = 2; i < slider_values.length; i++) {
    const prev_dir = slider_values[i - 1] - slider_values[i - 2];
    const curr_dir = slider_values[i] - slider_values[i - 1];
    if (prev_dir !== 0 && curr_dir !== 0 && Math.sign(prev_dir) !== Math.sign(curr_dir)) {
      slider_reversals++;
    }
  }

  const has_input_instability = Object.values(field_change_counts).some(
    (c) => c > rules.REPEATED_FIELD_EDIT_THRESHOLD,
  );

  const has_erratic_slider =
    slider_values.length > 0 &&
    slider_reversals >= rules.ERRATIC_SLIDER_REVERSAL_THRESHOLD;

  const has_excessive_resize = resize_count >= rules.RESIZE_EVENT_THRESHOLD;

  const has_non_progress_clicking =
    non_progress_clicks >= rules.NON_PROGRESS_CLICK_THRESHOLD;

  return {
    has_input_instability,
    has_erratic_slider,
    has_excessive_resize,
    has_non_progress_clicking,
  };
}

// ---------------------- Main scoring function ----------------------------

export function score_lead(normalized: NormalizedSubmission): ScoreResult {
  let score = rules.BASE_SCORE;
  const risk_flags: string[] = [];
  const explanations: string[] = [];

  // A. Consent / compliance
  if (!normalized.consent_detected) {
    score -= rules.NO_CONSENT;
    risk_flags.push("missing_consent");
    explanations.push("No consent language detected in the session");
  } else {
    explanations.push("Consent detected");
  }

  if (!normalized.submitted_at) {
    score -= rules.NO_SUBMISSION;
    risk_flags.push("missing_submission");
    explanations.push("No form submission event found");
  }

  if (!normalized.certificate_id) {
    score -= rules.NO_CERTIFICATE_ID;
    risk_flags.push("missing_certificate_id");
    explanations.push("Certificate ID is missing");
  }

  // B. Field completeness
  if (!normalized.email) {
    score -= rules.MISSING_EMAIL;
    risk_flags.push("missing_email");
    explanations.push("Email address not found");
  }

  if (!normalized.phone) {
    score -= rules.MISSING_PHONE;
    risk_flags.push("missing_phone");
    explanations.push("Phone number not found");
  }

  if (!normalized.first_name && !normalized.last_name) {
    score -= rules.MISSING_NAME;
    risk_flags.push("missing_name");
    explanations.push("No name fields found");
  }

  if (!normalized.address_full) {
    score -= rules.MISSING_ADDRESS;
    risk_flags.push("missing_address");
    explanations.push("Address not found");
  }

  // C. Data quality
  if (normalized.email) {
    if (!EMAIL_RE.test(normalized.email)) {
      score -= rules.INVALID_EMAIL;
      risk_flags.push("invalid_email");
      explanations.push(`Invalid email format: ${normalized.email}`);
    } else if (SUSPICIOUS_EMAIL_RE.test(normalized.email)) {
      score -= rules.SUSPICIOUS_EMAIL;
      risk_flags.push("suspicious_email");
      explanations.push(`Suspicious/test email detected: ${normalized.email}`);
    } else {
      explanations.push("Valid email found");
    }
  }

  if (normalized.phone) {
    const digit_count = (normalized.phone.match(PHONE_DIGITS_RE) ?? []).length;
    if (digit_count < 7) {
      score -= rules.INVALID_PHONE;
      risk_flags.push("invalid_phone");
      explanations.push(`Phone number appears too short (${digit_count} digits)`);
    }
  }

  // Check if a slider-like field was detected but employee_count is missing
  const had_slider = normalized.field_map
    ? Object.keys(normalized.field_map).some((k) => k.includes("slider"))
    : false;

  if (had_slider && normalized.employee_count === null) {
    score -= rules.MISSING_EMPLOYEE_COUNT;
    risk_flags.push("missing_employee_count");
    explanations.push("Slider field detected but employee count could not be parsed");
  }

  // D. Session quality
  const metrics = calculate_session_metrics(
    normalized.raw_events,
    normalized.certificate_created_at,
    normalized.submitted_at,
  );

  if (metrics.session_seconds !== null) {
    if (metrics.session_seconds < 5) {
      score -= rules.UNDER_5_SECONDS;
      risk_flags.push("extremely_rapid_submission");
      explanations.push(
        `Session completed in ${metrics.session_seconds.toFixed(1)}s (extremely rapid)`,
      );
    } else if (metrics.session_seconds < 10) {
      score -= rules.UNDER_10_SECONDS;
      risk_flags.push("rapid_submission");
      explanations.push(
        `Session completed in ${metrics.session_seconds.toFixed(1)}s (rapid)`,
      );
    }
  }

  if (metrics.meaningful_event_count < rules.MEANINGFUL_INTERACTION_MIN) {
    score -= rules.LOW_INTERACTION;
    risk_flags.push("low_interaction_session");
    explanations.push(
      `Only ${metrics.meaningful_event_count} meaningful interactions before submit`,
    );
  }

  // E. Behavioral signals
  const signals = detect_behavior_signals(normalized.raw_events);

  if (signals.has_input_instability) {
    score -= rules.INPUT_INSTABILITY;
    risk_flags.push("input_instability");
    explanations.push(
      `Repeated edits detected on same field (>${rules.REPEATED_FIELD_EDIT_THRESHOLD} times)`,
    );
  }

  if (signals.has_erratic_slider) {
    score -= rules.ERRATIC_SLIDER;
    risk_flags.push("erratic_slider_behavior");
    explanations.push("Erratic back-and-forth slider movement detected");
  }

  if (signals.has_excessive_resize) {
    score -= rules.EXCESSIVE_RESIZE;
    risk_flags.push("excessive_resize_activity");
    explanations.push(
      `Excessive window resize events (≥${rules.RESIZE_EVENT_THRESHOLD})`,
    );
  }

  if (signals.has_non_progress_clicking) {
    score -= rules.NON_PROGRESS_CLICKS;
    risk_flags.push("non_progress_clicking");
    explanations.push("Repeated clicks without form progress detected");
  }

  // F. Positive adjustments (only if no severe flags)
  const has_severe_flags = risk_flags.includes("missing_consent") ||
    risk_flags.includes("missing_submission") ||
    risk_flags.includes("invalid_email");

  if (!has_severe_flags) {
    // Clean progression: submitted, consent, no instability
    if (
      normalized.submitted_at &&
      normalized.consent_detected &&
      !signals.has_input_instability &&
      !signals.has_erratic_slider
    ) {
      score += rules.CLEAN_FLOW;
      explanations.push("Clean form progression detected");
    }

    // Stable inputs
    if (!signals.has_input_instability && !signals.has_non_progress_clicking) {
      score += rules.STABLE_INPUTS;
      explanations.push("Stable input behavior");
    }

    // Strong contact + consent
    const email_valid = normalized.email && EMAIL_RE.test(normalized.email) &&
      !SUSPICIOUS_EMAIL_RE.test(normalized.email);
    const phone_valid = normalized.phone &&
      (normalized.phone.match(PHONE_DIGITS_RE) ?? []).length >= 7;

    if (normalized.consent_detected && email_valid && phone_valid) {
      score += rules.STRONG_CONTACT_AND_CONSENT;
      explanations.push("Strong contact info with consent");
    }
  }

  // Clamp score between 0 and 100
  score = clamp(Math.round(score), 0, 100);

  // Determine status
  let status: ScoreResult["status"];
  if (score >= rules.APPROVED_MIN) {
    status = "approved";
  } else if (score >= rules.REVIEW_MIN) {
    status = "review";
  } else {
    status = "reject";
  }

  // Determine confidence
  const has_valid_contact =
    normalized.email &&
    EMAIL_RE.test(normalized.email) &&
    normalized.phone &&
    (normalized.phone.match(PHONE_DIGITS_RE) ?? []).length >= 7;

  const behavior_stable =
    !signals.has_input_instability &&
    !signals.has_erratic_slider &&
    !signals.has_excessive_resize;

  let confidence: ScoreResult["confidence"];
  if (normalized.consent_detected && has_valid_contact && behavior_stable) {
    confidence = "high";
  } else if (risk_flags.length <= 2) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  return {
    value: score,
    status,
    confidence,
    risk_flags,
    explanations,
    metrics,
  };
}
