import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Building2, CalendarDays, ChevronRight, Contact, Hash, SlidersHorizontal, Users, Workflow } from "lucide-react";
import { withSchool } from "@/lib/db";
import { hrPage, BASE } from "@/lib/staff/page";
import { EMPLOYMENT_TYPES, HR_FEATURES, hrSettings, USERNAME_FORMATS } from "@/lib/staff/settings";
import { StaffHead } from "../_components/head";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Col, Split } from "@/components/ui/blocks";
import { ArchiveButton, DepartmentForm, DesignationForm, FeatureSwitch, GeneralForm, LeaveTypeForm, type LeaveTypeValues } from "./settings-forms";
import { schoolRoles } from "@/lib/school-roles";
import {
  archiveDepartment, archiveDesignation, archiveLeaveType, saveDepartment, saveDesignation, saveGeneral, saveLeaveType, toggleFeature,
} from "./actions";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("HR Settings") };
}

const FIELD_CHOICES = [
  { value: "email", label: "Email" }, { value: "dateOfBirth", label: "Date of birth" }, { value: "gender", label: "Gender" }, { value: "bloodGroup", label: "Blood group" },
  { value: "address", label: "Current address" }, { value: "qualification", label: "Qualifications" }, { value: "aadhaar", label: "Aadhaar" }, { value: "photo", label: "Photo" },
];

const rowCls = "flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 px-5 py-3";

/** All HR rules on one page, as in the approved design: every section saves on its own. */
export default async function HrSettingsPage() {
  const { current, viewer, features } = await hrPage();
  if (viewer.change !== "all") redirect(BASE);

  const data = await withSchool(current.ctx, async (tx) => {
    const [settings, departments, designations, types, rules, staff, roles, counts] = await Promise.all([
      hrSettings(tx, current.ctx),
      tx.department.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } }),
      tx.designation.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      tx.leaveType.findMany({ where: { forWhom: "staff", archivedAt: null }, orderBy: { name: "asc" } }),
      tx.leaveTypeRule.findMany(),
      tx.staff.findMany({ where: { archivedAt: null, status: "ACTIVE" }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, designation: true } }),
      schoolRoles(tx, current.ctx, { where: { archivedAt: null, isEnabled: true, key: { notIn: ["student", "parent"] } }, orderBy: { name: "asc" } }),
      tx.staff.groupBy({ by: ["departmentId"], where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] } }, _count: true }),
    ]);
    return { settings, departments, designations, types, rules, staff, roles, counts };
  });
  const staffOptions = data.staff.map((s) => ({ value: s.id, label: `${s.fullName} (${s.designation})` }));
  const deptOptions = data.departments.map((d) => ({ value: d.id, label: d.name }));
  const roleOptions = data.roles.filter((r, i) => data.roles.findIndex((x) => (x.key ?? x.id) === (r.key ?? r.id)) === i).map((r) => ({ value: r.key ?? r.id, label: r.name }));
  const nameOf = (id: string | null) => data.staff.find((s) => s.id === id)?.fullName;
  const quotaGroups = [...new Set(data.rules.flatMap((r) => Object.keys((r.quotaByGroup ?? {}) as Record<string, number>)))];
  const paidTypes = data.types.filter((t) => t.paid);

  return (
    <>
      <StaffHead page="HR Settings" href={`${BASE}/settings`} sub="Departments, designations, leave types and rules. Every change is logged." />

      <Split side={380}>
        <Col>
          <Card className="overflow-hidden">
            <CardHeader title="Departments" icon={Building2} description="The head is the first leave approver for the department" divided action={<DepartmentForm action={saveDepartment} staff={staffOptions} />} />
            {data.departments.length === 0 ? <p className="px-5 py-4 text-[14px] text-ink3"><Words k="No departments yet. Add one so leave goes to the right head." /></p> : (
              <ul className="divide-y divide-line">
                {data.departments.map((d) => (
                  <li key={d.id} className={rowCls}>
                    <div className="min-w-0">
                      <p className="font-semibold">{d.name} <span className="text-[13px] font-normal text-ink3">· {data.counts.find((c) => c.departmentId === d.id)?._count ?? 0} <Words k="staff" /></span></p>
                      <p className="text-[13px] text-ink3">{d.headStaffId ? `Head: ${nameOf(d.headStaffId) ?? "left the school"}` : "No head yet"}</p>
                    </div>
                    <div className="flex items-start gap-1">
                      <DepartmentForm action={saveDepartment} staff={staffOptions} d={d} />
                      <ArchiveButton action={archiveDepartment} id={d.id} label={d.name} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Designations" icon={Contact} description="Each with its staff type and the role usually given. A designation gives no access by itself." divided action={<DesignationForm action={saveDesignation} departments={deptOptions} roles={roleOptions} />} />
            <ul className="divide-y divide-line">
              {data.designations.map((d) => (
                <li key={d.id} className={rowCls}>
                  <div className="min-w-0">
                    <p className="font-semibold">{d.name}</p>
                    <p className="text-[13px] text-ink3">{d.staffType}{d.defaultDepartmentId ? ` · ${data.departments.find((x) => x.id === d.defaultDepartmentId)?.name ?? ""}` : ""}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <Pill>{data.roles.find((r) => r.key === d.defaultRoleKey)?.name ?? "No login"}</Pill>
                    <DesignationForm action={saveDesignation} departments={deptOptions} roles={roleOptions} d={d} />
                    <ArchiveButton action={archiveDesignation} id={d.id} label={d.name} />
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Staff record and IDs" icon={Hash} description="Staff IDs, usernames, notice period and documents" />
            <div className="px-5 pb-5">
              <GeneralForm action={saveGeneral} formats={[...USERNAME_FORMATS]} fieldChoices={FIELD_CHOICES} v={data.settings} />
            </div>
          </Card>
        </Col>

        <Col>
          <Card className="overflow-hidden">
            <CardHeader title="Leave types and rules" icon={CalendarDays} description="Yearly quota, carry-forward, half days and documents" divided action={<LeaveTypeForm action={saveLeaveType} groups={[...EMPLOYMENT_TYPES]} />} />
            {data.types.length === 0 ? <p className="px-5 py-4 text-[14px] text-ink3"><Words k="No staff leave types yet." /></p> : (
              <ul className="divide-y divide-line">
                {data.types.map((t) => {
                  const r = data.rules.find((x) => x.leaveTypeId === t.id);
                  const quota = (r?.quotaByGroup ?? {}) as Record<string, number>;
                  const v: LeaveTypeValues = {
                    id: t.id, name: t.name, code: t.code, daysPerYear: String(Number(t.daysPerYear)), paid: t.paid, carryForward: t.carryForward, maxCarry: String(Number(t.maxCarry)),
                    needsDocAfter: t.needsDocAfter?.toString() ?? "", halfDayAllowed: r?.halfDayAllowed ?? true, documentRequired: r?.documentRequired ?? false, countsHolidays: r?.countsHolidays ?? false,
                    lossOfPay: r?.lossOfPay ?? false, sensitive: r?.sensitive ?? false, quota: Object.fromEntries(Object.entries(quota).map(([k, n]) => [k, String(n)])),
                  };
                  const pills: [string, "neutral" | "warn" | "ok" | "info"][] = [
                    ...(r?.halfDayAllowed === false ? [] : [["Half days", "neutral"] as [string, "neutral"]]),
                    ...(r?.lossOfPay ? [["Loss of pay when used up", "warn"] as [string, "warn"]] : []),
                    ...(r?.sensitive ? [["Private on the calendar", "ok"] as [string, "ok"]] : []),
                    ...(r?.documentRequired ? [["Document needed", "neutral"] as [string, "neutral"]] : t.needsDocAfter !== null ? [[`Document for ${t.needsDocAfter}+ days`, "neutral"] as [string, "neutral"]] : []),
                    ...(t.carryForward ? [[`Carry forward up to ${Number(t.maxCarry)}`, "info"] as [string, "info"]] : []),
                    ...(r?.countsHolidays ? [["Holidays count", "neutral"] as [string, "neutral"]] : []),
                  ];
                  return (
                    <li key={t.id} className={rowCls}>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">{t.name} <span className="whitespace-nowrap text-[13px] font-normal text-ink3">· {t.paid ? `${Number(t.daysPerYear)} days a year` : "unpaid"}</span></p>
                        {pills.length > 0 && <div className="mt-1 flex flex-wrap gap-1">{pills.map(([l, tone]) => <Pill key={l} tone={tone} className="!h-5 !text-[11px]">{l}</Pill>)}</div>}
                      </div>
                      <div className="flex items-start gap-1">
                        <LeaveTypeForm action={saveLeaveType} groups={[...EMPLOYMENT_TYPES]} t={v} />
                        <ArchiveButton action={archiveLeaveType} id={t.id} label={t.name} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {quotaGroups.length > 0 && (
            <Card className="overflow-hidden">
              <CardHeader title="Quota by staff group" icon={Users} description={`Days a year · ${paidTypes.map((t) => t.name.replace(/ leave$/i, "").toLowerCase()).join(", ")}`} />
              <ul className="space-y-1 px-5 pb-4">
                {quotaGroups.map((g) => (
                  <li key={g} className="flex items-center justify-between gap-3 py-2">
                    <span className="font-semibold">{g}</span>
                    <span className="font-semibold tnum">{paidTypes.map((t) => {
                      const q = (data.rules.find((r) => r.leaveTypeId === t.id)?.quotaByGroup ?? {}) as Record<string, number>;
                      return q[g] ?? Number(t.daysPerYear);
                    }).join(" · ")}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardHeader title="Leave approvers" icon={Workflow} description="Stored in Settings, Forms & Approvals" />
            <div className="space-y-3 px-5 pb-5">
              <div className="flex flex-wrap items-center gap-1.5"><Pill tone="ok"><Words k="Head of department" /></Pill><ChevronRight size={15} className="text-ink3" aria-hidden="true" /><Pill tone="ok"><Words k="Next approver from the rule" /></Pill></div>
              <p className="text-[13.5px] text-ink3"><Words k="Nobody approves their own leave. When the head asks for leave, it goes to the next approver." /></p>
              <Link href="/settings/forms-approvals" className={buttonClass("secondary", "sm")}><ArrowUpRight size={15} aria-hidden="true" /><Words k={"Change in Forms & Approvals"} /></Link>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Optional parts" icon={SlidersHorizontal} description="Shown in Recruitment & Appraisal when on. Switching off hides them; nothing is removed." divided />
            <ul className="divide-y divide-line">
              {HR_FEATURES.map((f) => (
                <li key={f.key} className={rowCls}>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{f.label}</p>
                    <p className="text-[13px] text-ink3">{f.about}</p>
                  </div>
                  <FeatureSwitch action={toggleFeature} k={f.key} on={features.has(f.key)} label={f.label} />
                </li>
              ))}
            </ul>
          </Card>
        </Col>
      </Split>
    </>
  );
}
