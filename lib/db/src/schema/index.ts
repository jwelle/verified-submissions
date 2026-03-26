import { pgTable, text, uuid, timestamp, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

export const leadSubmissionsTable = pgTable(
  "lead_submissions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    received_at: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
    certificate_url: text("certificate_url"),
    certificate_id: text("certificate_id"),
    raw_payload_json: jsonb("raw_payload_json"),
    trustedform_raw_json: jsonb("trustedform_raw_json"),
    parsed_submission_json: jsonb("parsed_submission_json"),
    score_json: jsonb("score_json"),
    status: text("status"),
    processed_at: timestamp("processed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("lead_submissions_certificate_url_idx").on(table.certificate_url),
  ],
);

export type LeadSubmission = typeof leadSubmissionsTable.$inferSelect;
export type InsertLeadSubmission = typeof leadSubmissionsTable.$inferInsert;
