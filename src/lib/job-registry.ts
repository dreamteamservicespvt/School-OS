// Imports every module's background jobs and schedules, so the worker knows
// them. Add one import line per module that defines jobs.
import "server-only";

import { defineSchedule } from "./jobs";
import { escalateOverdue } from "./approvals";
import { pruneRateLimits } from "./rate-limit";
import "./exports";
import "./importer";
import "./approval-handlers";
import "./data-security/jobs";
import "./staff/jobs";
import "./attendance/jobs";
import "./settings/jobs";
import "./exams/jobs";
import "./admission/jobs";
import "./messaging/jobs";
import "./communication/jobs";

defineSchedule("approval-escalation", 60, (tx, ctx, now) => escalateOverdue(tx, ctx, now));
defineSchedule("prune-rate-limits", 24 * 60, () => pruneRateLimits());
import "./students/jobs";
import "./students/import";
import "./dashboard/jobs";
