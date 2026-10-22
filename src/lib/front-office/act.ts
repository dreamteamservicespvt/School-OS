// Every Front Office server action starts here: the role is checked on the
// server, the work runs inside the school's walls, plain-words problems go
// back next to their field with what was typed (P7), and the success message
// shows as a toast (P15).
import "server-only";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireAction, type Current } from "../current";
import { withSchool, type SchoolContext, type Tx } from "../db";
import { flash, type Flash } from "../flash";
import { formValues, type FormState } from "../forms";
import { PermissionDeniedError, type Action } from "../permissions";
import { FileProblem } from "../files";
import { AdmissionProblem } from "../admission/act";
import { MessagingProblem } from "../messaging/send";
import { QueryProblem } from "../communication/queries";
import { TaskProblem } from "../dashboard/tasks";
import { foCan, foViewer, type FoCan, type FoViewer } from "./access";
import { FrontOfficeProblem, KeptRefusal } from "./problem";

export { FrontOfficeProblem, KeptRefusal } from "./problem";

export type FoWork = { tx: Tx; ctx: SchoolContext; v: FoViewer; can: FoCan; current: Current; tz: string };

type Known = Error & { field?: string; link?: { href: string; label: string } };

export function problemState(e: unknown, fd?: FormData): NonNullable<FormState<{ link?: { href: string; label: string } }>> {
  const known = [FrontOfficeProblem, PermissionDeniedError, FileProblem, AdmissionProblem, MessagingProblem, QueryProblem, TaskProblem];
  const values = fd ? formValues(fd) : undefined;
  if (known.some((K) => e instanceof K)) {
    const err = e as Known;
    const matches = (err as { matches?: unknown }).matches;
    return { ok: false, message: err.message, errors: err.field ? { [err.field]: err.message } : undefined, values, data: err.link ? { link: err.link } : matches ? ({ matches } as never) : undefined };
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    return { ok: false, message: "Someone else saved the same thing a moment ago. Refresh the page to see it, then try again if still needed.", values };
  }
  console.error(JSON.stringify({ level: "error", event: "front-office-action-failed", error: e instanceof Error ? e.message : String(e) }));
  return { ok: false, message: "That did not save because of a problem on our side. Nothing was changed. Please try again.", values };
}

/** Runs work for a person allowed this action in Front Office, inside the school's walls. */
export async function inFrontOffice<T>(action: Action, work: (w: FoWork) => Promise<T>) {
  const { current } = await requireAction("front-office", action);
  const v = foViewer(current);
  return withSchool(current.ctx, (tx) => work({ tx, ctx: current.ctx, v, can: foCan(v), current, tz: current.school.timeZone }));
}

/**
 * A server action: checks, does the work, answers with a FormState. Work that
 * returns a KeptRefusal is saved (what it wrote stays) and answered as a refusal.
 */
export async function foAction<T>(action: Action, fd: FormData | undefined, work: (w: FoWork) => Promise<T | KeptRefusal>, success: (result: T) => Flash | string): Promise<FormState<T>> {
  try {
    const result = await inFrontOffice(action, work);
    if (result instanceof KeptRefusal) {
      revalidatePath("/", "layout");
      return { ok: false, message: result.message, errors: result.field ? { [result.field]: result.message } : undefined, values: fd ? formValues(fd) : undefined };
    }
    const f = success(result);
    const message = typeof f === "string" ? f : f.message;
    await flash(typeof f === "string" ? { message } : f);
    revalidatePath("/", "layout");
    return { ok: true, message, data: result };
  } catch (e) {
    return problemState(e, fd) as FormState<T>;
  }
}

/** Refuses work a role may not do here, in plain words. */
export function need(allowed: boolean, what: string) {
  if (!allowed) throw new FrontOfficeProblem(`Your role cannot ${what}. Ask the front desk or your School Admin.`);
}

/* ---------- Reading form fields ---------- */

export function str(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function id(fd: FormData, key: string, what = "record") {
  const v = str(fd, key);
  if (!UUID_RE.test(v)) throw new FrontOfficeProblem(`Choose the ${what}.`, key);
  return v;
}

export function optionalId(fd: FormData, key: string) {
  const v = str(fd, key);
  return UUID_RE.test(v) ? v : null;
}

export function text(fd: FormData, key: string, label: string, { min = 1, max = 200, message }: { min?: number; max?: number; message?: string } = {}) {
  const v = str(fd, key).replace(/\s+/g, " ");
  if (v.length < min) throw new FrontOfficeProblem(message ?? (min > 1 ? `${label} needs at least ${min} characters.` : `${label} is needed.`), key);
  if (v.length > max) throw new FrontOfficeProblem(`${label} can be at most ${max} characters.`, key);
  return v;
}

export function maybe(fd: FormData, key: string, label: string, max = 500) {
  const v = str(fd, key).replace(/[ \t]+/g, " ");
  if (!v) return null;
  if (v.length > max) throw new FrontOfficeProblem(`${label} can be at most ${max} characters.`, key);
  return v;
}

export function file(fd: FormData, key: string): File | null {
  for (const v of fd.getAll(key)) if (v instanceof File && v.size > 0) return v;
  return null;
}
