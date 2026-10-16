"use server";

import { z } from "zod";
import type { SubjectType } from "@prisma/client";
import { checkbox, optionalDate, parseForm, type FormState } from "@/lib/forms";
import { addSubject, archiveSubject, copySubjectMap, endMap, mapSubject, recordChoices, removeChoice, reopenMap, saveElectiveOption, updateMap, updateSubject } from "@/lib/academic/subjects";
import { AcademicRuleError, todayIn } from "@/lib/academic/common";
import { writeAudit } from "@/lib/audit";
import { act, actSimple } from "../_lib/server";

const TYPES = ["CORE", "OPTIONAL", "ELECTIVE", "LANGUAGE"] as const;
const ppw = z.string().trim().transform((v) => (v === "" ? "0" : v)).refine((v) => /^\d+$/.test(v), "Periods per week must be a whole number.").transform(Number).refine((n) => n >= 0 && n <= 30, "Periods per week must be between 0 and 30.");

const subjectSchema = z.object({
  name: z.string().trim().min(1, "Subject name is needed.").max(80, "Subject name can be at most 80 characters."),
  code: z.string().trim().max(10, "Code can be at most 10 characters.").regex(/^[A-Za-z0-9-]*$/, "Code can have only letters, numbers and dashes."),
  type: z.enum(TYPES, { errorMap: () => ({ message: "Choose a type." }) }),
  gradeOnly: checkbox(),
  periodsPerWeek: ppw,
  fromDate: optionalDate("From date"),
});

export async function addSubjectAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(subjectSchema, fd);
  if (!parsed.ok) return parsed.state;
  const classIds = fd.getAll("classIds").map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  const d = parsed.data;
  return act("create", async ({ tx, current }) => {
    const s = await addSubject(tx, current.ctx, { name: d.name, code: d.code || null, type: d.type as SubjectType, gradeOnly: d.gradeOnly, classIds, periodsPerWeek: d.periodsPerWeek, fromDate: d.fromDate });
    return { flash: { message: `${s.name} (${s.code}) added${classIds.length ? ` to ${classIds.length} ${classIds.length === 1 ? "class" : "classes"}` : ""}.` } };
  }, { formData: fd });
}

export async function updateSubjectAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(subjectSchema.extend({ id: z.string().uuid(), code: z.string().trim().min(1, "Code is needed.").max(10, "Code can be at most 10 characters.").regex(/^[A-Za-z0-9-]+$/, "Code can have only letters, numbers and dashes.") }), fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  return act("edit", async ({ tx, current }) => {
    const s = await updateSubject(tx, current.ctx, d.id, { name: d.name, code: d.code, type: d.type as SubjectType, gradeOnly: d.gradeOnly });
    return { flash: { message: `${s.name} saved.` } };
  }, { formData: fd });
}

export async function archiveSubjectAction(id: string): Promise<string | undefined> {
  return actSimple("archive", async ({ tx, current }) => {
    const s = await archiveSubject(tx, current.ctx, id, todayIn(current.school.timeZone));
    return { flash: { message: `${s.name} archived. Past marks and homework stay linked to it.` } };
  });
}

export async function restoreSubjectAction(id: string): Promise<string | undefined> {
  return actSimple("edit", async ({ tx, current }) => {
    const s = await tx.subject.findFirst({ where: { id, archivedAt: { not: null } } });
    if (!s) throw new AcademicRuleError("This subject is not archived.");
    await tx.subject.update({ where: { id }, data: { archivedAt: null } });
    await writeAudit(tx, current.ctx, { action: "restored", recordType: "Subject", recordId: id });
    return { flash: { message: `${s.name} restored. Map it to classes again in By class.` } };
  });
}

const mapSchema = z.object({
  subjectId: z.string().uuid("Choose a subject."),
  classId: z.string().uuid("Choose a class."),
  periodsPerWeek: ppw,
  fromDate: optionalDate("From date"),
});

export async function mapSubjectAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(mapSchema, fd);
  if (!parsed.ok) return parsed.state;
  return act("create", async ({ tx, current }) => {
    const r = await mapSubject(tx, current.ctx, parsed.data);
    return { flash: { message: `${r.label} from ${parsed.data.fromDate ? "the date given" : "now"}.` } };
  }, { formData: fd });
}

export async function updateMapAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(z.object({ mapId: z.string().uuid(), periodsPerWeek: ppw }), fd);
  if (!parsed.ok) return parsed.state;
  return act("edit", async ({ tx, current }) => {
    const label = await updateMap(tx, current.ctx, parsed.data.mapId, { periodsPerWeek: parsed.data.periodsPerWeek });
    return { flash: { message: `${label}: ${parsed.data.periodsPerWeek} periods a week.` } };
  }, { formData: fd });
}

export async function endMapAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(z.object({ mapId: z.string().uuid(), endsFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Choose the date it stops.").transform((s) => new Date(`${s}T00:00:00Z`)) }), fd);
  if (!parsed.ok) return parsed.state;
  return act("edit", async ({ tx, current }) => {
    const words = await endMap(tx, current.ctx, parsed.data.mapId, parsed.data.endsFrom);
    return { flash: { message: `${words}. Past marks and homework stay linked.` } };
  }, { formData: fd });
}

export async function reopenMapAction(mapId: string): Promise<string | undefined> {
  return actSimple("edit", async ({ tx, current }) => {
    const words = await reopenMap(tx, current.ctx, mapId);
    return { flash: { message: `${words}.` } };
  });
}

export async function copyMapAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const fromClassId = String(fd.get("fromClassId") ?? "");
  const to = fd.getAll("toClassIds").map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  if (to.length === 0) return { ok: false, message: "Tick at least one class to copy to.", errors: { toClassIds: "Tick at least one class to copy to." } };
  return act("create", async ({ tx, current }) => {
    const words = await copySubjectMap(tx, current.ctx, fromClassId, to, todayIn(current.school.timeZone));
    return { flash: { message: words } };
  }, { formData: fd });
}

const optionSchema = z.object({
  id: z.string().optional(),
  yearId: z.string().uuid(),
  classId: z.string().uuid("Choose a class."),
  subjectId: z.string().uuid("Choose a subject."),
  groupName: z.string().trim().min(1, "Name the choice, like Second language.").max(60, "The name can be at most 60 characters."),
  seats: z.string().trim().refine((v) => v === "" || /^\d+$/.test(v), "Seats must be a whole number, or empty for no limit.").transform((v) => (v === "" ? null : Number(v))),
  prerequisite: z.string().trim().max(200, "The prerequisite can be at most 200 characters.").transform((v) => v || null),
});

export async function saveOptionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(optionSchema, fd);
  if (!parsed.ok) return parsed.state;
  const { id, yearId, ...rest } = parsed.data;
  return act(id ? "edit" : "create", async ({ tx, current }) => {
    await saveElectiveOption(tx, current.ctx, { academicYearId: yearId, ...rest }, id || undefined);
    return { flash: { message: `${rest.groupName} choice saved.` } };
  }, { formData: fd, yearId });
}

export async function recordChoicesAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const optionId = String(fd.get("optionId") ?? "");
  const students = fd.getAll("studentIds").map(String).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
  if (!/^[0-9a-f-]{36}$/i.test(optionId)) return { ok: false, message: "Choose the subject they chose.", errors: { optionId: "Choose the subject they chose." } };
  if (students.length === 0) return { ok: false, message: "Tick at least one student.", errors: { studentIds: "Tick at least one student." } };
  return act("edit", async ({ tx, current }) => {
    const r = await recordChoices(tx, current.ctx, optionId, students);
    return { flash: { message: `${r.subject} recorded for ${r.added} ${r.added === 1 ? "student" : "students"}.` } };
  }, { formData: fd, yearOf: async (tx) => (await tx.electiveOption.findFirst({ where: { id: optionId } }))?.academicYearId ?? null });
}

export async function removeChoiceAction(choiceId: string): Promise<string | undefined> {
  return actSimple("edit", async ({ tx, current }) => {
    await removeChoice(tx, current.ctx, choiceId);
    return { flash: { message: "Choice removed." } };
  }, { yearOf: async (tx) => (await tx.electiveChoice.findFirst({ where: { id: choiceId } }))?.academicYearId ?? null });
}
