import { Router, type Request, type Response } from "express";
import { claim_certificate, is_valid_trustedform_url } from "../services/trustedform_client";
import {
  parse_trustedform_text,
  parse_trustedform_payload,
} from "../services/event_parser";
import { infer_field_roles, normalize_submission } from "../services/field_inference";
import { score_lead } from "../services/scoring_engine";
import {
  route_lead,
  build_webhook_payload,
  type RoutingConfig,
} from "../services/routing_engine";
import { append_review_row } from "../services/google_sheets";
import { dispatch_outbound_webhook } from "../services/webhook_dispatcher";

const router = Router();

// Build routing config from env vars so it's easy to configure without code changes
function get_routing_config(): RoutingConfig {
  return {
    crm_webhook_url: process.env["CRM_WEBHOOK_URL"] ?? undefined,
    notify_webhook_url: process.env["NOTIFY_WEBHOOK_URL"] ?? undefined,
    google_sheets_enabled: process.env["GOOGLE_SHEETS_ENABLED"] !== "false",
    outbound_webhook_enabled: process.env["OUTBOUND_WEBHOOK_ENABLED"] === "true",
  };
}

function get_outbound_webhook_config() {
  return {
    enabled: process.env["OUTBOUND_WEBHOOK_ENABLED"] === "true",
    url: process.env["OUTBOUND_WEBHOOK_URL"] ?? "",
    retry_attempts: 3,
    timeout_seconds: 5,
  };
}

// POST /api/score-and-route
// Full Pass 2 pipeline: claim → parse → infer → normalize → score → route → sheets → webhook
router.post("/score-and-route", async (req: Request, res: Response) => {
  const { certificate_url } = req.body as { certificate_url?: string };

  // 1. Validate input
  if (!certificate_url || typeof certificate_url !== "string") {
    res.status(400).json({
      ok: false,
      error: "certificate_url is required and must be a string",
    });
    return;
  }

  if (!is_valid_trustedform_url(certificate_url)) {
    res.status(400).json({
      ok: false,
      error:
        "certificate_url must begin with https://cert.trustedform.com",
    });
    return;
  }

  // 2. Claim certificate
  const claim_result = await claim_certificate(certificate_url);

  if (!claim_result.ok) {
    res.status(502).json({
      ok: false,
      claim_result: {
        ok: false,
        status_code: claim_result.status_code,
        error: claim_result.error,
      },
      parsed_lead: null,
      score: null,
      routing: null,
      sheet_result: null,
      webhook_result: null,
    });
    return;
  }

  // 3. Parse
  let parsed_lead;
  if (
    typeof claim_result.data["raw_text"] === "string" &&
    (claim_result.data["raw_text"] as string).length > 0
  ) {
    parsed_lead = parse_trustedform_text(claim_result.data["raw_text"] as string);
  } else {
    parsed_lead = parse_trustedform_payload(claim_result.data);
  }

  // 4 & 5. Infer + normalize
  const inferred_fields = infer_field_roles(parsed_lead.field_map);
  const normalized = normalize_submission(parsed_lead, inferred_fields);

  // 6. Score
  const score = score_lead(normalized);

  // 7. Route
  const routing_config = get_routing_config();
  const routing = route_lead(normalized, score, routing_config);

  // 8. Google Sheets — only for review leads
  let sheet_result = null;
  if (score.status === "review" && routing_config.google_sheets_enabled !== false) {
    sheet_result = await append_review_row(
      {
        score: score.value,
        status: score.status,
        confidence: score.confidence,
        first_name: normalized.first_name,
        last_name: normalized.last_name,
        email: normalized.email,
        phone: normalized.phone,
        address: normalized.address_full,
        business_name: normalized.business_name,
        risk_flags: score.risk_flags,
        explanations: score.explanations,
        certificate_id: normalized.certificate_id,
        certificate_url,
        lead_source: normalized.lead_source,
        employee_count: normalized.employee_count,
        consent_detected: normalized.consent_detected,
      },
      certificate_url,
    );
  }

  // 9. Outbound webhook
  const webhook_config = get_outbound_webhook_config();
  let webhook_result = null;
  if (webhook_config.enabled) {
    const payload = build_webhook_payload(normalized, score, routing, certificate_url);
    webhook_result = await dispatch_outbound_webhook(payload, webhook_config);
  }

  // 10. Return structured response
  res.json({
    ok: true,
    claim_result: {
      ok: claim_result.ok,
      status_code: claim_result.status_code,
    },
    parsed_lead: {
      certificate_id: normalized.certificate_id,
      certificate_created_at: normalized.certificate_created_at,
      submitted_at: normalized.submitted_at,
      consent_detected: normalized.consent_detected,
      lead_source: normalized.lead_source,
      business_name: normalized.business_name,
      address_full: normalized.address_full,
      email: normalized.email,
      phone: normalized.phone,
      first_name: normalized.first_name,
      last_name: normalized.last_name,
      employee_count: normalized.employee_count,
      field_map: normalized.field_map,
      parse_notes: normalized.parse_notes,
      status: normalized.status,
    },
    score,
    routing,
    sheet_result,
    webhook_result,
  });
});

// POST /api/score-and-route/from-text
// Same full pipeline but scoring from a raw event log (no live cert claim)
router.post("/score-and-route/from-text", async (req: Request, res: Response) => {
  const { event_log_text, certificate_url } = req.body as {
    event_log_text?: string;
    certificate_url?: string;
  };

  if (!event_log_text || typeof event_log_text !== "string") {
    res.status(400).json({
      ok: false,
      error: "event_log_text is required",
    });
    return;
  }

  const parsed_lead = parse_trustedform_text(event_log_text);
  const inferred_fields = infer_field_roles(parsed_lead.field_map);
  const normalized = normalize_submission(parsed_lead, inferred_fields);
  const score = score_lead(normalized);

  const routing_config = get_routing_config();
  const routing = route_lead(normalized, score, routing_config);
  const cert_url = certificate_url ?? "";

  let sheet_result = null;
  if (score.status === "review" && routing_config.google_sheets_enabled !== false) {
    sheet_result = await append_review_row(
      {
        score: score.value,
        status: score.status,
        confidence: score.confidence,
        first_name: normalized.first_name,
        last_name: normalized.last_name,
        email: normalized.email,
        phone: normalized.phone,
        address: normalized.address_full,
        business_name: normalized.business_name,
        risk_flags: score.risk_flags,
        explanations: score.explanations,
        certificate_id: normalized.certificate_id,
        certificate_url: cert_url,
        lead_source: normalized.lead_source,
        employee_count: normalized.employee_count,
        consent_detected: normalized.consent_detected,
      },
      cert_url,
    );
  }

  const webhook_config = get_outbound_webhook_config();
  let webhook_result = null;
  if (webhook_config.enabled) {
    const payload = build_webhook_payload(normalized, score, routing, cert_url);
    webhook_result = await dispatch_outbound_webhook(payload, webhook_config);
  }

  res.json({
    ok: true,
    claim_result: {
      ok: false,
      status_code: null,
      note: "Scored from raw event text — no live certificate claim",
      certificate_url: cert_url || null,
    },
    parsed_lead: {
      certificate_id: normalized.certificate_id,
      certificate_created_at: normalized.certificate_created_at,
      submitted_at: normalized.submitted_at,
      consent_detected: normalized.consent_detected,
      lead_source: normalized.lead_source,
      business_name: normalized.business_name,
      address_full: normalized.address_full,
      email: normalized.email,
      phone: normalized.phone,
      first_name: normalized.first_name,
      last_name: normalized.last_name,
      employee_count: normalized.employee_count,
      field_map: normalized.field_map,
      parse_notes: normalized.parse_notes,
      status: normalized.status,
    },
    score,
    routing,
    sheet_result,
    webhook_result,
  });
});

export default router;
