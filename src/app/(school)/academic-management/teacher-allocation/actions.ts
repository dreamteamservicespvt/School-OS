"use server";

import { z } from "zod";
import { checkbox, parseForm, type FormState } from "@/lib/forms";
import { assignTeacher, endAllocation } from "@/lib/academic/allocation";
import { AcademicRuleError } from "@/lib/academic/common";
import { act, staffInCampus } from "../_lib/server";

const day = (label: string) => z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, `Choose the ${label}.`).transform((v) => new Date(`${v}T00:00:00Z`));

const assignSchema = z.object({
  yearId: z.string().uuid(),
  sectionId: z.string().uuid("Choose a class and section."),
  allSections: checkbox(),
  subjectId: z.string().uuid("Choose a subject."),
  staffId: z.string().uuid("Choose a teacher."),
  role: z.enum(["primary", "secondary"], { errorMap: () => ({ message: "Choose primary or secondary." }) }),
  periodsPerWeek: z.string().trim().refine((v) => v === "" || /^\d+$/.test(v), "Periods per week must be a whole number.").transform((v) => (v === "" ? null : Number(v))),
  fromDate: day("from date"),
  overLimitReason: z.string().trim().max(200, "The reason can be at most 200 characters.").optional().transform((v) => v || null),
});

export async function assignAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(assignSchema, fd);
  if (!parsed.ok) return parsed.state;
  const d = parsed.data;
  return act("create", async ({ tx, current, campus }) => {
    // One campus: the teacher is of the person's campus.
    await staffInCampus(tx, current, d.staffId, "Choose a teacher.", "staffId");
    let sectionIds = [d.sectionId];
    if (d.allSections) {
      const s = await tx.section.findFirst({ where: { id: d.sectionId, academicYearId: d.yearId } });
      if (!s) throw new AcademicRuleError("Choose a class and section.", "sectionId");
      sectionIds = (await tx.section.findMany({ where: { classId: s.classId, academicYearId: d.yearId, archivedAt: null }, select: { id: true } })).map((x) => x.id);
    }
    // The year's campus: its workload limits.
    const campusId = await campus();
    const r = await assignTeacher(tx, current.ctx, { yearId: d.yearId, campusId, sectionIds, subjectId: d.subjectId, staffId: d.staffId, role: d.role, periodsPerWeek: d.periodsPerWeek, fromDate: d.fromDate, overLimitReason: d.overLimitReason });
    return { flash: { message: r.message, undo: r.ids.length === 1 ? { kind: "academic-assignment", id: r.ids[0] } : undefined } };
  }, { formData: fd, yearId: d.yearId });
}

export async function endAllocationAction(_prev: FormState, fd: FormData): Promise<FormState> {
  const parsed = parseForm(z.object({ allocationId: z.string().uuid(), from: day("date it ends from") }), fd);
  if (!parsed.ok) return parsed.state;
  const { allocationId, from } = parsed.data;
  return act("edit", async ({ tx, current }) => {
    const words = await endAllocation(tx, current.ctx, allocationId, from);
    return { flash: { message: `${words}: the assignment ends. History is kept.` } };
  }, { formData: fd, yearOf: async (tx) => (await tx.teacherAllocation.findFirst({ where: { id: allocationId } }))?.academicYearId ?? null, notFound: "This assignment was not found." });
}
