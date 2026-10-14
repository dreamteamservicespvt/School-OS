// Every Events & Calendar server action starts here: the role is checked on
// the server (requireAction, then the Events level), the work runs inside the
// school's walls, plain-words problems go back next to their field with what
// was typed (P7), and the success message shows as a toast (P15).
import "server-only";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireAction, type Current } from "../current";
import { withSchool, type SchoolContext, type Tx } from "../db";
import { flash, type Flash } from "../flash";
import { formValues, type FormState } from "../forms";
import { PermissionDeniedError, type Action } from "../permissions";
import { FileProblem } from "../files";
import { MoneyProblem } from "../fees/problem";
import { MessagingProblem } from "../messaging/send";
import { ClosedYearError } from "../academic/years";
import { StudentProblem } from "../students/students";
import { evCan, evViewer, type EvCan, type EvViewer } from "./access";
import { EventsProblem, EventsWarning } from "./problem";

export { EventsProblem, EventsWarning } from "./problem";

export type EvWork = { tx: Tx; ctx: SchoolContext; v: EvViewer; can: EvCan; current: Current; tz: string };

type Known = Error & { field?: string; link?: { href: string; label: string } };

export function problemState(e: unknown, fd?: FormData): NonNullable<FormState<{ link?: { href: string; label: string }; warning?: string }>> {
  const values = fd ? formValues(fd) : undefined;
  if (e instanceof EventsWarning) {
    return { ok: false, message: e.message, values, data: { warning: e.confirmKey } };
  }
  const known = [EventsProblem, PermissionDeniedError, FileProblem, MoneyProblem, MessagingProblem, ClosedYearError, StudentProblem];
  if (known.some((K) => e instanceof K)) {
    const err = e as Known;
    return { ok: false, message: err.message, errors: err.field ? { [err.field]: err.message } : undefined, values, data: err.link ? { link: err.link } : undefined };
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    return { ok: false, message: "Someone else saved the same thing a moment ago. Refresh the page to see it, then try again if still needed.", values };
  }
  console.error(JSON.stringify({ level: "error", event: "events-action-failed", error: e instanceof Error ? e.message : String(e) }));
  return { ok: false, message: "That did not save because of a problem on our side. Nothing was changed. Please try again.", values };
}

/** Runs work for a person allowed this action in Events & Calendar, inside the school's walls. */
export async function inEvents<T>(action: Action, work: (w: EvWork) => Promise<T>) {
  const { current } = await requireAction("events-calendar", action);
  const v = evViewer(current);
  return withSchool(current.ctx, (tx) => work({ tx, ctx: current.ctx, v, can: evCan(v), current, tz: current.school.timeZone }), { timeout: 60_000 });
}

/** A server action: checks, does the work, answers with a FormState. */
export async function evAction<T>(action: Action, fd: FormData | undefined, work: (w: EvWork) => Promise<T>, success: (result: T) => Flash | string): Promise<FormState<T>> {
  try {
    const result = await inEvents(action, work);
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
  if (!allowed) throw new EventsProblem(`Your role cannot ${what}. Ask the School Admin if you need to.`);
}

/* ---------- Reading form fields ---------- */

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function str(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function id(fd: FormData, key: string, what = "record") {
  const v = str(fd, key);
  if (!UUID_RE.test(v)) throw new EventsProblem(`Choose the ${what}.`, key);
  return v;
}

export function ids(fd: FormData, key: string) {
  return [...new Set(fd.getAll(key).map(String).filter((v) => UUID_RE.test(v)))];
}

export function text(fd: FormData, key: string, label: string, { min = 1, max = 200, message }: { min?: number; max?: number; message?: string } = {}) {
  const v = str(fd, key).replace(/\s+/g, " ");
  if (v.length < min) throw new EventsProblem(message ?? (min > 1 ? `${label} needs at least ${min} characters.` : `${label} is needed.`), key);
  if (v.length > max) throw new EventsProblem(`${label} can be at most ${max} characters.`, key);
  return v;
}

export function maybe(fd: FormData, key: string, label: string, max = 500) {
  const v = str(fd, key).replace(/[ \t]+/g, " ");
  if (!v) return null;
  if (v.length > max) throw new EventsProblem(`${label} can be at most ${max} characters.`, key);
  return v;
}

/** A date from a date box (YYYY-MM-DD) or typed DD-MM-YYYY. */
export function dateIso(fd: FormData, key: string, label = "Date", required = true): string | null {
  const raw = str(fd, key);
  if (!raw) {
    if (required) throw new EventsProblem(`Enter the ${label.toLowerCase()}.`, key);
    return null;
  }
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(raw);
  const iso = m ? `${m[3]}-${m[2]}-${m[1]}` : raw;
  const d = new Date(`${iso}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso) {
    throw new EventsProblem(`Enter the ${label.toLowerCase()} as DD-MM-YYYY.`, key);
  }
  return iso;
}

export const checked = (fd: FormData, key: string) => ["on", "true", "1"].includes(str(fd, key));
