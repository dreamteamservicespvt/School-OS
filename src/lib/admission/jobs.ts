// Timed work for Admission Management: follow-up reminders to enquiry owners
// (02 Done when 3). Safe to run twice. Imported by src/lib/job-registry.ts.
import "server-only";

import { defineSchedule } from "../jobs";
import { sendFollowUpReminders } from "./enquiries";

defineSchedule("admission-follow-up-reminders", 15, (tx, ctx, now) => sendFollowUpReminders(tx, ctx, now).then(() => undefined));
