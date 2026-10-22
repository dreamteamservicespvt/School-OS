"use server";

import { z } from "zod";
import { parseForm, type FormState } from "@/lib/forms";
import { requireAction } from "@/lib/current";
import { withSchool, type Tx } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { AcademicRuleError, parseDay, plural, todayIn } from "@/lib/academic/common";
import { academicScope } from "@/lib/academic/scope";
import { campusAllows } from "@/lib/campus";
import { assignSubstitute, endTemporaryCover, markAbsent, removeSubstitute, suggestSubstitutes, temporaryTeacher, unmarkAbsent, type Suggestion } from "@/lib/academic/substitutions";
import { act, actSimple, staffInCampus } from "../_lib/server";

const PATH = "/academic-management/substitutions";
const day = (label: string) => z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, `Choose the ${label}.`).transform((v) => new Date(`${v}T00:00:00Z`));
const note = z.string().trim().max(200, "The note can be at most 200 characters.").optional().transform((v) => v || null);
const NO_PERIOD = "A chosen period is no longer in the Time Table. Reload the page.";

// Substitutions happen on one campus: the campus of the periods' sections,
// or of the teacher who is away. A person limited to one campus arranges
// only theirs.

/** The campus's year a date falls in, so a closed year stays read-only (each campus has its own years). */
async function yearOn(tx: Tx, date: Date, campusId: string | null | undefined) {
  const y = await tx.academicYear.findFirst({ where: { archivedAt: null, startDate: { lte: date }, endDate: { gte: date }, ...(campusId ? { campusId } : {}) }, orderBy: { startDate: "desc" } });
  return y?.id ?? null;
}

/** The one campus of Time Table periods (their sections'), looked up once; null when not found or on two campuses. */
function periodsCampus(periodIds: string[]) {
  let once: Promise<string | null> | null = null;
  return (tx: Tx) => (once ??= tx.timetablePeriod.findMany({ where: { id: { in: periodIds } }, select: { section: { select: { schoolClass: { select: { campusId: true } } } } } })
    .then((rows) => { const ids = new Set(rows.map((r) => r.section.schoolClass.campusId)); return ids.size === 1 ? [...ids][0] : null; }));
}

/** A staff member's campus, looked up once. */
function staffCampus(staffId: string | null | undefined) {
  let once: Promise<string | null> | null = null;
  return (tx: Tx) => (once ??= staffId ? tx.staff.findFirst({ where: { id: staffId }, select: { campusId: true } }).then((s) => s?.campusId ?? null) : Promise.resolve(null));
}

/**
 * Free teachers for the chosen periods, ranked (same subject, same class,
 * fewest this week). For several periods, only teachers free in all of them.
 */
export async function suggestAction(periodIds: string[], dateIso: string): Promise<{ suggestions: Suggestion[]; error?: string }> {
  const date = parseDay(dateIso);
  if (!date || !Array.isArray(periodIds) || periodIds.length === 0 || periodIds.length > 12 || periodIds.some((p) => !/^[0-9a-f-]{36}$/i.test(p))) return { suggestions: [], error: "Choose a period." };
  const { current } = await requireAction("academic-management", "view");
  return withSchool(current.ctx, async (tx) => {
    // The periods' campus and that campus's year (not the main campus's).
    const campusId = await periodsCampus(periodIds)(tx);
    if (!campusId || !campusAllows(current, campusId)) return { suggestions: [] };
    const scope = await academicScope(tx, current, await yearOn(tx, date, campusId));
    if (!scope.arrange) return { suggestions: [], error: "Your role does not arrange substitutions." };
    let list: Suggestion[] | null = null;
    for (const id of periodIds) {
      const s = await suggestSubstitutes(tx, current.ctx, campusId, id, date);
      list = list === null ? s : list.filter((x) => s.some((y) => y.id === x.id));
    }
    return { suggestions: list ?? [] };
  });
}

const assignSchema = z.object({
  date: day("date"),
  periodIds: z.array(z.string().uuid()).min(1, "Choose the period or periods to cover.").max(12),
  substituteId: z.string().uuid("Choose a substitute."),
  note,
});

export async function assignAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = assignSchema.safeParse({ date: fd.get("date"), periodIds: fd.getAll("periodIds"), substituteId: fd.get("substituteId") ?? "", note: fd.get("note") ?? undefined });
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const field = String(first.path[0] ?? "");
    return { ok: false, message: first.message, errors: field ? { [field]: first.message } : undefined };
  }
  const d = parsed.data;
  const campusOf = periodsCampus(d.periodIds);
  return act("edit", async ({ tx, current }) => {
    const campusId = await campusOf(tx);
    if (!campusId) throw new AcademicRuleError(NO_PERIOD);
    await staffInCampus(tx, current, d.substituteId, "Choose a substitute who is working today.", "substituteId");
    const r = await assignSubstitute(tx, current.ctx, { campusId, date: d.date, periodIds: d.periodIds, substituteId: d.substituteId, note: d.note });
    return { flash: { message: `${r.substitute} covers ${plural(r.count, "period")} on ${formatDate(d.date)}. They and the class teacher are told.` } };
  }, { formData: fd, campusOf, yearOf: async (tx) => yearOn(tx, d.date, await campusOf(tx)), notFound: NO_PERIOD, needs: "arrange", revalidate: [PATH] });
}

export async function removeSubstituteAction(substitutionId: string): Promise<string | undefined> {
  const place = async (tx: Tx) => tx.substitution.findFirst({ where: { id: substitutionId }, select: { date: true, period: { select: { section: { select: { schoolClass: { select: { campusId: true } } } } } } } });
  return actSimple("edit", async ({ tx, current }) => {
    const s = await removeSubstitute(tx, current.ctx, substitutionId);
    return { flash: { message: `Period ${s.period.periodNo} in ${s.period.section.schoolClass.name} ${s.period.section.name} needs a substitute again.` } };
  }, {
    campusOf: async (tx) => (await place(tx))?.period.section.schoolClass.campusId,
    yearOf: async (tx) => { const s = await place(tx); return s ? yearOn(tx, s.date, s.period.section.schoolClass.campusId) : null; },
    notFound: "This substitution was not found.", needs: "arrange", revalidate: [PATH],
  });
}

export async function markAbsentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(z.object({ staffId: z.string().uuid("Choose the teacher who is absent."), date: day("date"), note }), fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const campusOf = staffCampus(d.staffId);
  return act("edit", async ({ tx, current }) => {
    const r = await markAbsent(tx, current.ctx, d);
    return { flash: { message: `${r.name} marked absent on ${formatDate(d.date)}. ${r.raised ? `${plural(r.raised, "period")} need a substitute.` : "No periods that day."}${r.released ? ` Their ${plural(r.released, "substitution")} need someone else.` : ""}` } };
  }, { formData: fd, campusOf, yearOf: async (tx) => yearOn(tx, d.date, await campusOf(tx)), notFound: "Choose the teacher who is absent.", needs: "arrange", revalidate: [PATH] });
}

export async function unmarkAbsentAction(absenceId: string): Promise<string | undefined> {
  const absence = async (tx: Tx) => tx.staffAbsence.findFirst({ where: { id: absenceId }, select: { date: true, staffId: true } });
  const campusOf = async (tx: Tx) => { const a = await absence(tx); return a ? staffCampus(a.staffId)(tx) : null; };
  return actSimple("edit", async ({ tx, current }) => {
    await unmarkAbsent(tx, current.ctx, absenceId);
    return { flash: { message: "Absence removed. Substitutions arranged for it are cancelled and the substitutes told." } };
  }, { campusOf, yearOf: async (tx) => { const a = await absence(tx); return a ? yearOn(tx, a.date, await campusOf(tx)) : null; }, notFound: "This absence was already removed.", needs: "arrange", revalidate: [PATH] });
}

const tempSchema = z.object({
  absentStaffId: z.string().uuid("Choose the absent teacher."),
  tempStaffId: z.string().uuid("Choose the temporary teacher."),
  fromDate: day("from date"),
  toDate: day("to date"),
  note,
}).refine((d) => d.toDate >= d.fromDate, { message: "The to date must be on or after the from date.", path: ["toDate"] });

export async function temporaryTeacherAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(tempSchema, fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const campusOf = staffCampus(d.absentStaffId);
  return act("edit", async ({ tx, current }) => {
    if (d.fromDate < todayIn(current.school.timeZone)) throw new AcademicRuleError("The from date cannot be in the past.", "fromDate");
    await staffInCampus(tx, current, d.tempStaffId, "Choose a temporary teacher who is working.", "tempStaffId");
    const r = await temporaryTeacher(tx, current.ctx, d);
    return { flash: { message: `${r.temp} takes ${r.absent}'s classes from ${formatDate(d.fromDate)} to ${formatDate(d.toDate)}: ${plural(r.covered, "period")} covered.${r.needed ? ` ${plural(r.needed, "period")} clash with their own classes and still need someone.` : ""}` } };
  }, { formData: fd, campusOf, yearOf: async (tx) => yearOn(tx, d.fromDate, await campusOf(tx)), notFound: "Choose the absent teacher.", needs: "arrange", revalidate: [PATH] });
}

export async function endCoverAction(coverId: string): Promise<string | undefined> {
  return actSimple("edit", async ({ tx, current }) => {
    const n = await endTemporaryCover(tx, current.ctx, coverId, todayIn(current.school.timeZone));
    return { flash: { message: `Temporary teacher ended. ${plural(n, "future period")} released.` } };
  }, {
    campusOf: async (tx) => { const c = await tx.temporaryCover.findFirst({ where: { id: coverId }, select: { absentStaffId: true } }); return c ? staffCampus(c.absentStaffId)(tx) : null; },
    notFound: "This temporary teacher was not found.", needs: "arrange", revalidate: [PATH],
  });
}
