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
import { actionCampusId } from "@/lib/academic/page-campus";
import { campusAllows } from "@/lib/campus";

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

export type Work = {
  tx: Tx; current: Current; reach: Reach; scope: AcademicScope; correction: string | null;
  /**
   * The campus the change is made on: the campus of the change's year (or of
   * the page's year), else the person's own campus (src/lib/academic/page-campus.ts).
   */
  campus: () => Promise<string>;
};

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
  /**
   * The campus of the record being changed when it has no year (a stream, a
   * room, a period of the day, a teacher...). Looked up only for a person
   * limited to one campus: another campus's record is refused.
   */
  campusOf?: (tx: Tx) => Promise<string | null | undefined>;
  /** The year of the page the form was on, for changes with no year of their own (timings, streams, rooms): they are made on that year's campus. */
  pageYearId?: string | null;
  /** The words when the record is on another campus than the person's: the module's usual not-found words, so it stays unknown. */
  notFound?: string;
  needs?: "manage" | "arrange" | "any";
};

/** The page's year sent with a form (hidden "pageYearId"), for ActOptions.pageYearId. */
export function pageYearOf(fd: FormData): string | null {
  const v = String(fd.get("pageYearId") ?? "");
  return /^[0-9a-f-]{36}$/i.test(v) ? v : null;
}

/** The campus of an academic year, or null when there is no such year. */
export async function yearCampus(tx: Tx, yearId: string | null | undefined): Promise<string | null> {
  if (!yearId) return null;
  return (await tx.academicYear.findFirst({ where: { id: yearId }, select: { campusId: true } }))?.campusId ?? null;
}

/**
 * One campus (05-roles.md): refuses a record on another campus than the one
 * the person is limited to, with the module's not-found words. A record with
 * no campus (null) belongs to the whole school.
 */
export function sameCampus(current: Pick<Current, "campusId">, campusId: string | null | undefined, notFound: string, field?: string) {
  if (!campusAllows(current, campusId)) throw new AcademicRuleError(notFound, field);
}

/** For a person limited to one campus: a staff member picked in a form must be of that campus. */
export async function staffInCampus(tx: Tx, current: Pick<Current, "campusId">, staffId: string | null | undefined, notFound: string, field?: string) {
  if (!current.campusId || !staffId) return;
  const s = await tx.staff.findFirst({ where: { id: staffId }, select: { campusId: true } });
  if (s) sameCampus(current, s.campusId, notFound, field);
}

/** A class picked in a form must be on the campus the change is made on (its year's campus). */
export async function classOnCampus(tx: Tx, classId: string, campusId: string, notFound = "This class was not found.", field?: string) {
  const c = await tx.schoolClass.findFirst({ where: { id: classId }, select: { campusId: true } });
  if (c && c.campusId !== campusId) throw new AcademicRuleError(notFound, field);
}

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
      // One campus: a year or a record of another campus is refused as not found.
      if (current.campusId) {
        const notFound = opts.notFound ?? "This academic year was not found.";
        if (yearId) sameCampus(current, await yearCampus(tx, yearId), notFound);
        if (opts.campusOf) sameCampus(current, await opts.campusOf(tx), notFound);
      }
      let campusOnce: Promise<string> | null = null;
      const campus = () => (campusOnce ??= actionCampusId(tx, current.ctx, current, yearId ?? opts.pageYearId ?? null));
      const correction = await correctionFor(current, yearId);
      const scope = await academicScope(tx, current, yearId);
      const needs = opts.needs ?? "manage";
      if (needs === "manage" && !scope.manage) throw new NotAllowedError("Your role lets you see this, but not change it. Ask your Principal if something needs changing.");
      if (needs === "arrange" && !scope.arrange) throw new NotAllowedError("Your role does not arrange the Time Table or substitutions. Ask the office or the Principal.");
      // Closed years are read-only, except an authorised correction (04 §5).
      const note = yearId ? await assertYearWritable(tx, yearId, correction) : null;
      const out = await work({ tx, current, reach, scope, correction, campus });
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
