"use server";

import { z } from "zod";
import { checkbox, parseForm, type FormState } from "@/lib/forms";
import { formatDate } from "@/lib/format";
import { TIME_RE, AcademicRuleError, plural } from "@/lib/academic/common";
import { closeYear, createYear, openYear, removeYear, updateYear } from "@/lib/academic/lifecycle";
import { archiveSlot, mainCampusId, saveAcademicSettings, saveSlot } from "@/lib/academic/settings";
import { addCondition, addFinancialYear, archiveCondition, archiveTerm, savePreference, saveTerm, setFeature } from "@/lib/academic/rules";
import { addRoom, archiveRoom } from "@/lib/academic/rooms";
import { ACADEMIC_FEATURES, type AcademicFeature } from "@/lib/academic/scope";
import { act, actSimple } from "../_lib/server";

const PATH = "/academic-management";
const uuid = (m: string) => z.string().uuid(m);
const day = (label: string) => z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, `Choose the ${label}.`).transform((v) => new Date(`${v}T00:00:00Z`));
const optionalInt = (label: string, min: number, max: number) => z.string().trim().optional()
  .refine((v) => !v || /^\d+$/.test(v), `${label} must be a whole number.`)
  .transform((v) => (v ? Number(v) : null))
  .refine((n) => n === null || (n >= min && n <= max), `${label} must be between ${min} and ${max}.`);
const int = (label: string, min: number, max: number) => z.string().trim().min(1, `${label} is needed.`).regex(/^\d+$/, `${label} must be a whole number.`).transform(Number).refine((n) => n >= min && n <= max, `${label} must be between ${min} and ${max}.`);
const days = (fd: FormData, name: string) => fd.getAll(name).map(Number).filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);

// ---------------------------------------------------------------- academic years

const yearSchema = z.object({
  name: z.string().trim().min(1, "Year name is needed, like 2027-28.").max(40, "The name can be at most 40 characters."),
  startDate: day("start date"), endDate: day("end date"),
  copyFrom: z.string().trim().optional().transform((v) => v || null),
  termPreset: z.string().trim().optional().transform((v) => v || null),
});

export async function createYearAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(yearSchema, fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  return act("create", async ({ tx, current }) => {
    const campusId = await mainCampusId(tx, current.ctx);
    const r = await createYear(tx, current.ctx, { campusId, name: d.name, startDate: d.startDate, endDate: d.endDate, copyFromYearId: d.copyFrom, termPreset: d.termPreset });
    return { flash: { message: `${r.message} It is Upcoming until you open it.`, link: { href: `${PATH}?year=${r.year.id}`, label: `See ${r.year.name}` } } };
  }, { formData: fd });
}

export async function updateYearAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(yearSchema.extend({ yearId: uuid("This year was not found.") }), fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  return act("edit", async ({ tx, current }) => {
    const y = await updateYear(tx, current.ctx, d.yearId, d);
    return { flash: { message: `${y.name} saved: ${formatDate(y.startDate)} to ${formatDate(y.endDate)}.` } };
  }, { formData: fd });
}

export async function openYearAction(yearId: string, oldYear: "close" | "keep"): Promise<string | undefined> {
  if (oldYear !== "close" && oldYear !== "keep") return "Choose what happens to the current year.";
  return actSimple("edit", async ({ tx, current }) => {
    const r = await openYear(tx, current.ctx, yearId, oldYear);
    return { flash: { message: `${r.year.name} is now the active year.${r.previous ? ` ${r.previous.name} is ${oldYear === "close" ? "closed and read-only" : "kept open for late changes"}.` : ""}` } };
  });
}

export async function closeYearAction(yearId: string): Promise<string | undefined> {
  return actSimple("edit", async ({ tx, current }) => {
    const y = await closeYear(tx, current.ctx, yearId);
    return { flash: { message: `${y.name} is closed. It is read-only now; corrections need a reason and are logged.` } };
  });
}

export async function removeYearAction(yearId: string): Promise<string | undefined> {
  return actSimple("archive", async ({ tx, current }) => {
    const r = await removeYear(tx, current.ctx, yearId);
    return { flash: { message: `${r.year.name} removed with ${plural(r.counts.sections, "section")} and ${plural(r.counts.terms, "term")}.` } };
  });
}

// ---------------------------------------------------------------- terms and financial years

const termSchema = z.object({ yearId: uuid("Choose the year."), id: z.string().trim().optional().transform((v) => v || undefined), name: z.string().trim().min(1, "Give the term a name, like Term 1.").max(40, "The name can be at most 40 characters."), startDate: day("start date"), endDate: day("end date") });

export async function saveTermAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(termSchema, fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  return act(d.id ? "edit" : "create", async ({ tx, current }) => {
    const r = await saveTerm(tx, current.ctx, { academicYearId: d.yearId, name: d.name, startDate: d.startDate, endDate: d.endDate }, d.id);
    return { flash: { message: `${r.name} saved.${r.warning ? ` Note: ${r.warning}` : ""}`, tone: r.warning ? "info" : "success" } };
  }, { formData: fd, yearId: d.yearId });
}

export async function archiveTermAction(id: string): Promise<string | undefined> {
  return actSimple("archive", async ({ tx, current }) => {
    const t = await archiveTerm(tx, current.ctx, id);
    return { flash: { message: `${t.name} removed.` } };
  }, { yearOf: async (tx) => (await tx.term.findFirst({ where: { id } }))?.academicYearId ?? null });
}

export async function addFinancialYearAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(z.object({ name: z.string().trim().min(1, "Give a name, like FY 2027-28.").max(40), startDate: day("start date"), endDate: day("end date") }), fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  return act("create", async ({ tx, current }) => {
    const r = await addFinancialYear(tx, current.ctx, d);
    return { flash: { message: `${r.name} added.` } };
  }, { formData: fd });
}

// ---------------------------------------------------------------- timings, limits, substitution rule

export async function saveTimingsAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(z.object({
    dayStart: z.string().trim().regex(TIME_RE, "Give the start time like 08:30."),
    dayEnd: z.string().trim().regex(TIME_RE, "Give the end time like 15:00."),
    halfDayEnd: z.string().trim().optional().refine((v) => !v || TIME_RE.test(v), "Give the time like 12:30.").transform((v) => v || null),
    maxPeriodsPerDay: int("Periods a day", 1, 12),
    maxPeriodsPerWeek: int("Periods a week", 1, 72),
    maxConsecutive: int("Periods in a row", 1, 12),
    autoSubstitutions: checkbox(),
  }), fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const workingDays = days(fd, "workingDays");
  const halfDays = days(fd, "halfDays");
  if (workingDays.length === 0) return { ok: false, message: "Choose at least one working day.", errors: { workingDays: "Choose at least one working day." } };
  return act("edit", async ({ tx, current }) => {
    const campusId = await mainCampusId(tx, current.ctx);
    await saveAcademicSettings(tx, current.ctx, campusId, { ...d, workingDays, halfDays });
    return { flash: { message: "School timings and Time Table rules saved." } };
  }, { formData: fd });
}

const slotSchema = z.object({
  id: z.string().trim().optional().transform((v) => v || undefined),
  label: z.string().trim().min(1, "Give the period a name, like Period 1 or Lunch.").max(40, "The name can be at most 40 characters."),
  number: z.string().trim().optional().transform((v) => (v ? Number(v) : 0)).refine((n) => Number.isInteger(n) && n >= 0 && n <= 20, "The period number must be between 1 and 20."),
  startTime: z.string().trim().regex(TIME_RE, "Give the start time like 08:45."),
  endTime: z.string().trim().regex(TIME_RE, "Give the end time like 09:25."),
  isBreak: checkbox(),
});

export async function saveSlotAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(slotSchema, fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const slotDays = days(fd, "days");
  if (!d.isBreak && d.number < 1) return { ok: false, message: "Give the period number, like 1.", errors: { number: "Give the period number, like 1." } };
  return act(d.id ? "edit" : "create", async ({ tx, current }) => {
    const campusId = await mainCampusId(tx, current.ctx);
    const row = await saveSlot(tx, current.ctx, campusId, { label: d.label, number: d.number, startTime: d.startTime, endTime: d.endTime, isBreak: d.isBreak, days: slotDays }, d.id);
    return { flash: { message: `${row.label} saved.` } };
  }, { formData: fd, revalidate: [PATH] });
}

export async function archiveSlotAction(id: string): Promise<string | undefined> {
  return actSimple("archive", async ({ tx, current }) => {
    const s = await archiveSlot(tx, current.ctx, id);
    return { flash: { message: `${s.label} removed from the period master. Time Tables keep the periods already placed.` } };
  });
}

// ---------------------------------------------------------------- teacher preferences, subject conditions

export async function savePreferenceAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(z.object({ staffId: uuid("Choose a teacher."), maxPerDay: optionalInt("Periods a day", 1, 12), maxPerWeek: optionalInt("Periods a week", 1, 72), note: z.string().trim().max(200).optional().transform((v) => v || null) }), fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  const unavailable = fd.getAll("unavailable").map(String).filter((u) => /^[1-7]:-?\d{1,2}$/.test(u));
  return act("edit", async ({ tx, current }) => {
    const s = await savePreference(tx, current.ctx, d.staffId, { maxPerDay: d.maxPerDay, maxPerWeek: d.maxPerWeek, unavailable, note: d.note });
    return { flash: { message: `${s.fullName}'s preferences saved. They are used when making the Time Table automatically.` } };
  }, { formData: fd });
}

export async function addConditionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(z.object({
    subjectId: uuid("Choose a subject."),
    classId: z.string().trim().optional().transform((v) => v || null),
    dayOfWeek: z.string().trim().optional().transform((v) => (v ? Number(v) : null)).refine((n) => n === null || (n >= 1 && n <= 7), "Choose a day."),
    periodNo: int("Period", 1, 20),
  }), fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  return act("create", async ({ tx, current }) => {
    const r = await addCondition(tx, current.ctx, d);
    return { flash: { message: `Added: ${r.words}.` } };
  }, { formData: fd });
}

export async function archiveConditionAction(id: string): Promise<string | undefined> {
  return actSimple("archive", async ({ tx, current }) => {
    await archiveCondition(tx, current.ctx, id);
    return { flash: { message: "Condition removed." } };
  });
}

// ---------------------------------------------------------------- optional parts and rooms

export async function setFeatureAction(key: string, on: boolean): Promise<string | undefined> {
  if (!ACADEMIC_FEATURES.some((f) => f.key === key)) return "That option was not found.";
  return actSimple("edit", async ({ tx, current }) => {
    const f = await setFeature(tx, current.ctx, key as AcademicFeature, on);
    return { flash: { message: `${f.label} switched ${on ? "on" : "off"}.` } };
  }, { revalidate: ["/"] });
}

export async function addRoomAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(z.object({ name: z.string().trim().min(1, "Give the room a name, like Lab 1.").max(40, "The name can be at most 40 characters."), kind: z.enum(["classroom", "lab", "activity"], { errorMap: () => ({ message: "Choose the kind of room." }) }), capacity: optionalInt("Capacity", 1, 2000) }), fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  return act("create", async ({ tx, current }) => {
    if (!current.features.has("academic-rooms")) throw new AcademicRuleError("Switch on Rooms and lab bookings first.");
    const campusId = await mainCampusId(tx, current.ctx);
    const r = await addRoom(tx, current.ctx, campusId, d);
    return { flash: { message: `${r.name} added.` } };
  }, { formData: fd });
}

export async function archiveRoomAction(id: string): Promise<string | undefined> {
  return actSimple("archive", async ({ tx, current }) => {
    const r = await archiveRoom(tx, current.ctx, id);
    return { flash: { message: `${r.name} removed. Bookings already made stay in the history.` } };
  });
}
