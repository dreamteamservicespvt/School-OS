// Timed work of Settings: school document expiry reminders (A15 pattern).
import "server-only";

import { defineSchedule } from "../jobs";
import { remindExpiringDocuments } from "./vault";

defineSchedule("school-document-expiry", 24 * 60, (tx, ctx, now) => remindExpiringDocuments(tx, ctx, now));
