// Every Transport server action starts here: the role is checked on the
// server (05-roles.md column 12 and the page rules in access.ts), Transport
// must be switched on for the school, the work runs inside the school's
// walls, plain-words problems go back next to their field with what was typed
// (P7), and the success message shows as a toast (P15).
import "server-only";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { Prisma } from "@prisma/client";
import { requireAction, requirePage, type Current } from "../current";
import { withSchool, type SchoolContext, type Tx } from "../db";
import { flash, type Flash } from "../flash";
import { formValues, type FormState } from "../forms";
import { PermissionDeniedError, type Action } from "../permissions";
import { FileProblem } from "../files";
import { MessagingProblem } from "../messaging/send";
import { MoneyProblem } from "../fees/problem";
import { SettingsProblem } from "../settings/common";
import { StaffProblem } from "../staff/staff";
import { DecisionProblem } from "../approvals";
import { todayDate } from "../front-office/time";
import { trCan, trViewer, type TrCan, type TrViewer } from "./access";
import { TransportProblem } from "./problem";
import { MODULE, type PageKey } from "./words";

export { TransportProblem } from "./problem";

export type TrWork = { tx: Tx; ctx: SchoolContext; v: TrViewer; can: TrCan; current: Current; tz: string; today: Date; now: Date };

type Known = Error & { field?: string; link?: { href: string; label: string } };

export function problemState(e: unknown, fd?: FormData): NonNullable<FormState<{ link?: { href: string; label: string } }>> {
  const known = [TransportProblem, PermissionDeniedError, FileProblem, MessagingProblem, MoneyProblem, SettingsProblem, StaffProblem, DecisionProblem];
  const values = fd ? formValues(fd) : undefined;
  if (known.some((K) => e instanceof K)) {
    const err = e as Known;
    return { ok: false, message: err.message, errors: err.field ? { [err.field]: err.message } : undefined, values, data: err.link ? { link: err.link } : undefined };
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    return { ok: false, message: "Someone else saved the same thing a moment ago. Refresh the page to see it, then try again if still needed.", values };
  }
  console.error(JSON.stringify({ level: "error", event: "transport-action-failed", error: e instanceof Error ? e.message : String(e) }));
  return { ok: false, message: "That did not save because of a problem on our side. Nothing was changed. Please try again.", values };
}

/** The Transport viewer of the signed-in person, refused when Transport is off or their role has no reach. */
export async function trPerson(action: Action) {
  const { current } = await requireAction(MODULE, action);
  if (!current.modulesOn.has(MODULE)) throw new TransportProblem("Transport is switched off for this school. Switch it on in Settings, Modules On/Off.");
  const v = trViewer(current);
  return { current, v, can: trCan(v, current) };
}

/** Runs work for a person allowed this action in Transport, inside the school's walls. */
export async function inTransport<T>(action: Action, work: (w: TrWork) => Promise<T>) {
  const { current, v, can } = await trPerson(action);
  const tz = current.school.timeZone;
  const now = new Date();
  return withSchool(current.ctx, (tx) => work({ tx, ctx: current.ctx, v, can, current, tz, today: todayDate(tz, now), now }));
}

/** A server action: checks, does the work, answers with a FormState. */
export async function trAction<T>(action: Action, fd: FormData | undefined, work: (w: TrWork) => Promise<T>, success: (result: T) => Flash | string): Promise<FormState<T>> {
  try {
    const result = await inTransport(action, work);
    const f = success(result);
    const message = typeof f === "string" ? f : f.message;
    await flash(typeof f === "string" ? { message } : f);
    revalidatePath("/transport-management", "layout");
    return { ok: true, message, data: result };
  } catch (e) {
    return problemState(e, fd) as FormState<T>;
  }
}

/** Refuses work a role may not do here, in plain words. */
export function need(allowed: boolean, what: string) {
  if (!allowed) throw new TransportProblem(`Your role cannot ${what}. Ask the Transport In-charge.`);
}

/** For pages: the person, refused to /no-access when this page is hidden for their role. */
export async function trPage(page: PageKey) {
  const current = await requirePage(MODULE);
  const v = trViewer(current);
  if (v.pages[page] === "hidden") {
    if (page === "live" && v.level !== "none" && !v.live) redirect("/transport-management/trips");
    redirect(`/no-access?m=${MODULE}`);
  }
  const tz = current.school.timeZone;
  const now = new Date();
  return { current, v, can: trCan(v, current), tz, now, today: todayDate(tz, now) };
}

/* ---------- Reading form fields ---------- */

export function str(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function id(fd: FormData, key: string, what = "record") {
  const v = str(fd, key);
  if (!UUID_RE.test(v)) throw new TransportProblem(`Choose the ${what}.`, key);
  return v;
}

export function optionalId(fd: FormData, key: string) {
  const v = str(fd, key);
  return UUID_RE.test(v) ? v : null;
}

export function ids(fd: FormData, key: string) {
  return fd.getAll(key).filter((x): x is string => typeof x === "string").flatMap((x) => x.split(",")).map((x) => x.trim()).filter((x) => UUID_RE.test(x));
}

export function text(fd: FormData, key: string, label: string, { min = 1, max = 200 }: { min?: number; max?: number } = {}) {
  const v = str(fd, key).replace(/\s+/g, " ");
  if (v.length < min) throw new TransportProblem(min > 1 ? `${label} needs at least ${min} characters.` : `${label} is needed.`, key);
  if (v.length > max) throw new TransportProblem(`${label} can be at most ${max} characters.`, key);
  return v;
}

export function maybe(fd: FormData, key: string, label: string, max = 500) {
  const v = str(fd, key).replace(/[ \t]+/g, " ");
  if (!v) return null;
  if (v.length > max) throw new TransportProblem(`${label} can be at most ${max} characters.`, key);
  return v;
}

export function int(fd: FormData, key: string, label: string, { min = 0, max = 1_000_000, required = true }: { min?: number; max?: number; required?: boolean } = {}): number | null {
  const raw = str(fd, key).replace(/,/g, "");
  if (!raw) {
    if (required) throw new TransportProblem(`${label} is needed.`, key);
    return null;
  }
  const n = Number(raw);
  if (!Number.isInteger(n)) throw new TransportProblem(`${label} must be a whole number.`, key);
  if (n < min || n > max) throw new TransportProblem(`${label} must be between ${min} and ${max}.`, key);
  return n;
}

export function num(fd: FormData, key: string, label: string, min: number, max: number): number | null {
  const raw = str(fd, key);
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) throw new TransportProblem(`${label} must be between ${min} and ${max}.`, key);
  return n;
}

/** A date field (YYYY-MM-DD) as a @db.Date value. */
export function date(fd: FormData, key: string, label: string, required = true): Date | null {
  const v = str(fd, key);
  if (!v) {
    if (required) throw new TransportProblem(`${label} is needed.`, key);
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(Date.parse(`${v}T00:00:00Z`))) throw new TransportProblem(`Pick a real date for ${label.toLowerCase()}.`, key);
  return new Date(`${v}T00:00:00Z`);
}

/** Rupees typed by a person ("1,250" or "1250.50") as whole paise. */
export function money(fd: FormData, key: string, label: string, required = true): bigint | null {
  const raw = str(fd, key).replace(/[₹,\s]/g, "");
  if (!raw) {
    if (required) throw new TransportProblem(`${label} is needed.`, key);
    return null;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw new TransportProblem(`${label} must be an amount in rupees, like 1,250.`, key);
  const [r, p = ""] = raw.split(".");
  const paise = BigInt(r) * BigInt(100) + BigInt((p + "00").slice(0, 2));
  if (paise > BigInt(10_000_000_00)) throw new TransportProblem(`${label} looks too large.`, key);
  return paise;
}

/** A clock time field ("07:35") as minutes after midnight. */
export function clock(fd: FormData, key: string, label: string, required = true): number | null {
  const v = str(fd, key);
  if (!v) {
    if (required) throw new TransportProblem(`${label} is needed.`, key);
    return null;
  }
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) throw new TransportProblem(`Pick a time for ${label.toLowerCase()}.`, key);
  return Number(m[1]) * 60 + Number(m[2]);
}

export function file(fd: FormData, key: string): File | null {
  for (const v of fd.getAll(key)) if (v instanceof File && v.size > 0) return v;
  return null;
}

export const bool = (fd: FormData, key: string) => ["on", "true", "1", "yes"].includes(str(fd, key));
