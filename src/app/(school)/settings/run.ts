// Runs one Settings change for a server action: checks the permission on the
// server, does the work in one transaction for the person's school, and turns
// a rule that stopped it into a plain-words message (P7).
import "server-only";

import { requireAction, type Current } from "@/lib/current";
import { withSchool, type Tx } from "@/lib/db";
import { PermissionDeniedError, type Action } from "@/lib/permissions";
import { SettingsProblem } from "@/lib/settings/common";
import { FieldProblem } from "@/lib/settings/forms";
import { FileProblem } from "@/lib/files";
import type { FormState } from "@/lib/forms";

export type Outcome<T> = { ok: true; data: T; current: Current } | { ok: false; message: string; field?: string; errors?: Record<string, string> };

export const FAILED = "That did not work, and nothing was changed. Please try again.";

export async function runSettings<T>(action: Action, work: (tx: Tx, current: Current) => Promise<T>): Promise<Outcome<T>> {
  let current: Current;
  try {
    current = (await requireAction("settings", action)).current;
  } catch (e) {
    if (e instanceof PermissionDeniedError) return { ok: false, message: e.message };
    throw e;
  }
  try {
    const data = await withSchool(current.ctx, (tx) => work(tx, current), { timeout: 30_000 });
    return { ok: true, data, current };
  } catch (e) {
    if (e instanceof FieldProblem) return { ok: false, message: e.message, errors: e.errors };
    if (e instanceof SettingsProblem) return { ok: false, message: e.message, field: e.field };
    if (e instanceof FileProblem) return { ok: false, message: e.message, field: "file" };
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") return { ok: false, message: "Something with the same name already exists. Use a different name." };
    console.error(JSON.stringify({ level: "error", event: "settings-action", error: e instanceof Error ? e.message : String(e) }));
    return { ok: false, message: FAILED };
  }
}

/** The outcome as a form state, keeping what was typed. */
export function asFormState<T>(r: Outcome<T>, values: Record<string, string>, success: string): NonNullable<FormState<T>> {
  if (r.ok) return { ok: true, message: success, data: r.data };
  const errors = r.errors ?? (r.field ? { [r.field]: r.message } : undefined);
  return { ok: false, message: r.message, errors, values };
}
