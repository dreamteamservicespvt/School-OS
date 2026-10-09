// Turns a Staff & HR server action's work into a FormState: plain-words
// problems go next to their field, typed values are kept (P7), and the
// success message shows as a toast with a link (P15).
import "server-only";

import { revalidatePath } from "next/cache";
import type { FormState } from "../forms";
import { formValues } from "../forms";
import { flash, type Flash } from "../flash";
import { PermissionDeniedError } from "../permissions";
import { ClosedYearError } from "../academic/years";
import { FileProblem } from "../files";
import { DecisionProblem } from "../approvals";
import { LeaveProblem } from "./leave";
import { StaffProblem } from "./staff";
import { ExitProblem } from "./exit";
import { TalentProblem } from "./talent";
import { HrOnlyError } from "./access";

export class FieldProblem extends Error {
  constructor(message: string, public field?: string) {
    super(message);
  }
}

type Known = Error & { field?: string; link?: { href: string; label: string } };

export function problemState(e: unknown, fd?: FormData): NonNullable<FormState<{ link?: { href: string; label: string } }>> {
  const known = [LeaveProblem, StaffProblem, ExitProblem, TalentProblem, HrOnlyError, PermissionDeniedError, ClosedYearError, FileProblem, DecisionProblem, FieldProblem];
  if (known.some((K) => e instanceof K)) {
    const err = e as Known;
    return { ok: false, message: err.message, errors: err.field ? { [err.field]: err.message } : undefined, values: fd ? formValues(fd) : undefined, data: err.link ? { link: err.link } : undefined };
  }
  console.error(JSON.stringify({ level: "error", event: "staff-action-failed", error: e instanceof Error ? e.message : String(e) }));
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
  if (!UUID_RE.test(v)) throw new FieldProblem(`Choose the ${what}.`, key);
  return v;
}

export function optionalId(fd: FormData, key: string): string | null {
  const v = str(fd, key);
  return UUID_RE.test(v) ? v : null;
}

export function dateOf(fd: FormData, key: string, label: string): Date {
  const v = str(fd, key);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new FieldProblem(`Choose the ${label.toLowerCase()}.`, key);
  const d = new Date(`${v}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) throw new FieldProblem(`${label} is not a real date.`, key);
  return d;
}

export function optionalDateOf(fd: FormData, key: string, label: string): Date | null {
  return str(fd, key) ? dateOf(fd, key, label) : null;
}

/** Rupees typed by a person (like 45000 or 45,000.50) as whole paise. */
export function rupeesOf(fd: FormData, key: string, label: string): bigint | null {
  const v = str(fd, key).replace(/[,₹\s]/g, "");
  if (!v) return null;
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(v)) throw new FieldProblem(`${label} must be an amount in rupees, like 45000.`, key);
  const [r, p = ""] = v.split(".");
  return BigInt(r) * BigInt(100) + BigInt((p + "00").slice(0, 2));
}

/** A date and time typed in the school's time zone (datetime-local), as a real instant. */
export function dateTimeOf(fd: FormData, key: string, label: string, timeZone: string): Date {
  const v = str(fd, key);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) throw new FieldProblem(`Choose the ${label.toLowerCase()}.`, key);
  const asUtc = new Date(`${v}:00Z`);
  const shown = new Date(asUtc.toLocaleString("en-US", { timeZone }));
  const utcShown = new Date(asUtc.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(asUtc.getTime() - (shown.getTime() - utcShown.getTime()));
}
