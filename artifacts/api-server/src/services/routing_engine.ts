import { NormalizedSubmission } from "./field_inference";
import { ScoreResult } from "./scoring_engine";

// Configuration shape for routing decisions
export interface RoutingConfig {
  crm_webhook_url?: string;
  notify_webhook_url?: string;
  google_sheets_enabled?: boolean;
  outbound_webhook_enabled?: boolean;
}

// Possible routing decisions
export type RoutingDecision =
  | "sent_to_crm"
  | "sent_to_review"
  | "rejected_logged_only"
  | "rejected_notified"
  | "approved_no_crm_configured";

export interface RoutingResult {
  decision: RoutingDecision;
  destination: string;
  score_status: string;
  notes: string[];
}

export function route_lead(
  normalized: NormalizedSubmission,
  score: ScoreResult,
  config: RoutingConfig = {},
): RoutingResult {
  const notes: string[] = [];

  switch (score.status) {
    case "approved": {
      if (config.crm_webhook_url) {
        notes.push("Lead approved — forwarding to CRM webhook");
        return {
          decision: "sent_to_crm",
          destination: "crm_webhook",
          score_status: score.status,
          notes,
        };
      }
      notes.push(
        "Lead approved — no CRM webhook configured, holding for manual action",
      );
      return {
        decision: "approved_no_crm_configured",
        destination: "none",
        score_status: score.status,
        notes,
      };
    }

    case "review": {
      const destinations: string[] = [];
      if (config.google_sheets_enabled !== false) {
        destinations.push("google_sheet");
      }
      notes.push(
        `Lead requires review — sending to: ${destinations.join(", ") || "none configured"}`,
      );
      return {
        decision: "sent_to_review",
        destination: destinations.join(", ") || "none",
        score_status: score.status,
        notes,
      };
    }

    case "reject": {
      if (config.outbound_webhook_enabled && config.notify_webhook_url) {
        notes.push("Lead rejected — notifying via outbound webhook");
        return {
          decision: "rejected_notified",
          destination: "outbound_webhook",
          score_status: score.status,
          notes,
        };
      }
      notes.push("Lead rejected — logged internally only");
      return {
        decision: "rejected_logged_only",
        destination: "internal_log",
        score_status: score.status,
        notes,
      };
    }
  }
}

// Build the outbound webhook payload for a scored/routed lead
export function build_webhook_payload(
  normalized: NormalizedSubmission,
  score: ScoreResult,
  routing: RoutingResult,
  certificate_url: string,
): Record<string, unknown> {
  return {
    event: "lead.scored",
    timestamp: new Date().toISOString(),
    lead: {
      first_name: normalized.first_name,
      last_name: normalized.last_name,
      email: normalized.email,
      phone: normalized.phone,
      address_full: normalized.address_full,
      business_name: normalized.business_name,
      lead_source: normalized.lead_source,
      employee_count: normalized.employee_count,
    },
    score: {
      value: score.value,
      status: score.status,
      confidence: score.confidence,
    },
    risk_flags: score.risk_flags,
    explanations: score.explanations,
    compliance: {
      consent_detected: normalized.consent_detected,
      certificate_id: normalized.certificate_id,
      certificate_url,
    },
    routing: {
      decision: routing.decision,
      destination: routing.destination,
    },
  };
}
