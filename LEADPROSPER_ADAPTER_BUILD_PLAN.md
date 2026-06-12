# Lead Prosper Adapter — Build Plan

**Status:** Plan for review. No code written yet.
**Branch (when we start):** `matt/leadprosper-adapter` off `main`
**Repo:** github.com/jwelle/verified-submissions
**Last validated against code:** June 12, 2026

---

## 1. Goal

Add a synchronous pre-ping endpoint that Lead Prosper (LP) can call, which wraps the existing score-and-route pipeline and returns flat `vs_*` fields LP can store in custom fields and use for accept / reject / review / downweight / return-eligible logic.

```
LP lead -> POST /api/leadprosper/pre-ping
        -> normalize payload
        -> scoreAndRouteLead()  (shared service, extracted from existing route)
        -> map result to flat vs_* fields
        -> return synchronously (with a hard deadline + fail-open fallback)
        -> log raw request + flat response
```

This is an adapter layer. The existing scoring/routing behavior is not rewritten.

---

## 2. What already exists vs. what is net-new

Confirmed by reading the live code.

| Capability | State | Action in this build |
|---|---|---|
| `score-and-route` pipeline (claim→parse→infer→normalize→score→route→store) | Exists, **inline in `routes/score_and_route.ts`** | Extract into a shared `scoreAndRouteLead()` service |
| Stage services (`scoring_engine`, `routing_engine`, `event_parser`, `field_inference`, `trustedform_client`, `submission_store`) | Exist | Reuse unchanged |
| `ScoreResult`: `value` (0–100), `status`, `confidence`, `risk_flags[]`, `explanations[]`, `metrics{session_seconds, meaningful_event_count, ...}` | Exists | Map to `vs_*` |
| `consent_detected` | Exists on **NormalizedSubmission**, not ScoreResult | Map from the normalized lead |
| `vs_classification` (real_human / bot_script / autofill / lead_farm_human / inconclusive) | **Does NOT exist** | **Net-new mapper** |
| Inbound API-key auth | **Does NOT exist** (`middlewares/` is empty) | **Net-new middleware** |
| DB `lead_submissions` table (stores `raw_payload_json`, `score_json`, dedup by `certificate_url`) | Exists | Reuse + small additive migration |
| LP fields in DB (`lp_lead_id`, `source`, `flat_response_json`) | Do NOT exist | **Additive migration** |
| TrustedForm claim | Live sync HTTP POST, **15s timeout, no retry** | Wrap with shorter pre-ping deadline + fallback |

Health route note: the real path is `/api/healthz` (docs say `/api/health` — docs are stale).
Score thresholds in code: approved ≥ 85, review 60–84, reject < 60.

---

## 3. Architecture

```
/api/score-and-route        -> scoreAndRouteLead()         (unchanged public behavior)
/api/leadprosper/pre-ping   -> normalizeLeadProsperPayload()
                            -> scoreAndRouteLead()          (shared, with deadline)
                            -> mapToLeadProsperFlatFields()
```

Rule: the LP route must **not** make an internal HTTP call to `/api/score-and-route`. Both routes call the same in-process function.

---

## 4. File-by-file changes

All paths under `artifacts/api-server/src/` unless noted.

### New files
- `services/score_and_route_service.ts` — `scoreAndRouteLead(input)`. Holds the orchestration currently inline in the route. Returns the existing rich internal result.
- `services/leadprosper_adapter.ts` — `normalizeLeadProsperPayload(body)` → `{ certificate_url, lead_context, raw_payload }`.
- `services/leadprosper_flat_fields.ts` — `mapToLeadProsperFlatFields(result, ctx)` → flat `vs_*` object; plus `mapScoreToOneToTen()`, `mapRecommendedAction()`, `mapReturnEligible()`.
- `services/lead_classifier.ts` — `classifyLead(result, normalized)` → one of the five classifications (net-new).
- `routes/leadprosper.ts` — the `POST /api/leadprosper/pre-ping` handler.
- `middlewares/api_key_auth.ts` — `x-api-key` check against `INTERNAL_API_KEY`.

### Modified files
- `routes/score_and_route.ts` — replace inline orchestration with a call to `scoreAndRouteLead()`. Public request/response shape unchanged.
- `routes/index.ts` — mount the new `leadprosper` router; apply auth middleware.
- `lib/db/src/schema/index.ts` — add optional LP columns (additive).
- `services/submission_store.ts` — persist the new LP fields when present.
- Env documentation (`OVERVIEW.md` / `replit.md`) — add the new vars. (Optionally add a `.env.example`, which does not currently exist.)

---

## 5. Payload normalization

Accept any of these certificate field names and normalize to `certificate_url`:

```
certificate_url, trustedform_cert_url, trustedform_cert, trustedform_url,
xxTrustedFormCertUrl, xxTrustedFormToken, tf_cert_url, tf_cert
```

Preserve optional context if present (stored, not required for scoring):

```
lp_lead_id, lp_campaign_id, lp_supplier_id, lp_buyer_id,
campaign_id, supplier_id, buyer_id,
email, phone, first_name, last_name, address, zip, state, lead_source, vertical
```

Keep the original body as `raw_payload`. If no certificate URL resolves → `400` with a clear error (this is a tested case).

---

## 6. Flat response contract

```json
{
  "vs_pass": true,
  "vs_score": 87,
  "vs_score_1_10": 9,
  "vs_status": "approved",
  "vs_confidence": "high",
  "vs_classification": "real_human",
  "vs_recommended_action": "accept",
  "vs_return_eligible": false,
  "vs_certificate_id": "abc123",
  "vs_consent_detected": true,
  "vs_session_seconds": 42,
  "vs_meaningful_event_count": 18,
  "vs_risk_flags": "",
  "vs_reason": "Consent detected; valid contact info; stable input behavior.",
  "vs_analysis_id": "uuid-or-empty",
  "vs_model_version": "0.1-beta"
}
```

Flat fields only (LP custom-field safe). No nested JSON in the LP response.

Field sources:
- `vs_score` ← `ScoreResult.value`; `vs_score_1_10` ← `mapScoreToOneToTen(value)`
- `vs_status`, `vs_confidence`, `vs_risk_flags` (join `risk_flags[]` with commas), `vs_reason` (from `explanations[]`)
- `vs_session_seconds`, `vs_meaningful_event_count` ← `metrics`
- `vs_consent_detected` ← normalized submission
- `vs_certificate_id` ← parsed cert hash
- `vs_classification` ← `classifyLead()`
- `vs_recommended_action`, `vs_return_eligible` ← mappers below

---

## 7. Mapping logic (first pass — tunable)

**Score to 1–10**
```ts
mapScoreToOneToTen(score) = max(1, ceil(clamp(score,0,100) / 10))
```

**Decision bands** (aligned to live thresholds: reject <60, review 60–84, approved ≥85)

| 0–100 | 1–10 | status | recommended_action |
|---|---|---|---|
| 0–39 | 1–4 | reject | reject (return-eligible if strong) |
| 40–59 | 5–6 | reject/review | review or downweight |
| 60–84 | 7–8 | review | review / cautious accept |
| 85–100 | 9–10 | approved | accept |

**Recommended action**
```
approved -> vs_pass=true,  action=accept
review   -> vs_pass=true,  action=review
reject   -> vs_pass=false, action=reject
```

**Return eligible**
```
vs_return_eligible = status==reject && confidence==high
                     && classification in {bot_script, autofill}
```
(No actual LP returns are triggered in this scope — evidence only.)

**Classification (net-new, conservative)** — derived from `status`, `risk_flags`, `metrics`, `explanations`:
- `bot_script` — reject + flags for very short/missing session, no meaningful events, automation-like behavior
- `autofill` — rapid fill, low interaction, no meaningful typing, not enough for bot_script
- `lead_farm_human` — review + human-but-too-clean/fast/linear/repetitive
- `real_human` — approved + meaningful activity + realistic session + no major automation flags
- `inconclusive` — missing cert data, partial log, conflicting signals, or parse failure where a hard reject isn't justified

Use `inconclusive` whenever signals are weak — do not overstate confidence.

---

## 8. Timeout & fallback (confirmed decisions)

**Lead Prosper behavior (confirmed by LP support):** the API Filter timeout is set by *us* in LP's settings — default 30s, adjustable up to 5 min. If our endpoint doesn't answer in time, LP **drops the connection and treats the lead as rejected (fail-closed).** So the only way a lead is wrongly killed is if *we* fail to answer in time — which our own fast fallback prevents.

**Posture: completeness-first** (the behavioral score is the product's value, and we have generous headroom).
- LP API Filter timeout: **set to ~20s** in LP settings (comfortably above our 15s cert-pull cap).
- Hard internal deadline: `VS_PREPING_DEADLINE_MS`, **default 12000ms** (env-configurable). Sits below LP's 20s so we always emit our own response before LP drops. Tune down once we measure real cert-pull latency.
- On deadline exceeded **or** cert claim/scoring failure → **fail open as review** (so a stall becomes a surviving lead, not an LP-side reject):
  ```json
  { "vs_pass": true, "vs_status": "review", "vs_classification": "inconclusive",
    "vs_recommended_action": "review", "vs_confidence": "low",
    "vs_risk_flags": "vs_timeout", "vs_reason": "Scoring did not complete within deadline; returned for manual review." }
  ```
- Always log: request-received time, scoring duration, whether the fallback fired, and the outcome.

> Ordering of the three numbers: our deadline (~12s, fail-open fires here) < cert-pull cap (15s) < LP filter timeout (20s). We always answer before LP gives up.

---

## 9. Database (additive only)

Add optional columns to `lead_submissions` (nullable, no backfill, no breaking change):

```
lp_lead_id         text null
lp_campaign_id     text null
lp_supplier_id     text null
lp_buyer_id        text null
source             text null   -- 'generic' | 'leadprosper'
flat_response_json jsonb null  -- the vs_* object returned to LP
```

Reuse existing `raw_payload_json` and `score_json`. Do not block the adapter on a larger reporting schema.

---

## 10. Authentication

- New `api_key_auth` middleware on the LP route: require header `x-api-key: <INTERNAL_API_KEY>`; 401 if missing/wrong.
- `INTERNAL_API_KEY` is a new env var (separate from the outbound `ACTIVEPROSPECT_API_KEY`).
- No secrets in frontend or git.

---

## 11. Environment variables (new)

| Var | Required | Default | Purpose |
|---|---|---|---|
| `INTERNAL_API_KEY` | Yes | — | Auth for inbound LP calls |
| `VS_PREPING_DEADLINE_MS` | No | `12000` | Pre-ping soft deadline (completeness-first; below LP's ~20s filter timeout) |
| `VS_PREPING_FAIL_MODE` | No | `open` | Reserved; `open` per decision |

(Existing required vars stay: `ACTIVEPROSPECT_API_KEY`, `PORT`, `DATABASE_URL`.)

---

## 12. Test matrix

1. Payload normalization (context fields preserved).
2. Missing certificate URL → 400.
3. Each TrustedForm field-name variant resolves to `certificate_url`.
4. `mapScoreToOneToTen` boundaries (0, 39, 40, 84, 85, 100).
5. `ScoreResult` → flat `vs_*` mapping.
6. Classification mapping for each of the five outcomes.
7. Recommended-action mapping (approved/review/reject).
8. Return-eligibility logic (true only on reject+high+bot/autofill).
9. Timeout fallback fires fail-open `review` with `vs_timeout` flag.
10. Auth: missing/invalid `x-api-key` → 401.
11. Existing `/api/score-and-route` still returns its current shape (regression).
12. `/api/leadprosper/pre-ping` returns flat fields on a sample LP payload.

---

## 13. Acceptance criteria

- `/api/leadprosper/pre-ping` exists, accepts LP-style payloads, handles all cert field-name variants.
- Reuses the pipeline via the shared `scoreAndRouteLead()` (no internal HTTP call).
- Returns flat `vs_*` including both `vs_score` and `vs_score_1_10`, plus `vs_classification`, `vs_recommended_action`, `vs_return_eligible`, `vs_reason`, `vs_risk_flags`.
- Auth enforced via `x-api-key`.
- Fail-open `review` fallback within the deadline.
- Existing frontend and routes still work. Typecheck passes. Build passes.
- A sample LP request scores end-to-end.

---

## 14. Out of scope (unchanged from the spec)

Customer dashboard, billing/Stripe, user accounts, automatic LP returns, buyer pause/resume, supplier reporting dashboard, manual review portal, major scoring rewrite, CRM/Sheets rebuild. Only the small logging/schema work above is in scope.

---

## 15. Open items (owner: Matt / LP)

1. ~~LP's pre-ping timeout + fail behavior~~ — **RESOLVED.** LP timeout is configurable by us (default 30s, up to 5 min), fails closed (timeout = reject). Decision: set LP filter to ~20s, our deadline ~12s, completeness-first. See §8.
2. Real TrustedForm cert samples — two real **good** leads received and analyzed (see §17–18). Still want one **bad** (bot/autofill) lead when available; modeling it synthetically for now.
3. **NEW — needs a decision (see §18):** three scoring-engine issues real leads exposed. Decide whether to fix as part of this work or hand to John separately.

---

## 16. Suggested build order

1. Extract `scoreAndRouteLead()`; repoint existing route; confirm regression test green.
2. Add `normalizeLeadProsperPayload()` + flat-field mapper.
3. Add `classifyLead()`.
4. Add the route + deadline/fallback wrapper.
5. Add `x-api-key` middleware.
6. Additive DB migration + store LP fields.
7. Tests + typecheck + build.
8. Manual test with a sample LP payload (and a real cert once available).

---

## 17. Classification logic (locked)

`classifyLead()` runs after `score_lead()` and reads only what the engine already produces: `value`, `status`, `confidence`, `risk_flags[]`, and `metrics` (`session_seconds`, `meaningful_event_count`, `resize_event_count`, `repeated_field_edit_count`, `slider_change_count`), plus `consent_detected` from the normalized lead.

### Primary authenticity signal: `meaningful_event_count`
This is the most defensible human/bot axis available, confirmed against the two real leads:
- **Real humans type field-by-field**, so each keystroke is a separate `field_changed` event → a *high* `meaningful_event_count` (both real samples produced 100+ events).
- **Bots and autofill set each field's final value in one shot** → a *low* `meaningful_event_count` (roughly one event per field).

So low event count + short session = automated; high event count + realistic session = human. The classifier leans on this rather than on the noisy flags below.

### Flags to DISCOUNT (known false positives — see §18)
- `input_instability` — fires on normal char-by-char typing (threshold is only 8 edits/field; a typed email exceeds it). **Do not treat as a fraud signal in the classifier.**
- `excessive_resize_activity` — fires on Heyflow's resize-spam template. **Ignore for classification.**
- `missing_consent` — a real human can lack the exact TrustedForm consent event (real sample #2 did). **Do not let it alone force a bot/autofill class.**

### Mapping (first pass, tunable)

```
inconclusive  -> status is parse error/partial, OR missing_certificate_id,
                 OR the timeout fail-open path, OR confidence "low" with sparse metrics.

bot_script    -> status == reject
                 AND meaningful_event_count is very low (<= ~5)
                 AND (extremely_rapid_submission OR low_interaction_session OR missing_submission).
                 i.e. almost no real interaction + automated speed.

autofill      -> fields are populated (not missing) BUT meaningful_event_count is low
                 relative to the number of filled fields (values appeared without keystroke buildup),
                 short/rapid session, no instability. Distinct from bot_script, which usually has
                 missing fields / missing submission.

lead_farm_human -> status == review
                 AND meaningful_event_count >= MEANINGFUL_INTERACTION_MIN (real typing present)
                 AND a "too clean / suspicious" marker (suspicious_email, or fast-but-typed,
                 or several quality flags) — human hands, low-quality source.

real_human    -> status == approved (or review with strong typing)
                 AND meaningful_event_count healthy
                 AND realistic session_seconds
                 AND no automation flags (NOT extremely_rapid, NOT low_interaction).
                 Discounted flags above do not disqualify.
```

`vs_confidence` passes through the engine's `confidence`. Use `inconclusive` whenever signals are weak — never overstate.

### How the two real samples classify under this logic
- **Sample 1** (Heyflow, consent + opt-in, ~3.5 min, 100+ events): `real_human`, approved. The `input_instability` + `excessive_resize` flags are discounted as template/typing noise.
- **Sample 2** (custom form, SMS-verified, ~2 min, 100+ events, **no consent event**): behaviorally `real_human`. But note the engine *scores* it as reject today purely because of `missing_consent` (−50) — see §18. The classifier reads it as human; the score disagrees, which is the bug to resolve.

---

## 18. Scoring-engine findings from real leads (needs a decision)

Reading the engine against two real human leads exposed three systematic issues. None are caused by the adapter, but they affect whether the `vs_*` output is defensible at launch. The scope doc says "don't change scoring unless required" — flagging these so you/John decide.

**P1 — Normal typing triggers a fraud flag (highest impact).**
`calculate_session_metrics` / `detect_behavior_signals` count every `changed value to '...'` keystroke as a separate edit on the same field. `REPEATED_FIELD_EDIT_THRESHOLD` is 8, but a typed email is ~18 keystrokes → `input_instability` fires AND positive adjustments (`CLEAN_FLOW`, `STABLE_INPUTS`) are blocked. The most human behavior (careful typing) is penalized. *Fix direction:* count distinct edits differently (collapse monotonic keystroke buildup into one "field entry"), or raise the threshold substantially, or exclude known text-input fields.

**P2 — Missing consent event hard-rejects real humans.**
Consent is detected only by the literal `consent language detected` event string. Real sample #2 (phone-verified human) had no such line → −50 → reject. Forms/funnels that don't emit that exact event get crushed regardless of behavior. *Fix direction:* treat SMS/phone verification or an opt-in checkbox as alternative consent evidence, and/or make the consent deduction less absolute.

**P3 — Heyflow resize-spam triggers `excessive_resize`.**
The Heyflow template fires hundreds of `resized the window` events; threshold is 10 → `excessive_resize_activity` on legitimate leads. *Fix direction:* ignore resize volume for known templates, or raise the threshold sharply, or weight it near zero.

**Recommended handling:** the adapter ships independently and the classifier already discounts these flags (§17), so the LP integration isn't blocked. But P1 and P2 should be fixed before going public to lead buyers, since they make the *score itself* mis-rank real humans. Suggest a small, separate `matt/scoring-tuning` (or John-owned) follow-up, kept out of the adapter PR to stay scope-clean.
