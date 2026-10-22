// Background work (08-platform-security.md §6 and §9): exports, imports,
// bulk messages and reminders. Every job is safe to run twice, is retried
// 3 times, and nothing fails silently.
import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma, withSchool, type SchoolContext, type Tx } from "./db";
import { notify } from "./notifications";
import { isTestCopy } from "./test-copy-env";
import { HELD_UNTIL_LIVE, movingIn } from "./move-in/live";

export const MAX_ATTEMPTS = 3;

type JobHandler = (tx: Tx, ctx: SchoolContext, payload: Record<string, unknown>, job: { id: string; requestedById: string | null }) => Promise<Prisma.InputJsonValue | void>;
type JobDef = { handler: JobHandler; label: string; /** Long work runs outside one transaction. */ ownTransaction?: boolean };
const jobs = new Map<string, JobDef>();

export function defineJob(kind: string, label: string, handler: JobHandler, opts: { ownTransaction?: boolean } = {}) {
  jobs.set(kind, { handler, label, ownTransaction: opts.ownTransaction });
}

/** Queues a job. The same key queues it only once. */
export async function enqueue(tx: Tx, ctx: SchoolContext, kind: string, idempotencyKey: string, payload: Prisma.InputJsonValue, runAfter = new Date()) {
  const existing = await tx.backgroundJob.findUnique({ where: { schoolId_idempotencyKey: { schoolId: ctx.schoolId, idempotencyKey } } });
  if (existing) return existing;
  const job = await tx.backgroundJob.create({
    data: { schoolId: ctx.schoolId, kind, idempotencyKey, payload, runAfter, requestedById: ctx.userId },
  });
  if (runAfter.getTime() <= Date.now() + 1000) kickJobs();
  return job;
}

/**
 * Hosts without a worker (the Vercel test copy): run due jobs right after the
 * response that queued them, once the change is saved (job-tick.ts). Elsewhere
 * `npm run worker` does it, and outside a request this does nothing.
 */
let kickPending = false;
function kickJobs() {
  if (kickPending || (!isTestCopy() && process.env.RUN_JOBS_AFTER_REQUESTS !== "on")) return;
  // One burst at a time per server: a bulk send queues hundreds of jobs in one request.
  kickPending = true;
  void import("next/server")
    .then(({ after }) => after(async () => {
      try {
        const { tickJobs } = await import("./job-tick");
        await tickJobs();
      } finally {
        kickPending = false;
      }
    }))
    .catch(() => { kickPending = false; });
}

/**
 * Claims and runs jobs that are due. Returns how many ran. `only` keeps it to
 * one school's jobs and/or some kinds (tests run their own jobs this way).
 */
export async function runDueJobs(limit = 10, only: { schoolId?: string; kinds?: string[] } = {}): Promise<number> {
  const claimed = await prisma.$queryRaw<{ job_id: string; job_school_id: string }[]>`
    SELECT * FROM claim_background_jobs(${limit}::int, ${only.schoolId ?? null}::uuid, ${only.kinds?.length ? only.kinds : null}::text[])`;
  for (const { job_id, job_school_id } of claimed) {
    await runOne(job_id, job_school_id);
  }
  return claimed.length;
}

async function runOne(jobId: string, schoolId: string) {
  const ctx: SchoolContext = { schoolId, userId: null };
  const job = await withSchool(ctx, (tx) => tx.backgroundJob.findUnique({ where: { id: jobId } }));
  if (!job) return;
  const def = jobs.get(job.kind);
  try {
    if (!def) throw new Error(`No handler for job kind ${job.kind}`);
    const jobCtx: SchoolContext = { schoolId, userId: job.requestedById };
    // Long work (full exports, imports) gets up to 10 minutes in its transaction.
    const result = await withSchool(jobCtx, (tx) => def.handler(tx, jobCtx, job.payload as Record<string, unknown>, job), { timeout: def.ownTransaction ? 600_000 : undefined });
    await withSchool(ctx, (tx) =>
      tx.backgroundJob.update({ where: { id: jobId }, data: { status: "done", finishedAt: new Date(), lockedAt: null, lastError: null, result: result ?? undefined } }),
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const final = job.attempts >= MAX_ATTEMPTS;
    await withSchool(ctx, async (tx) => {
      await tx.backgroundJob.update({
        where: { id: jobId },
        data: {
          status: final ? "failed" : "queued",
          lockedAt: null,
          lastError: message.slice(0, 2000),
          // Try again after 1, then 5 minutes.
          runAfter: new Date(Date.now() + (job.attempts === 1 ? 60_000 : 300_000)),
          finishedAt: final ? new Date() : null,
        },
      });
      if (final && job.requestedById) {
        await notify(tx, ctx, {
          to: job.requestedById,
          type: "job-failed",
          text: `${def?.label ?? "A background task"} did not finish after 3 tries. Nothing was half-done. Please try again, or ask DREAM TEAM support if it keeps failing.`,
          link: "/notifications",
        });
      }
    });
    if (final) console.error(JSON.stringify({ level: "error", event: "job-failed", jobId, kind: job.kind, error: message }));
  }
}

type Schedule = { name: string; everyMinutes: number; run: (tx: Tx, ctx: SchoolContext, now: Date) => Promise<unknown> };
const schedules: Schedule[] = [];

/**
 * Work that runs on a timer for every school, such as escalations and reminders. Work that waits on another service gets the long transaction.
 * heldWhileMovingIn: work that exists to message parents or add charges does not run for a school still moving in
 * (workflow 15, step 10: automations start on go-live; move-in/live.ts).
 */
export function defineSchedule(name: string, everyMinutes: number, run: Schedule["run"], opts: { ownTransaction?: boolean; heldWhileMovingIn?: boolean } = {}) {
  schedules.push({ name, everyMinutes, run });
  defineJob(`schedule:${name}`, name, async (tx, ctx) => {
    if (opts.heldWhileMovingIn && (await movingIn(tx, ctx))) return { held: HELD_UNTIL_LIVE };
    await run(tx, ctx, new Date());
  }, { ownTransaction: opts.ownTransaction });
}

/** Queues each schedule once per time slot per school; the key makes repeats harmless. */
export async function queueSchedules(now = new Date()) {
  const schools = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM active_school_ids()`;
  for (const s of schools) {
    const ctx: SchoolContext = { schoolId: s.id, userId: null };
    await withSchool(ctx, async (tx) => {
      for (const sch of schedules) {
        const slot = Math.floor(now.getTime() / (sch.everyMinutes * 60_000));
        await enqueue(tx, ctx, `schedule:${sch.name}`, `schedule:${sch.name}:${slot}`, {});
      }
    });
  }
  return schools.length;
}
