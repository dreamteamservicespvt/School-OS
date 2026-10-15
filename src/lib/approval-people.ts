// Who is asking, and about whom (owner's prototype changes of 13 Oct 2026,
// other.jsx ApprovalWho and ApprovalSheet): every request shows the asker's
// job ("Teacher, Science · Class teacher, Class 5 A") and reason, the same way
// on Approvals, the request page and the home screens, and links to the
// staff or student profile the request is about, when the viewer may open it.
import "server-only";

import type { Tx } from "./db";
import type { PermissionMap } from "./permissions";
import { reachFor } from "./permissions";

/** The asker's job in a few words, from their staff record (else their roles), by login. */
export async function askerJobs(tx: Tx, userIds: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const staff = await tx.staff.findMany({ where: { userLoginId: { in: ids }, archivedAt: null }, select: { id: true, userLoginId: true, designation: true, departmentId: true } });
  const [depts, sections, access] = await Promise.all([
    tx.department.findMany({ where: { id: { in: staff.map((s) => s.departmentId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } }),
    tx.section.findMany({
      where: { classTeacherId: { in: staff.map((s) => s.id) }, archivedAt: null, academicYear: { status: "ACTIVE", archivedAt: null } },
      select: { classTeacherId: true, name: true, schoolClass: { select: { name: true } } },
    }),
    tx.schoolAccess.findMany({ where: { userLoginId: { in: ids }, archivedAt: null }, select: { userLoginId: true, roles: { select: { role: { select: { name: true } } } } } }),
  ]);
  const dept = new Map(depts.map((d) => [d.id, d.name]));
  for (const s of staff) {
    if (!s.userLoginId) continue;
    const d = s.departmentId ? dept.get(s.departmentId) : null;
    const classes = sections.filter((x) => x.classTeacherId === s.id).map((x) => `${x.schoolClass.name} ${x.name}`);
    const job = [s.designation, d && !s.designation.toLowerCase().includes(d.toLowerCase()) ? d : null].filter(Boolean).join(", ");
    out.set(s.userLoginId, [job, classes.length ? `Class teacher, ${classes.join(" and ")}` : null].filter(Boolean).join(" · "));
  }
  for (const a of access) {
    if (out.has(a.userLoginId)) continue;
    const names = a.roles.map((r) => r.role.name);
    if (names.length) out.set(a.userLoginId, names.join(", "));
  }
  return out;
}

export type ProfileLink = { kind: "staff" | "student"; href: string; label: string };

/** Records whose request is about one student or one staff member. */
async function subjectOf(tx: Tx, recordType: string, recordId: string): Promise<{ studentId?: string | null; staffId?: string | null } | null> {
  const id = recordId;
  switch (recordType) {
    case "Leave Request": return tx.leaveRequest.findUnique({ where: { id }, select: { studentId: true, staffId: true } });
    case "Concession": return tx.concession.findUnique({ where: { id }, select: { studentId: true } });
    case "Refund": return tx.refund.findUnique({ where: { id }, select: { studentId: true } });
    case "Payment": return tx.payment.findUnique({ where: { id }, select: { studentId: true } });
    case "Certificate": return tx.certificate.findUnique({ where: { id }, select: { studentId: true } });
    case "Clearance Check": {
      const c = await tx.studentClearanceCheck.findUnique({ where: { id }, select: { request: { select: { studentId: true } } } });
      return c ? { studentId: c.request.studentId } : null;
    }
    case "Student": return { studentId: id };
    case "Exit Case": return tx.exitCase.findUnique({ where: { id }, select: { staffId: true } });
    case "Salary Advance": return tx.salaryAdvance.findUnique({ where: { id }, select: { staffId: true } });
    default: return null;
  }
}

/**
 * Profile links for one request: the asker's staff profile, and the student
 * or staff member it is about, each only when the viewer's role may open that
 * module (checked again on the profile page itself).
 */
export async function profileLinks(tx: Tx, permissions: PermissionMap, a: { askedById: string; recordType: string; recordId: string }): Promise<ProfileLink[]> {
  const seesStaff = reachFor(permissions, "staff-hr-management", "view") === "all";
  const seesStudents = reachFor(permissions, "student-management", "view") !== "none";
  const links: ProfileLink[] = [];
  const asker = seesStaff ? await tx.staff.findFirst({ where: { userLoginId: a.askedById, archivedAt: null }, select: { id: true, firstName: true } }) : null;
  if (asker) links.push({ kind: "staff", href: `/staff-hr-management/${asker.id}`, label: `Open ${asker.firstName}’s profile` });
  const about = await subjectOf(tx, a.recordType, a.recordId).catch(() => null);
  if (about?.studentId && seesStudents) {
    const s = await tx.student.findFirst({ where: { id: about.studentId }, select: { id: true, firstName: true } });
    if (s) links.push({ kind: "student", href: `/student-management/students/${s.id}`, label: `Open ${s.firstName}’s profile` });
  }
  if (about?.staffId && seesStaff && about.staffId !== asker?.id) {
    const s = await tx.staff.findFirst({ where: { id: about.staffId }, select: { id: true, firstName: true } });
    if (s) links.push({ kind: "staff", href: `/staff-hr-management/${s.id}`, label: `Open ${s.firstName}’s profile` });
  }
  return links;
}
