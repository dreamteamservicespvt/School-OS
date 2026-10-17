// Background work without a separate worker (deploy/vercel/README.md). On a
// host like Vercel, where `npm run worker` cannot run, the web app itself does
// the worker's work in short bursts: right after a request that queued a job
// (jobs.ts, kickJobs), and when /api/v1/jobs/tick is called by a scheduler.
//
// Two bursts at once are harmless: each job is claimed by one runner only
// (claim_background_jobs, FOR UPDATE SKIP LOCKED) and every job is safe to run
// twice (08-platform-security.md §9), so an extra call never sends twice.
import "server-only";

import "./job-registry";
import { queueSchedules, runDueJobs } from "./jobs";
import { hitLimit } from "./rate-limit";

/** A burst stops starting new jobs after this long, well inside a serverless function's time limit. */
const BURST_MS = 20_000;
export type TickResult = { ran: number; schedules: boolean };

export async function tickJobs(budgetMs = BURST_MS): Promise<TickResult> {
  const until = Date.now() + budgetMs;
  // Timed work (reminders, escalations) is queued at most once a minute, like the worker.
  const schedules = (await hitLimit("job-tick:schedules", 1, 60)).ok;
  if (schedules) {
    await queueSchedules();
    await consoleWork();
  }
  let ran = 0;
  while (Date.now() < until) {
    const n = await runDueJobs(5);
    ran += n;
    if (n === 0) break;
  }
  return { ran, schedules };
}

/** One billing day an hour, whichever server or worker gets there first. */
export const BILLING_LIMIT_KEY = "job-tick:console-billing";

/** The console's own timed work, as scripts/worker.ts does it. */
async function consoleWork() {
  try {
    const [{ measureStale }, { runBillingDay }, { endExpiredSupport }] = await Promise.all([import("./console/measure"), import("./console/billing"), import("./console/support-entry")]);
    // Support access ends by itself at the time the school gave (07-super-admin.md §3.4 step 5),
    // and a request the school has not answered within 24 hours expires.
    await endExpiredSupport();
    if ((await hitLimit("job-tick:console-measure", 1, 10 * 60)).ok) await measureStale();
    // The same limit as scripts/worker.ts, so the billing day runs once an hour across every server and worker.
    if ((await hitLimit(BILLING_LIMIT_KEY, 1, 60 * 60)).ok) await runBillingDay();
  } catch (e) {
    console.error(JSON.stringify({ level: "error", event: "console-work", error: e instanceof Error ? e.message : String(e) }));
  }
}
