// Turns a Fee or Finance action's work into a FormState: plain-words problems
// go next to their field, typed values are kept (P7), and the success message
// shows as a toast with a link (P15).
import "server-only";

import { revalidatePath } from "next/cache";
import { formValues, type FormState } from "../forms";
import { flash, type Flash } from "../flash";
import { PermissionDeniedError } from "../permissions";
import { ClosedYearError } from "../academic/years";
import { FileProblem } from "../files";
import { DecisionProblem } from "../approvals";
import { RazorpayProblem } from "../payments/razorpay";
import { MessagingProblem } from "../messaging/send";
import { NotEnoughCredits } from "../messaging/credits";
import { MoneyProblem } from "./problem";

export { MoneyProblem } from "./problem";

type Known = Error & { field?: string; link?: { href: string; label: string }; warning?: boolean; code?: string };

export type ProblemData = { link?: { href: string; label: string }; warning?: boolean; code?: string };

export function problemState(e: unknown, fd?: FormData): NonNullable<FormState<ProblemData>> {
  const known = [MoneyProblem, PermissionDeniedError, ClosedYearError, FileProblem, DecisionProblem, RazorpayProblem, MessagingProblem, NotEnoughCredits];
  if (known.some((K) => e instanceof K)) {
    const err = e as Known;
    return {
      ok: false,
      message: err.message,
      errors: err.field ? { [err.field]: err.message } : undefined,
      values: fd ? formValues(fd) : undefined,
      data: err.link || err.warning || err.code ? { link: err.link, warning: err.warning, code: err.code } : undefined,
    };
  }
  console.error(JSON.stringify({ level: "error", event: "money-action-failed", error: e instanceof Error ? e.message : String(e) }));
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

export function strs(fd: FormData, key: string) {
  return fd.getAll(key).filter((v): v is string => typeof v === "string" && v.trim() !== "").map((v) => v.trim());
}

export function file(fd: FormData, key: string): File | null {
  const v = fd.get(key);
  return v instanceof File && v.size > 0 ? v : null;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function id(fd: FormData, key: string, what = "record"): string {
  const v = str(fd, key);
  if (!UUID_RE.test(v)) throw new MoneyProblem(`Choose the ${what}.`, key);
  return v;
}

export function optionalId(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return UUID_RE.test(v) ? v : null;
}

export function ids(fd: FormData, key: string): string[] {
  return strs(fd, key).filter((v) => UUID_RE.test(v));
}

export function dateOf(fd: FormData, key: string, label: string): Date {
  const v = str(fd, key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new MoneyProblem(`Choose the ${label.toLowerCase()}.`, key);
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new MoneyProblem(`${label} is not a real date.`, key);
  return d;
}

export function optionalDateOf(fd: FormData, key: string, label: string): Date | null {
  return str(fd, key) ? dateOf(fd, key, label) : null;
}

/** Rupees typed by a person (like 45000 or 45,000.50) as whole paise, or null when empty. */
export function rupeesOf(fd: FormData, key: string, label: string): bigint | null {
  return parseRupees(str(fd, key), label, key);
}

export function parseRupees(raw: string, label: string, key?: string): bigint | null {
  // Old registers and exports write amounts as "Rs. 12,500/-", "INR 4500" or "₹ 4,500.00".
  const v = raw.replace(/[,₹\s]/g, "").replace(/^(rs\.?|inr)/i, "").replace(/\/-$|-$/, "");
  if (!v) return null;
  if (!/^\d{1,10}(\.\d{1,2})?$/.test(v)) throw new MoneyProblem(`${label} must be an amount in rupees, like 4500 or 4500.50.`, key);
  const [r, p = ""] = v.split(".");
  return BigInt(r) * BigInt(100) + BigInt((p + "00").slice(0, 2));
}

export function needRupees(fd: FormData, key: string, label: string, { allowZero = false } = {}): bigint {
  const v = rupeesOf(fd, key, label);
  if (v === null) throw new MoneyProblem(`${label} is needed.`, key);
  if (!allowZero && v <= BigInt(0)) throw new MoneyProblem(`${label} must be more than ₹0.`, key);
  return v;
}

export function text(fd: FormData, key: string, label: string, { min = 1, max = 300 } = {}) {
  const v = str(fd, key).replace(/\s+/g, " ");
  if (v.length < min) throw new MoneyProblem(min > 1 ? `${label} needs at least ${min} characters.` : `${label} is needed.`, key);
  if (v.length > max) throw new MoneyProblem(`${label} can be at most ${max} characters.`, key);
  return v;
}

export function optionalText(fd: FormData, key: string, label: string, max = 500) {
  const v = str(fd, key);
  if (v.length > max) throw new MoneyProblem(`${label} can be at most ${max} characters.`, key);
  return v || null;
}

/** A date and time typed in the school's time zone (datetime-local), as a real instant. */
export function dateTimeOf(fd: FormData, key: string, label: string, timeZone: string): Date {
  const v = str(fd, key);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) throw new MoneyProblem(`Choose the ${label.toLowerCase()}.`, key);
  return zonedToInstant(v, timeZone);
}

export function zonedToInstant(local: string, timeZone: string): Date {
  const asUtc = new Date(`${local.length === 16 ? `${local}:00` : local}Z`);
  const shown = new Date(asUtc.toLocaleString("en-US", { timeZone }));
  const utcShown = new Date(asUtc.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(asUtc.getTime() - (shown.getTime() - utcShown.getTime()));
}
