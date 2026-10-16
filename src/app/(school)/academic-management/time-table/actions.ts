"use server";

import { z } from "zod";
import { checkbox, parseForm, type FormState } from "@/lib/forms";
import { requireAction } from "@/lib/current";
import { withSchool, type Tx } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { AcademicRuleError, TIME_RE, plural, todayIn } from "@/lib/academic/common";
import { autoFill, clashFor, copyToYear, discardDraft, makeDraft, publishVersion, removePeriod, savePeriod } from "@/lib/academic/timetable";
import { mainCampusId } from "@/lib/academic/settings";
import { bookLab, cancelBooking } from "@/lib/academic/rooms";
import { academicScope } from "@/lib/academic/scope";
import { act, actSimple } from "../_lib/server";

const PATH = "/academic-management/time-table";
const uuid = (m: string) => z.string().uuid(m);
const day = (label: string) => z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, `Choose the ${label}.`).transform((v) => new Date(`${v}T00:00:00Z`));
const versionYear = (versionId: string) => async (tx: Tx) =>
  (await tx.timetableVersion.findFirst({ where: { id: versionId } }))?.academicYearId ?? null;

/** Starts a draft from the published Time Table (or an empty one). */
export async function startDraftAction(yearId: string): Promise<string | undefined> {
  return actSimple("edit", async ({ tx, current, correction }) => {
    const campusId = await mainCampusId(tx, current.ctx);
    const r = await makeDraft(tx, current.ctx, yearId, campusId, todayIn(current.school.timeZone), correction);
    return { flash: { message: !r.created ? "A draft is already open. Showing it." : "copiedFrom" in r && r.copiedFrom ? "Draft started from the published Time Table. Changes stay in the draft until you publish." : "Empty draft started. Fill it by hand or make it automatically, then publish." } };
  }, { yearId, needs: "arrange", revalidate: [PATH] });
}

export async function discardDraftAction(versionId: string): Promise<string | undefined> {
  return actSimple("edit", async ({ tx, current }) => {
    const v = await discardDraft(tx, current.ctx, versionId);
    return { flash: { message: `${v.name} discarded. The published Time Table is unchanged.` } };
  }, { yearOf: versionYear(versionId), needs: "arrange", revalidate: [PATH] });
}

const periodSchema = z.object({
  versionId: uuid("This Time Table was not found."),
  sectionId: uuid("Choose a section."),
  dayOfWeek: z.coerce.number().int().min(1).max(7),
  periodNo: z.coerce.number().int().min(-20).max(20),
  startTime: z.string().trim().regex(TIME_RE, "Give the start time like 09:00."),
  endTime: z.string().trim().regex(TIME_RE, "Give the end time like 09:40."),
  isBreak: checkbox(),
  subjectId: z.string().trim().optional().transform((v) => v || null),
  staffId: z.string().trim().optional().transform((v) => v || null),
  room: z.string().trim().max(40, "Room can be at most 40 characters.").optional().transform((v) => v || null),
  label: z.string().trim().max(40, "The name can be at most 40 characters.").optional().transform((v) => v || null),
  wholeWeek: checkbox(),
}).refine((d) => d.startTime < d.endTime, { message: "The end time must be after the start time.", path: ["endTime"] });

export async function savePeriodAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(periodSchema, fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  return act("edit", async ({ tx, current, correction }) => {
    const r = await savePeriod(tx, current.ctx, { ...d, correction });
    const where = d.wholeWeek ? `every day (${plural(r.days.length, "day")})` : "";
    const msg = `${r.label}, period ${d.periodNo} saved${where ? ` for ${where}` : ""}.${r.warnings.length ? ` Check: ${r.warnings[0]}` : ""}`;
    return { flash: { message: msg, tone: r.warnings.length ? "info" : "success" } };
  }, { formData: fd, yearOf: versionYear(d.versionId), needs: "arrange", revalidate: [PATH] });
}

export async function removePeriodAction(periodId: string): Promise<string | undefined> {
  return actSimple("edit", async ({ tx, current, correction }) => {
    const p = await removePeriod(tx, current.ctx, periodId, correction);
    return { flash: { message: `Period ${p.periodNo} removed.`, undo: { kind: "academic-period", id: periodId } } };
  }, { yearOf: async (tx) => { const p = await tx.timetablePeriod.findFirst({ where: { id: periodId } }); return p ? versionYear(p.versionId)(tx) : null; }, needs: "arrange", revalidate: [PATH] });
}

/** Live clash check while a period is being edited. Reads only. */
export async function checkClashAction(input: { versionId: string; sectionId: string; dayOfWeek: number; periodNo: number; staffId: string | null; room: string | null; wholeWeek: boolean }): Promise<string[]> {
  const ok = z.object({ versionId: z.string().uuid(), sectionId: z.string().uuid(), dayOfWeek: z.number().int().min(1).max(7), periodNo: z.number().int(), staffId: z.string().uuid().nullable(), room: z.string().max(40).nullable(), wholeWeek: z.boolean() }).safeParse(input);
  if (!ok.success) return [];
  const { current } = await requireAction("academic-management", "view");
  return withSchool(current.ctx, async (tx) => {
    const version = await tx.timetableVersion.findFirst({ where: { id: input.versionId, archivedAt: null } });
    if (!version) return [];
    const scope = await academicScope(tx, current, version.academicYearId);
    if (!scope.arrange) return [];
    let days = [input.dayOfWeek];
    if (input.wholeWeek) {
      const settings = await tx.academicSettings.findFirst({ where: { campusId: version.campusId } });
      const slot = await tx.periodSlot.findFirst({ where: { campusId: version.campusId, number: input.periodNo, archivedAt: null } });
      days = (settings?.workingDays ?? [1, 2, 3, 4, 5, 6]).filter((d) => !slot || slot.days.includes(d));
    }
    return clashFor(tx, { versionId: version.id, sectionId: input.sectionId, days, periodNo: input.periodNo, staffId: input.staffId, room: input.room?.trim() || null });
  });
}

const autoSchema = z.object({ versionId: uuid("Start a draft first."), classId: z.string().trim() });

export async function autoFillAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(autoSchema, fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  return act("edit", async ({ tx, current }) => {
    let sectionIds: string[] | null = null;
    const version = await tx.timetableVersion.findFirstOrThrow({ where: { id: d.versionId } });
    if (d.classId && d.classId !== "all") {
      sectionIds = (await tx.section.findMany({ where: { classId: d.classId, academicYearId: version.academicYearId, archivedAt: null }, select: { id: true } })).map((s) => s.id);
      if (sectionIds.length === 0) throw new AcademicRuleError("That class has no sections in this year.", "classId");
    }
    const r = await autoFill(tx, current.ctx, d.versionId, sectionIds, todayIn(current.school.timeZone));
    const left = r.unplaced.reduce((n, u) => n + u.count, 0);
    const msg = `Draft made for ${plural(r.sections, "section")}: ${plural(r.placed, "period")} placed.${left ? ` ${plural(left, "period")} could not be placed (${r.unplaced.slice(0, 3).map((u) => `${u.section} ${u.subject} ×${u.count}`).join(", ")}${r.unplaced.length > 3 ? "…" : ""}). Place them by hand.` : " No clashes."} Check it, then publish.`;
    return { flash: { message: msg, tone: left ? "info" : "success" }, data: r };
  }, { formData: fd, yearOf: versionYear(d.versionId), needs: "arrange", revalidate: [PATH] });
}

export async function publishAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(z.object({ versionId: uuid("Start a draft first."), effectiveFrom: day("effective date") }), fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  return act("edit", async ({ tx, current }) => {
    const r = await publishVersion(tx, current.ctx, d.versionId, d.effectiveFrom, todayIn(current.school.timeZone));
    return { flash: { message: `Published from ${formatDate(r.effectiveFrom)}. ${plural(r.notified, "teacher")} told.` } };
  }, { formData: fd, yearOf: versionYear(d.versionId), needs: "arrange", revalidate: [PATH, "/"] });
}

export async function copyAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(z.object({ versionId: uuid("Choose the Time Table to copy."), toYearId: uuid("Choose where to copy it.") }), fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  return act("edit", async ({ tx, current, correction }) => {
    const from = await tx.timetableVersion.findFirstOrThrow({ where: { id: d.versionId } });
    if (from.academicYearId === d.toYearId) {
      // Another week of the same year: a new draft from this version, to publish with its own date.
      const r = await makeDraft(tx, current.ctx, d.toYearId, from.campusId, todayIn(current.school.timeZone), correction);
      if (!r.created) throw new AcademicRuleError("A draft is already open for this year. Publish or discard it first.", "toYearId");
      return { flash: { message: "Copied into a new draft. Choose its effective date when you publish." } };
    }
    const r = await copyToYear(tx, current.ctx, d.versionId, d.toYearId);
    const hard = r.clashes.filter((c) => c.hard).length;
    const notes = [
      hard ? `${plural(hard, "clash", "clashes")} to fix` : "",
      r.unassigned ? `${plural(r.unassigned, "period")} with a teacher not assigned in the new year` : "",
      r.sectionsMissing ? `${plural(r.sectionsMissing, "section")} not in the new year` : "",
    ].filter(Boolean);
    return { flash: { message: `Copied ${plural(r.copied, "period")} into a draft for the new year.${notes.length ? ` Check: ${notes.join("; ")}.` : ""}`, tone: notes.length ? "info" : "success" } };
  }, { formData: fd, yearId: d.toYearId, needs: "arrange", revalidate: [PATH] });
}

const bookSchema = z.object({
  roomId: uuid("Choose a room or lab."),
  date: day("date"),
  periodNo: z.coerce.number({ invalid_type_error: "Choose a period." }).int().min(1, "Choose a period."),
  sectionId: z.string().trim().optional().transform((v) => v || null),
  purpose: z.string().trim().max(120, "The purpose can be at most 120 characters.").optional().transform((v) => v || null),
});

/** Books a lab for one period (optional rooms feature). Any teacher may book; nobody can book it twice. */
export async function bookLabAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(bookSchema, fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  return act("create", async ({ tx, current, scope }) => {
    if (!current.features.has("academic-rooms")) throw new AcademicRuleError("Rooms and lab bookings are switched off for this school.");
    if (!scope.staffId) throw new AcademicRuleError("Your login is not linked to a staff record, so a booking cannot be made in your name.");
    if (d.sectionId && scope.sectionIds && !scope.sectionIds.includes(d.sectionId)) throw new AcademicRuleError("Choose one of your own sections.", "sectionId");
    const r = await bookLab(tx, current.ctx, { ...d, staffId: scope.staffId, today: todayIn(current.school.timeZone) });
    return { flash: { message: `${r.room.name} booked for period ${d.periodNo} on ${formatDate(d.date)}.` } };
  }, { formData: fd, needs: "any", revalidate: [PATH] });
}

export async function cancelBookingAction(id: string): Promise<string | undefined> {
  return actSimple("edit", async ({ tx, current, scope }) => {
    const b = await tx.labBooking.findFirst({ where: { id, archivedAt: null } });
    if (b && !scope.arrange && b.staffId !== scope.staffId) throw new AcademicRuleError("Only the teacher who booked it, or the office, can cancel this booking.");
    const r = await cancelBooking(tx, current.ctx, id);
    return { flash: { message: `Booking of ${r.room.name} cancelled.` } };
  }, { needs: "any", revalidate: [PATH] });
}
