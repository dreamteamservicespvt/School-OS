import "server-only";

import type { SchoolContext, Tx } from "@/lib/db";

/**
 * "Whole school", each class, and each section, for the Who field. campusId: a
 * person limited to one campus chooses among that campus's classes, and
 * "Whole school" means their campus.
 */
export async function whoOptions(tx: Tx, ctx: SchoolContext, campusId?: string | null) {
  const [classes, sections, campus] = await Promise.all([
    tx.schoolClass.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null, ...(campusId ? { campusId } : {}) }, select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }),
    tx.section.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null, ...(campusId ? { schoolClass: { campusId } } : {}) }, select: { id: true, name: true, classId: true }, orderBy: { name: "asc" } }),
    campusId ? tx.campus.findFirst({ where: { id: campusId, schoolId: ctx.schoolId }, select: { name: true } }) : null,
  ]);
  return [
    { value: "school", label: campus ? `All of ${campus.name}` : "Whole school", group: "" },
    ...classes.map((c) => ({ value: `class:${c.id}`, label: `Class ${c.name.replace(/^Class\s+/i, "")} (all sections)`, group: "Classes" })),
    ...classes.flatMap((c) => sections.filter((s) => s.classId === c.id).map((s) => ({ value: `section:${s.id}`, label: `${c.name} ${s.name}`, group: "Sections" }))),
  ];
}
