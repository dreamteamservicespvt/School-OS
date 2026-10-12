// One way for every Admission server action to start: the role is checked on
// the server first, then the work runs inside the school's walls with the
// viewer (what they may see and change) and the settings at hand.
import "server-only";

import type { Flash } from "../flash";
import type { FormState } from "../forms";
import type { Action } from "../permissions";
import { requireAction, type Current } from "../current";
import { withSchool, type SchoolContext, type Tx } from "../db";
import type { Prisma } from "@prisma/client";
import { loadCustomFields, readCustomFieldForm, storeCustomValues, validateCustomValues, visibleFields, type CustomValues } from "../custom-fields";
import { act, AdmissionProblem } from "./act";
import { viewerFor, type Viewer } from "./access";
import { loadSettings, type Settings } from "./settings";

export type Work = { tx: Tx; ctx: SchoolContext; v: Viewer; s: Settings; current: Current; tz: string };

export async function inSchool<T>(action: Action, work: (w: Work) => Promise<T>, opts: { timeout?: number } = {}) {
  const { current } = await requireAction("admission-management", action);
  return withSchool(current.ctx, async (tx) => {
    const v = await viewerFor(tx, current.ctx, current);
    const s = await loadSettings(tx, current.ctx);
    return work({ tx, ctx: current.ctx, v, s, current, tz: current.school.timeZone });
  }, opts);
}

/** The school's extra fields for enquiries or applications (Settings, Forms & Approvals), checked and saved. */
export async function customFrom(w: Pick<Work, "tx" | "ctx" | "current">, recordType: "enquiry" | "application", fd: FormData, existing: unknown): Promise<Prisma.InputJsonValue> {
  const fields = visibleFields(await loadCustomFields(w.tx, recordType), w.current.roles);
  if (fields.length === 0) return (existing ?? {}) as Prisma.InputJsonValue;
  const checked = validateCustomValues(fields, readCustomFieldForm(fd, fields), (existing ?? {}) as CustomValues);
  if (!checked.ok) {
    const [key, message] = Object.entries(checked.errors)[0];
    throw new AdmissionProblem(message, `cf_${key}`);
  }
  return (await storeCustomValues(w.tx, w.ctx, fields, checked.values, existing)) as Prisma.InputJsonValue;
}

/** A server action: checks, does the work, and answers with a FormState (problems in plain words). */
export function admissionAct<T>(action: Action, fd: FormData | undefined, work: (w: Work) => Promise<T>, success: (result: T) => Flash | string, opts: { timeout?: number } = {}): Promise<FormState<T>> {
  return act(fd, () => inSchool(action, work, opts), success);
}
