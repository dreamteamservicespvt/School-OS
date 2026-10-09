import "server-only";

import type { Notice } from "@prisma/client";
import { withSchool } from "@/lib/db";
import type { CommAccess } from "@/lib/communication/access";
import { currentYear } from "@/lib/academic/years";
import { messageSettings } from "@/lib/messaging/settings";
import { readAudience, DEFAULT_EXPIRY_DAYS } from "@/lib/communication/notices";
import { utcToLocal } from "@/lib/communication/time";
import { formatDate } from "@/lib/format";
import type { NoticeFormData } from "./notice-form";

export async function noticeFormData(access: CommAccess, notice: Notice | null): Promise<NoticeFormData> {
  const { current, scope } = access;
  const tz = current.school.timeZone;
  return withSchool(current.ctx, async (tx) => {
    const year = await currentYear(tx, current.ctx);
    const sections = year
      ? await tx.section.findMany({ where: { schoolId: current.ctx.schoolId, academicYearId: year.id, archivedAt: null, ...(scope.sectionIds === "all" ? {} : { id: { in: scope.sectionIds } }) }, select: { id: true, name: true, classId: true, schoolClass: { select: { name: true, sortOrder: true } } } })
      : [];
    sections.sort((a, b) => a.schoolClass.sortOrder - b.schoolClass.sortOrder || a.name.localeCompare(b.name));
    const classes = [...new Map(sections.map((s) => [s.classId, { id: s.classId, name: s.schoolClass.name, sections: sections.filter((x) => x.classId === s.classId).map((x) => ({ id: x.id, name: x.name })) }])).values()];
    const roles = scope.staff ? await tx.role.findMany({ where: { schoolId: current.ctx.schoolId, archivedAt: null, isEnabled: true, key: { not: null } }, select: { key: true, name: true }, orderBy: { name: "asc" } }) : [];
    const campuses = await tx.campus.findMany({ where: { schoolId: current.ctx.schoolId, archivedAt: null }, select: { id: true, name: true } });
    const settings = await messageSettings(tx, current.ctx);
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
      needsApproval: access.full ? { parents: false, all: false } : { parents: settings.noticeApproval === "parents", all: settings.noticeApproval === "all" },
      defaultExpiry: formatDate(new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 86400_000), tz),
    };
  });
}
