import "server-only";

import type { SchoolContext, Tx } from "@/lib/db";

/** "Whole school", each class, and each section, for the Who field. */
export async function whoOptions(tx: Tx, ctx: SchoolContext) {
  const [classes, sections] = await Promise.all([
    tx.schoolClass.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null }, select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }),
    tx.section.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null }, select: { id: true, name: true, classId: true }, orderBy: { name: "asc" } }),
  ]);
  return [
    { value: "school", label: "Whole school", group: "" },
    ...classes.map((c) => ({ value: `class:${c.id}`, label: `Class ${c.name.replace(/^Class\s+/i, "")} (all sections)`, group: "Classes" })),
    ...classes.flatMap((c) => sections.filter((s) => s.classId === c.id).map((s) => ({ value: `section:${s.id}`, label: `${c.name} ${s.name}`, group: "Sections" }))),
  ];
}
