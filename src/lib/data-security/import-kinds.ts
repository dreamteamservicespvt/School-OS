// Import kinds that belong to Settings itself. Modules add their own
// (students, staff, fee dues...) with defineImport in their own files, listed
// in src/lib/import-registry.ts.
import "server-only";

import { defineImport } from "../importer";
import { writeAudit } from "../audit";

/** Departments, for a school switching to School OS (workflow 15). */
defineImport<{ name: string; headStaffId: string | null }>({
  key: "departments",
  label: "Departments",
  columns: [
    { key: "name", label: "Department", required: true, example: "Mathematics", aliases: ["department name", "name"] },
    { key: "head", label: "Head of department (staff ID)", example: "SPS-T-024", aliases: ["head", "hod", "head staff id"], help: "Optional. The staff ID of the head." },
  ],
  async check(tx, _ctx, row, seen) {
    const problems: string[] = [];
    const name = row.name.replace(/\s+/g, " ").trim();
    if (name.length > 80) problems.push("Department can be at most 80 characters.");
    if (seen.has(name.toLowerCase())) problems.push(`${name} appears twice in the file.`);
    seen.add(name.toLowerCase());
    let headStaffId: string | null = null;
    if (row.head) {
      const head = await tx.staff.findFirst({ where: { staffCode: { equals: row.head.trim(), mode: "insensitive" }, archivedAt: null }, select: { id: true } });
      if (!head) problems.push(`No staff member has the staff ID ${row.head}.`);
      else headStaffId = head.id;
    }
    return problems.length ? { ok: false, problems } : { ok: true, value: { name, headStaffId } };
  },
  async save(tx, ctx, v) {
    const existing = await tx.department.findFirst({ where: { name: { equals: v.name, mode: "insensitive" } } });
    if (existing) {
      await tx.department.update({ where: { id: existing.id }, data: { headStaffId: v.headStaffId ?? existing.headStaffId, archivedAt: null } });
      return { id: existing.id, created: false };
    }
    const row = await tx.department.create({ data: { schoolId: ctx.schoolId, name: v.name, headStaffId: v.headStaffId } });
    return { id: row.id, created: true };
  },
  async undo(tx, ctx, ids) {
    const inUse = await tx.staff.groupBy({ by: ["departmentId"], where: { departmentId: { in: ids } }, _count: true });
    const keep = new Set(inUse.map((r) => r.departmentId));
    const archive = ids.filter((id) => !keep.has(id));
    await tx.department.updateMany({ where: { id: { in: archive } }, data: { archivedAt: new Date() } });
    await writeAudit(tx, ctx, { action: "archived", recordType: "Department", recordId: null, after: { archived: archive.length, keptBecauseStaffUseThem: keep.size } });
  },
});
