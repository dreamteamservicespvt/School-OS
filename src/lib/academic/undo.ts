// Undo for Academic Management's simple changes (P5): archiving a section or
// a class, assigning a teacher, removing a Time Table period. Each undo checks
// the role again and refuses in a closed year.
import "server-only";

import { registerUndo } from "../undo";
import { withSchool, type Tx } from "../db";
import { requirePermission } from "../permissions";
import { writeAudit } from "../audit";
import type { Current } from "../current";
import { AcademicRuleError } from "./common";
import { academicScope } from "./scope";
import { assertYearWritable } from "./years";
import { undoAssignment } from "./allocation";
import { restorePeriod } from "./timetable";

async function guarded(current: Current, needs: "manage" | "arrange", yearOf: (tx: Tx) => Promise<string | null>, work: (tx: Tx) => Promise<void>) {
  requirePermission(current.permissions, "academic-management", "edit");
  await withSchool(current.ctx, async (tx) => {
    const yearId = await yearOf(tx);
    const scope = await academicScope(tx, current, yearId);
    if (needs === "manage" ? !scope.manage : !scope.arrange) throw new AcademicRuleError("Your role cannot undo this change.");
    if (yearId) await assertYearWritable(tx, yearId);
    await work(tx);
  });
}

registerUndo("academic-section", (current, sectionId) =>
  guarded(current, "manage", async (tx) => (await tx.section.findFirst({ where: { id: sectionId } }))?.academicYearId ?? null, async (tx) => {
    const s = await tx.section.findFirst({ where: { id: sectionId, archivedAt: { not: null } }, include: { schoolClass: true } });
    if (!s || !s.archivedAt) throw new AcademicRuleError("This section is already back.");
    const clash = await tx.section.findFirst({ where: { classId: s.classId, academicYearId: s.academicYearId, name: s.name, archivedAt: null } });
    if (clash) throw new AcademicRuleError(`${s.schoolClass.name} ${s.name} exists again, so it cannot come back.`);
    await tx.teacherAllocation.updateMany({ where: { sectionId, archivedAt: s.archivedAt }, data: { archivedAt: null } });
    await tx.section.update({ where: { id: sectionId }, data: { archivedAt: null } });
    await writeAudit(tx, current.ctx, { action: "undone", recordType: "Section", recordId: sectionId, after: { restored: `${s.schoolClass.name} ${s.name}` } });
  }));

registerUndo("academic-class", (current, key) => {
  const [classId, yearId, time] = key.split(":");
  const at = new Date(Number(time));
  if (!classId || !yearId || Number.isNaN(at.getTime())) throw new AcademicRuleError("This change cannot be undone.");
  return guarded(current, "manage", async () => yearId, async (tx) => {
    const sections = await tx.section.findMany({ where: { classId, academicYearId: yearId, archivedAt: at } });
    const cls = await tx.schoolClass.findFirst({ where: { id: classId } });
    if (!cls) throw new AcademicRuleError("This class was not found.");
    if (cls.archivedAt && cls.archivedAt.getTime() === at.getTime()) await tx.schoolClass.update({ where: { id: classId }, data: { archivedAt: null } });
    await tx.teacherAllocation.updateMany({ where: { sectionId: { in: sections.map((s) => s.id) }, archivedAt: at }, data: { archivedAt: null } });
    await tx.section.updateMany({ where: { id: { in: sections.map((s) => s.id) } }, data: { archivedAt: null } });
    await writeAudit(tx, current.ctx, { action: "undone", recordType: "Class", recordId: classId, after: { sections: sections.length } });
  });
});

registerUndo("academic-assignment", (current, id) =>
  guarded(current, "manage", async (tx) => (await tx.teacherAllocation.findFirst({ where: { id } }))?.academicYearId ?? null, (tx) => undoAssignment(tx, current.ctx, id)));

registerUndo("academic-period", (current, id) =>
  guarded(current, "arrange", async (tx) => {
    const p = await tx.timetablePeriod.findFirst({ where: { id } });
    return p ? (await tx.timetableVersion.findFirst({ where: { id: p.versionId } }))?.academicYearId ?? null : null;
  }, (tx) => restorePeriod(tx, current.ctx, id)));
