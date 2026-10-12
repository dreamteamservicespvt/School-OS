// Pill colours for Admission statuses and stages (design: mod-admissions.jsx STATUS_TONE, STAGE_TONE).
import type { PillTone } from "@/components/ui/badge";

export const STATUS_TONE: Record<string, PillTone> = { new: "info", contacted: "brand", "visit-scheduled": "brand", visited: "brand", "application-given": "warn", applied: "ok", admitted: "ok", lost: "neutral" };

export const STAGE_TONE: Record<string, PillTone> = {
  SUBMITTED: "info", SUBMITTED_ONLINE: "info", REVIEWED: "brand", DOCUMENTS: "warn", TEST_INTERVIEW: "brand", DECISION: "warn",
  APPROVED: "ok", WAITING_LIST: "warn", REJECTED: "bad", ADMITTED: "ok", WITHDRAWN: "neutral",
};
