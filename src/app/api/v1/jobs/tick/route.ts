// Wakes the background work on hosts without a worker (src/lib/job-tick.ts):
// a scheduler calls this every few minutes so reminders and queued messages
// go out even when nobody is using School OS. It takes no input and shows no
// school data, and a burst starts at most once every 15 seconds, so calling
// it more often changes nothing.
import { tickJobs } from "@/lib/job-tick";
import { hitLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function tick() {
  if (!(await hitLimit("job-tick:http", 1, 15)).ok) return Response.json({ ok: true, ran: 0, note: "A burst ran a moment ago." });
  const r = await tickJobs();
  return Response.json({ ok: true, ...r });
}

export const GET = tick;
export const POST = tick;
