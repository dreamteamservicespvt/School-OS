// Delayed background jobs run when they are due, whatever time zone the
// database session is in (TEACHING-06). Times are kept as UTC in "timestamp"
// columns; on a database set to Asia/Kolkata a job due in 15 minutes (an
// absence message waiting for the teacher's correction) was claimed at once.
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { prisma, withSchool } from "@/lib/db";
import { defineJob, enqueue, runDueJobs } from "@/lib/jobs";
import { hitLimit } from "@/lib/rate-limit";
import { nextNumber } from "@/lib/sequences";
import { makeSchool } from "./helpers";

const KIND = "test-job-times";
let ran = 0;
defineJob(KIND, "Test job times", async () => { ran++; });

/** Claims this school's test jobs the way the worker does, with the session in `zone`. */
async function claimIn(zone: string, schoolId: string) {
  const rows = await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE '${zone}'`);
    return tx.$queryRaw<{ job_id: string }[]>`SELECT job_id FROM claim_background_jobs(50, ${schoolId}::uuid, ${[KIND]}::text[])`;
  });
  return rows.map((r) => r.job_id);
}

async function newSchoolJob(name: string, key: string, runAfter: Date) {
  const school = await makeSchool(name);
  const ctx = { schoolId: school.id, userId: null };
  const job = await withSchool(ctx, (tx) => enqueue(tx, ctx, KIND, key, {}, runAfter));
  return { ctx, job };
}

/** Leaves nothing "running" behind for later files. */
const finish = (ctx: { schoolId: string; userId: null }) =>
  withSchool(ctx, (tx) => tx.backgroundJob.updateMany({ where: { kind: KIND }, data: { status: "done", lockedAt: null, finishedAt: new Date() } }));

describe("delayed jobs and the database's time zone", () => {
  it("does not claim a job due in 15 minutes, in Asia/Kolkata or in UTC", async () => {
    const { ctx, job } = await newSchoolJob("Kolkata Job School", "later", new Date(Date.now() + 15 * 60_000));
    expect(await claimIn("Asia/Kolkata", ctx.schoolId)).toEqual([]);
    expect(await claimIn("UTC", ctx.schoolId)).toEqual([]);
    expect(await claimIn("America/New_York", ctx.schoolId)).toEqual([]);
    const still = await withSchool(ctx, (tx) => tx.backgroundJob.findUniqueOrThrow({ where: { id: job.id } }));
    expect(still.status).toBe("queued");
    expect(still.attempts).toBe(0);
  });

  it("claims a job as soon as it is due, also in a time zone behind UTC, and locks it in UTC", async () => {
    const { ctx, job } = await newSchoolJob("New York Job School", "due", new Date(Date.now() - 60_000));
    expect(await claimIn("America/New_York", ctx.schoolId)).toEqual([job.id]);
    const locked = await withSchool(ctx, (tx) => tx.backgroundJob.findUniqueOrThrow({ where: { id: job.id } }));
    expect(locked.status).toBe("running");
    expect(Math.abs(locked.lockedAt!.getTime() - Date.now())).toBeLessThan(60_000);
    await finish(ctx);
  });

  it("takes back a stuck job 15 minutes after it was locked, never one still running", async () => {
    const { ctx, job } = await newSchoolJob("Stuck Job School", "stuck", new Date(Date.now() - 30 * 60_000));
    const lock = (minutesAgo: number) => withSchool(ctx, (tx) => tx.backgroundJob.update({ where: { id: job.id }, data: { status: "running", lockedAt: new Date(Date.now() - minutesAgo * 60_000) } }));
    await lock(5);
    expect(await claimIn("Asia/Kolkata", ctx.schoolId)).toEqual([]);
    await lock(16);
    expect(await claimIn("America/New_York", ctx.schoolId)).toEqual([job.id]);
    await finish(ctx);
  });

  it("runs the job through the worker only once it is due", async () => {
    const { ctx, job } = await newSchoolJob("Worker Job School", "worker", new Date(Date.now() + 15 * 60_000));
    const before = ran;
    expect(await runDueJobs(50, { schoolId: ctx.schoolId, kinds: [KIND] })).toBe(0);
    await withSchool(ctx, (tx) => tx.backgroundJob.update({ where: { id: job.id }, data: { runAfter: new Date(Date.now() - 1000) } }));
    expect(await runDueJobs(50, { schoolId: ctx.schoolId, kinds: [KIND] })).toBe(1);
    expect(ran).toBe(before + 1);
  });

  it("claims only the school and kinds asked for", async () => {
    const a = await newSchoolJob("Own Jobs School A", "mine", new Date(Date.now() - 1000));
    const b = await newSchoolJob("Own Jobs School B", "theirs", new Date(Date.now() - 1000));
    expect(await runDueJobs(50, { schoolId: a.ctx.schoolId, kinds: ["some-other-kind"] })).toBe(0);
    expect(await runDueJobs(50, { schoolId: a.ctx.schoolId, kinds: [KIND] })).toBe(1);
    const theirs = await withSchool(b.ctx, (tx) => tx.backgroundJob.findUniqueOrThrow({ where: { id: b.job.id } }));
    expect(theirs.status).toBe("queued");
    await finish(b.ctx);
  });
});

describe("other times written by SQL", () => {
  it("writes running numbers' times in UTC whatever the session's time zone", async () => {
    const school = await makeSchool("Number Time School");
    const ctx = { schoolId: school.id, userId: null };
    const row = await withSchool(ctx, async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL TIME ZONE 'Asia/Kolkata'`);
      await nextNumber(tx, ctx, "tz-check");
      await nextNumber(tx, ctx, "tz-check");
      return tx.numberSequence.findFirstOrThrow({ where: { key: "tz-check" } });
    });
    expect(Math.abs(row.updatedAt.getTime() - Date.now())).toBeLessThan(60_000);
  });

  it("keeps rate-limit windows in UTC", async () => {
    const now = new Date();
    const key = `tz-check:${now.getTime()}`;
    await hitLimit(key, 5, 60, now);
    const [row] = await prisma.$queryRaw<{ start: string }[]>`SELECT to_char(window_start, 'YYYY-MM-DD"T"HH24:MI:SS') AS start FROM rate_limit_bucket WHERE key = ${key}`;
    const expected = new Date(Math.floor(now.getTime() / 60_000) * 60_000).toISOString().slice(0, 19);
    expect(row.start).toBe(expected);
    // A second hit in the same window counts on.
    await hitLimit(key, 1, 60, now);
    expect((await hitLimit(key, 1, 60, now)).ok).toBe(false);
  });

  it("has no database function that reads the clock in the session's time zone", async () => {
    const fns = await prisma.$queryRaw<{ name: string; body: string }[]>`
      SELECT p.proname AS name, p.prosrc AS body FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace`;
    const bad = fns.filter((f) => /\bnow\(\)(?!\s*AT TIME ZONE 'UTC')|\bcurrent_timestamp\b|\blocaltimestamp\b|\bcurrent_date\b/i.test(f.body)).map((f) => f.name);
    expect(bad).toEqual([]);
    expect(fns.some((f) => f.name === "claim_background_jobs")).toBe(true);
  });

  it("has no raw SQL in the app that reads now() in the session's time zone", () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = path.join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name)) files.push(p);
      }
    };
    walk(path.resolve("src"));
    const bad: string[] = [];
    for (const f of files) {
      const text = readFileSync(f, "utf8");
      if (!/\$(queryRaw|executeRaw)|Prisma\.sql/.test(text)) continue;
      text.split("\n").forEach((line, i) => {
        if (/(^|[^.\w])now\(\)(?!\s*AT TIME ZONE 'UTC')|\bCURRENT_TIMESTAMP\b|\bLOCALTIMESTAMP\b/i.test(line)) bad.push(`${path.relative(process.cwd(), f)}:${i + 1}`);
      });
    }
    expect(bad).toEqual([]);
  });
});
