// Background jobs of Settings, Data Backup & Security.
import "server-only";

import { defineJob, defineSchedule } from "../jobs";
import { runDataExport } from "./data-export";
import { runRetentionCheck } from "./retention";
import "./imports";

defineJob("data-export", "The full data export", (tx, ctx, payload) => runDataExport(tx, ctx, payload as { exportId: string; models: string[] }), { ownTransaction: true });

// Retention schedule (08-platform-security.md §12): once a day, records past
// their period are listed for the School Admin; working rows are cleared.
defineSchedule("retention-check", 24 * 60, (tx, ctx, now) => runRetentionCheck(tx, ctx, now), { ownTransaction: true });
