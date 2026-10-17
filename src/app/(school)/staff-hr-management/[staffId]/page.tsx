import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime, formatRupees } from "@/lib/format";
import { salaryLevel } from "@/lib/salary/access";
import { staffPage, BASE } from "@/lib/staff/page";
import { canChangeStaff, canOpenStaff, canSeeSalary } from "@/lib/staff/access";
import { showRestricted } from "@/lib/staff/staff";
import { balancesFor, daysText, holidaySet, leaveYearFor } from "@/lib/staff/leave";
import { docStatus, DOC_TONE, showDocNumber } from "@/lib/staff/documents";
import { EMPLOYMENT_TYPES, hrSettings, statusLabel } from "@/lib/staff/settings";
import { combineLevels, extraPermissions, roleLines } from "@/lib/staff/role-words";
import { isoDay, monthStart, monthEnd, eachDay, isoWeekday, monthLabel, addDays } from "@/lib/staff/dates";
import { exitTypeLabel } from "@/lib/staff/exit";
import { MODULES, type ModuleKey } from "@/lib/modules";
import type { AccessLevel, RolePermissions } from "@/lib/roles";
import { Card, CardBody, CardHeader, Detail } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, CalendarCheck, CalendarDays, CalendarPlus, CircleCheck, Clock, FileText, FolderOpen, IdCard, Info, KeyRound, Lock, LogOut, Mail, MessageCircle, Phone, ReceiptText, School, Wallet } from "lucide-react";
import { BackLink, PinButton } from "@/components/ui/module-head";
import { Pill } from "@/components/ui/badge";
import { Banner, Col, DL, Split } from "@/components/ui/blocks";
import { MoreMenu, type MenuItem } from "@/components/ui/more-menu";
import { cx } from "@/components/ui/cx";
import { Avatar, StatusBadge } from "../_components/bits";
import {
  ContactForm, EmergencyForm, EmploymentForm, ExtraFieldsForm, GiveLoginForm, NewLinkButton, PersonalForm, PhotoForm, ReprintForm, RestrictedForm, StatusForm, SwitchLoginForm,
  type ProfileValues,
} from "./edit-forms";
import {
  changeStatusAction, giveLoginAction, newSignInLink, saveContact, saveEmergency, saveEmployment, saveExtraFields, savePersonal, saveRestricted, switchLoginAction, uploadOwnPhoto, uploadPhoto, removeStaffPhoto,
} from "./actions";
import { UploadDocumentForm } from "../documents/upload-form";
import { removeDocumentAction, uploadDocument } from "../documents/actions";
import { ConfirmButton } from "@/components/ui/confirm";

type Props = { params: Promise<{ staffId: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export const metadata: Metadata = { title: "Staff Profile" };

/** Inferred: the most periods a teacher should have in a week. */
const PERIOD_LIMIT = 36;

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "classes", label: "Classes", teaching: true },
  { key: "timetable", label: "Time Table", teaching: true },
  { key: "attendance", label: "Attendance" },
  { key: "leave", label: "Leave" },
  { key: "workload", label: "Workload", teaching: true },
  { key: "performance", label: "Performance" },
  { key: "documents", label: "Documents" },
  { key: "salary", label: "Salary", salary: true },
] as const;

export default async function StaffProfilePage({ params, searchParams }: Props) {
  const { staffId } = await params;
  const sp = await searchParams;
  const { current, viewer, tz, today, features } = await staffPage();
  if (!/^[0-9a-f-]{36}$/i.test(staffId) || !canOpenStaff(viewer, staffId)) notFound();

  const s = await withSchool(current.ctx, (tx) => tx.staff.findFirst({
    where: { id: staffId },
    include: { department: true, documents: { where: { archivedAt: null }, orderBy: [{ expiresOn: "asc" }, { createdAt: "desc" }] } },
  }));
  if (!s) notFound();

  const hr = viewer.change === "all";
  const mine = viewer.staffId === s.id;
  const canEdit = canChangeStaff(viewer, s.id);
  const salary = canSeeSalary(viewer, s.id);
  const teaching = s.staffType === "Teaching";
  const tabs = TABS.filter((t) => (!("teaching" in t) || teaching) && (!("salary" in t) || salary));
  const tab = tabs.find((t) => t.key === sp.tab)?.key ?? "overview";
  const editOpen = typeof sp.edit === "string" ? sp.edit : null;
  const href = (t: string) => `${BASE}/${s.id}${t === "overview" ? "" : `?tab=${t}`}`;
  const left = ["RESIGNED", "RETIRED", "TERMINATED"].includes(s.status);

  const head = await withSchool(current.ctx, async (tx) => {
    const [manager, campus, exit, printed, login, onLeave, year] = await Promise.all([
      s.reportingToId ? tx.staff.findUnique({ where: { id: s.reportingToId }, select: { id: true, fullName: true } }) : null,
      tx.campus.findUnique({ where: { id: s.campusId }, select: { name: true } }),
      tx.exitCase.findFirst({ where: { staffId: s.id, status: { not: "CANCELLED" } }, orderBy: { createdAt: "desc" } }),
      tx.staffIdCardPrint.count({ where: { staffId: s.id } }),
      s.userLoginId ? tx.userLogin.findUnique({ where: { id: s.userLoginId }, select: { id: true, username: true, status: true, lastSignInAt: true } }) : null,
      tx.leaveRequest.findFirst({ where: { staffId: s.id, status: "APPROVED", fromDate: { lte: today }, toDate: { gte: today }, archivedAt: null } }),
      leaveYearFor(tx, current.ctx, today, s.campusId),
    ]);
    const balances = year && !left ? (await balancesFor(tx, current.ctx, [s.id], year.id)).get(s.id) ?? [] : [];
    let periods = 0, classCount = 0;
    let classTeacher: string[] = [];
    if (teaching && year) {
      const version = await tx.timetableVersion.findFirst({ where: { campusId: s.campusId, status: "PUBLISHED", archivedAt: null, OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: today } }] }, orderBy: { effectiveFrom: "desc" } });
      const [p, allocs, sections] = await Promise.all([
        version ? tx.timetablePeriod.count({ where: { versionId: version.id, staffId: s.id, isBreak: false, archivedAt: null } }) : 0,
        tx.teacherAllocation.findMany({ where: { staffId: s.id, academicYearId: year.id, archivedAt: null }, select: { sectionId: true } }),
        tx.section.findMany({ where: { classTeacherId: s.id, academicYearId: year.id, archivedAt: null }, include: { schoolClass: true } }),
      ]);
      periods = p;
      classCount = new Set(allocs.map((a) => a.sectionId)).size;
      classTeacher = sections.map((x) => `${x.schoolClass.name} ${x.name}`);
    }
    return { manager, campus, exit, printed, login, onLeave, balances, periods, classCount, classTeacher };
  });

  const first = s.firstName || s.fullName.split(/\s+/)[0];
  const limited = head.balances.filter((b) => b.limited);
  const mainLeave = limited.find((b) => /casual/i.test(b.type.name)) ?? limited[0];
  const docsNeed = s.documents.filter((d) => docStatus(d, today) !== "Valid").length;
  const years = Math.floor((today.getTime() - s.joiningDate.getTime()) / (365.25 * 86_400_000));
  const strip: { label: string; icon: LucideIcon; value: React.ReactNode; sub?: React.ReactNode; tone?: "warn" | "bad"; href?: string }[] = [
    { label: "Today", icon: CalendarDays, value: s.status !== "ACTIVE" ? statusLabel(s.status) : head.onLeave ? "On leave" : "–", sub: head.onLeave && s.status === "ACTIVE" ? `Until ${formatDate(head.onLeave.toDate, tz)}` : s.status === "ACTIVE" ? "Once attendance is taken" : undefined, tone: head.onLeave || s.status !== "ACTIVE" ? "warn" : undefined },
    ...(mainLeave ? [{ label: `${mainLeave.type.name} left`, icon: CalendarCheck, value: `${mainLeave.left} of ${mainLeave.given + mainLeave.adjusted}`, sub: limited.filter((b) => b !== mainLeave).slice(0, 2).map((b) => `${b.type.name.replace(/ leave$/i, "")} ${b.left}`).join(" · ") || undefined, href: href("leave") }] : []),
    ...(teaching ? [
      { label: "Periods a week", icon: Clock, value: `${head.periods} of ${PERIOD_LIMIT}`, sub: `${head.classCount} class${head.classCount === 1 ? "" : "es"}`, tone: head.periods > PERIOD_LIMIT ? "bad" as const : undefined, href: href("workload") },
      { label: "Class teacher", icon: School, value: head.classTeacher.length ? head.classTeacher.join(", ") : "No", sub: head.classTeacher.length ? "Takes daily attendance" : undefined },
    ] : []),
    { label: "Documents", icon: FolderOpen, value: `${s.documents.length - docsNeed} of ${s.documents.length}`, sub: docsNeed ? `${docsNeed} need${docsNeed === 1 ? "s" : ""} attention` : s.documents.length ? "All in order" : "None yet", tone: docsNeed ? "warn" : undefined, href: href("documents") },
    { label: "Joined", icon: CircleCheck, value: new Intl.DateTimeFormat("en-IN", { month: "short", year: "numeric", timeZone: tz }).format(s.joiningDate), sub: years >= 1 ? `${years} year${years === 1 ? "" : "s"} here` : "This year" },
  ];
  const stripCols = strip.length >= 6 ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-6" : strip.length === 5 ? "grid-cols-2 md:grid-cols-3 xl:grid-cols-5" : strip.length === 4 ? "grid-cols-2 xl:grid-cols-4" : "grid-cols-3";
  const more: MenuItem[] = [
    ...(hr && !left && head.printed === 0 ? [{ label: "Print ID card", href: `${BASE}/id-cards?staff=${s.id}`, icon: <IdCard size={17} aria-hidden="true" /> }] : []),
    ...(hr && head.exit && head.exit.status !== "WAITING_APPROVAL" ? [{ label: "Experience letter", href: `${BASE}/exit/${head.exit.id}`, icon: <FileText size={17} aria-hidden="true" /> }] : []),
    ...(hr && !left && !head.exit ? [{ label: "Record exit", href: `${BASE}/exit/new?staff=${s.id}`, icon: <LogOut size={17} aria-hidden="true" /> }] : []),
  ];
  const photoAction = left ? null : hr ? uploadPhoto : mine && canEdit ? uploadOwnPhoto : null;

  return (
    <>
      {viewer.see === "all" ? <BackLink href={s.departmentId ? `${BASE}?department=${s.departmentId}` : BASE} label="Staff List" sub={s.department?.name} /> : <BackLink href={`${BASE}/leave`} label="Staff Leave" />}
      {s.archivedAt && <Banner tone="warn" className="mb-4" title="This staff record is archived.">It stays in history and reports.</Banner>}
      {head.exit && head.exit.status !== "COMPLETED" && (
        <Banner tone="warn" className="mb-4" title={`${exitTypeLabel(head.exit.type)}: last working day ${formatDate(head.exit.lastWorkingDay, tz)}.`}>
          {hr ? <Link href={`${BASE}/exit/${head.exit.id}`} className="font-semibold underline">Open the exit</Link> : "HR is handling the handover."}
        </Banner>
      )}

      <Card className="overflow-hidden">
        <div className="relative h-16 bg-gradient-to-r from-brand to-brand/60 md:h-20" aria-hidden="true"><div className="dotgrid absolute inset-0 opacity-50" /></div>
        <div className="relative flex flex-col gap-4 px-4 pb-5 md:px-6 lg:flex-row lg:items-end">
          <div className="flex min-w-0 flex-1 items-end gap-4">
            <div className="-mt-10 flex shrink-0 flex-col items-center gap-1 md:-mt-12">
              <span className="rounded-full bg-surface p-1"><Avatar name={s.fullName} photoFileId={s.photoFileId} size="lg" /></span>
              {photoAction && <PhotoForm staffId={s.id} action={photoAction} has={Boolean(s.photoFileId)} />}
              {photoAction && s.photoFileId && (
                <ConfirmButton trigger="Remove photo" triggerVariant="ghost" title="Remove this photo?" confirmLabel="Remove photo" confirmVariant="danger" onConfirm={removeStaffPhoto.bind(null, s.id)}>
                  Initials show instead, and the ID card prints without a photo until a new one is added.
                </ConfirmButton>
              )}
            </div>
            <div className="min-w-0 pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-display text-[24px] font-semibold leading-tight tracking-tight md:text-[28px]">{s.fullName}</h1>
                <StatusBadge status={s.status} />
                {head.onLeave && s.status === "ACTIVE" && <Pill tone="warn">On leave today</Pill>}
                <PinButton label={s.fullName} href={`${BASE}/${s.id}`} userId={current.user.id} />
              </div>
              <p className="mt-0.5 text-[13.5px] text-ink3">
                {s.designation}{s.department ? ` · ${s.department.name}` : ""} · <span className="font-mono text-[12.5px]">{s.staffCode}</span> · <a href={`tel:+91${s.phone}`} className="tnum hover:underline">{s.phone}</a>
              </p>
              {s.statusReason && s.status !== "ACTIVE" && <p className="mt-1 text-[13px] text-ink2">{statusLabel(s.status)} since {s.statusSince ? formatDate(s.statusSince, tz) : "?"}: {s.statusReason}</p>}
            </div>
          </div>
          <div className="relative flex flex-wrap gap-2">
            <a className={buttonClass("secondary", "md", "flex-1 lg:flex-none")} href={`https://wa.me/91${s.phone}`} target="_blank" rel="noopener noreferrer"><MessageCircle size={17} aria-hidden="true" />Message</a>
            {!left && (hr || mine) && <ButtonLink variant="primary" icon={CalendarPlus} href={`${BASE}/leave?apply=${s.id}`} className="flex-1 lg:flex-none">{mine ? "Apply for leave" : `Apply leave for ${first}`}</ButtonLink>}
            {hr && !left && head.printed > 0 && <ReprintForm staffId={s.id} />}
            {hr && !left && <StatusForm staffId={s.id} current={s.status} action={changeStatusAction} today={isoDay(today)} />}
            {more.length > 0 && <MoreMenu items={more} label={`More actions for ${s.fullName}`} />}
          </div>
        </div>
        <div className={cx("grid gap-px border-t border-line bg-line/70", stripCols)}>
          {strip.map((m) => {
            const body = (
              <>
                <p className="flex items-center gap-1.5 text-[12px] font-semibold text-ink3"><m.icon size={14} aria-hidden="true" />{m.label}</p>
                <p className={cx("mt-0.5 truncate text-[17px] font-semibold tnum", m.tone === "bad" && "text-bad", m.tone === "warn" && "text-warn")}>{m.value}</p>
                {m.sub && <p className="truncate text-[12px] text-ink3">{m.sub}</p>}
              </>
            );
            return m.href
              ? <Link key={m.label} href={m.href} scroll={false} className="bg-surface px-4 py-3.5 text-left transition hover:bg-sunken/60 md:px-5">{body}</Link>
              : <div key={m.label} className="bg-surface px-4 py-3.5 text-left md:px-5">{body}</div>;
          })}
        </div>
      </Card>

      <nav aria-label="Profile sections" className="-mx-4 mt-5 px-4 md:mx-0 md:px-0">
        <ul className="no-scrollbar flex gap-1 overflow-x-auto border-b border-line">
          {tabs.map((t) => {
            const on = t.key === tab;
            return (
              <li key={t.key} className="shrink-0">
                <Link href={href(t.key)} aria-current={on ? "page" : undefined} scroll={false}
                  className={cx("relative flex h-11 items-center whitespace-nowrap px-3.5 text-sm font-semibold transition", on ? "text-brand" : "text-ink2 hover:text-ink")}>
                  {t.label}
                  {on && <span className="absolute -bottom-px left-2 right-2 h-[3px] rounded-t bg-brand" aria-hidden="true" />}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="mt-5 animate-rise" key={tab}>
      {tab === "overview" && <Overview />}
      {tab === "classes" && <Classes />}
      {tab === "timetable" && <TimeTable />}
      {tab === "attendance" && <Attendance />}
      {tab === "leave" && <Leave />}
      {tab === "workload" && <Workload />}
      {tab === "performance" && <Performance />}
      {tab === "documents" && <Documents />}
      {tab === "salary" && salary && <Salary />}
      </div>
    </>
  );

  // ------------------------------------------------------------------ tabs

  async function Overview() {
    const data = await withSchool(current.ctx, async (tx) => {
      const [contacts, designations, departments, staff, campuses, fields, roles, access] = await Promise.all([
        tx.emergencyContact.findMany({ where: { staffId: s!.id, archivedAt: null }, orderBy: { priority: "asc" } }),
        tx.designation.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
        tx.department.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } }),
        tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }),
        tx.campus.findMany({ where: { archivedAt: null } }),
        tx.customField.findMany({ where: { recordType: "staff", archivedAt: null }, orderBy: { sortOrder: "asc" } }),
        tx.role.findMany({ where: { isEnabled: true, archivedAt: null, key: { not: "student" } }, orderBy: { name: "asc" } }),
        s!.userLoginId ? tx.schoolAccess.findFirst({ where: { userLoginId: s!.userLoginId }, orderBy: { createdAt: "desc" }, include: { roles: { include: { role: true } } } }) : null,
      ]);
      const settings = await hrSettings(tx, current.ctx);
      return { contacts, designations, departments, staff, campuses, fields, roles, access, settings };
    });
    const custom = (s!.customFields ?? {}) as Record<string, unknown>;
    const fields = data.fields.filter((f) => f.visibility === "everyone" || viewer.restricted);
    const contacts = data.contacts.length ? data.contacts : s!.emergencyName ? [{ id: "legacy", name: s!.emergencyName, relation: "", phone: s!.emergencyPhone ?? "" }] : [];
    const v: ProfileValues = {
      staffId: s!.id, fullName: s!.fullName, dateOfBirth: s!.dateOfBirth ? isoDay(s!.dateOfBirth) : "", gender: s!.gender ?? "", bloodGroup: s!.bloodGroup ?? "",
      address: s!.address ?? "", permanentAddress: s!.permanentAddress ?? "", qualification: s!.qualification ?? "", experienceYears: s!.experienceYears?.toString() ?? "",
      phone: s!.phone, email: s!.email ?? "", phoneVerified: s!.phoneVerified, emailVerified: s!.emailVerified,
      staffCode: s!.staffCode, departmentId: s!.departmentId ?? "", designation: s!.designation, joiningDate: isoDay(s!.joiningDate), employmentType: s!.employmentType,
      reportingToId: s!.reportingToId ?? "", campusId: s!.campusId,
      emergency: contacts.map((c) => ({ name: c.name, relation: c.relation, phone: c.phone })),
      bankIfsc: s!.bankIfsc ?? "", bankName: s!.bankName ?? "", uan: s!.uan ?? "", esiNo: s!.esiNo ?? "",
    };
    const editable = canEdit && !left;
    const accessRoles = data.access?.roles.map((r) => r.role) ?? [];
    const exceptions = (data.access?.exceptions ?? {}) as Record<string, AccessLevel>;
    const base = combineLevels(accessRoles.map((r) => r.permissions as RolePermissions));
    const extras = extraPermissions(base, exceptions);
    const roleOptions = data.roles.filter((r, i) => data.roles.findIndex((x) => (x.key ?? x.id) === (r.key ?? r.id)) === i).map((r) => ({ key: r.key ?? r.id, name: r.name, lines: roleLines(r.permissions as RolePermissions).map((l) => `${l.module}: ${l.words}`) }));
    const defaultRole = data.designations.find((d) => d.name === s!.designation)?.defaultRoleKey ?? null;

    const loginPill = head.login ? (head.login.status === "ACTIVE" && !data.access?.archivedAt ? <Pill tone="ok">Active</Pill> : head.login.status === "INVITED" ? <Pill tone="warn">Invite not used yet</Pill> : <Pill tone="bad">Switched off</Pill>) : null;
    const verified = (ok: boolean) => ok ? <Pill tone="ok" className="!h-5 !text-[11px]">Verified</Pill> : <Pill className="!h-5 !text-[11px]">Not verified</Pill>;

    return (
      <Split side={380}>
        <Col>
          <Card>
            <CardHeader title="Personal details" action={hr && !left ? <PersonalForm v={v} action={savePersonal} defaultOpen={editOpen === "personal"} /> : undefined} />
            <DL rows={[
              ["Full name", s!.fullName],
              ["Date of birth", s!.dateOfBirth ? formatDate(s!.dateOfBirth, tz) : null],
              ["Gender", s!.gender],
              ["Blood group", s!.bloodGroup],
              ["Aadhaar", showRestricted(s!.aadhaarEnc, viewer.restricted)],
              ["Qualifications", s!.qualification],
              ["Experience", s!.experienceYears !== null ? `${s!.experienceYears} years` : null],
              ["Home address", s!.address],
              ["Permanent address", s!.permanentAddress],
            ]} />
          </Card>
          <Card>
            <CardHeader title="Employment" action={hr && !left ? (
              <EmploymentForm v={v} action={saveEmployment} designations={data.designations.map((d) => ({ value: d.name, label: d.name }))} departments={data.departments.map((d) => ({ value: d.id, label: d.name }))}
                staff={data.staff.map((x) => ({ value: x.id, label: x.fullName }))} campuses={data.campuses.map((c) => ({ value: c.id, label: c.name }))} types={[...EMPLOYMENT_TYPES]} />
            ) : undefined} />
            <DL rows={[
              ["Staff ID", <span key="c" className="font-mono">{s!.staffCode}</span>],
              ["Designation", s!.designation],
              ["Department", s!.department?.name],
              ["Joining date", formatDate(s!.joiningDate, tz)],
              ["Employment type", s!.employmentType],
              ["Reporting manager", head.manager ? <Link key="m" href={`${BASE}/${head.manager.id}`} className="font-medium text-brand hover:underline">{head.manager.fullName}</Link> : null],
              ...(data.campuses.length > 1 ? [["Campus", head.campus?.name] as [string, React.ReactNode]] : []),
              ["Status", `${statusLabel(s!.status)}${s!.leavingDate ? `, left ${formatDate(s!.leavingDate, tz)}` : ""}`],
            ]} />
          </Card>
          <Card>
            <CardHeader title="Emergency contacts" description="Called in this order" action={editable ? <EmergencyForm v={v} action={saveEmergency} /> : undefined} />
            {contacts.length === 0 ? <p className="px-5 pb-5 text-[14px] text-ink3">No emergency contact yet.{editable ? " Add one so the school knows whom to call." : ""}</p> : (
              <ol className="divide-y divide-line px-5 pb-3">
                {contacts.map((c, i) => (
                  <li key={c.id} className="flex items-center gap-3 py-2.5">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-sunken text-[12px] font-semibold tnum">{i + 1}</span>
                    <span className="min-w-0 flex-1"><span className="font-semibold">{c.name}</span>{c.relation ? <span className="text-ink3"> · {c.relation}</span> : null}</span>
                    {c.phone && <a href={`tel:+91${c.phone}`} className="tnum hover:underline">{c.phone}</a>}
                  </li>
                ))}
              </ol>
            )}
          </Card>
          {fields.length > 0 && (
            <Card>
              <CardHeader title="Extra fields" description="Added in Settings, Forms & Approvals." action={hr && !left ? (
                <ExtraFieldsForm staffId={s!.id} action={saveExtraFields} fields={fields.map((f) => ({ key: f.key, label: f.label, fieldType: f.fieldType, required: f.required, choices: f.choices, value: custom[f.key] ? String(custom[f.key]) : "" }))} />
              ) : undefined} />
              <DL rows={fields.map((f) => [f.label, custom[f.key] ? String(custom[f.key]) : null] as [string, React.ReactNode])} />
            </Card>
          )}
          {viewer.restricted && (
            <Card>
              <CardHeader title="Restricted details" description="Shown in full only to HR, the School Admin and the Principal." action={hr && !left ? <RestrictedForm v={v} action={saveRestricted} /> : undefined} />
              <DL rows={[
                ["Aadhaar", showRestricted(s!.aadhaarEnc, true)],
                ["PAN", showRestricted(s!.panEnc, true)],
                ["Bank account", showRestricted(s!.bankAccountEnc, true)],
                ["IFSC", s!.bankIfsc],
              ]} />
            </Card>
          )}
        </Col>
        <Col>
          <Card>
            <CardHeader title="Contact" icon={Phone} action={hr && !left ? <ContactForm v={v} action={saveContact} /> : undefined} />
            <ul className="space-y-3 px-5 pb-5 text-[14px]">
              <li className="flex flex-wrap items-center gap-2"><Phone size={17} className="text-ink3" aria-hidden="true" /><a href={`tel:+91${s!.phone}`} className="tnum hover:underline">+91 {s!.phone}</a>{verified(s!.phoneVerified)}</li>
              {s!.email ? <li className="flex flex-wrap items-center gap-2"><Mail size={17} className="text-ink3" aria-hidden="true" /><a href={`mailto:${s!.email}`} className="break-all hover:underline">{s!.email}</a>{verified(s!.emailVerified)}</li>
                : <li className="flex items-center gap-2 text-ink3"><Mail size={17} aria-hidden="true" />No email</li>}
              {head.onLeave && s!.status === "ACTIVE" && <li className="flex items-center gap-2"><CalendarDays size={17} className="text-warn" aria-hidden="true" />On leave until {formatDate(head.onLeave.toDate, tz)}</li>}
            </ul>
          </Card>
          {(hr || mine) && (
            <Card>
              <CardHeader title="Login and roles" icon={KeyRound} description="What they can open in School OS." />
              <div className="space-y-3 px-5 pb-5">
                {head.login ? (
                  <>
                    <DL cols={1} className="!px-0 !pb-0" rows={[
                      ["Username", <span key="u" className="font-mono">{head.login.username}</span>],
                      ["Login", loginPill],
                      ["Roles", accessRoles.map((r) => r.name).join(", ") || null],
                      ["Last sign-in", head.login.lastSignInAt ? formatDateTime(head.login.lastSignInAt, tz) : "Never"],
                    ]} />
                    {extras.length > 0 && (
                      <Banner tone="warn" title={`${extras.length} extra permission${extras.length === 1 ? "" : "s"} beyond the role${accessRoles.length === 1 ? "" : "s"}.`}>
                        {extras.map((k) => `${MODULES.find((m) => m.key === k)?.name} (${exceptions[k]})`).join(", ")}. Change it in Settings, Users &amp; Permissions.
                      </Banner>
                    )}
                    {hr && (
                      <div className="flex flex-wrap items-start gap-2">
                        {head.login.status !== "DISABLED" && !data.access?.archivedAt && <NewLinkButton staffId={s!.id} action={newSignInLink} />}
                        {viewer.roleKeys.some((k) => k === "principal" || k === "school-admin") && !mine && (
                          <SwitchLoginForm staffId={s!.id} on={head.login.status === "DISABLED" || Boolean(data.access?.archivedAt)} action={switchLoginAction} />
                        )}
                      </div>
                    )}
                  </>
                ) : hr && !left ? (
                  <>
                    <p className="text-[14px] text-ink2">{s!.fullName} has no login yet.</p>
                    <GiveLoginForm staffId={s!.id} roles={roleOptions} defaultRole={defaultRole} modules={MODULES.map((m) => ({ key: m.key, name: m.name }))} action={giveLoginAction}
                      suggested={`${s!.firstName.toLowerCase()}${s!.lastName ? `.${s!.lastName.toLowerCase().replace(/\s+/g, "")}` : ""}`} />
                  </>
                ) : <p className="text-[14px] text-ink3">No login.</p>}
              </div>
            </Card>
          )}
          <p className="flex gap-1.5 text-[12.5px] text-ink3"><Info size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            {hr ? "Every change is kept in the history (Settings, Data Backup & Security, audit log), with the value before and after." : "HR keeps this record. You can change your photo and emergency contacts; ask HR to change anything else."}
          </p>
        </Col>
      </Split>
    );
  }

  async function Classes() {
    const data = await withSchool(current.ctx, async (tx) => {
      const year = await leaveYearFor(tx, current.ctx, today, s!.campusId);
      if (!year) return null;
      const [allocs, sections] = await Promise.all([
        tx.teacherAllocation.findMany({ where: { staffId: s!.id, academicYearId: year.id, archivedAt: null }, include: { section: { include: { schoolClass: true } }, subject: true }, orderBy: [{ section: { schoolClass: { sortOrder: "asc" } } }] }),
        tx.section.findMany({ where: { classTeacherId: s!.id, academicYearId: year.id, archivedAt: null }, include: { schoolClass: true } }),
      ]);
      return { year, allocs, sections };
    });
    if (!data) return <EmptyState title="No academic year is open">Classes are given in Teacher Allocation once the academic year is opened in Academic Management.</EmptyState>;
    return (
      <div className="space-y-5">
        <Card>
          <CardHeader title="Class teacher of" description={data.year.name} />
          <CardBody>{data.sections.length ? <p className="font-medium">{data.sections.map((x) => `${x.schoolClass.name} ${x.name}`).join(", ")}</p> : <p className="text-ink-2">Not a class teacher this year.</p>}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Classes and subjects" description={`From Teacher Allocation, ${data.year.name}`} action={hr ? <ButtonLink size="sm" href="/academic-management">Teacher Allocation</ButtonLink> : undefined} />
          <CardBody>
            {data.allocs.length === 0 ? <p className="text-ink-2">No classes given yet. Classes are given in Add Staff step 3 or in Teacher Allocation.</p> : (
              <ul className="divide-y divide-line">
                {data.allocs.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span><span className="font-medium">{a.section.schoolClass.name} {a.section.name}</span> · {a.subject.name}</span>
                    {!a.isMain && <Badge>Second teacher</Badge>}
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    );
  }

  async function TimeTable() {
    const data = await withSchool(current.ctx, async (tx) => {
      const version = await tx.timetableVersion.findFirst({ where: { campusId: s!.campusId, status: "PUBLISHED", archivedAt: null, OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: today } }] }, orderBy: { effectiveFrom: "desc" } });
      if (!version) return null;
      const periods = await tx.timetablePeriod.findMany({ where: { versionId: version.id, staffId: s!.id, archivedAt: null }, include: { section: { include: { schoolClass: true } }, subject: true }, orderBy: [{ dayOfWeek: "asc" }, { periodNo: "asc" }] });
      return { version, periods };
    });
    if (!data) return <EmptyState title="No published Time Table">The teacher&apos;s week shows here once a Time Table is published in Academic Management.</EmptyState>;
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    const nos = [...new Set(data.periods.map((p) => p.periodNo))].sort((a, b) => a - b);
    if (data.periods.length === 0) return <EmptyState title="No periods on the Time Table">{s!.fullName} has no periods in {data.version.name}.</EmptyState>;
    return (
      <Card>
        <CardHeader title="Time Table" description={`${data.version.name}${data.version.effectiveFrom ? `, from ${formatDate(data.version.effectiveFrom, tz)}` : ""} · ${data.periods.length} periods a week`} />
        <CardBody>
          <div className="hidden relative overflow-x-auto [contain:inline-size] md:block">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Periods by day</caption>
              <thead><tr><th scope="col" className="p-2 text-ink-2">Day</th>{nos.map((n) => <th key={n} scope="col" className="p-2 text-ink-2">Period {n}</th>)}</tr></thead>
              <tbody className="divide-y divide-line">
                {days.map((d, i) => (
                  <tr key={d}>
                    <th scope="row" className="p-2 font-medium">{d}</th>
                    {nos.map((n) => {
                      const p = data.periods.find((x) => x.dayOfWeek === i + 1 && x.periodNo === n);
                      return <td key={n} className="p-2 align-top">{p ? <><span className="font-medium">{p.section.schoolClass.name} {p.section.name}</span><span className="block text-ink-2">{p.subject?.name}</span></> : <span className="text-ink-2">–</span>}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ul className="space-y-3 md:hidden">
            {days.map((d, i) => {
              const list = data.periods.filter((p) => p.dayOfWeek === i + 1);
              return (
                <li key={d}>
                  <p className="font-medium">{d}</p>
                  <p className="text-sm text-ink-2">{list.length ? list.map((p) => `P${p.periodNo} ${p.section.schoolClass.name} ${p.section.name} ${p.subject?.name ?? ""}`).join(" · ") : "Free"}</p>
                </li>
              );
            })}
          </ul>
        </CardBody>
      </Card>
    );
  }

  async function Attendance() {
    const m = typeof sp.month === "string" && /^\d{4}-\d{2}$/.test(sp.month) ? new Date(`${sp.month}-01T00:00:00Z`) : monthStart(today);
    const from = monthStart(m);
    const to = monthEnd(m);
    const data = await withSchool(current.ctx, async (tx) => {
      const [holidays, leaves] = await Promise.all([
        holidaySet(tx, current.ctx, from, to, s!.campusId),
        tx.leaveRequest.findMany({ where: { staffId: s!.id, status: "APPROVED", archivedAt: null, fromDate: { lte: to }, toDate: { gte: from } } }),
      ]);
      const types = await tx.leaveType.findMany({ where: { id: { in: leaves.map((l) => l.leaveTypeId) } } });
      return { holidays, leaves, types };
    });
    const prev = isoDay(addDays(from, -1)).slice(0, 7);
    const next = isoDay(addDays(to, 1)).slice(0, 7);
    const lead = isoWeekday(from) - 1;
    let leaveDays = 0;
    let working = 0;
    const cells = eachDay(from, to).map((d) => {
      const iso = isoDay(d);
      const sunday = isoWeekday(d) === 7;
      const holiday = data.holidays.has(iso);
      const leave = data.leaves.find((l) => l.fromDate <= d && l.toDate >= d);
      if (!sunday && !holiday) working++;
      if (leave && !sunday && !holiday) leaveDays += leave.halfDay ? 0.5 : 1;
      const label = sunday ? "Sunday" : holiday ? "Holiday" : leave ? (data.types.find((t) => t.id === leave.leaveTypeId)?.name ?? "Leave") + (leave.halfDay ? " (half)" : "") : d > today ? "" : "Working day";
      return { d, iso, sunday, holiday, leave: Boolean(leave) && !sunday && !holiday, label };
    });
    return (
      <Card>
        <CardHeader title={`Attendance, ${monthLabel(from)}`} description={`${working} working days · ${daysText(leaveDays)} on leave`}
          action={<div className="flex gap-2"><ButtonLink size="sm" href={`${href("attendance")}&month=${prev}`} aria-label="Previous month">‹ Previous</ButtonLink><ButtonLink size="sm" href={`${href("attendance")}&month=${next}`} aria-label="Next month">Next ›</ButtonLink></div>} />
        <CardBody>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-ink-2" aria-hidden="true">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((x) => <span key={x}>{x}</span>)}</div>
          <ol className="mt-1 grid grid-cols-7 gap-1" aria-label={`Days of ${monthLabel(from)}`}>
            {Array.from({ length: lead }, (_, i) => <li key={`e${i}`} aria-hidden="true" />)}
            {cells.map((c) => (
              <li key={c.iso} title={c.label} aria-label={`${formatDate(c.d, tz)}: ${c.label || "Upcoming"}`}
                className={`min-h-12 rounded-lg border p-1 text-left text-xs ${c.leave ? "border-warn/40 bg-warn-bg text-warn-text" : c.holiday || c.sunday ? "border-line bg-surface-2 text-ink-2" : "border-line"} ${c.iso === isoDay(today) ? "ring-2 ring-brand" : ""}`}>
                <span className="font-medium">{c.d.getUTCDate()}</span>
                <span className="hidden truncate sm:block">{c.leave || c.holiday ? c.label : ""}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-sm text-ink-2">Leave and holidays come from Staff Leave and the School Calendar. Present, absent and late marks are added by Staff Attendance in <Link href="/attendance-management" className="text-brand-text underline">Attendance Management</Link>.</p>
        </CardBody>
      </Card>
    );
  }

  async function Leave() {
    const data = await withSchool(current.ctx, async (tx) => {
      const year = await leaveYearFor(tx, current.ctx, today, s!.campusId);
      const balances = year ? (await balancesFor(tx, current.ctx, [s!.id], year.id)).get(s!.id) ?? [] : [];
      const history = await tx.leaveRequest.findMany({ where: { staffId: s!.id, archivedAt: null }, orderBy: { fromDate: "desc" }, take: 30 });
      const types = await tx.leaveType.findMany({ where: { forWhom: "staff" } });
      return { year, balances, history, types };
    });
    return (
      <div className="space-y-5">
        <Card>
          <CardHeader title="Leave balance" description={data.year?.name} action={(hr || mine) && !left ? <ButtonLink size="sm" href={`${BASE}/leave?apply=${s!.id}`} variant="primary">Apply for leave</ButtonLink> : undefined} />
          <CardBody>
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {data.balances.filter((b) => b.limited).map((b) => (
                <li key={b.type.id} className="rounded-xl border border-line p-3">
                  <p className="text-sm text-ink-2">{b.type.name}</p>
                  <p className="text-2xl font-semibold">{b.left}<span className="text-sm font-normal text-ink-2"> left</span></p>
                  <p className="text-xs text-ink-2">{b.given + b.adjusted} allocated · {b.used} used{b.waiting ? ` · ${b.waiting} waiting` : ""}</p>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Leave history" />
          <CardBody>
            {data.history.length === 0 ? <p className="text-ink-2">No leave taken yet.</p> : (
              <ul className="divide-y divide-line">
                {data.history.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span><span className="font-medium">{data.types.find((t) => t.id === l.leaveTypeId)?.name}</span> · {formatDate(l.fromDate, tz)}{isoDay(l.fromDate) !== isoDay(l.toDate) ? ` to ${formatDate(l.toDate, tz)}` : ""} · {daysText(Number(l.days))}</span>
                    <Badge tone={l.status === "APPROVED" ? "success" : l.status === "WAITING" ? "warning" : l.status === "REJECTED" ? "danger" : "neutral"}>{l.status === "WAITING" ? "Waiting" : l.status === "APPROVED" ? "Approved" : l.status === "REJECTED" ? "Not approved" : "Cancelled"}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    );
  }

  async function Workload() {
    const data = await withSchool(current.ctx, async (tx) => {
      const year = await leaveYearFor(tx, current.ctx, today, s!.campusId);
      const version = await tx.timetableVersion.findFirst({ where: { campusId: s!.campusId, status: "PUBLISHED", archivedAt: null, OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: today } }] }, orderBy: { effectiveFrom: "desc" } });
      const periods = version ? await tx.timetablePeriod.count({ where: { versionId: version.id, staffId: s!.id, isBreak: false, archivedAt: null } }) : 0;
      const range = year ? { gte: year.startDate, lte: year.endDate } : undefined;
      const [taken, given] = await Promise.all([
        tx.substitution.count({ where: { substituteStaffId: s!.id, status: "ARRANGED", archivedAt: null, date: range } }),
        tx.substitution.count({ where: { absentStaffId: s!.id, status: { not: "CANCELLED" }, archivedAt: null, date: range } }),
      ]);
      return { periods, taken, given, year };
    });
    const pct = Math.min(100, Math.round((data.periods / PERIOD_LIMIT) * 100));
    return (
      <Card>
        <CardHeader title="Workload" description={data.year?.name} />
        <CardBody className="space-y-4">
          <div>
            <p className="font-medium">{data.periods} of {PERIOD_LIMIT} periods a week</p>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-surface-3" role="meter" aria-valuemin={0} aria-valuemax={PERIOD_LIMIT} aria-valuenow={data.periods} aria-label="Periods a week">
              <div className={`h-full ${data.periods > PERIOD_LIMIT ? "bg-danger" : "bg-brand"}`} style={{ width: `${pct}%` }} />
            </div>
            {data.periods > PERIOD_LIMIT && <p className="mt-1 text-sm text-danger">Over the limit by {data.periods - PERIOD_LIMIT} periods.</p>}
          </div>
          <dl className="grid gap-4 sm:grid-cols-2">
            <Detail label="Substitutions taken this year">{data.taken}</Detail>
            <Detail label="Their periods covered by others">{data.given}</Detail>
          </dl>
        </CardBody>
      </Card>
    );
  }

  async function Performance() {
    const data = await withSchool(current.ctx, async (tx) => {
      const [appraisals, training, promotions] = await Promise.all([
        tx.appraisal.findMany({ where: { staffId: s!.id }, include: { cycle: true }, orderBy: { createdAt: "desc" } }),
        tx.trainingRecord.findMany({ where: { staffId: s!.id, archivedAt: null }, orderBy: { fromDate: "desc" } }),
        tx.promotionRecord.findMany({ where: { staffId: s!.id }, orderBy: { effectiveFrom: "desc" } }),
      ]);
      return { appraisals, training, promotions };
    });
    const any = data.appraisals.length + data.training.length + data.promotions.length > 0;
    if (!any) {
      return (
        <EmptyState title="No appraisals, training or promotions yet">
          {features.size ? "They appear here when recorded in Recruitment & Appraisal." : "Appraisal, training and promotions can be switched on in HR Settings."}
          {hr && <div className="mt-4"><ButtonLink href={features.size ? `${BASE}/recruitment` : `${BASE}/settings`}>{features.size ? "Recruitment & Appraisal" : "HR Settings"}</ButtonLink></div>}
        </EmptyState>
      );
    }
    return (
      <div className="space-y-5">
        {data.appraisals.length > 0 && (
          <Card>
            <CardHeader title="Appraisals" />
            <CardBody><ul className="divide-y divide-line">{data.appraisals.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span className="font-medium">{a.cycle.name}</span>
                <span>{a.status === "DONE" ? <Badge tone="success">Rating {Number(a.finalRating).toFixed(1)} of 5</Badge> : <Badge tone="warning">{a.status === "SELF_REVIEW" ? "Self review" : "Manager review"}</Badge>}</span></li>
            ))}</ul></CardBody>
          </Card>
        )}
        {data.training.length > 0 && (
          <Card>
            <CardHeader title="Training" />
            <CardBody><ul className="divide-y divide-line">{data.training.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span><span className="font-medium">{t.course}</span>{t.provider ? ` · ${t.provider}` : ""}</span>
                <span className="text-sm text-ink-2">{formatDate(t.fromDate, tz)} · {Number(t.hours)} hours {t.certificateFileId && <a className="text-brand-text underline" href={`${BASE}/files/${t.certificateFileId}`} target="_blank" rel="noopener">Certificate</a>}</span></li>
            ))}</ul></CardBody>
          </Card>
        )}
        {data.promotions.length > 0 && (
          <Card>
            <CardHeader title="Promotions" />
            <CardBody><ul className="divide-y divide-line">{data.promotions.map((p) => (
              <li key={p.id} className="py-2"><span className="font-medium">{p.fromDesignation} → {p.toDesignation}</span> <span className="text-sm text-ink-2">from {formatDate(p.effectiveFrom, tz)} · {p.reason}</span></li>
            ))}</ul></CardBody>
          </Card>
        )}
      </div>
    );
  }

  async function Documents() {
    const types = await withSchool(current.ctx, async (tx) => (await hrSettings(tx, current.ctx)).documentTypes);
    const docs = s!.documents;
    return (
      <Card>
        <CardHeader title="Documents" description="Certificates, ID proof and contracts, with expiry dates." action={hr && !left ? <UploadDocumentForm staffOptions={[{ value: s!.id, label: s!.fullName }]} types={types} action={uploadDocument} fixedStaffId={s!.id} /> : undefined} />
        <CardBody>
          {docs.length === 0 ? <p className="text-ink-2">No documents yet.{hr ? " Upload certificates, ID proof and contracts with their expiry dates to get reminders." : " Give your documents to HR."}</p> : (
            <ul className="divide-y divide-line">
              {docs.map((d) => {
                const status = docStatus(d, today);
                return (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <div>
                      <p className="font-medium">{d.kind}{d.number ? <span className="font-normal text-ink-2"> · {showDocNumber(d.kind, d.number, viewer.restricted)}</span> : null}</p>
                      <p className="text-sm text-ink-2">{d.issuedOn ? `Issued ${formatDate(d.issuedOn, tz)}` : ""}{d.issuedOn && d.expiresOn ? " · " : ""}{d.expiresOn ? `Expires ${formatDate(d.expiresOn, tz)}` : "No expiry"}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge tone={DOC_TONE[status]}>{status}</Badge>
                      {d.fileId && <a href={`${BASE}/files/${d.fileId}`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center px-2 font-medium text-brand-text hover:underline">Open</a>}
                      {hr && !left && <UploadDocumentForm staffOptions={[{ value: s!.id, label: s!.fullName }]} types={types} action={uploadDocument} fixedStaffId={s!.id} replace={{ id: d.id, kind: d.kind }} />}
                      {hr && !left && (
                        <ConfirmButton trigger="Remove" triggerVariant="danger-soft" title={`Remove ${d.kind}?`} confirmLabel="Remove document" confirmVariant="danger" onConfirm={removeDocumentAction.bind(null, d.id)}>
                          It is taken off {s!.fullName}’s record and its expiry reminders stop. Use this for a document added by mistake. The file itself is kept for the record.
                        </ConfirmButton>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>
    );
  }

  async function Salary() {
    // Salary tab (mod-staff.jsx ProfileSalary). Amounts only with full Salary Management;
    // HR's View sees days, leave and loss of pay; a person sees a link to their own slips.
    const level = salaryLevel(current.permissions);
    const money = level === "full";
    const data = await withSchool(current.ctx, async (tx) => {
      const structure = money ? await tx.salaryStructure.findFirst({ where: { staffId: s!.id, archivedAt: null, effectiveFrom: { lte: today } }, orderBy: [{ effectiveFrom: "desc" }, { version: "desc" }] }) : null;
      const lines = await tx.payrollLine.findMany({ where: { staffId: s!.id, included: true, run: { status: { in: ["APPROVED", "PAID", "LOCKED"] } } }, include: { run: { select: { month: true, paidOn: true } } }, orderBy: { run: { month: "desc" } }, take: 3 });
      return { structure, lines };
    });
    const last = data.lines[0];
    const monthWord = (d: Date) => d.toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
    if (mine && level === "own") {
      return (
        <Card className="p-5 flex flex-col md:flex-row md:items-center gap-4">
          <span className="w-12 h-12 rounded-2xl bg-brand/10 text-brand grid place-items-center shrink-0"><Wallet size={22} aria-hidden="true" /></span>
          <div className="flex-1"><p className="font-semibold text-[15px]">Your salary slips are in Salary, My Salary Slips</p><p className="text-[13.5px] text-ink3">{last ? `${monthWord(last.run.month)} ${last.run.paidOn ? `was paid on ${formatDate(last.run.paidOn)}` : "is approved"}. ` : ""}Only you can see your slips.</p></div>
          <ButtonLink variant="primary" icon={ArrowUpRight} href="/salary-management/slips?mine=1">My salary slips</ButtonLink>
        </Card>
      );
    }
    const st = data.structure;
    return (
      <div className="space-y-5">
        <Split>
          {money ? (
            <Card>
              <CardHeader title="Monthly salary" description={st ? `Structure v${st.version} · from ${formatDate(st.effectiveFrom)} · shown only to people with Salary Management` : "No salary structure yet"} icon={Lock} />
              {st ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 px-5 pb-5">
                  <div><p className="text-[12px] text-ink3 font-semibold">Gross</p><p className="text-[18px] font-semibold tnum">{formatRupees(st.grossPaise)}</p></div>
                  <div><p className="text-[12px] text-ink3 font-semibold">Deductions</p><p className="text-[18px] font-semibold tnum">{last ? formatRupees(last.deductionsPaise) : "—"}</p></div>
                  <div><p className="text-[12px] text-ink3 font-semibold">Net</p><p className="text-[18px] font-semibold tnum text-ok">{last ? formatRupees(last.netPaise) : "—"}</p></div>
                </div>
              ) : <p className="px-5 pb-4 text-[14px] text-ink3">Left out of the monthly salary until one is added.</p>}
              <div className="px-5 pb-5"><ButtonLink variant="secondary" icon={ArrowUpRight} href={`/salary-management/structures?open=${s!.id}`}>Open in Salary Management</ButtonLink></div>
            </Card>
          ) : (
            <Card>
              <CardHeader title="Salary days" description="Days, leave and loss of pay that reached the salary. Amounts are not shown here." icon={Lock} />
              <div className="px-5 pb-5"><ButtonLink variant="secondary" icon={ArrowUpRight} href={`/salary-management/history?tab=staff&who=${s!.id}`}>Open Salary History</ButtonLink></div>
            </Card>
          )}
          <Card>
            <CardHeader title="Last 3 months" />
            {data.lines.length ? (
              <ul className="px-2 pb-2">
                {data.lines.map((l) => (
                  <li key={l.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5">
                    <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-sunken text-ink2"><ReceiptText size={19} aria-hidden="true" /></span>
                    <div className="min-w-0 flex-1"><p className="font-semibold text-[14.5px]">{monthWord(l.run.month)}</p><p className="text-[12.5px] text-ink3">{l.run.paidOn ? `paid ${formatDate(l.run.paidOn)}` : "approved"}{!money ? ` · ${Number(l.paidDays)} paid days` : ""}</p></div>
                    {money ? <b className="font-semibold tnum">{formatRupees(l.netPaise)}</b> : <span className="tnum text-[13px] text-ink2">{Number(l.lopDays)} days loss of pay</span>}
                  </li>
                ))}
              </ul>
            ) : <p className="px-5 pb-5 text-[14px] text-ink3">No approved salary yet.</p>}
          </Card>
        </Split>
        <Card>
          <CardHeader title="Bank and statutory numbers" description="Used for the salary bank file and the PF and ESI statements" />
          <CardBody>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Detail label="Bank account">{showRestricted(s!.bankAccountEnc, viewer.restricted)}</Detail>
              <Detail label="IFSC">{s!.bankIfsc}</Detail>
              <Detail label="Bank">{s!.bankName}</Detail>
              <Detail label="PAN">{showRestricted(s!.panEnc, viewer.restricted)}</Detail>
              <Detail label="UAN (PF)">{s!.uan}</Detail>
              <Detail label="ESI number">{s!.esiNo}</Detail>
            </dl>
          </CardBody>
        </Card>
      </div>
    );
  }
}

// Keeps the module list import used for type checking of exceptions.
export type _Modules = ModuleKey;
