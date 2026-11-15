import "server-only";

import type { Notice } from "@prisma/client";
import { withSchool } from "@/lib/db";
import type { CommAccess } from "@/lib/communication/access";
import { yearsFor } from "@/lib/academic/years";
import { readAudience, needsApproval, DEFAULT_EXPIRY_DAYS } from "@/lib/communication/notices";
import { utcToLocal } from "@/lib/communication/time";
import { formatDate } from "@/lib/format";
import type { NoticeFormData } from "./notice-form";

const noAudience = { parents: false, students: false, staff: false, roleKeys: [], classIds: [], sectionIds: [], campusIds: [] };

/** "Student" is a login kind, not a staff job: it is never offered under Staff roles (layman loop 4). */
const NOT_STAFF = new Set(["student"]);
/** "All teachers": subject teachers and class teachers together. */
const TEACHER_KEYS = ["teacher", "class-teacher"];

/**
 * `start`: who a new notice is for at first ("staff", "teachers" or "parents", from the page address).
 * Without it, a person who may write to staff starts with nothing ticked and picks (layman loop 4:
 * "Send a notice" for teachers opened on Parents); others start on Parents, the only people they write to.
 */
export async function noticeFormData(access: CommAccess, notice: Notice | null, start: string | null = null): Promise<NoticeFormData> {
  const { current, scope } = access;
  const tz = current.school.timeZone;
  return withSchool(current.ctx, async (tx) => {
    // This year of each campus (a school with two campuses has two current years); only the sender's
    // campus when they are limited to one, so other campuses' classes are not offered.
    const yearIds = (await yearsFor(tx, current.ctx, scope.campusId ?? null)).map((y) => y.id);
    const sections = yearIds.length
      ? await tx.section.findMany({ where: { schoolId: current.ctx.schoolId, academicYearId: { in: yearIds }, archivedAt: null, ...(scope.sectionIds === "all" ? {} : { id: { in: scope.sectionIds } }) }, select: { id: true, name: true, classId: true, schoolClass: { select: { name: true, sortOrder: true, campusId: true } } } })
      : [];
    sections.sort((a, b) => a.schoolClass.sortOrder - b.schoolClass.sortOrder || a.name.localeCompare(b.name));
    const campuses = await tx.campus.findMany({ where: { schoolId: current.ctx.schoolId, archivedAt: null, ...(scope.campusId ? { id: scope.campusId } : {}) }, select: { id: true, name: true } });
    // With classes of several campuses on offer, each class shows its campus.
    const several = new Set(sections.map((s) => s.schoolClass.campusId)).size > 1;
    const campusOf = (id: string) => campuses.find((c) => c.id === id)?.name;
    const className = (s: (typeof sections)[number]) => (several && campusOf(s.schoolClass.campusId) ? `${s.schoolClass.name} (${campusOf(s.schoolClass.campusId)})` : s.schoolClass.name);
    const classes = [...new Map(sections.map((s) => [s.classId, { id: s.classId, name: className(s), sections: sections.filter((x) => x.classId === s.classId).map((x) => ({ id: x.id, name: x.name })) }])).values()];
    const roles = (scope.staff ? await tx.role.findMany({ where: { schoolId: current.ctx.schoolId, archivedAt: null, isEnabled: true, key: { not: null } }, select: { key: true, name: true }, orderBy: { name: "asc" } }) : []).filter((r) => !NOT_STAFF.has(r.key!));
    // Staff with no login never see a notice (the board and the bell need a login; messages go to parents only).
    const staffNoLogin = scope.staff ? await tx.staff.count({ where: { schoolId: current.ctx.schoolId, archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] }, userLoginId: null, ...(scope.campusId ? { campusId: scope.campusId } : {}) } }) : 0;
    const files = notice?.attachmentFileIds.length ? await tx.storedFile.findMany({ where: { id: { in: notice.attachmentFileIds } }, select: { id: true, fileName: true } }) : [];
    const a = notice ? readAudience(notice.audience) : null;
    const to = scope.staff && (start === "staff" || start === "teachers") ? start : start === "parents" ? "parents" : null;
    const teacherKeys = roles.map((r) => r.key!).filter((k) => TEACHER_KEYS.includes(k));
    return {
      id: notice?.id ?? null,
      values: {
        title: notice?.title ?? "",
        body: notice?.body ?? "",
        parents: a?.parents ?? (to ? to === "parents" : !scope.staff),
        students: a?.students ?? false,
        staff: a?.staff ?? (to === "staff" || to === "teachers"),
        roleKeys: a?.roleKeys ?? (to === "teachers" ? teacherKeys : []),
        classIds: a?.classIds ?? [],
        sectionIds: a?.sectionIds ?? [],
        campusIds: a?.campusIds ?? [],
        priority: notice?.priority ?? "NORMAL",
        channels: notice?.channels ?? ["board", "app", "parent-link"],
        publishAt: notice?.publishAt ? utcToLocal(notice.publishAt, tz) : "",
        expiresOn: notice?.expiresOn ? notice.expiresOn.toISOString().slice(0, 10) : "",
        askAck: notice?.askAck ?? false,
        files: files.map((f) => ({ id: f.id, name: f.fileName })),
      },
      classes,
      roles: roles.map((r) => ({ key: r.key!, name: r.name })),
      teacherKeys,
      staffNoLogin,
      campuses,
      staffAllowed: scope.staff,
      wholeSchool: scope.sectionIds === "all",
      // The same rule the server applies when it is saved (the people who decide notices need nobody's approval).
      needsApproval: { parents: await needsApproval(tx, current.ctx, { ...noAudience, parents: true }), all: await needsApproval(tx, current.ctx, { ...noAudience, students: true }) },
      criticalAllowed: access.full,
      defaultExpiry: formatDate(new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 86400_000), tz),
    };
  });
}
