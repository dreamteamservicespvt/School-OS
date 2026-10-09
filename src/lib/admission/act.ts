// Turns an Admission server action's work into a FormState: plain-words
// problems go next to their field, typed values are kept (P7), and the
// success message shows as a toast with a link (P15).
import "server-only";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import type { FormState } from "../forms";
import { formValues } from "../forms";
import { flash, type Flash } from "../flash";
import { PermissionDeniedError } from "../permissions";
import { ClosedYearError } from "../academic/years";
import { FileProblem } from "../files";
import { DecisionProblem } from "../approvals";
import { RazorpayProblem } from "../payments/razorpay";

/** A rule of Admission Management said no. The message is for the person, in plain words. */
export class AdmissionProblem extends Error {
  constructor(message: string, public field?: string, public link?: { href: string; label: string }) {
    super(message);
    this.name = "AdmissionProblem";
  }
}

type Known = Error & { field?: string; link?: { href: string; label: string } };

export function problemState(e: unknown, fd?: FormData): NonNullable<FormState<{ link?: { href: string; label: string } }>> {
  const known = [AdmissionProblem, PermissionDeniedError, ClosedYearError, FileProblem, DecisionProblem, RazorpayProblem];
  if (known.some((K) => e instanceof K)) {
    const err = e as Known;
    return { ok: false, message: err.message, errors: err.field ? { [err.field]: err.message } : undefined, values: fd ? formValues(fd) : undefined, data: err.link ? { link: err.link } : undefined };
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    return { ok: false, message: "Someone else saved the same thing a moment ago. Refresh the page to see it, then try again if still needed.", values: fd ? formValues(fd) : undefined };
  }
  console.error(JSON.stringify({ level: "error", event: "admission-action-failed", error: e instanceof Error ? e.message : String(e) }));
  return { ok: false, message: "That did not save because of a problem on our side. Nothing was changed. Please try again.", values: fd ? formValues(fd) : undefined };
}

/** Runs the work; on success shows the message as a toast and refreshes the page. */
export async function act<T>(fd: FormData | undefined, work: () => Promise<T>, success: (result: T) => Flash | string): Promise<FormState<T>> {
  try {
    const result = await work();
    const f = success(result);
    const message = typeof f === "string" ? f : f.message;
    await flash(typeof f === "string" ? { message } : f);
    revalidatePath("/", "layout");
    return { ok: true, message, data: result };
  } catch (e) {
    return problemState(e, fd) as FormState<T>;
  }
}

export function str(fd: FormData, key: string) {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function file(fd: FormData, key: string): File | null {
  const v = fd.get(key);
  return v instanceof File && v.size > 0 ? v : null;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function id(fd: FormData, key: string, what = "record"): string {
  const v = str(fd, key);
  if (!UUID_RE.test(v)) throw new AdmissionProblem(`Choose the ${what}.`, key);
  return v;
}

export function optionalId(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return UUID_RE.test(v) ? v : null;
}

export function need(fd: FormData, key: string, label: string, max = 200): string {
  const v = str(fd, key);
  if (!v) throw new AdmissionProblem(`${label} is needed.`, key);
  if (v.length > max) throw new AdmissionProblem(`${label} can be at most ${max} characters.`, key);
  return v;
}

export function maybe(fd: FormData, key: string, label: string, max = 500): string | null {
  const v = str(fd, key);
  if (v.length > max) throw new AdmissionProblem(`${label} can be at most ${max} characters.`, key);
  return v || null;
}

export function dateOf(fd: FormData, key: string, label: string): Date {
  const v = str(fd, key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new AdmissionProblem(`Choose the ${label.toLowerCase()}.`, key);
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new AdmissionProblem(`${label} is not a real date.`, key);
  return d;
}

export function optionalDateOf(fd: FormData, key: string, label: string): Date | null {
  return str(fd, key) ? dateOf(fd, key, label) : null;
}

/** Rupees typed by a person (like 500 or 1,500.50) as whole paise. */
export function rupeesOf(fd: FormData, key: string, label: string): bigint | null {
  const v = str(fd, key).replace(/[,₹\s]/g, "");
  if (!v) return null;
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(v)) throw new AdmissionProblem(`${label} must be an amount in rupees, like 500.`, key);
  const [r, p = ""] = v.split(".");
  return BigInt(r) * BigInt(100) + BigInt((p + "00").slice(0, 2));
}

/** Indian mobile: +91 and 10 digits starting 6 to 9. Returns the 10 digits. */
export function mobileOf(fd: FormData, key: string, label = "Phone"): string {
  return checkMobile(str(fd, key), key, label);
}

export function checkMobile(raw: string, key: string, label = "Phone"): string {
  const digits = raw.replace(/[^\d]/g, "").replace(/^91(?=\d{10}$)/, "").replace(/^0(?=\d{10}$)/, "");
  if (!digits) throw new AdmissionProblem(`${label} is needed.`, key);
  if (digits.length !== 10) throw new AdmissionProblem(`${label} has ${digits.length} digits. Indian mobile numbers have 10 digits.`, key);
  if (!/^[6-9]/.test(digits)) throw new AdmissionProblem(`${label}: Indian mobile numbers start with 6, 7, 8 or 9.`, key);
  return digits;
}

export function emailOf(fd: FormData, key: string): string | null {
  const v = str(fd, key).toLowerCase();
  if (!v) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) || v.length > 200) throw new AdmissionProblem("Email does not look right. It should be like name@example.com.", key);
  return v;
}

/** A date and time typed in the school's time zone (datetime-local), as a real instant. */
export function dateTimeOf(fd: FormData, key: string, label: string, timeZone: string): Date {
  const v = str(fd, key);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) throw new AdmissionProblem(`Choose the ${label.toLowerCase()}.`, key);
  return zonedToInstant(v, timeZone);
}

/** "2026-10-12T11:00" in a time zone, as an instant. */
export function zonedToInstant(local: string, timeZone: string): Date {
  const asUtc = new Date(`${local}:00Z`);
  const shown = new Date(asUtc.toLocaleString("en-US", { timeZone }));
  const utcShown = new Date(asUtc.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(asUtc.getTime() - (shown.getTime() - utcShown.getTime()));
}

/** An instant as "YYYY-MM-DDTHH:MM" in a time zone, for datetime-local inputs. */
export function instantToLocal(d: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(d);
  const g = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${g("year")}-${g("month")}-${g("day")}T${g("hour") === "24" ? "00" : g("hour")}:${g("minute")}`;
}

/** Today's date (YYYY-MM-DD) in a time zone. */
export function todayIn(timeZone: string, now = new Date()): string {
  return instantToLocal(now, timeZone).slice(0, 10);
}
