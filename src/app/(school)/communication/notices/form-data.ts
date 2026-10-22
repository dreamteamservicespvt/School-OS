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

export async function noticeFormData(access: CommAccess, notice: Notice | null): Promise<NoticeFormData> {
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
    const roles = scope.staff ? await tx.role.findMany({ where: { schoolId: current.ctx.schoolId, archivedAt: null, isEnabled: true, key: { not: null } }, select: { key: true, name: true }, orderBy: { name: "asc" } }) : [];
    const files = notice?.attachmentFileIds.length ? await tx.storedFile.findMany({ where: { id: { in: notice.attachmentFileIds } }, select: { id: true, fileName: true } }) : [];
    const a = notice ? readAudience(notice.audience) : null;
    return {
      id: notice?.id ?? null,
      values: {
        title: notice?.title ?? "",
        body: notice?.body ?? "",
        parents: a?.parents ?? true,
        students: a?.students ?? false,
        staff: a?.staff ?? false,
        roleKeys: a?.roleKeys ?? [],
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
