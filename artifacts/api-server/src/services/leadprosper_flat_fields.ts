import type { ScoreResult } from "./scoring_engine";
import type { ScoreAndRouteOutcome } from "./score_and_route_service";

// Version stamp returned to Lead Prosper so responses are traceable to a model rev.
export const MODEL_VERSION = "0.1-beta";

export type Classification =
  | "real_human"
  | "lead_farm_human"
  | "bot_script"
  | "autofill"
  | "inconclusive";

export type RecommendedAction =
  | "accept"
  | "reject"
  | "review"
  | "downweight"
  | "return_eligible";

// The flat, Lead-Prosper-friendly response contract. All values are scalars
// (no nested JSON) so they map cleanly onto Lead Prosper custom fields.
export interface LeadProsperFlatResponse {
  vs_pass: boolean;
  vs_score: number;
  vs_score_1_10: number;
  vs_status: "approved" | "review" | "reject";
  vs_confidence: "high" | "medium" | "low";
  vs_classification: Classification;
  vs_recommended_action: RecommendedAction;
  vs_return_eligible: boolean;
  vs_certificate_id: string;
  vs_consent_detected: boolean;
  vs_session_seconds: number;
  vs_meaningful_event_count: number;
  vs_risk_flags: string;
  vs_reason: string;
  vs_analysis_id: string;
  vs_model_version: string;
}

// Map the operational 0-100 score to a simplified 1-10 display score.
export function mapScoreToOneToTen(score: number): number {
  const clamped = Math.max(0, Math.min(100, score));
  return Math.max(1, Math.ceil(clamped / 10));
}

interface ClassifyInput {
  status: ScoreResult["status"];
  risk_flags: string[];
  metrics: Pick<ScoreResult["metrics"], "session_seconds" | "meaningful_event_count">;
}

// Conservative first-pass classifier. Deliberately falls back to "inconclusive"
// whenever signals are weak or missing — we never overstate certainty.
export function classifyLead(input: ClassifyInput): Classification {
  const flags = new Set(input.risk_flags);
  const session_seconds = input.metrics.session_seconds;
  const events = input.metrics.meaningful_event_count ?? 0;

  const no_timing = session_seconds === null || session_seconds === undefined;
  const no_events = events === 0;

  // No usable behavioral data at all — can't judge.
  if (no_timing && no_events) return "inconclusive";

  const major_automation =
    flags.has("extremely_rapid_submission") ||
    flags.has("erratic_slider_behavior") ||
    flags.has("input_instability");

  if (input.status === "reject") {
    const bot_like =
      flags.has("extremely_rapid_submission") ||
      (session_seconds !== null && session_seconds < 5) ||
      no_events ||
      (flags.has("low_interaction_session") &&
        (flags.has("missing_submission") || flags.has("missing_certificate_id")));
    if (bot_like) return "bot_script";

    // Rapid population / low interaction with some data present — looks autofilled.
    if (
      flags.has("rapid_submission") ||
      flags.has("low_interaction_session") ||
      flags.has("input_instability")
    ) {
      return "autofill";
    }

    // Rejected on data-quality grounds but behavior wasn't clearly automated.
    return "inconclusive";
  }

  if (input.status === "review") {
    // Human-looking but not clean enough to approve outright.
    return "lead_farm_human";
  }

  // approved
  if (major_automation || flags.has("low_interaction_session")) return "inconclusive";
  return "real_human";
}

function build_flat(
  score: ScoreResult,
  certificate_id: string,
  consent_detected: boolean,
  analysis_id: string | null,
): LeadProsperFlatResponse {
  const classification = classifyLead({
    status: score.status,
    risk_flags: score.risk_flags ?? [],
    metrics: {
      session_seconds: score.metrics?.session_seconds ?? null,
      meaningful_event_count: score.metrics?.meaningful_event_count ?? 0,
    },
  });

  // vs_pass + recommended action are driven directly by status (first version).
  let vs_pass: boolean;
  let recommended_action: RecommendedAction;
  switch (score.status) {
    case "approved":
      vs_pass = true;
      recommended_action = "accept";
      break;
    case "review":
      vs_pass = true;
      recommended_action = "review";
      break;
    case "reject":
    default:
      vs_pass = false;
      recommended_action = "reject";
      break;
  }

  // Return eligibility is intentionally strict — strong evidence only.
  const return_eligible =
    score.status === "reject" &&
    score.confidence === "high" &&
    (classification === "bot_script" || classification === "autofill");

  return {
    vs_pass,
    vs_score: score.value,
    vs_score_1_10: mapScoreToOneToTen(score.value),
    vs_status: score.status,
    vs_confidence: score.confidence,
    vs_classification: classification,
    vs_recommended_action: recommended_action,
    vs_return_eligible: return_eligible,
    vs_certificate_id: certificate_id || "",
    vs_consent_detected: consent_detected,
    vs_session_seconds: score.metrics?.session_seconds ?? 0,
    vs_meaningful_event_count: score.metrics?.meaningful_event_count ?? 0,
    vs_risk_flags: (score.risk_flags ?? []).join(","),
    vs_reason: (score.explanations ?? []).join("; "),
    vs_analysis_id: analysis_id ?? "",
    vs_model_version: MODEL_VERSION,
  };
}

// When we couldn't analyze (claim failure or invalid certificate URL), return a
// safe inconclusive response: vs_pass=false so Lead Prosper doesn't auto-accept,
// routed to review rather than a hard reject (our failure shouldn't kill the lead).
function inconclusive_response(reason: string): LeadProsperFlatResponse {
  return {
    vs_pass: false,
    vs_score: 0,
    vs_score_1_10: 1,
    vs_status: "review",
    vs_confidence: "low",
    vs_classification: "inconclusive",
    vs_recommended_action: "review",
    vs_return_eligible: false,
    vs_certificate_id: "",
    vs_consent_detected: false,
    vs_session_seconds: 0,
    vs_meaningful_event_count: 0,
    vs_risk_flags: "analysis_unavailable",
    vs_reason: reason,
    vs_analysis_id: "",
    vs_model_version: MODEL_VERSION,
  };
}

// Read certificate_id / consent_detected defensively from a stored (cached)
// parsed_lead JSON blob whose exact type we don't statically know.
function read_parsed_lead(value: unknown): { certificate_id: string; consent_detected: boolean } {
  const pl = (value ?? {}) as Record<string, unknown>;
  return {
    certificate_id: typeof pl["certificate_id"] === "string" ? (pl["certificate_id"] as string) : "",
    consent_detected: pl["consent_detected"] === true,
  };
}

// Map a shared score-and-route outcome onto the flat Lead Prosper response.
export function mapToLeadProsperFlatFields(
  outcome: ScoreAndRouteOutcome,
): LeadProsperFlatResponse {
  switch (outcome.kind) {
    case "scored":
      return build_flat(
        outcome.score,
        outcome.parsed_lead.certificate_id,
        outcome.parsed_lead.consent_detected,
        outcome.analysis_id,
      );

    case "cached": {
      const { certificate_id, consent_detected } = read_parsed_lead(outcome.parsed_lead);
      // Stored score_json matches the ScoreResult shape it was written from.
      return build_flat(
        outcome.score as ScoreResult,
        certificate_id,
        consent_detected,
        outcome.analysis_id,
      );
    }

    case "claim_failed":
      return inconclusive_response(outcome.error);

    case "invalid_url":
      return inconclusive_response(outcome.error);
  }
}
