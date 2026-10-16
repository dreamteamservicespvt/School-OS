// Every Library server action starts here: the role is checked on the
// server, the module must be switched on, the work runs inside the school's
// walls, plain-words problems go back next to their field with what was
// typed (P7), and the success message shows as a toast (P15).
import "server-only";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireAction, type Current } from "../current";
import { withSchool, type SchoolContext, type Tx } from "../db";
import { flash, type Flash } from "../flash";
import { formValues, type FormState } from "../forms";
import { PermissionDeniedError, type Action } from "../permissions";
import { MoneyProblem } from "../fees/problem";
import { MessagingProblem } from "../messaging/send";
import { DecisionProblem } from "../approvals";
import { ClosedYearError } from "../academic/years";
import { FileProblem } from "../files";
import { todayDate } from "../front-office/time";
import { libCan, libViewer, type LibCan, type LibViewer } from "./access";
import { LibraryProblem } from "./problem";
import { MODULE } from "./words";

export { LibraryProblem } from "./problem";

export type LibWork = { tx: Tx; ctx: SchoolContext; v: LibViewer; can: LibCan; current: Current; tz: string; today: Date };

type Known = Error & { field?: string; link?: { href: string; label: string } };

export function problemState(e: unknown, fd?: FormData): NonNullable<FormState<{ link?: { href: string; label: string } }>> {
  const known = [LibraryProblem, PermissionDeniedError, MoneyProblem, MessagingProblem, DecisionProblem, ClosedYearError, FileProblem];
  const values = fd ? formValues(fd) : undefined;
  if (known.some((K) => e instanceof K)) {
    const err = e as Known;
    return { ok: false, message: err.message, errors: err.field ? { [err.field]: err.message } : undefined, values, data: err.link ? { link: err.link } : undefined };
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    return { ok: false, message: "Someone else saved the same thing a moment ago. Refresh the page to see it, then try again if still needed.", values };
  }
  if (e instanceof Error && e.message.startsWith("Nobody else can approve")) return { ok: false, message: e.message, values };
  console.error(JSON.stringify({ level: "error", event: "library-action-failed", error: e instanceof Error ? e.message : String(e) }));
  return { ok: false, message: "That did not save because of a problem on our side. Nothing was changed. Please try again.", values };
}

/** Runs work for a person allowed this action in Library Management, inside the school's walls. */
export async function inLibrary<T>(action: Action, work: (w: LibWork) => Promise<T>, timeout = 60_000) {
  const { current } = await requireAction(MODULE, action);
  if (!current.modulesOn.has(MODULE)) throw new LibraryProblem("Library Management is switched off for this school. A School Admin can switch it on in Settings, Modules On/Off.");
  const v = libViewer(current);
  const tz = current.school.timeZone;
  return withSchool(current.ctx, (tx) => work({ tx, ctx: current.ctx, v, can: libCan(v), current, tz, today: todayDate(tz) }), { timeout });
}

/** A server action: checks, does the work, answers with a FormState. */
export async function libAction<T>(action: Action, fd: FormData | undefined, work: (w: LibWork) => Promise<T>, success: (result: T) => Flash | string): Promise<FormState<T>> {
  try {
    const result = await inLibrary(action, work);
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
  if (!allowed) throw new LibraryProblem(`Your role cannot ${what}. Ask the librarian.`);
}

/* ---------- Reading form fields ---------- */

export function str(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function id(fd: FormData, key: string, what = "record") {
  const v = str(fd, key);
  if (!UUID_RE.test(v)) throw new LibraryProblem(`Choose the ${what}.`, key);
  return v;
}

export function optionalId(fd: FormData, key: string) {
  const v = str(fd, key);
  return UUID_RE.test(v) ? v : null;
}

export function text(fd: FormData, key: string, label: string, { min = 1, max = 200 }: { min?: number; max?: number } = {}) {
  const v = str(fd, key).replace(/\s+/g, " ");
  if (v.length < min) throw new LibraryProblem(min > 1 ? `${label} needs at least ${min} characters.` : `${label} is needed.`, key);
  if (v.length > max) throw new LibraryProblem(`${label} can be at most ${max} characters.`, key);
  return v;
}

export function maybe(fd: FormData, key: string, label: string, max = 500) {
  const v = str(fd, key).replace(/[ \t]+/g, " ");
  if (!v) return null;
  if (v.length > max) throw new LibraryProblem(`${label} can be at most ${max} characters.`, key);
  return v;
}

export function int(fd: FormData, key: string, label: string, fallback?: number) {
  const raw = str(fd, key);
  if (!raw && fallback !== undefined) return fallback;
  const n = Number(raw);
  if (!raw || !Number.isInteger(n)) throw new LibraryProblem(`${label} must be a whole number.`, key);
  return n;
}

/** A rupee amount typed in a form, as paise. */
export function money(fd: FormData, key: string, label: string, { required = true }: { required?: boolean } = {}): bigint | null {
  const raw = str(fd, key).replace(/[₹,\s]/g, "");
  if (!raw) {
    if (required) throw new LibraryProblem(`${label} is needed.`, key);
    return null;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new LibraryProblem(`${label} must be an amount in rupees, like 120.`, key);
  const [r, p = ""] = raw.split(".");
  const paise = BigInt(r) * BigInt(100) + BigInt((p + "00").slice(0, 2));
  // Nothing in a library costs a crore; a slip of the keyboard is caught before it becomes a fine or a charge.
  if (paise > BigInt(10_000_000_00)) throw new LibraryProblem(`${label} looks too large. Check the amount.`, key);
  return paise;
}

export function isoDate(fd: FormData, key: string, label: string, { required = true }: { required?: boolean } = {}): Date | null {
  const raw = str(fd, key);
  if (!raw) {
    if (required) throw new LibraryProblem(`${label} is needed.`, key);
    return null;
  }
  const d = new Date(`${raw}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== raw) throw new LibraryProblem(`${label} is not a real date.`, key);
  return d;
}

export const on = (fd: FormData, key: string) => ["on", "true", "1", "yes"].includes(str(fd, key).toLowerCase());
