// Timed work for the Dashboard: task reminders one day before and on the due
// morning (01 §2, My Tasks). Safe to run twice. Imported by src/lib/job-registry.ts.
import "server-only";

import { defineSchedule } from "../jobs";
import { sendTaskReminders } from "./tasks";

defineSchedule("task-reminders", 30, (tx, ctx, now) => sendTaskReminders(tx, ctx, now));
