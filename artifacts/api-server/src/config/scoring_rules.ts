// Scoring rules configuration — adjust these values to tune the engine
export const BASE_SCORE = 100;

// Consent / compliance deductions
export const NO_CONSENT = 50;
export const NO_SUBMISSION = 40;
export const NO_CERTIFICATE_ID = 20;

// Field completeness deductions
export const MISSING_EMAIL = 20;
export const MISSING_PHONE = 20;
export const MISSING_NAME = 10;
export const MISSING_ADDRESS = 10;

// Data quality deductions
export const INVALID_EMAIL = 25;
export const SUSPICIOUS_EMAIL = 10;
export const INVALID_PHONE = 10;
export const MISSING_EMPLOYEE_COUNT = 5;

// Session quality deductions
export const UNDER_10_SECONDS = 20;
export const UNDER_5_SECONDS = 35;
export const LOW_INTERACTION = 25;

// Behavior deductions
export const INPUT_INSTABILITY = 10;
export const ERRATIC_SLIDER = 10;
export const EXCESSIVE_RESIZE = 5;
export const NON_PROGRESS_CLICKS = 5;

// Positive adjustments
export const CLEAN_FLOW = 5;
export const STABLE_INPUTS = 5;
export const STRONG_CONTACT_AND_CONSENT = 5;

// Score thresholds
export const APPROVED_MIN = 85;
export const REVIEW_MIN = 60;

// Behavior thresholds
export const REPEATED_FIELD_EDIT_THRESHOLD = 8;
export const RESIZE_EVENT_THRESHOLD = 10;
export const NON_PROGRESS_CLICK_THRESHOLD = 4;
export const MEANINGFUL_INTERACTION_MIN = 3;
export const ERRATIC_SLIDER_REVERSAL_THRESHOLD = 3;
