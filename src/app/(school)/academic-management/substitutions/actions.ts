"use server";

import { z } from "zod";
import { parseForm, type FormState } from "@/lib/forms";
import { requireAction } from "@/lib/current";
import { withSchool, type Tx } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { AcademicRuleError, parseDay, plural, todayIn } from "@/lib/academic/common";
import { mainCampusId } from "@/lib/academic/settings";
import { academicScope } from "@/lib/academic/scope";
import { currentYear } from "@/lib/academic/years";
import { assignSubstitute, endTemporaryCover, markAbsent, removeSubstitute, suggestSubstitutes, temporaryTeacher, unmarkAbsent, type Suggestion } from "@/lib/academic/substitutions";
import { act, actSimple } from "../_lib/server";

const PATH = "/academic-management/substitutions";
const day = (label: string) => z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, `Choose the ${label}.`).transform((v) => new Date(`${v}T00:00:00Z`));
const note = z.string().trim().max(200, "The note can be at most 200 characters.").optional().transform((v) => v || null);

/** The year a date falls in, so a closed year stays read-only. */
async function yearOn(tx: Tx, date: Date) {
  const y = await tx.academicYear.findFirst({ where: { archivedAt: null, startDate: { lte: date }, endDate: { gte: date } }, orderBy: { startDate: "desc" } });
  return y?.id ?? null;
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
    const year = await currentYear(tx, current.ctx);
    const scope = await academicScope(tx, current, year?.id ?? null);
    if (!scope.arrange) return { suggestions: [], error: "Your role does not arrange substitutions." };
    const campusId = await mainCampusId(tx, current.ctx);
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
  return act("edit", async ({ tx, current }) => {
    const campusId = await mainCampusId(tx, current.ctx);
    const r = await assignSubstitute(tx, current.ctx, { campusId, date: d.date, periodIds: d.periodIds, substituteId: d.substituteId, note: d.note });
    return { flash: { message: `${r.substitute} covers ${plural(r.count, "period")} on ${formatDate(d.date)}. They and the class teacher are told.` } };
  }, { formData: fd, yearOf: (tx) => yearOn(tx, d.date), needs: "arrange", revalidate: [PATH] });
}

export async function removeSubstituteAction(substitutionId: string): Promise<string | undefined> {
  return actSimple("edit", async ({ tx, current }) => {
    const s = await removeSubstitute(tx, current.ctx, substitutionId);
    return { flash: { message: `Period ${s.period.periodNo} in ${s.period.section.schoolClass.name} ${s.period.section.name} needs a substitute again.` } };
  }, { yearOf: async (tx) => { const s = await tx.substitution.findFirst({ where: { id: substitutionId } }); return s ? yearOn(tx, s.date) : null; }, needs: "arrange", revalidate: [PATH] });
}

export async function markAbsentAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(z.object({ staffId: z.string().uuid("Choose the teacher who is absent."), date: day("date"), note }), fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  return act("edit", async ({ tx, current }) => {
    const r = await markAbsent(tx, current.ctx, d);
    return { flash: { message: `${r.name} marked absent on ${formatDate(d.date)}. ${r.raised ? `${plural(r.raised, "period")} need a substitute.` : "No periods that day."}${r.released ? ` Their ${plural(r.released, "substitution")} need someone else.` : ""}` } };
  }, { formData: fd, yearOf: (tx) => yearOn(tx, d.date), needs: "arrange", revalidate: [PATH] });
}

export async function unmarkAbsentAction(absenceId: string): Promise<string | undefined> {
  return actSimple("edit", async ({ tx, current }) => {
    await unmarkAbsent(tx, current.ctx, absenceId);
    return { flash: { message: "Absence removed. Substitutions arranged for it are cancelled and the substitutes told." } };
  }, { yearOf: async (tx) => { const a = await tx.staffAbsence.findFirst({ where: { id: absenceId } }); return a ? yearOn(tx, a.date) : null; }, needs: "arrange", revalidate: [PATH] });
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
  return act("edit", async ({ tx, current }) => {
    if (d.fromDate < todayIn(current.school.timeZone)) throw new AcademicRuleError("The from date cannot be in the past.", "fromDate");
    const r = await temporaryTeacher(tx, current.ctx, d);
    return { flash: { message: `${r.temp} takes ${r.absent}'s classes from ${formatDate(d.fromDate)} to ${formatDate(d.toDate)}: ${plural(r.covered, "period")} covered.${r.needed ? ` ${plural(r.needed, "period")} clash with their own classes and still need someone.` : ""}` } };
  }, { formData: fd, yearOf: (tx) => yearOn(tx, d.fromDate), needs: "arrange", revalidate: [PATH] });
}

export async function endCoverAction(coverId: string): Promise<string | undefined> {
  return actSimple("edit", async ({ tx, current }) => {
    const n = await endTemporaryCover(tx, current.ctx, coverId, todayIn(current.school.timeZone));
    return { flash: { message: `Temporary teacher ended. ${plural(n, "future period")} released.` } };
  }, { needs: "arrange", revalidate: [PATH] });
}
