import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the pipeline's external edges so tests are hermetic (no DB, no network,
// no Google Sheets). Mocking submission_store also prevents @workspace/db from
// loading (it throws unless DATABASE_URL is set).
vi.mock("../services/submission_store.js", () => ({
  save_submission: vi.fn(async () => ({ id: "analysis-123" })),
  get_submission_by_certificate: vi.fn(async () => null),
}));
vi.mock("../services/google_sheets.js", () => ({
  append_review_row: vi.fn(async () => ({ success: true, row_id: "r1", error: null })),
}));
vi.mock("../services/webhook_dispatcher.js", () => ({
  dispatch_outbound_webhook: vi.fn(async () => ({ success: true })),
}));
vi.mock("../services/trustedform_client.js", async (importActual) => {
  const actual = await importActual<typeof import("../services/trustedform_client.js")>();
  return { ...actual, claim_certificate: vi.fn() };
});

import express, { type Express } from "express";
import request from "supertest";
import router from "../routes/index.js";
import { claim_certificate } from "../services/trustedform_client.js";
import { get_submission_by_certificate } from "../services/submission_store.js";
import { GOOD_LEAD_EVENT_LOG } from "../fixtures/sample_leads.js";

const VALID_URL = `https://cert.trustedform.com/${"a".repeat(40)}`;

const FLAT_KEYS = [
  "vs_pass",
  "vs_score",
  "vs_score_1_10",
  "vs_status",
  "vs_confidence",
  "vs_classification",
  "vs_recommended_action",
  "vs_return_eligible",
  "vs_certificate_id",
  "vs_consent_detected",
  "vs_session_seconds",
  "vs_meaningful_event_count",
  "vs_risk_flags",
  "vs_reason",
  "vs_analysis_id",
  "vs_model_version",
];

function makeApp(): Express {
  const app = express();
  app.use(express.json());
  app.use("/api", router);
  return app;
}

beforeEach(() => {
  vi.clearAllMocks();
  (get_submission_by_certificate as ReturnType<typeof vi.fn>).mockResolvedValue(null);
});

describe("POST /api/leadprosper/pre-ping", () => {
  it("returns the full flat vs_* contract for a valid pre-ping payload", async () => {
    (claim_certificate as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status_code: 200,
      data: { raw_text: GOOD_LEAD_EVENT_LOG },
      error: null,
    });

    const res = await request(makeApp()).post("/api/leadprosper/pre-ping").send({
      lp_lead_id: "test-lp-123",
      lp_campaign_id: "solar-campaign-1",
      trustedform_cert_url: VALID_URL,
      email: "test@example.com",
      phone: "5555555555",
      first_name: "Test",
      last_name: "Lead",
    });

    expect(res.status).toBe(200);
    for (const key of FLAT_KEYS) expect(res.body).toHaveProperty(key);
    expect(typeof res.body.vs_score).toBe("number");
    expect(res.body.vs_score).toBeGreaterThanOrEqual(0);
    expect(res.body.vs_score).toBeLessThanOrEqual(100);
    expect(["approved", "review", "reject"]).toContain(res.body.vs_status);
    expect(res.body.vs_model_version).toBe("0.1-beta");
    expect(res.body.vs_analysis_id).toBe("analysis-123");
    // The "good" fixture is a clean, consented session — should pass.
    expect(res.body.vs_pass).toBe(true);
  });

  it("400s when no certificate URL is present in the payload", async () => {
    const res = await request(makeApp())
      .post("/api/leadprosper/pre-ping")
      .send({ email: "x@y.com" });
    expect(res.status).toBe(400);
    expect(res.body.vs_pass).toBe(false);
    expect(claim_certificate).not.toHaveBeenCalled();
  });

  it("returns inconclusive (HTTP 200) when the certificate claim fails", async () => {
    (claim_certificate as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: false,
      status_code: 404,
      data: {},
      error: "missing",
    });
    const res = await request(makeApp())
      .post("/api/leadprosper/pre-ping")
      .send({ certificate_url: VALID_URL });
    expect(res.status).toBe(200);
    expect(res.body.vs_pass).toBe(false);
    expect(res.body.vs_classification).toBe("inconclusive");
    expect(res.body.vs_status).toBe("review");
  });
});

describe("POST /api/score-and-route (after refactor to shared service)", () => {
  it("still returns the original rich response shape for a scored lead", async () => {
    (claim_certificate as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      status_code: 200,
      data: { raw_text: GOOD_LEAD_EVENT_LOG },
      error: null,
    });

    const res = await request(makeApp())
      .post("/api/score-and-route")
      .send({ certificate_url: VALID_URL });

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.cached).toBe(false);
    expect(res.body).toHaveProperty("parsed_lead");
    expect(res.body).toHaveProperty("score");
    expect(res.body).toHaveProperty("routing");
    expect(res.body.claim_result).toEqual({ ok: true, status_code: 200 });
  });

  it("400s when certificate_url is missing", async () => {
    const res = await request(makeApp()).post("/api/score-and-route").send({});
    expect(res.status).toBe(400);
    expect(res.body.ok).toBe(false);
  });

  it("returns a cached result when a stored submission exists", async () => {
    (get_submission_by_certificate as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      id: "cached-row",
      processed_at: new Date("2026-01-01T00:00:00Z"),
      parsed_submission_json: { certificate_id: "CID" },
      score_json: { value: 88, status: "approved" },
    });

    const res = await request(makeApp())
      .post("/api/score-and-route")
      .send({ certificate_url: VALID_URL });

    expect(res.status).toBe(200);
    expect(res.body.cached).toBe(true);
    expect(res.body.score).toEqual({ value: 88, status: "approved" });
    expect(claim_certificate).not.toHaveBeenCalled();
  });
});
