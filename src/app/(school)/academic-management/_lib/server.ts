// Shared server pieces for the Academic Management pages: running an action
// with permission and year checks, and plain-words results.
import "server-only";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { withSchool, type Tx } from "@/lib/db";
import { requireAction, type Current } from "@/lib/current";
import { PermissionDeniedError, type Action, type Reach } from "@/lib/permissions";
import { formValues, type FormState } from "@/lib/forms";
import { flash, type Flash } from "@/lib/flash";
import { AcademicRuleError } from "@/lib/academic/common";
import { ClosedYearError, assertYearWritable } from "@/lib/academic/years";
import { writeAudit } from "@/lib/audit";
import { academicScope, type AcademicScope } from "@/lib/academic/scope";
import { openCorrection } from "@/lib/academic/correction-cookie";

export const CORRECTION_COOKIE = "sos_year_correction";

/** An authorised correction to a closed year, if one is running for this year (04 §5). */
export async function correctionFor(current: Current, yearId: string | null | undefined): Promise<string | null> {
  if (!yearId) return null;
  const raw = (await cookies()).get(CORRECTION_COOKIE)?.value;
  if (!raw) return null;
  const c = openCorrection(raw);
  if (!c || c.yearId !== yearId || c.userId !== current.user.id || c.until < Date.now()) return null;
  const allowed = current.roles.some((r) => r.key === "principal" || r.key === "school-admin");
  return allowed ? c.reason : null;
}

export type Work = { tx: Tx; current: Current; reach: Reach; scope: AcademicScope; correction: string | null };

export class NotAllowedError extends AcademicRuleError {}

/** Turns any error into a message a person can act on (P7). Never shows codes. */
export function plainError(e: unknown): { message: string; field?: string } {
  if (e instanceof AcademicRuleError) return { message: e.message, field: e.field };
  if (e instanceof ClosedYearError || e instanceof PermissionDeniedError) return { message: e.message };
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
    return { message: "That is already there, or someone else just made the same change. Reload the page and check." };
  }
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2028") {
    return { message: "That took too long and nothing was changed. Please try again." };
  }
  console.error(JSON.stringify({ level: "error", event: "academic-action-failed", error: e instanceof Error ? e.message : String(e) }));
  return { message: "That did not work and nothing was changed. Please try again." };
}

/**
 * Runs an Academic Management change: checks the role on the server, runs
 * the work in one transaction, and returns a FormState. A flash message is
 * shown on the next page; paths given are refreshed.
 */
export type ActOptions = {
  formData?: FormData;
  revalidate?: string[];
  /** The year the change is in, so a closed year stays read-only. */
  yearId?: string | null;
  /** Or: find the year from the record being changed (safer than trusting the form). */
  yearOf?: (tx: Tx) => Promise<string | null>;
  needs?: "manage" | "arrange" | "any";
};

export async function act(
  action: Action,
  work: (w: Work) => Promise<{ flash?: Flash; data?: unknown; state?: FormState } | void>,
  opts: ActOptions = {},
): Promise<FormState> {
  const values = opts.formData ? formValues(opts.formData) : undefined;
  try {
    const { current, reach } = await requireAction("academic-management", action);
    const result = await withSchool(current.ctx, async (tx) => {
      const yearId = opts.yearOf ? await opts.yearOf(tx) : opts.yearId ?? null;
      const correction = await correctionFor(current, yearId);
      const scope = await academicScope(tx, current, yearId);
      const needs = opts.needs ?? "manage";
      if (needs === "manage" && !scope.manage) throw new NotAllowedError("Your role lets you see this, but not change it. Ask your Principal if something needs changing.");
      if (needs === "arrange" && !scope.arrange) throw new NotAllowedError("Your role does not arrange the Time Table or substitutions. Ask the office or the Principal.");
      // Closed years are read-only, except an authorised correction (04 §5).
      const note = yearId ? await assertYearWritable(tx, yearId, correction) : null;
      const out = await work({ tx, current, reach, scope, correction });
      if (note) await writeAudit(tx, current.ctx, { action: "correction", recordType: "Academic Year", recordId: yearId, actorNote: note });
      return out;
    }, { timeout: 60_000 });
    if (result?.flash) await flash(result.flash);
    for (const p of opts.revalidate ?? ["/academic-management"]) revalidatePath(p, "layout");
    return result?.state ?? { ok: true, message: result?.flash?.message, data: result?.data };
  } catch (e) {
    const { message, field } = plainError(e);
    return { ok: false, message, errors: field ? { [field]: message } : undefined, values };
  }
}

/** For buttons that confirm first: returns a message when it failed, nothing when it worked. */
export async function actSimple(action: Action, work: (w: Work) => Promise<{ flash?: Flash } | void>, opts: Omit<ActOptions, "formData"> = {}): Promise<string | undefined> {
  const state = await act(action, work, opts);
  return state?.ok ? undefined : state?.message ?? "That did not work. Please try again.";
}
