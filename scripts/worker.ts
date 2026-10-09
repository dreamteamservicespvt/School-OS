// The background worker: runs queued jobs and timed work for every school.
//   npm run worker
// Run one or more of these next to the web server in production.
import "../src/lib/job-registry";
import { queueSchedules, runDueJobs } from "../src/lib/jobs";

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
