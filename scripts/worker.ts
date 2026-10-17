// The background worker: runs queued jobs and timed work for every school.
//   npm run worker
// Run one or more of these next to the web server in production.
import "../src/lib/job-registry";
import { queueSchedules, runDueJobs } from "../src/lib/jobs";
import { measureStale } from "../src/lib/console/measure";
import { runBillingDay } from "../src/lib/console/billing";
import { endExpiredSupport } from "../src/lib/console/support-entry";
import { hitLimit } from "../src/lib/rate-limit";
import { BILLING_LIMIT_KEY } from "../src/lib/job-tick";

// The Super Admin console: school cards are measured every 10 minutes (only
// counts), and the billing day (trial ends, renewals, reminders, grace) runs
// once an hour; it is safe to run more than once a day.
const MEASURE_EVERY_MS = 10 * 60_000;
const BILLING_EVERY_MS = 60 * 60_000;
let lastMeasure = 0;
let lastBilling = 0;

async function consoleWork() {
  // Support access ends by itself at the time the school gave (07-super-admin.md §3.4 step 5).
  await endExpiredSupport();
  if (Date.now() - lastMeasure > MEASURE_EVERY_MS) {
    lastMeasure = Date.now();
    await measureStale();
  }
  // Several workers (and the web server's job tick) share one hourly limit, so two billing days never run at once.
  if (Date.now() - lastBilling > BILLING_EVERY_MS && (await hitLimit(BILLING_LIMIT_KEY, 1, BILLING_EVERY_MS / 1000)).ok) {
    lastBilling = Date.now();
    const done = await runBillingDay();
    if (done.length) console.log(JSON.stringify({ level: "info", event: "console-billing-day", done: done.length }));
  }
}

let stopping = false;
process.on("SIGTERM", () => (stopping = true));
process.on("SIGINT", () => (stopping = true));

async function main() {
  let lastSchedule = 0;
  console.log("School OS worker started");
  while (!stopping) {
    try {
      if (Date.now() - lastSchedule > 60_000) {
        await queueSchedules();
        lastSchedule = Date.now();
        await consoleWork().catch((e) => console.error(JSON.stringify({ level: "error", event: "console-work", error: e instanceof Error ? e.message : String(e) })));
      }
      const ran = await runDueJobs(10);
      if (ran === 0) await new Promise((r) => setTimeout(r, 2000));
    } catch (e) {
      console.error(JSON.stringify({ level: "error", event: "worker-loop", error: e instanceof Error ? e.message : String(e) }));
      await new Promise((r) => setTimeout(r, 5000));
    }
  }
  console.log("School OS worker stopped");
  process.exit(0);
}

main();
