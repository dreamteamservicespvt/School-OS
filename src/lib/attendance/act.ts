// Turns an Attendance server action's work into a FormState: plain-words
// problems next to their field, typed values kept (P7), and the success
// message as a toast with a link (P15).
import "server-only";

import { revalidatePath } from "next/cache";
import type { FormState } from "../forms";
import { formValues } from "../forms";
import { flash, type Flash } from "../flash";
import { PermissionDeniedError } from "../permissions";
import { ClosedYearError } from "../academic/years";
import { FileProblem } from "../files";
import { DecisionProblem } from "../approvals";
import { FieldProblem } from "../staff/act";
import { AttendanceProblem } from "./access";
import { OffDayError } from "./calendar";

export type ActionData = { link?: { href: string; label: string } } & Record<string, unknown>;

export function problemState<T>(e: unknown, fd?: FormData): NonNullable<FormState<T>> {
  const known = [AttendanceProblem, OffDayError, PermissionDeniedError, ClosedYearError, FileProblem, DecisionProblem, FieldProblem];
  if (known.some((K) => e instanceof K)) {
    const err = e as Error & { field?: string; link?: { href: string; label: string } };
    return { ok: false, message: err.message, errors: err.field ? { [err.field]: err.message } : undefined, values: fd ? formValues(fd) : undefined, data: (err.link ? { link: err.link } : undefined) as T | undefined };
  }
  console.error(JSON.stringify({ level: "error", event: "attendance-action-failed", error: e instanceof Error ? e.message : String(e) }));
  return { ok: false, message: "That did not save because of a problem on our side. Nothing was changed. Please try again.", values: fd ? formValues(fd) : undefined };
}

/** Runs the work; on success shows the message as a toast and refreshes the pages. */
export async function act<T>(fd: FormData | undefined, work: () => Promise<T>, success: (result: T) => Flash | string, opts: { toast?: boolean } = {}): Promise<FormState<T>> {
  try {
    const result = await work();
    const f = success(result);
    const message = typeof f === "string" ? f : f.message;
    if (opts.toast !== false) await flash(typeof f === "string" ? { message } : f);
    revalidatePath("/attendance-management", "layout");
    return { ok: true, message, data: result };
  } catch (e) {
    return problemState<T>(e, fd);
  }
}
