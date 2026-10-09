"use server";

import { z } from "zod";
import { parseForm, type FormState } from "@/lib/forms";
import { writeAudit } from "@/lib/audit";
import { addClass, addClasses, addSection, addStream, archiveClass, archiveSection, archiveStream, reorderClasses, updateClass, updateSection } from "@/lib/academic/structure";
import { mainCampusId } from "@/lib/academic/settings";
import { AcademicRuleError, parseClassNames, parseSectionNames, plural } from "@/lib/academic/common";
import { act, actSimple } from "./_lib/server";

const id = (label: string) => z.string().uuid(label);
const optionalId = z.string().trim().transform((v) => (v === "" ? null : v)).refine((v) => v === null || /^[0-9a-f-]{36}$/i.test(v), "Choose from the list.");
const seats = (label = "Seats") => z.string().trim().transform((v) => (v === "" ? "40" : v)).refine((v) => /^\d+$/.test(v), `${label} must be a whole number.`).transform(Number).refine((n) => n >= 1 && n <= 500, `${label} must be between 1 and 500.`);

const classSchema = z.object({
  yearId: id("Choose the year."),
  name: z.string().trim().min(1, "Class name is needed.").max(60, "Class name can be at most 60 characters."),
  position: z.string().trim().default("end"),
  level: z.string().trim().max(40).transform((v) => v || null),
  sections: z.string().trim().transform((v) => parseSectionNames(v || "A")).refine((l) => l.length > 0 && l.length <= 26, "Give between 1 and 26 sections, like A, B, C."),
  seats: seats("Seats per section"),
  board: z.string().trim().max(60).optional().transform((v) => v || null),
});

export async function addClassAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(classSchema, fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  return act("create", async ({ tx, current }) => {
    const campusId = await mainCampusId(tx, current.ctx);
    let sortOrder: number | null = null;
    if (d.position === "start") sortOrder = 1;
    else if (d.position !== "end") {
      const after = await tx.schoolClass.findFirst({ where: { id: d.position, archivedAt: null } });
      if (after) sortOrder = after.sortOrder + 1;
    }
    const r = await addClass(tx, current.ctx, { campusId, yearId: d.yearId, name: d.name, sortOrder, level: d.level, sectionNames: d.sections, seats: d.seats, board: d.board });
    return { flash: { message: `${r.cls.name} added with ${plural(r.sections.length, "section")} (${r.sections.join(", ")}).` } };
  }, { formData: fd, yearId: d.yearId });
}

const classesSchema = z.object({
  yearId: id("Choose the year."),
  names: z.string().trim().min(1, "Type the class names, one per line or like Class 1 to Class 10.").transform(parseClassNames).refine((l) => l.length > 0 && l.length <= 40, "Give between 1 and 40 class names."),
  sections: z.string().trim().transform((v) => parseSectionNames(v || "A")).refine((l) => l.length > 0 && l.length <= 26, "Give between 1 and 26 sections, like A, B."),
  seats: seats("Seats per section"),
});

export async function addClassesAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(classesSchema, fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  return act("create", async ({ tx, current }) => {
    const campusId = await mainCampusId(tx, current.ctx);
    const r = await addClasses(tx, current.ctx, { campusId, yearId: d.yearId, names: d.names, sectionNames: d.sections, seats: d.seats });
    if (r.classes === 0) throw new AcademicRuleError(`All of these classes already exist in this year: ${r.skipped.join(", ")}.`, "names");
    return { flash: { message: `Added ${plural(r.classes, "class", "classes")} and ${plural(r.sections, "section")}.${r.skipped.length ? ` Already there: ${r.skipped.join(", ")}.` : ""}` } };
  }, { formData: fd, yearId: d.yearId });
}

const editClassSchema = z.object({
  classId: id("This class was not found."),
  yearId: id("Choose the year."),
  name: z.string().trim().min(1, "Class name is needed.").max(60, "Class name can be at most 60 characters."),
  level: z.string().trim().max(40).transform((v) => v || null),
  board: z.string().trim().max(60).optional().transform((v) => v || null),
});

export async function updateClassAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(editClassSchema, fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  return act("edit", async ({ tx, current }) => {
    const r = await updateClass(tx, current.ctx, d.classId, { name: d.name, level: d.level, board: d.board });
    // The class board sets grading and report cards in Examination & Results (04 §5): applies to exams not yet created.
    return { flash: { message: r.boardChanged ? `${r.cls.name} saved. The new board applies to exams not yet created; past marks keep their old grading.` : `${r.cls.name} saved.`, tone: r.boardChanged ? "info" : "success" } };
  }, { formData: fd, yearId: d.yearId });
}

export async function reorderClassesAction(yearId: string, ids: string[]): Promise<string | undefined> {
  if (!Array.isArray(ids) || ids.some((x) => typeof x !== "string")) return "That order could not be read.";
  return actSimple("edit", async ({ tx, current }) => {
    const campusId = await mainCampusId(tx, current.ctx);
    await reorderClasses(tx, current.ctx, campusId, ids.slice(0, 200));
  }, { yearId });
}

const sectionSchema = z.object({
  sectionId: z.string().optional(),
  classId: z.string().optional(),
  yearId: id("Choose the year."),
  name: z.string().trim().max(30, "Section name can be at most 30 characters."),
  seats: seats(),
  classTeacherId: optionalId,
  streamId: optionalId.optional().transform((v) => v ?? null),
  room: z.string().trim().max(40, "Room can be at most 40 characters.").transform((v) => v || null),
});

export async function saveSectionAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(sectionSchema, fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  if (d.sectionId) {
    return act("edit", async ({ tx, current }) => {
      if (!d.name) throw new AcademicRuleError("Section name is needed.", "name");
      const r = await updateSection(tx, current.ctx, d.sectionId!, { name: d.name, seats: d.seats, classTeacherId: d.classTeacherId, streamId: d.streamId, room: d.room });
      return { flash: { message: r.warning ? `${r.label} saved. ${r.warning}` : `${r.label} saved.`, tone: r.warning ? "info" : "success" } };
    }, { formData: fd, yearOf: async (tx) => (await tx.section.findFirst({ where: { id: d.sectionId! } }))?.academicYearId ?? d.yearId });
  }
  return act("create", async ({ tx, current }) => {
    if (!d.classId) throw new AcademicRuleError("Choose the class.");
    const r = await addSection(tx, current.ctx, d.classId, d.yearId, { name: d.name, seats: d.seats, classTeacherId: d.classTeacherId, streamId: d.streamId, room: d.room });
    return { flash: { message: `${r.label} added.` } };
  }, { formData: fd, yearId: d.yearId });
}

export async function archiveSectionAction(sectionId: string): Promise<string | undefined> {
  return actSimple("archive", async ({ tx, current }) => {
    const r = await archiveSection(tx, current.ctx, sectionId);
    return { flash: { message: `${r.label} archived.`, undo: { kind: "academic-section", id: sectionId } } };
  }, { yearOf: async (tx) => (await tx.section.findFirst({ where: { id: sectionId } }))?.academicYearId ?? null });
}

export async function restoreSectionAction(sectionId: string): Promise<string | undefined> {
  return actSimple("edit", async ({ tx, current }) => {
    const s = await tx.section.findFirst({ where: { id: sectionId, archivedAt: { not: null } }, include: { schoolClass: true } });
    if (!s) throw new AcademicRuleError("This section is not archived.");
    const clash = await tx.section.findFirst({ where: { classId: s.classId, academicYearId: s.academicYearId, name: s.name, archivedAt: null } });
    if (clash) throw new AcademicRuleError(`${s.schoolClass.name} ${s.name} already exists again.`);
    await tx.section.update({ where: { id: s.id }, data: { archivedAt: null } });
    if (s.schoolClass.archivedAt) await tx.schoolClass.update({ where: { id: s.classId }, data: { archivedAt: null } });
    await writeAudit(tx, current.ctx, { action: "restored", recordType: "Section", recordId: s.id });
    return { flash: { message: `${s.schoolClass.name} ${s.name} restored.` } };
  }, { yearOf: async (tx) => (await tx.section.findFirst({ where: { id: sectionId } }))?.academicYearId ?? null });
}

export async function archiveClassAction(classId: string, yearId: string): Promise<string | undefined> {
  return actSimple("archive", async ({ tx, current }) => {
    const r = await archiveClass(tx, current.ctx, classId, yearId);
    return { flash: { message: `${r.cls.name} archived with ${plural(r.sectionIds.length, "section")}.`, undo: { kind: "academic-class", id: `${classId}:${yearId}:${r.at.getTime()}` } } };
  }, { yearId });
}

export async function addStreamAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(z.object({ name: z.string().trim().min(1, "Stream name is needed.").max(40, "Stream name can be at most 40 characters.") }), fd);
  if (!parsed.ok) return parsed.state;
  return act("create", async ({ tx, current }) => {
    const campusId = await mainCampusId(tx, current.ctx);
    const s = await addStream(tx, current.ctx, campusId, parsed.data.name);
    return { flash: { message: `${s.name} stream added.` } };
  }, { formData: fd });
}

export async function archiveStreamAction(streamId: string): Promise<string | undefined> {
  return actSimple("archive", async ({ tx, current }) => {
    const s = await archiveStream(tx, current.ctx, streamId);
    return { flash: { message: `${s.name} stream archived.` } };
  });
}
