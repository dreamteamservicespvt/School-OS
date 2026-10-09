import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { hrPage, BASE } from "@/lib/staff/page";
import { EMPLOYMENT_TYPES, HR_FEATURES, hrSettings, USERNAME_FORMATS } from "@/lib/staff/settings";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SubNav } from "../_components/bits";
import { ArchiveButton, DepartmentForm, DesignationForm, FeatureSwitch, GeneralForm, LeaveTypeForm, type LeaveTypeValues } from "./settings-forms";
import {
  archiveDepartment, archiveDesignation, archiveLeaveType, saveDepartment, saveDesignation, saveGeneral, saveLeaveType, toggleFeature,
} from "./actions";

export const metadata: Metadata = { title: "HR Settings" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const VIEWS = [
  { key: "departments", label: "Departments" },
  { key: "designations", label: "Designations" },
  { key: "leave", label: "Leave types" },
  { key: "general", label: "IDs and documents" },
  { key: "features", label: "Recruitment & Appraisal" },
];

const FIELD_CHOICES = [
  { value: "email", label: "Email" }, { value: "dateOfBirth", label: "Date of birth" }, { value: "gender", label: "Gender" }, { value: "bloodGroup", label: "Blood group" },
  { value: "address", label: "Current address" }, { value: "qualification", label: "Qualifications" }, { value: "aadhaar", label: "Aadhaar" }, { value: "photo", label: "Photo" },
];

export default async function HrSettingsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { current, viewer, features } = await hrPage();
  if (viewer.change !== "all") redirect(BASE);
  const view = VIEWS.find((v) => v.key === sp.view)?.key ?? "departments";

  const data = await withSchool(current.ctx, async (tx) => {
    const [settings, departments, designations, types, rules, staff, roles, counts] = await Promise.all([
      hrSettings(tx, current.ctx),
      tx.department.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } }),
      tx.designation.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      tx.leaveType.findMany({ where: { forWhom: "staff", archivedAt: null }, orderBy: { name: "asc" } }),
      tx.leaveTypeRule.findMany(),
      tx.staff.findMany({ where: { archivedAt: null, status: "ACTIVE" }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, designation: true } }),
      tx.role.findMany({ where: { archivedAt: null, isEnabled: true, key: { notIn: ["student", "parent"] } }, orderBy: { name: "asc" } }),
      tx.staff.groupBy({ by: ["departmentId"], where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] } }, _count: true }),
    ]);
    return { settings, departments, designations, types, rules, staff, roles, counts };
  });
  const staffOptions = data.staff.map((s) => ({ value: s.id, label: `${s.fullName} (${s.designation})` }));
  const deptOptions = data.departments.map((d) => ({ value: d.id, label: d.name }));
  const roleOptions = data.roles.map((r) => ({ value: r.key ?? r.id, label: r.name }));
  const nameOf = (id: string | null) => data.staff.find((s) => s.id === id)?.fullName;

  return (
    <>
      <PageHeader title="HR Settings" href={`${BASE}/settings`} userId={current.user.id} />
      <SubNav current={view} items={VIEWS.map((v) => ({ ...v, href: `${BASE}/settings?view=${v.key}` }))} />

      {view === "departments" && (
        <Card>
          <CardHeader title="Departments" description="Each department can have a head, who decides its staff leave first." action={<DepartmentForm action={saveDepartment} staff={staffOptions} />} />
          <CardBody>
            <ul className="divide-y divide-line">
              {data.departments.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-medium">{d.name} <span className="font-normal text-ink-2">· {data.counts.find((c) => c.departmentId === d.id)?._count ?? 0} staff</span></p>
                    <p className="text-sm text-ink-2">{d.headStaffId ? `Head: ${nameOf(d.headStaffId) ?? "left the school"}` : "No head"}</p>
                  </div>
                  <div className="flex gap-2">
                    <DepartmentForm action={saveDepartment} staff={staffOptions} d={d} />
                    <ArchiveButton action={archiveDepartment} id={d.id} label={d.name} />
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {view === "designations" && (
        <Card>
          <CardHeader title="Designations" description="Posts such as Teacher or Accountant, with the role usually given. A designation does not give access by itself." action={<DesignationForm action={saveDesignation} departments={deptOptions} roles={roleOptions} />} />
          <CardBody>
            <ul className="divide-y divide-line">
              {data.designations.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-medium">{d.name} <Badge>{d.staffType}</Badge></p>
                    <p className="text-sm text-ink-2">Role: {data.roles.find((r) => r.key === d.defaultRoleKey)?.name ?? "no login by default"}{d.defaultDepartmentId ? ` · ${data.departments.find((x) => x.id === d.defaultDepartmentId)?.name ?? ""}` : ""}</p>
                  </div>
                  <div className="flex gap-2">
                    <DesignationForm action={saveDesignation} departments={deptOptions} roles={roleOptions} d={d} />
                    <ArchiveButton action={archiveDesignation} id={d.id} label={d.name} />
                  </div>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}

      {view === "leave" && (
        <Card>
          <CardHeader title="Staff leave types" description="Yearly days, carry-forward, half days, documents and loss of pay." action={<LeaveTypeForm action={saveLeaveType} groups={[...EMPLOYMENT_TYPES]} />} />
          <CardBody>
            <ul className="divide-y divide-line">
              {data.types.map((t) => {
                const r = data.rules.find((x) => x.leaveTypeId === t.id);
                const quota = (r?.quotaByGroup ?? {}) as Record<string, number>;
                const v: LeaveTypeValues = {
                  id: t.id, name: t.name, code: t.code, daysPerYear: String(Number(t.daysPerYear)), paid: t.paid, carryForward: t.carryForward, maxCarry: String(Number(t.maxCarry)),
                  needsDocAfter: t.needsDocAfter?.toString() ?? "", halfDayAllowed: r?.halfDayAllowed ?? true, documentRequired: r?.documentRequired ?? false, countsHolidays: r?.countsHolidays ?? false,
                  lossOfPay: r?.lossOfPay ?? false, sensitive: r?.sensitive ?? false, quota: Object.fromEntries(Object.entries(quota).map(([k, n]) => [k, String(n)])),
                };
                const notes = [
                  t.paid ? `${Number(t.daysPerYear)} days a year` : "Unpaid",
                  ...Object.entries(quota).map(([g, n]) => `${g}: ${n}`),
                  t.carryForward ? `carry up to ${Number(t.maxCarry)}` : null,
                  r?.halfDayAllowed === false ? "no half days" : null,
                  r?.documentRequired ? "document always" : t.needsDocAfter !== null ? `document after ${t.needsDocAfter} days` : null,
                  r?.countsHolidays ? "holidays count" : null,
                  r?.lossOfPay ? "extra days loss of pay" : null,
                  r?.sensitive ? "private" : null,
                ].filter(Boolean);
                return (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <p className="font-medium">{t.name} <span className="font-normal text-ink-2">({t.code})</span></p>
                      <p className="text-sm text-ink-2">{notes.join(" · ")}</p>
                    </div>
                    <div className="flex gap-2">
                      <LeaveTypeForm action={saveLeaveType} groups={[...EMPLOYMENT_TYPES]} t={v} />
                      <ArchiveButton action={archiveLeaveType} id={t.id} label={t.name} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}

      {view === "general" && (
        <Card>
          <CardHeader title="Staff IDs, usernames and documents" />
          <CardBody>
            <GeneralForm action={saveGeneral} formats={[...USERNAME_FORMATS]} fieldChoices={FIELD_CHOICES} v={data.settings} />
          </CardBody>
        </Card>
      )}

      {view === "features" && (
        <Card>
          <CardHeader title="Recruitment & Appraisal" description="Switch on only the parts your school uses. Switching off hides them; nothing is removed." />
          <CardBody>
            <ul className="divide-y divide-line">
              {HR_FEATURES.map((f) => (
                <li key={f.key} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div>
                    <p className="font-medium">{f.label} {features.has(f.key) ? <Badge tone="success">On</Badge> : <Badge>Off</Badge>}</p>
                    <p className="text-sm text-ink-2">{f.about}</p>
                  </div>
                  <FeatureSwitch action={toggleFeature} k={f.key} on={features.has(f.key)} label={f.label} />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      )}
    </>
  );
}
