// Shared server pieces for Examination & Results actions: the role check on
// the server, one transaction, the person's exam scope, and plain words.
import "server-only";

import { revalidatePath } from "next/cache";
import { Prisma } from "@prisma/client";
import { withSchool, type Tx } from "@/lib/db";
import { requireAction, type Current } from "@/lib/current";
import { PermissionDeniedError, type Action } from "@/lib/permissions";
import { formValues, type FormState } from "@/lib/forms";
import { flash, type Flash } from "@/lib/flash";
import { AcademicRuleError } from "@/lib/academic/common";
import { ClosedYearError, chosenYear } from "@/lib/academic/years";
import { FileProblem } from "@/lib/files";
import { ExamRuleError } from "@/lib/exams/common";
import { examScope, type ExamScope } from "@/lib/exams/scope";

export const BASE = "/examination-results";

export type Work = { tx: Tx; current: Current; scope: ExamScope; yearId: string | null };

export type Need = "manage" | "datesheets" | "publish" | "any";

/** Turns any error into a message a person can act on (P7). Never shows codes. */
export function plainError(e: unknown): { message: string; field?: string } {
  if (e instanceof ExamRuleError || e instanceof AcademicRuleError) return { message: e.message, field: e.field };
  if (e instanceof ClosedYearError || e instanceof PermissionDeniedError || e instanceof FileProblem) return { message: e.message };
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") return { message: "That is already there, or someone else just made the same change. Reload the page and check." };
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2028") return { message: "That took too long and nothing was changed. Please try again." };
  console.error(JSON.stringify({ level: "error", event: "exam-action-failed", error: e instanceof Error ? e.message : String(e) }));
  return { message: "That did not work and nothing was changed. Please try again." };
}

const NEED_WORDS: Record<Exclude<Need, "any">, string> = {
  manage: "Your role lets you see this, but not change it. Ask the Exam In-charge or the Principal.",
  datesheets: "Your role does not prepare datesheets. Ask the Exam In-charge or the office.",
  publish: "Your role cannot publish results. Exam Settings says who can. Ask the Principal.",
};

export type ActOptions = { formData?: FormData; revalidate?: string[]; yearId?: string | null; needs?: Need; timeout?: number };

/**
 * Runs an Examination & Results change: checks the role on the server, works
 * out the person's scope, runs the work in one transaction and returns a
 * FormState. A flash message shows on the next page.
 */
export async function act(action: Action, work: (w: Work) => Promise<{ flash?: Flash; data?: unknown; state?: FormState } | void>, opts: ActOptions = {}): Promise<FormState> {
  const values = opts.formData ? formValues(opts.formData) : undefined;
  try {
    const { current } = await requireAction("examination-results", action);
    const result = await withSchool(current.ctx, async (tx) => {
      const year = await chosenYear(tx, current.ctx, opts.yearId ?? null);
      const scope = await examScope(tx, current, year?.id ?? null);
      const needs = opts.needs ?? "manage";
      if (needs !== "any" && !scope[needs]) throw new ExamRuleError(NEED_WORDS[needs]);
      return work({ tx, current, scope, yearId: year?.id ?? null });
    }, { timeout: opts.timeout ?? 60_000 });
    if (result?.flash) await flash(result.flash);
    for (const p of opts.revalidate ?? [BASE]) revalidatePath(p, "layout");
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

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
