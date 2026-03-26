// Sample lead fixtures for testing the scoring engine.
// Use these with POST /api/score-lead/from-text

// Good lead — clean session, consent, all fields, stable behavior
export const GOOD_LEAD_EVENT_LOG = `
Certificate ID: abc123goodlead000000000000000000000000000
2026/01/15 10:00:00  0:00  certificate created
2026/01/15 10:00:02  0:02  changed value to 'facebook' in [input-a4ad7fac]
2026/01/15 10:00:06  0:06  changed value to 'Acme Solar Corp' in [input-10bf0565]
2026/01/15 10:00:12  0:12  changed value to '1265 Rainbow Lane, Pilot Mountain, NC, USA' in [address-fd904f8b]
2026/01/15 10:00:18  0:18  changed value to 'jane.doe@acmesolar.com' in [input-6417e977]
2026/01/15 10:00:22  0:22  changed value to '+1 317 555 1234' in [phone-input-id-9bc36538]
2026/01/15 10:00:25  0:25  changed value to 'Jane' in [input-13c9ba29]
2026/01/15 10:00:26  0:26  changed value to 'Doe' in [input-041bc24c]
2026/01/15 10:00:28  0:28  changed value to '45' in [slider-5c5a48ae-numeric]
2026/01/15 10:00:30  0:30  consent language detected
2026/01/15 10:00:32  0:32  submitted form
`.trim();

// Review lead — session is OK but some behavioral noise and missing some data
export const REVIEW_LEAD_EVENT_LOG = `
Certificate ID: def456reviewlead0000000000000000000000000
2026/01/15 11:00:00  0:00  certificate created
2026/01/15 11:00:04  0:04  resized the window
2026/01/15 11:00:05  0:05  changed value to 'google' in [input-a4ad7fac]
2026/01/15 11:00:08  0:08  changed value to 'Summit Energy LLC' in [input-10bf0565]
2026/01/15 11:00:12  0:12  changed value to 'bob@summitllc.biz' in [input-6417e977]
2026/01/15 11:00:15  0:15  changed value to '+1 555 888 9900' in [phone-input-id-9bc36538]
2026/01/15 11:00:16  0:16  resized the window
2026/01/15 11:00:17  0:17  resized the window
2026/01/15 11:00:18  0:18  resized the window
2026/01/15 11:00:20  0:20  changed value to '200' in [slider-5c5a48ae]
2026/01/15 11:00:20  0:20  changed value to '250' in [slider-5c5a48ae]
2026/01/15 11:00:21  0:21  changed value to '200' in [slider-5c5a48ae]
2026/01/15 11:00:21  0:21  changed value to '230' in [slider-5c5a48ae]
2026/01/15 11:00:22  0:22  changed value to '100' in [slider-5c5a48ae]
2026/01/15 11:00:22  0:22  changed value to '180' in [slider-5c5a48ae]
2026/01/15 11:00:23  0:23  changed value to '150' in [slider-5c5a48ae-numeric]
2026/01/15 11:00:26  0:26  consent language detected
2026/01/15 11:00:30  0:30  submitted form
`.trim();

// Reject lead — rapid submission, no consent, suspicious email, repeated edits
export const REJECT_LEAD_EVENT_LOG = `
Certificate ID: ghi789rejectlead000000000000000000000000
2026/01/15 12:00:00  0:00  certificate created
2026/01/15 12:00:01  0:01  changed value to 'test@test.com' in [input-6417e977]
2026/01/15 12:00:01  0:01  changed value to 't' in [input-a4ad7fac]
2026/01/15 12:00:01  0:01  changed value to 'te' in [input-a4ad7fac]
2026/01/15 12:00:01  0:01  changed value to 'tes' in [input-a4ad7fac]
2026/01/15 12:00:01  0:01  changed value to 'test' in [input-a4ad7fac]
2026/01/15 12:00:01  0:01  changed value to 'testo' in [input-a4ad7fac]
2026/01/15 12:00:01  0:01  changed value to 'testor' in [input-a4ad7fac]
2026/01/15 12:00:01  0:01  changed value to 'testorg' in [input-a4ad7fac]
2026/01/15 12:00:01  0:01  changed value to 'testorg1' in [input-a4ad7fac]
2026/01/15 12:00:02  0:02  submitted form
`.trim();

// Sample request bodies for the API
export const SAMPLE_REQUESTS = {
  score_from_live_cert: {
    certificate_url: "https://cert.trustedform.com/abc123...",
  },
  score_from_text_good: {
    event_log_text: GOOD_LEAD_EVENT_LOG,
    certificate_url: "https://cert.trustedform.com/abc123goodlead000000000000000000000000000",
  },
  score_from_text_review: {
    event_log_text: REVIEW_LEAD_EVENT_LOG,
    certificate_url: "https://cert.trustedform.com/def456reviewlead0000000000000000000000000",
  },
  score_from_text_reject: {
    event_log_text: REJECT_LEAD_EVENT_LOG,
    certificate_url: "https://cert.trustedform.com/ghi789rejectlead000000000000000000000000",
  },
};
