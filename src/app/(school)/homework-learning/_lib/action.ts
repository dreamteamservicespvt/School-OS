// Every Homework & Learning action: the role is checked on the server, the
// person's reach (their own classes and subjects, or a student's own work) is
// read again inside the school's own transaction, and plain-words problems go
// back to the form or the button.
import "server-only";

import { revalidatePath } from "next/cache";
import { requireAction, type Current } from "@/lib/current";
import { withSchool, type Tx } from "@/lib/db";
import { PermissionDeniedError, type Action } from "@/lib/permissions";
import { flash, type Flash } from "@/lib/flash";
import type { FormState } from "@/lib/forms";
import { act, MoneyProblem, problemState } from "@/lib/fees/act";
import { FileProblem } from "@/lib/files";
import { todayIn } from "@/lib/academic/common";
import { dayStartUtc } from "@/lib/periods";
import { HomeworkProblem } from "@/lib/homework/access";
import { homeworkScope, type HomeworkScope } from "@/lib/homework/scope";

export type Ctx = { tx: Tx; s: HomeworkScope; current: Current; now: Date; today: Date; tz: string };
type Work<T> = (c: Ctx) => Promise<T>;

/** A Homework Problem in the shape the shared form handling knows. */
function known(e: unknown): unknown {
  if (e instanceof HomeworkProblem) return new MoneyProblem(e.message, e.field, e.link);
  return e;
}

async function run<T>(current: Current, work: Work<T>) {
  const now = new Date();
  const tz = current.school.timeZone;
  const today = todayIn(tz, now);
  try {
    return await withSchool(current.ctx, async (tx) => {
      const s = await homeworkScope(tx, current, today);
      return work({ tx, s, current, now, today, tz });
    });
  } catch (e) {
    throw known(e);
  }
}

/** For a form in a sheet: the FormState the sheet shows (problems next to their fields, typed values kept). */
export async function hwForm<T>(action: Action, fd: FormData | undefined, work: Work<T>, success: (result: T) => Flash | string): Promise<FormState<T>> {
  let current: Current;
  try {
    ({ current } = await requireAction("homework-learning", action));
  } catch (e) {
    if (e instanceof PermissionDeniedError) return problemState(e, fd) as FormState<T>;
    throw e;
  }
  return act(fd, () => run(current, work), success);
}

/** For a question from the screen that changes nothing (a draft, a preview): the answer, or a problem in plain words. */
export async function hwAsk<T>(action: Action, work: Work<T>): Promise<{ ok: true; data: T } | { ok: false; problem: string }> {
  try {
    const { current } = await requireAction("homework-learning", action);
    return { ok: true, data: await run(current, work) };
  } catch (e) {
    if (e instanceof PermissionDeniedError || e instanceof MoneyProblem || e instanceof HomeworkProblem) return { ok: false, problem: (e as Error).message };
    console.error(JSON.stringify({ level: "error", event: "homework-ask-failed", error: e instanceof Error ? e.message : String(e) }));
    return { ok: false, problem: "That did not work because of a problem on our side. Please try again." };
  }
}

/** For a button: returns a problem in plain words, or nothing when it worked (the toast says what happened). */
export async function hwQuick<T>(action: Action, work: Work<T>, success: (result: T) => Flash | string): Promise<string | void> {
  try {
    const { current } = await requireAction("homework-learning", action);
    const result = await run(current, work);
    const f = success(result);
    await flash(typeof f === "string" ? { message: f } : f);
  } catch (e) {
    if (e instanceof PermissionDeniedError || e instanceof MoneyProblem || e instanceof HomeworkProblem || e instanceof FileProblem) return (e as Error).message;
    console.error(JSON.stringify({ level: "error", event: "homework-action-failed", error: e instanceof Error ? e.message : String(e) }));
    return "That did not work because of a problem on our side. Nothing was changed. Please try again.";
  }
  revalidatePath("/", "layout");
}

/** "2026-10-16T20:00" typed in a date-and-time box, read in the school's time zone. */
export function localMoment(value: string, timeZone: string): Date | null {
  const m = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!m) return null;
  return new Date(dayStartUtc(m[1], timeZone).getTime() + (Number(m[2]) * 60 + Number(m[3])) * 60_000);
}
