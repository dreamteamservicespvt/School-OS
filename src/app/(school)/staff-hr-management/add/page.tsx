import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { pageHidden } from "@/lib/duty";
import { withSchool } from "@/lib/db";
import { hrPage, BASE } from "@/lib/staff/page";
import { hrSettings, EMPLOYMENT_TYPES } from "@/lib/staff/settings";
import { leaveYearFor } from "@/lib/staff/leave";
import { isoDay } from "@/lib/staff/dates";
import { roleLines } from "@/lib/staff/role-words";
import { UUID_RE } from "@/lib/staff/act";
import type { AccessLevel, RolePermissions } from "@/lib/roles";
import { MODULES } from "@/lib/modules";
import { BackLink } from "@/components/ui/module-head";
import { PageHeader } from "@/components/shell/page-header";
import { Wizard, type WizardData } from "./wizard";
import { checkDetails, createStaffAction } from "./actions";

export const metadata: Metadata = { title: "Add Staff" };

type Search = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function AddStaffPage({ searchParams }: Search) {
  const { current, today } = await hrPage("create");
  if (pageHidden(current, "staff-hr-management", "add")) redirect(BASE);
  const sp = await searchParams;
  const applicationId = typeof sp.application === "string" && UUID_RE.test(sp.application) ? sp.application : null;

  const data = await withSchool(current.ctx, async (tx) => {
    const [settings, designations, departments, staff, campuses, roles] = await Promise.all([
      hrSettings(tx, current.ctx),
      tx.designation.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      tx.department.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } }),
      tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, designation: true } }),
      tx.campus.findMany({ where: { archivedAt: null }, orderBy: [{ isMain: "desc" }, { name: "asc" }] }),
      tx.role.findMany({ where: { isEnabled: true, archivedAt: null }, orderBy: [{ kind: "asc" }, { name: "asc" }] }),
    ]);
    const year = campuses[0] ? await leaveYearFor(tx, current.ctx, today, campuses[0].id) : null;
    const sections = year ? await tx.section.findMany({ where: { academicYearId: year.id, archivedAt: null }, include: { schoolClass: true }, orderBy: [{ schoolClass: { sortOrder: "asc" } }, { name: "asc" }] }) : [];
    const classIds = [...new Set(sections.map((s) => s.classId))];
    const subjects = await tx.subjectClass.findMany({ where: { classId: { in: classIds }, archivedAt: null, subject: { archivedAt: null } }, include: { subject: true } });
    let prefill: WizardData["prefill"] = null;
    if (applicationId) {
      const app = await tx.jobApplication.findFirst({ where: { id: applicationId, archivedAt: null }, include: { offers: { where: { status: { in: ["MADE", "ACCEPTED"] } }, take: 1 }, vacancy: true } });
      if (app && app.status !== "HIRED") {
        const offer = app.offers[0];
        prefill = {
          applicationId: app.id, fullName: app.name, phone: app.phone, email: app.email ?? "", qualification: app.qualification ?? "",
          experienceYears: app.experienceYears !== null ? String(app.experienceYears) : "", designation: offer?.designation ?? app.vacancy.designation,
          departmentId: offer?.departmentId ?? app.vacancy.departmentId ?? "", joiningDate: offer ? isoDay(offer.joiningDate) : isoDay(today),
        };
      }
    }
    return {
      usernameFormat: settings.usernameFormat,
      designations: designations.map((d) => ({ name: d.name, staffType: d.staffType, departmentId: d.defaultDepartmentId, roleKey: d.defaultRoleKey })),
      departments: departments.map((d) => ({ value: d.id, label: d.name })),
      staff: staff.map((s) => ({ value: s.id, label: `${s.fullName} (${s.designation})` })),
      campuses: campuses.map((c) => ({ value: c.id, label: c.name })),
      roles: roles.filter((r, i) => r.key !== "student" && roles.findIndex((x) => (x.key ?? x.id) === (r.key ?? r.id)) === i).map((r) => {
        const perms = r.permissions as RolePermissions;
        return { key: r.key ?? r.id, name: r.name, perms: perms as Record<string, AccessLevel>, lines: roleLines(perms).map((l) => `${l.module}: ${l.words}`) };
      }),
      yearName: year?.name ?? null,
      classes: classIds.map((id) => {
        const secs = sections.filter((s) => s.classId === id);
        return {
          id, name: secs[0].schoolClass.name,
          sections: secs.map((s) => ({ id: s.id, name: s.name })),
          subjects: subjects.filter((x) => x.classId === id).map((x) => ({ id: x.subjectId, name: x.subject.name })).sort((a, b) => a.name.localeCompare(b.name)),
        };
      }),
      prefill,
    };
  });

  return (
    <>
      <BackLink href={BASE} label="Staff List" />
      <PageHeader title="Add Staff" href={`${BASE}/add`} userId={current.user.id} />
      <Wizard
        data={{ ...data, today: isoDay(today), employmentTypes: [...EMPLOYMENT_TYPES], modules: MODULES.map((m) => ({ key: m.key, name: m.name })) }}
        checkDetails={checkDetails}
        create={createStaffAction}
      />
    </>
  );
}
