// Every Reports & Analytics server action starts here: the role is checked on
// the server (requireAction, then what Reports & Analytics allows this person),
// the work runs inside the school's walls, plain-words problems go back next
// to their field with what was typed (P7), and success shows as a toast (P15).
import "server-only";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireAction, type Current } from "../current";
import { withSchool, type SchoolContext, type Tx } from "../db";
import { flash, type Flash } from "../flash";
import { formValues, type FormState } from "../forms";
import { PermissionDeniedError, type Action } from "../permissions";
import { MessagingProblem } from "../messaging/send";
import { StudentProblem } from "../students/students";
import { TaskProblem } from "../dashboard/tasks";
import { reportAccess, type ReportAccess } from "./access";
import { ReportProblem } from "./run";
import { WarningProblem } from "./warnings";
import { CustomProblem } from "./custom";
import { GovProblem } from "./government";

export type RepWork = { tx: Tx; ctx: SchoolContext; current: Current; a: ReportAccess; tz: string };

type Known = Error & { field?: string };
const KNOWN = [ReportProblem, WarningProblem, CustomProblem, GovProblem, PermissionDeniedError, MessagingProblem, StudentProblem, TaskProblem];

export function problemState(e: unknown, fd?: FormData): NonNullable<FormState<unknown>> {
  const values = fd ? formValues(fd) : undefined;
  if (KNOWN.some((K) => e instanceof K)) {
    const err = e as Known;
    return { ok: false, message: err.message, errors: err.field ? { [err.field]: err.message } : undefined, values };
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    return { ok: false, message: "Someone else saved the same thing a moment ago. Refresh the page to see it.", values };
  }
  console.error(JSON.stringify({ level: "error", event: "reports-action-failed", error: e instanceof Error ? e.message : String(e) }));
  return { ok: false, message: "That did not save because of a problem on our side. Nothing was changed. Please try again.", values };
}

/** Runs work for a person allowed this action in Reports & Analytics, inside the school's walls. */
export async function inReports<T>(action: Action, work: (w: RepWork) => Promise<T>) {
  const { current } = await requireAction("reports-analytics", action);
  const a = reportAccess(current);
  return withSchool(current.ctx, (tx) => work({ tx, ctx: current.ctx, current, a, tz: current.school.timeZone }), { timeout: 120_000 });
}

/** A server action: checks, does the work, answers with a FormState. */
export async function repAction<T>(action: Action, fd: FormData | undefined, work: (w: RepWork) => Promise<T>, success: (result: T) => Flash | string): Promise<FormState<T>> {
  try {
    const result = await inReports(action, work);
    const f = success(result);
    const message = typeof f === "string" ? f : f.message;
    await flash(typeof f === "string" ? { message } : f);
    revalidatePath("/", "layout");
    return { ok: true, message, data: result };
  } catch (e) {
    return problemState(e, fd) as FormState<T>;
  }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function str(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}
export function id(fd: FormData, key: string, what = "record") {
  const v = str(fd, key);
  if (!UUID_RE.test(v)) throw new ReportProblem(`That ${what} was not found.`);
  return v;
}
export const all = (fd: FormData, key: string) => fd.getAll(key).filter((x): x is string => typeof x === "string").map((x) => x.trim()).filter(Boolean);
