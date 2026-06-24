import { describe, it, expect } from "vitest";
import {
  mapScoreToOneToTen,
  classifyLead,
  mapToLeadProsperFlatFields,
  MODEL_VERSION,
} from "../services/leadprosper_flat_fields.js";
import type { ScoreResult } from "../services/scoring_engine.js";
import type { ScoreAndRouteOutcome } from "../services/score_and_route_service.js";

function scoreFixture(overrides: Partial<ScoreResult> = {}): ScoreResult {
  return {
    value: 90,
    status: "approved",
    confidence: "high",
    risk_flags: [],
    explanations: ["Consent detected", "Strong contact info with consent"],
    metrics: {
      session_seconds: 32,
      meaningful_event_count: 8,
      resize_event_count: 0,
      repeated_field_edit_count: 0,
      slider_change_count: 1,
    },
    ...overrides,
  };
}

describe("mapScoreToOneToTen", () => {
  it("maps the documented bands and clamps out-of-range input", () => {
    expect(mapScoreToOneToTen(0)).toBe(1);
    expect(mapScoreToOneToTen(1)).toBe(1);
    expect(mapScoreToOneToTen(10)).toBe(1);
    expect(mapScoreToOneToTen(11)).toBe(2);
    expect(mapScoreToOneToTen(60)).toBe(6);
    expect(mapScoreToOneToTen(85)).toBe(9);
    expect(mapScoreToOneToTen(100)).toBe(10);
    expect(mapScoreToOneToTen(150)).toBe(10);
    expect(mapScoreToOneToTen(-5)).toBe(1);
  });
});

describe("classifyLead", () => {
  it("approved + clean signals => real_human", () => {
    expect(
      classifyLead({
        status: "approved",
        risk_flags: [],
        metrics: { session_seconds: 30, meaningful_event_count: 8 },
      }),
    ).toBe("real_human");
  });

  it("review => lead_farm_human", () => {
    expect(
      classifyLead({
        status: "review",
        risk_flags: ["excessive_resize_activity"],
        metrics: { session_seconds: 30, meaningful_event_count: 6 },
      }),
    ).toBe("lead_farm_human");
  });

  it("reject + extremely rapid / no events => bot_script", () => {
    expect(
      classifyLead({
        status: "reject",
        risk_flags: ["extremely_rapid_submission", "low_interaction_session"],
        metrics: { session_seconds: 1, meaningful_event_count: 0 },
      }),
    ).toBe("bot_script");
  });

  it("reject + rapid population with some data => autofill", () => {
    expect(
      classifyLead({
        status: "reject",
        risk_flags: ["rapid_submission", "input_instability"],
        metrics: { session_seconds: 7, meaningful_event_count: 3 },
      }),
    ).toBe("autofill");
  });

  it("no timing and no events => inconclusive", () => {
    expect(
      classifyLead({
        status: "reject",
        risk_flags: ["missing_certificate_id"],
        metrics: { session_seconds: null, meaningful_event_count: 0 },
      }),
    ).toBe("inconclusive");
  });

  it("approved but low interaction => inconclusive (does not overstate)", () => {
    expect(
      classifyLead({
        status: "approved",
        risk_flags: ["low_interaction_session"],
        metrics: { session_seconds: 20, meaningful_event_count: 1 },
      }),
    ).toBe("inconclusive");
  });
});

function scoredOutcome(
  score: ScoreResult,
  parsed: { certificate_id: string; consent_detected: boolean },
  analysis_id: string | null,
): ScoreAndRouteOutcome {
  return {
    kind: "scored",
    certificate_url: "https://cert.trustedform.com/x",
    claim_result: { ok: true, status_code: 200 },
    parsed_lead: { certificate_id: parsed.certificate_id, consent_detected: parsed.consent_detected } as never,
    score,
    routing: { decision: "sent_to_crm", destination: "crm", score_status: score.status, notes: [] },
    sheet_result: null,
    webhook_result: null,
    analysis_id,
  };
}

describe("mapToLeadProsperFlatFields", () => {
  it("maps an approved scored outcome to accept/real_human flat fields", () => {
    const flat = mapToLeadProsperFlatFields(
      scoredOutcome(scoreFixture(), { certificate_id: "CID", consent_detected: true }, "AID"),
    );
    expect(flat.vs_pass).toBe(true);
    expect(flat.vs_recommended_action).toBe("accept");
    expect(flat.vs_status).toBe("approved");
    expect(flat.vs_classification).toBe("real_human");
    expect(flat.vs_score).toBe(90);
    expect(flat.vs_score_1_10).toBe(9);
    expect(flat.vs_certificate_id).toBe("CID");
    expect(flat.vs_consent_detected).toBe(true);
    expect(flat.vs_session_seconds).toBe(32);
    expect(flat.vs_meaningful_event_count).toBe(8);
    expect(flat.vs_analysis_id).toBe("AID");
    expect(flat.vs_model_version).toBe(MODEL_VERSION);
    expect(flat.vs_return_eligible).toBe(false);
    expect(flat.vs_reason).toContain("Consent detected");
  });

  it("flags return_eligible only for a high-confidence automated reject", () => {
    const flat = mapToLeadProsperFlatFields(
      scoredOutcome(
        scoreFixture({
          value: 10,
          status: "reject",
          confidence: "high",
          risk_flags: ["extremely_rapid_submission"],
          metrics: {
            session_seconds: 1,
            meaningful_event_count: 0,
            resize_event_count: 0,
            repeated_field_edit_count: 0,
            slider_change_count: 0,
          },
        }),
        { certificate_id: "", consent_detected: false },
        null,
      ),
    );
    expect(flat.vs_pass).toBe(false);
    expect(flat.vs_recommended_action).toBe("reject");
    expect(flat.vs_classification).toBe("bot_script");
    expect(flat.vs_return_eligible).toBe(true);
    expect(flat.vs_risk_flags).toBe("extremely_rapid_submission");
    expect(flat.vs_analysis_id).toBe("");
  });

  it("does not flag return_eligible for a low-confidence reject", () => {
    const flat = mapToLeadProsperFlatFields(
      scoredOutcome(
        scoreFixture({
          value: 30,
          status: "reject",
          confidence: "low",
          risk_flags: ["rapid_submission", "input_instability"],
          metrics: {
            session_seconds: 7,
            meaningful_event_count: 3,
            resize_event_count: 0,
            repeated_field_edit_count: 4,
            slider_change_count: 0,
          },
        }),
        { certificate_id: "C", consent_detected: false },
        "A",
      ),
    );
    expect(flat.vs_classification).toBe("autofill");
    expect(flat.vs_return_eligible).toBe(false);
  });

  it("returns a safe inconclusive response when the claim failed", () => {
    const flat = mapToLeadProsperFlatFields({
      kind: "claim_failed",
      certificate_url: "https://cert.trustedform.com/x",
      status_code: 404,
      error: "Certificate not found.",
    });
    expect(flat.vs_pass).toBe(false);
    expect(flat.vs_status).toBe("review");
    expect(flat.vs_classification).toBe("inconclusive");
    expect(flat.vs_reason).toBe("Certificate not found.");
  });

  it("maps a cached outcome by reading the stored score JSON", () => {
    const flat = mapToLeadProsperFlatFields({
      kind: "cached",
      certificate_url: "https://cert.trustedform.com/x",
      stored_at: null,
      analysis_id: "cached-id",
      parsed_lead: { certificate_id: "CID2", consent_detected: true },
      score: scoreFixture({ value: 70, status: "review", confidence: "medium" }),
    });
    expect(flat.vs_status).toBe("review");
    expect(flat.vs_score).toBe(70);
    expect(flat.vs_certificate_id).toBe("CID2");
    expect(flat.vs_analysis_id).toBe("cached-id");
  });
});
