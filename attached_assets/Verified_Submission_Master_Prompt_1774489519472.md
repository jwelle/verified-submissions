Below is a **master Replit prompt** with upfront context, product goal, pass structure, and implementation detail.

You can paste this into Replit as your project brief.

PROJECT CONTEXT AND GOAL

I am building a product that acts as a **lead integrity and compliance gatekeeper** before CRM ingestion.

The purpose of this system is to help a client evaluate incoming leads using TrustedForm / ActiveProspect certificate data so they can:

* detect likely fraud or low-quality leads  
* identify missing or weak consent signals  
* assign a lead integrity / compliance score  
* decide whether a lead should be approved, reviewed, or rejected  
* create a clean audit trail for review and potential return of bad leads  
* optionally pass the result into downstream systems such as CRM, Zapier, or n8n

This product should not be framed as helping anyone “defraud” anything. It is a **fraud detection, compliance review, and lead quality scoring system**.

The product should be built in **two passes** to reduce risk and avoid over-refactoring.

PASS 1 GOAL:  
Build the core backend engine that:

* retrieves a TrustedForm certificate  
* parses the event log  
* normalizes lead data  
* scores the lead  
* returns a structured JSON response

PASS 2 GOAL:  
Build the workflow and light UI layer that:

* routes leads based on score  
* sends review leads to Google Sheets  
* sends outbound webhooks to Zapier / n8n  
* provides a lightweight manual frontend where a user can submit a certificate URL and view results

This is primarily a backend/infrastructure product with a thin UI for demo, QA, and manual review.

IMPORTANT IMPLEMENTATION RULES

* Do not refactor unrelated files  
* Do not modify authentication, deployment config, database config, or unrelated routes unless absolutely necessary  
* Keep changes isolated and modular  
* Prefer deterministic logic, regex, and heuristics over unnecessary abstraction  
* Use clear comments  
* Keep all scoring logic easy to adjust through config  
* Build clean, testable modules  
* Do not overengineer  
* If the app already has an existing framework, integrate cleanly with it  
* If not, build the smallest clean implementation needed

# **\==================================================**

# **GLOBAL SECURITY REQUIREMENTS**

* API key must come from environment variable:  
  ACTIVEPROSPECT\_API\_KEY  
* Use HTTP Basic Auth for ActiveProspect / TrustedForm:  
  username \= "API"  
  password \= value of ACTIVEPROSPECT\_API\_KEY  
* Only allow authenticated certificate requests to URLs that begin with:  
  [https://cert.trustedform.com](https://cert.trustedform.com/)  
* Reject all other domains to avoid credential leakage  
* Use timeouts and defensive error handling for all external requests

# **\==================================================**

# **OVERALL FILE STRUCTURE**

Create or extend these files over the two passes:

services/  
trustedform\_client.py  
event\_parser.py  
field\_inference.py  
scoring\_engine.py  
routing\_engine.py  
webhook\_dispatcher.py  
google\_sheets.py

routes/  
lead\_scoring.py

config/  
scoring\_rules.py

templates/ or frontend/  
lead\_check page  
lead\_results page

tests or fixtures/  
sample good lead  
sample review lead  
sample reject lead

# **\==================================================**

# **PASS 1**

# **CORE BACKEND ENGINE**

The goal of Pass 1 is to build the core engine only.

Do not build routing, Google Sheets, outbound webhooks, or the frontend UI yet.

Pass 1 should do exactly this:

1. accept a TrustedForm certificate URL  
2. securely claim or retrieve the certificate from ActiveProspect / TrustedForm  
3. parse the event log or payload  
4. normalize the lead record  
5. apply the fraud / compliance scoring engine  
6. return a structured JSON response

---

## **PASS 1 FILES**

Create:

services/  
trustedform\_client.py  
event\_parser.py  
field\_inference.py  
scoring\_engine.py

routes/  
lead\_scoring.py

config/  
scoring\_rules.py

---

## **PASS 1 STEP 1: TRUSTEDFORM CLIENT**

Create services/trustedform\_client.py

Implement:

* get\_api\_key() \-\> str  
* is\_valid\_trustedform\_url(url: str) \-\> bool  
* claim\_certificate(certificate\_url: str) \-\> dict

Behavior:

1. Validate certificate URL begins with:  
   [https://cert.trustedform.com](https://cert.trustedform.com/)  
2. Send POST request to certificate URL  
3. Use HTTP Basic Auth:  
   username \= "API"  
   password \= env var API key  
4. Set headers:  
   Accept: application/json  
5. Use a reasonable timeout  
6. Return structured result like:

{  
"ok": true,  
"status\_code": 200,  
"data": {},  
"error": null  
}

Handle:

* missing API key  
* invalid domain  
* timeout  
* unauthorized  
* malformed response

---

## **PASS 1 STEP 2: EVENT PARSER**

\--------------------------------------------------  
REFERENCE EVENT LOG (IMPORTANT)  
\--------------------------------------------------

A real TrustedForm event log file 

Use this file as a reference example to understand:

\- event formatting  
\- timestamp structure  
\- field change patterns  
\- noise vs meaningful events  
\- real-world sequencing of events

Important instructions:

\- Do NOT hardcode logic specific only to this file  
\- Use it to identify generalizable patterns  
\- Ensure the parser works for:  
\- similar text logs  
\- future variations  
\- JSON-based event payloads

The parser should be flexible and not brittle.

If helpful, load this file in development to test parsing logic.

Create services/event\_parser.py

Implement:

* parse\_trustedform\_text(raw\_text: str) \-\> dict  
* parse\_trustedform\_payload(payload: dict) \-\> dict

The parser must extract:

* certificate\_id  
* certificate\_created\_at  
* submitted\_at  
* consent\_detected  
* field\_map  
* raw\_events  
* parse\_notes

Parse events like:

* certificate created  
* submitted form  
* consent language detected  
* changed value to 'X' in \[field-id\]

Rules:

* Keep the latest final value for each field ID  
* Preserve structured raw events where possible  
* Ignore low-value noise for scoring purposes such as:  
  * resized the window  
  * generic wrapper clicks  
* Still retain raw events if practical

Output shape:

{  
"certificate\_id": "",  
"certificate\_created\_at": "",  
"submitted\_at": "",  
"consent\_detected": false,  
"field\_map": {},  
"raw\_events": \[\],  
"parse\_notes": \[\]  
}

---

## **PASS 1 STEP 3: FIELD INFERENCE**

Create services/field\_inference.py

Implement:

* infer\_field\_roles(field\_map: dict) \-\> dict  
* normalize\_submission(parsed\_data: dict, inferred\_fields: dict) \-\> dict

Support manual overrides:

FIELD\_OVERRIDES \= {  
"input-6417e977": "email",  
"phone-input-id-9bc36538": "phone",  
"address-fd904f8b": "address\_full",  
"input-10bf0565": "business\_name",  
"input-13c9ba29": "first\_name",  
"input-041bc24c": "last\_name",  
"slider-5c5a48ae-numeric": "employee\_count",  
"input-a4ad7fac": "lead\_source"  
}

If an override exists, use it first.

Otherwise infer using regex and heuristics:

* email by email regex  
* phone by phone regex  
* address by address-like structure  
* business\_name by longer org-like text  
* first\_name and last\_name by short name-like values  
* employee\_count by numeric slider or count-like field  
* lead\_source by values like facebook, google, website, etc.

Normalized output shape:

{  
"certificate\_id": "",  
"certificate\_created\_at": "",  
"submitted\_at": "",  
"consent\_detected": false,  
"lead\_source": "",  
"business\_name": "",  
"address\_full": "",  
"email": "",  
"phone": "",  
"first\_name": "",  
"last\_name": "",  
"employee\_count": null,  
"raw\_events": \[\],  
"field\_map": {},  
"parse\_notes": \[\],  
"status": "parsed"  
}

Status:

* parsed if most important fields were extracted  
* partial if only some fields were extracted  
* error if parsing failed badly

---

## **PASS 1 STEP 4: SCORING RULES CONFIG**

Create config/scoring\_rules.py

Store scoring constants in config, including:

BASE\_SCORE \= 100

Consent / compliance deductions:

* NO\_CONSENT \= 50  
* NO\_SUBMISSION \= 40  
* NO\_CERTIFICATE\_ID \= 20

Field completeness deductions:

* MISSING\_EMAIL \= 20  
* MISSING\_PHONE \= 20  
* MISSING\_NAME \= 10  
* MISSING\_ADDRESS \= 10

Data quality deductions:

* INVALID\_EMAIL \= 25  
* SUSPICIOUS\_EMAIL \= 10  
* INVALID\_PHONE \= 10  
* MISSING\_EMPLOYEE\_COUNT \= 5

Session quality deductions:

* UNDER\_10\_SECONDS \= 20  
* UNDER\_5\_SECONDS \= 35  
* LOW\_INTERACTION \= 25

Behavior deductions:

* INPUT\_INSTABILITY \= 10  
* ERRATIC\_SLIDER \= 10  
* EXCESSIVE\_RESIZE \= 5  
* NON\_PROGRESS\_CLICKS \= 5

Positive adjustments:

* CLEAN\_FLOW \= 5  
* STABLE\_INPUTS \= 5  
* STRONG\_CONTACT\_AND\_CONSENT \= 5

Thresholds:

* APPROVED\_MIN \= 85  
* REVIEW\_MIN \= 60

---

## **PASS 1 STEP 5: SCORING ENGINE**

Create services/scoring\_engine.py

Implement:

* calculate\_session\_metrics(raw\_events: list\[dict\], created\_at: str, submitted\_at: str) \-\> dict  
* detect\_behavior\_signals(raw\_events: list\[dict\]) \-\> dict  
* score\_lead(normalized\_submission: dict) \-\> dict

Start base score \= 100\.

The scoring engine must produce:

{  
"value": 72,  
"status": "review",  
"confidence": "medium",  
"risk\_flags": \[\],  
"explanations": \[\],  
"metrics": {}  
}

Use these scoring dimensions:

A. Consent / compliance

* no consent\_detected \-\> \-50  
* no submitted\_at \-\> \-40  
* missing certificate\_id \-\> \-20

Risk flags:

* missing\_consent  
* missing\_submission  
* missing\_certificate\_id

B. Field completeness

* missing email \-\> \-20  
* missing phone \-\> \-20  
* missing both first and last name \-\> \-10  
* missing address\_full \-\> \-10

Risk flags:

* missing\_email  
* missing\_phone  
* missing\_name  
* missing\_address

C. Data quality

* invalid email \-\> \-25  
* suspicious email \-\> \-10  
* invalid or incomplete phone \-\> \-10  
* missing employee\_count when count field appears present \-\> \-5

Risk flags:

* invalid\_email  
* suspicious\_email  
* invalid\_phone  
* missing\_employee\_count

D. Session quality  
Compute time from certificate\_created\_at to submitted\_at.

* session under 10 seconds \-\> \-20  
* session under 5 seconds \-\> \-35  
* no meaningful interaction before submit \-\> \-25

Risk flags:

* rapid\_submission  
* extremely\_rapid\_submission  
* low\_interaction\_session

Meaningful interaction includes:

* value changes  
* radio choices  
* slider changes  
* address entries

E. Behavioral fraud signals  
Detect from raw\_events:

* more than 8 repeated value changes on same field in short sequence \-\> \-10  
* erratic slider movement with back-and-forth changes \-\> \-10  
* excessive window resize events \-\> \-5  
* repeated wrapper clicks without progress \-\> \-5

Risk flags:

* input\_instability  
* erratic\_slider\_behavior  
* excessive\_resize\_activity  
* non\_progress\_clicking

F. Positive adjustments  
Only add small bonuses if no severe red flags exist:

* clean progression through form \-\> \+5  
* stable final inputs with limited noise \-\> \+5  
* consent \+ valid email \+ valid phone \-\> \+5

Clamp final score between 0 and 100\.

Score status:

* approved if score \>= 85  
* review if score is 60 to 84  
* reject if score \< 60

Confidence:

* high if consent exists and at least two key contact fields are valid and behavior is stable  
* medium if some uncertainty exists  
* low if many deductions or critical signals are missing

Return shape:

{  
"value": 72,  
"status": "review",  
"confidence": "medium",  
"risk\_flags": \[  
"rapid\_submission",  
"input\_instability"  
\],  
"explanations": \[  
"Consent detected",  
"Valid email found",  
"Session completed in under 10 seconds",  
"Multiple repeated edits detected on the same field"  
\],  
"metrics": {  
"session\_seconds": 9,  
"meaningful\_event\_count": 14,  
"resize\_event\_count": 6,  
"repeated\_field\_edit\_count": 11,  
"slider\_change\_count": 9  
}  
}

---

## **PASS 1 STEP 6: MAIN API ROUTE**

Create routes/lead\_scoring.py

Implement:

POST /api/score-lead

Input:  
{  
"certificate\_url": "[https://cert.trustedform.com/](https://cert.trustedform.com/)..."  
}

Flow:

1. validate input  
2. claim certificate  
3. parse payload  
4. infer fields  
5. normalize submission  
6. score lead  
7. return full structured response

Response:  
{  
"claim\_result": {  
"ok": true,  
"status\_code": 200  
},  
"parsed\_lead": {},  
"score": {}  
}

---

## **PASS 1 STEP 7: TEST FIXTURES**

Add local fixtures for:

* one good lead  
* one review lead  
* one reject lead

Use event sequences like:

* certificate created  
* changed value to lead source  
* changed value to company name  
* changed value to address  
* changed value to email  
* changed value to phone  
* consent language detected  
* submitted form

Include examples with:

* erratic slider movement  
* repeated field edits  
* rapid submission  
* missing consent

---

## **PASS 1 DELIVERABLES**

At the end of Pass 1, show:

1. file structure  
2. trustedform client code  
3. parser code  
4. field inference code  
5. scoring engine code  
6. route code  
7. sample request bodies  
8. sample responses

# **\==================================================**

# **PASS 2**

# **ROUTING, GOOGLE SHEETS, OUTBOUND WEBHOOKS, LIGHT UI**

Pass 1 already includes:

* TrustedForm fetch  
* event parsing  
* field inference  
* normalized lead output  
* scoring engine  
* score API route

In Pass 2, do not rewrite Pass 1 unless required for small integration adjustments.

The goal of Pass 2 is to add:

1. routing engine  
2. Google Sheets review queue  
3. outbound webhook support for Zapier / n8n  
4. lightweight frontend UI

The UI is not the core product. It is a thin manual review, demo, and QA layer.

---

## **PASS 2 FILES**

Add:

services/  
routing\_engine.py  
webhook\_dispatcher.py  
google\_sheets.py

templates/ or frontend/  
lead\_check page  
lead\_results page

If the app already has an existing frontend framework, use it minimally and consistently.  
If not, build a lightweight server-rendered UI or a very small static frontend.

---

## **PASS 2 STEP 1: ROUTING ENGINE**

Create services/routing\_engine.py

Implement:

* route\_lead(normalized\_submission: dict, score\_result: dict, routing\_config: dict) \-\> dict

Routing logic:

* approved:  
  * optionally forward to CRM webhook if configured  
* review:  
  * send to Google Sheets review queue  
* reject:  
  * do not send to CRM  
  * optionally still notify downstream via outbound webhook  
  * log internally if practical

Return:  
{  
"decision": "sent\_to\_review",  
"destination": "google\_sheet"  
}

Possible values:

* sent\_to\_crm  
* sent\_to\_review  
* rejected\_logged\_only  
* rejected\_notified  
* approved\_no\_crm\_configured

---

## **PASS 2 STEP 2: GOOGLE SHEETS REVIEW QUEUE**

Create services/google\_sheets.py

Implement:

* append\_review\_row(review\_data: dict) \-\> dict

Only review leads should be sent to Google Sheets by default.

Columns:

* timestamp  
* score  
* status  
* first\_name  
* last\_name  
* email  
* phone  
* address  
* business\_name  
* risk\_flags  
* explanations  
* certificate\_id  
* certificate\_url

Return:  
{  
"success": true,  
"row\_id": null,  
"error": null  
}

Keep the Sheets integration isolated so it can be swapped later.

---

## **PASS 2 STEP 3: OUTBOUND WEBHOOK DISPATCHER**

Create services/webhook\_dispatcher.py

Implement:

* dispatch\_outbound\_webhook(payload: dict, config: dict) \-\> dict

Config:  
{  
"enabled": true,  
"url": "[https://hooks.zapier.com/](https://hooks.zapier.com/)...",  
"method": "POST",  
"headers": {  
"Content-Type": "application/json"  
},  
"retry\_attempts": 3,  
"timeout\_seconds": 5  
}

Behavior:

* only send if enabled is true  
* POST JSON payload  
* retry on failure up to retry\_attempts  
* do not break main flow if webhook fails  
* return warning instead

Return:  
{  
"success": true,  
"status\_code": 200,  
"error": null  
}

Payload format:  
{  
"event": "lead.scored",  
"timestamp": "...",  
"lead": {  
"first\_name": "",  
"last\_name": "",  
"email": "",  
"phone": "",  
"address\_full": "",  
"business\_name": ""  
},  
"score": {  
"value": 72,  
"status": "review",  
"confidence": "medium"  
},  
"risk\_flags": \[\],  
"explanations": \[\],  
"compliance": {  
"consent\_detected": true,  
"certificate\_id": "",  
"certificate\_url": ""  
},  
"routing": {  
"decision": "sent\_to\_review",  
"destination": "google\_sheet"  
}  
}

---

## **PASS 2 STEP 4: MAIN ROUTE UPGRADE**

Upgrade the API route to:

POST /api/score-and-route

Input:  
{  
"certificate\_url": "[https://cert.trustedform.com/](https://cert.trustedform.com/)..."  
}

Flow:

1. claim certificate  
2. parse payload  
3. infer fields  
4. normalize submission  
5. score lead  
6. route lead  
7. append to Google Sheets if review  
8. send outbound webhook  
9. return structured response

Response:  
{  
"claim\_result": {  
"ok": true,  
"status\_code": 200  
},  
"parsed\_lead": {},  
"score": {},  
"routing": {},  
"sheet\_result": {},  
"webhook\_result": {}  
}

---

## **PASS 2 STEP 5: LIGHTWEIGHT FRONTEND UI**

Add a very small frontend so a user can manually check a lead.

The UI should be simple, professional, and clean.

PAGE 1: LEAD CHECK  
Fields:

* certificate URL input  
* submit button

Optional:

* textarea for notes or pasted lead JSON, but keep it optional

On submit:

* call /api/score-and-route

PAGE 2: RESULTS  
Display:

* score as a large number  
* status badge: approved / review / reject  
* confidence  
* risk flags  
* explanations  
* parsed lead fields:  
  * name  
  * email  
  * phone  
  * address  
  * business name  
  * lead source  
  * employee count  
* compliance fields:  
  * consent detected  
  * certificate id  
* routing result  
* Google Sheet result if used  
* webhook result

Optional but useful:

* collapsible raw event preview  
* copy JSON button

UI rules:

* keep it mobile friendly  
* use clean spacing  
* cards or sections are fine  
* no complex analytics dashboard in this pass  
* no auth in this pass unless already present

---

## **PASS 2 STEP 6: UX GOAL**

The UI should serve three jobs only:

1. Demo tool  
2. Internal QA tool  
3. Manual exception review screen

Use this simple flow:

Lead Check Form  
→ Result Screen  
→ Optional review visibility

Do not build a large admin system in this pass.

---

## **PASS 2 DELIVERABLES**

At the end of Pass 2, show:

1. updated file structure  
2. routing code  
3. Google Sheets code  
4. outbound webhook code  
5. upgraded route code  
6. frontend files  
7. sample requests  
8. sample responses

# **\==================================================**

# **FINAL EXPECTED OUTCOME**

The final system should act as a gatekeeper before CRM ingestion.

End-to-end flow:

Form or webhook  
→ backend receives certificate URL  
→ claim certificate  
→ parse events  
→ normalize lead  
→ score fraud / compliance risk  
→ route:

* approved to CRM if configured  
* review to Google Sheets  
* reject to log or webhook only  
  → send outbound webhook to Zapier or n8n  
  → optionally show the result in the lightweight UI

This product should make it easy for a client to review leads, identify bad submissions, document compliance issues, and support return or dispute workflows with lead vendors.

A useful companion document after this would be a **plain-English product spec** for users, separate from the build prompt.

