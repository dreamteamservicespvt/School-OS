// Background work without a worker (src/lib/job-tick.ts): one burst runs the
// jobs that are due, and a second burst at once never runs a job twice.
import { describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { defineJob, enqueue } from "@/lib/jobs";
import { tickJobs } from "@/lib/job-tick";
import { makeSchool } from "./helpers";

let runs = 0;
defineJob("test-tick", "Test tick", async () => { runs++; });

describe("job bursts", () => {
  it("run due jobs once, even when two bursts start together", async () => {
    const school = await makeSchool("Tick School");
    const ctx = { schoolId: school.id, userId: null };
    await withSchool(ctx, async (tx) => {
      for (let i = 0; i < 3; i++) await enqueue(tx, ctx, "test-tick", `tick-${i}`, {});
    });
    // Only this file's jobs: other test files' jobs share the queue.
    const only = { schoolId: school.id, kinds: ["test-tick"] };
    await Promise.all([tickJobs(10_000, only), tickJobs(10_000, only)]);
    expect(runs).toBe(3);
    const jobs = await withSchool(ctx, (tx) => tx.backgroundJob.findMany({ where: { kind: "test-tick" } }));
    expect(jobs.every((j) => j.status === "done")).toBe(true);
  });
});
