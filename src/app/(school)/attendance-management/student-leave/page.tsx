import type { Metadata } from "next";
import { redirect } from "next/navigation";
import type { Prisma } from "@prisma/client";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { fileLink } from "@/lib/files";
import { readListParams, skipTake } from "@/lib/list";
import { daysText } from "@/lib/staff/leave";
import { isoDay, monthEnd, monthLabel } from "@/lib/staff/dates";
import { UUID_RE } from "@/lib/staff/act";
import { attendancePage } from "@/lib/attendance/page";
import { BASE } from "@/lib/attendance/access";
import { registerChoices, readMonth } from "@/lib/attendance/register";
import { canDecideStudentLeave, STUDENT_LEAVE_STATUS, studentLeaveTypes } from "@/lib/attendance/student-leave";
import { PageHeader } from "@/components/shell/page-header";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/list/data-table";
import { ListToolbar } from "@/components/list/list-toolbar";
import { EmptyState } from "@/components/empty-state";
import { SubNav } from "../../staff-hr-management/_components/bits";
import { DecisionButtons } from "../_components/decision";
import { CancelStudentLeave, RecordLeaveForm } from "../_components/leave-forms";
import { approveStudentLeaveAction, cancelStudentLeaveAction, findStudents, previewStudentLeave, recordStudentLeaveAction, rejectStudentLeaveAction } from "./actions";

export const metadata: Metadata = { title: "Student Leave" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const STATUS_KEYS = ["WAITING", "APPROVED", "REJECTED", "CANCELLED"] as const;

export default async function StudentLeavePage({ searchParams }: Props) {
  const raw = await searchParams;
  const params = readListParams(raw, ["section", "type", "month"]);
  const { current, access, today } = await attendancePage();
  if (access.studentLeave === "none") redirect(BASE);
  const status = typeof raw.status === "string" && (raw.status === "all" || (STATUS_KEYS as readonly string[]).includes(raw.status)) ? raw.status : "WAITING";
  const openId = typeof raw.open === "string" && UUID_RE.test(raw.open) ? raw.open : null;
  const path = `${BASE}/student-leave`;
  const canRecord = access.change !== "none";

  const data = await withSchool(current.ctx, async (tx) => {
    const [types, sections] = await Promise.all([studentLeaveTypes(tx, current.ctx), registerChoices(tx, access)]);
    const mySections = access.studentLeave === "all" ? null : access.classSections;
    // Students in reach: everyone, or the class teacher's own sections this year.
    const inReach = mySections && access.yearId
      ? (await tx.enrolment.findMany({ where: { sectionId: { in: mySections }, academicYearId: access.yearId, archivedAt: null }, select: { studentId: true } })).map((e) => e.studentId)
      : null;
    const sectionFilter = params.filters.section && UUID_RE.test(params.filters.section)
      ? (await tx.enrolment.findMany({ where: { sectionId: params.filters.section, archivedAt: null }, select: { studentId: true } })).map((e) => e.studentId)
      : null;
    const nameMatch = params.q
      ? (await tx.student.findMany({ where: { OR: [{ fullName: { contains: params.q, mode: "insensitive" } }, { admissionNo: { contains: params.q, mode: "insensitive" } }] }, select: { id: true }, take: 500 })).map((s) => s.id)
      : null;
    const month = readMonth(params.filters.month);
    const idLists = [inReach, sectionFilter, nameMatch].filter((x): x is string[] => x !== null);
    const ids = idLists.length ? idLists.reduce((a, b) => a.filter((x) => b.includes(x))) : null;
    const base: Prisma.LeaveRequestWhereInput = {
      studentId: ids ? { in: ids } : { not: null },
      archivedAt: null,
      ...(params.filters.type && UUID_RE.test(params.filters.type) ? { leaveTypeId: params.filters.type } : {}),
      ...(month ? { fromDate: { lte: monthEnd(month) }, toDate: { gte: month } } : {}),
    };
    const where: Prisma.LeaveRequestWhereInput = { ...base, ...(status === "all" ? {} : { status: status as (typeof STATUS_KEYS)[number] }) };
    const [rows, total, counts] = await Promise.all([
      tx.leaveRequest.findMany({ where, orderBy: [{ fromDate: "desc" }, { createdAt: "desc" }], ...skipTake(params) }),
      tx.leaveRequest.count({ where }),
      tx.leaveRequest.groupBy({ by: ["status"], where: base, _count: true }),
    ]);
    const open = openId && !rows.some((r) => r.id === openId) ? await tx.leaveRequest.findFirst({ where: { ...base, id: openId } }) : null;
    const all = open ? [open, ...rows] : rows;
    const studentIds = [...new Set(all.map((r) => r.studentId!))];
    const [students, enrolments, users] = await Promise.all([
      tx.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, fullName: true, admissionNo: true } }),
      tx.enrolment.findMany({ where: { studentId: { in: studentIds }, archivedAt: null, ...(access.yearId ? { academicYearId: access.yearId } : {}) }, select: { studentId: true, sectionId: true } }),
      tx.userLogin.findMany({ where: { id: { in: all.flatMap((r) => [r.recordedById, r.decidedById]).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } }),
    ]);
    const sectionNames = new Map(sections.map((s) => [s.id, s.name]));
    const missing = enrolments.map((e) => e.sectionId).filter((x) => !sectionNames.has(x));
    if (missing.length) for (const s of await tx.section.findMany({ where: { id: { in: missing } }, include: { schoolClass: { select: { name: true } } } })) sectionNames.set(s.id, `${s.schoolClass.name} ${s.name}`);
    const decidable = new Set<string>();
    for (const r of all) if (r.status === "WAITING" && (await canDecideStudentLeave(tx, current.ctx, access, r))) decidable.add(r.id);
    // Months of this academic year for the filter.
    const year = access.yearId ? await tx.academicYear.findUnique({ where: { id: access.yearId } }) : null;
    const months: { value: string; label: string }[] = [];
    if (year) for (let m = new Date(Date.UTC(year.startDate.getUTCFullYear(), year.startDate.getUTCMonth(), 1)); m <= year.endDate; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) months.push({ value: isoDay(m).slice(0, 7), label: monthLabel(m) });
    return {
      rows: all, total, counts: new Map(counts.map((c) => [c.status, c._count])), types, sections, months, decidable, open,
      students: new Map(students.map((s) => [s.id, s])),
      classOf: new Map(enrolments.map((e) => [e.studentId, sectionNames.get(e.sectionId) ?? ""])),
      users: new Map(users.map((u) => [u.id, u.displayName])),
      typeNames: new Map(types.map((t) => [t.id, t.name])),
    };
  });

  type Row = (typeof data.rows)[number];
  const name = (r: Row) => data.students.get(r.studentId!)?.fullName ?? "Student";
  const dates = (r: Row) => (isoDay(r.fromDate) === isoDay(r.toDate) ? formatDate(r.fromDate, "UTC") : `${formatDate(r.fromDate, "UTC")} to ${formatDate(r.toDate, "UTC")}`);
  const statusQs = (s: string) => {
    const sp = new URLSearchParams();
    if (params.q) sp.set("q", params.q);
    for (const [k, v] of Object.entries(params.filters)) sp.set(k, v);
    if (s !== "WAITING") sp.set("status", s);
    const q = sp.toString();
    return q ? `${path}?${q}` : path;
  };
  const columns: Column<Row>[] = [
    { key: "student", label: "Student", cell: (r) => <span className={r.id === openId ? "font-semibold text-brand-text" : ""}>{name(r)}</span>, phone: "title" },
    { key: "class", label: "Class", cell: (r) => data.classOf.get(r.studentId!) ?? "", phone: "meta" },
    { key: "type", label: "Leave type", cell: (r) => data.typeNames.get(r.leaveTypeId) ?? "Leave", phone: "meta" },
    { key: "dates", label: "From and to", cell: (r) => `${dates(r)}${r.halfDay ? " (half day)" : ""}`, phone: "meta" },
    { key: "days", label: "Days", cell: (r) => daysText(Number(r.days)) },
    { key: "reason", label: "Reason", cell: (r) => <span className="line-clamp-2 max-w-xs">{r.reason}</span>, phone: "meta" },
    { key: "doc", label: "Document", cell: (r) => (r.documentFileId ? <a href={fileLink(r.documentFileId, current.ctx.schoolId)} target="_blank" rel="noopener" className="font-medium text-brand-text hover:underline">Open<span className="sr-only"> document for {name(r)}</span></a> : <span className="text-ink-2">None</span>) },
    { key: "status", label: "Status", cell: (r) => <Badge tone={STUDENT_LEAVE_STATUS[r.status]?.tone ?? "neutral"}>{STUDENT_LEAVE_STATUS[r.status]?.label ?? r.status}</Badge>, phone: "badge" },
    { key: "by", label: "Recorded by", cell: (r) => data.users.get(r.recordedById ?? "") ?? "" },
    { key: "decided", label: "Decided by", cell: (r) => (r.decidedById ? `${data.users.get(r.decidedById) ?? ""}${r.decisionReason && r.status === "REJECTED" ? `: ${r.decisionReason}` : ""}` : r.status === "CANCELLED" && r.decisionReason ? `Cancelled: ${r.decisionReason}` : "") },
  ];
  const actions = (r: Row) => {
    const closed = r.status === "REJECTED" || r.status === "CANCELLED";
    if (closed || !canRecord) return null;
    return (
      <div className="flex flex-wrap items-start justify-end gap-2">
        {data.decidable.has(r.id) && (
          <DecisionButtons hidden={{ requestId: r.id }} canDecide canWithdraw={false} what="leave" approve={approveStudentLeaveAction} reject={rejectStudentLeaveAction} />
        )}
        <CancelStudentLeave requestId={r.id} action={cancelStudentLeaveAction} name={name(r)} />
      </div>
    );
  };
  const views = [
    ...STATUS_KEYS.map((s) => ({ key: s, label: STUDENT_LEAVE_STATUS[s].label, href: statusQs(s), count: s === "WAITING" ? data.counts.get(s) ?? 0 : undefined })),
    { key: "all", label: "All", href: statusQs("all") },
  ];
  const filtered = Boolean(params.q || Object.keys(params.filters).length);

  return (
    <>
      <PageHeader title="Student Leave" href={path} userId={current.user.id}>
        {canRecord && data.types.length > 0 && (
          <RecordLeaveForm action={recordStudentLeaveAction} preview={previewStudentLeave} find={findStudents} today={isoDay(today)}
            types={data.types.map((t) => ({ value: t.id, label: t.name }))} defaultOpen={raw.record === "1"} />
        )}
      </PageHeader>
      <SubNav items={views} current={status} />
      <ListToolbar placeholder="Search student name or admission number" showArchived={false} filters={[
        { key: "section", label: "Class", options: data.sections.map((s) => ({ value: s.id, label: s.name })) },
        { key: "type", label: "Type", options: data.types.map((t) => ({ value: t.id, label: t.name })) },
        { key: "month", label: "Month", options: data.months },
      ]} />
      <DataTable rows={data.rows} columns={columns} rowKey={(r) => r.id} total={data.total + (data.open ? 1 : 0)} params={params} path={path} actions={actions}
        caption="Student leave"
        empty={<EmptyState title={filtered ? "No leave matches" : status === "WAITING" ? "No leave waiting" : "No student leave here"}>
          {filtered ? "Try another search or reset the filters." : status === "WAITING" ? "Nothing is waiting for a decision. Record leave when a parent calls, writes or messages." : "Record leave when a parent calls, writes or messages."}
        </EmptyState>} />
      {data.types.length === 0 && <p className="mt-3 text-sm text-ink-2">No student leave types are set up. Add them in Attendance Settings.</p>}
    </>
  );
}
