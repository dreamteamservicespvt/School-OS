import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BellOff, CalendarCheck2, CircleCheck, CircleX, Ban, Hourglass, Paperclip, Plus, ClipboardCheck } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { fileLink } from "@/lib/files";
import { readListParams, skipTake, listHref, PAGE_SIZE } from "@/lib/list";
import { periodFromSearch, dateWhere } from "@/lib/periods";
import { periodSetup } from "@/lib/period-setup";
import { daysText } from "@/lib/staff/leave";
import { isoDay, monthStart } from "@/lib/staff/dates";
import { attendancePage } from "@/lib/attendance/page";
import { BASE } from "@/lib/attendance/access";
import { STUDENT_LEAVE_STATUS } from "@/lib/attendance/student-leave";
import { LEAVE_STATUSES, studentLeaveDetail, studentLeaveList, studentsInReach } from "@/lib/attendance/student-leave-list";
import { attendanceSettings } from "@/lib/attendance/settings";
import { REASONS_FEATURE } from "@/lib/attendance/absence-reasons";
import Link from "next/link";
import { buttonClass } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Banner } from "@/components/ui/banner";
import { Stats } from "@/components/ui/stats";
import { Chips } from "@/components/ui/chips";
import { DL, Timeline } from "@/components/ui/rows";
import { DataList, Pager } from "@/app/(school)/attendance-management/_components/data-list";
import { CloseSheetButton, UrlSearch, UrlSelect, UrlSheet } from "@/components/ui/url-controls";
import { PeriodFilter } from "@/components/list/period-filter";
import { EmptyState } from "@/components/empty-state";
import { AttHead } from "../_components/att-head";
import { ExportMenu } from "../_components/export-menu";
import { AllTick, BulkApprove, ReasonButton, RecordLeaveButton, RowTick, TapButton } from "../_components/leave-ui";
import { rangeText } from "../_components/dates";
import { approveManyStudentLeaveAction, approveStudentLeaveAction, cancelStudentLeaveAction, findStudents, previewStudentLeave, recordStudentLeaveAction, rejectStudentLeaveAction } from "./actions";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Student Leave") };
}

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const TONE: Record<string, "warn" | "ok" | "bad" | "neutral"> = { WAITING: "warn", APPROVED: "ok", REJECTED: "bad", CANCELLED: "neutral" };
const BULK = "leave-bulk";

export default async function StudentLeavePage({ searchParams }: Props) {
  const raw = await searchParams;
  const params = readListParams(raw, ["section", "type"]);
  const { current, access, features, today, tz } = await attendancePage();
  if (access.studentLeave === "none") redirect("/no-access?m=attendance-management");
  // Student leave is the class teacher's and the office's; people who look after the whole school follow it in Approvals.
  if (access.pages.studentLeave === "hidden") redirect(`${BASE}/register`);
  const status = typeof raw.status === "string" && (raw.status === "all" || (LEAVE_STATUSES as readonly string[]).includes(raw.status)) ? raw.status : "WAITING";
  const openId = typeof raw.open === "string" ? raw.open : null;
  const dates = await periodSetup(current);
  const range = periodFromSearch(raw, dates);
  const path = `${BASE}/student-leave`;
  const canRecord = access.change !== "none";
  const ownOnly = access.studentLeave === "own";
  const office = access.studentLeave === "all" && !access.full && !access.classSections.length;

  const data = await withSchool(current.ctx, async (tx) => {
    const list = await studentLeaveList(tx, current.ctx, access, { q: params.q, section: params.filters.section, type: params.filters.type, range, status, ...skipTake(params) });
    const open = openId ? await studentLeaveDetail(tx, current.ctx, access, openId) : null;
    const settings = await attendanceSettings(tx, current.ctx);
    // The numbers on top: waiting, on leave today, approved this month and the absence messages not sent for them.
    const reach = list.sections.map((s) => s.id);
    const scope = ownOnly ? { sectionId: { in: reach } } : {};
    // The same students as the list: their own class's, their campus's when limited to one campus, or everyone.
    const mine = await studentsInReach(tx, access);
    const who = mine ? { in: mine } : { not: null };
    const [onLeaveToday, monthLeave, oldestWaiting, approvedMonth] = await Promise.all([
      tx.leaveRequest.count({ where: { status: "APPROVED", archivedAt: null, studentId: who, fromDate: { lte: today }, toDate: { gte: today } } }),
      tx.attendanceMark.count({ where: { date: dateWhere({ period: "month", from: isoDay(monthStart(today)), to: isoDay(today), label: "" }), statusKey: "leave", studentId: who, archivedAt: null, ...scope } }),
      tx.leaveRequest.findFirst({ where: { status: "WAITING", archivedAt: null, studentId: who }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
      tx.leaveRequest.findMany({ where: { status: "APPROVED", archivedAt: null, studentId: who, fromDate: { lte: today }, toDate: { gte: monthStart(today) } }, select: { days: true, studentId: true } }),
    ]);
    return { ...list, open, settings, onLeaveToday, monthLeave, oldestWaiting, approvedMonth };
  });

  type Row = (typeof data.rows)[number];
  const name = (r: { studentId: string | null }) => data.students.get(r.studentId!)?.fullName ?? "Student";
  const cls = (r: { studentId: string | null }) => data.classOf.get(r.studentId!) ?? "";
  const when = (r: Row) => rangeText(r.fromDate, r.toDate);
  const days = (r: Row) => (Number(r.days) === 0.5 ? "Half day" : daysText(Number(r.days)));
  const statusPill = (r: Row) => <Pill tone={TONE[r.status] ?? "neutral"}>{STUDENT_LEAVE_STATUS[r.status]?.label ?? r.status}</Pill>;
  const qs = (change: Record<string, string | null>) => {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(raw)) if (typeof v === "string" && !["open", "page"].includes(k)) sp.set(k, v);
    for (const [k, v] of Object.entries(change)) { if (v) sp.set(k, v); else sp.delete(k); }
    return sp.size ? `${path}?${sp}` : path;
  };
  const all = Object.values(data.counts).reduce((a, b) => a + b, 0);
  const waiting = data.counts.WAITING ?? 0;
  const filtered = Boolean(params.q || params.filters.section || params.filters.type || range);
  const bulkOn = status === "WAITING" && data.rows.some((r) => data.decidable.has(r.id));
  const exportHref = `${path}/export?${new URLSearchParams(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string" && !["open", "page"].includes(e[0]))).toString()}`;
  const sub = ownOnly
    ? `${data.sections.filter((s) => access.classSections.includes(s.id)).map((s) => s.name).join(", ") || "Your class"} only · you decide up to ${data.settings.classTeacherLeaveDays} days; longer leave goes to the Principal`
    : office ? "You record leave for parents, who have no login. Class teachers and the Principal decide."
      : "Leave requests for students, recorded by staff when a parent calls, writes or messages";
  const approvedDays = data.approvedMonth.reduce((a, l) => a + Number(l.days), 0);
  const o = data.open;
  const classes = ownOnly ? data.sections.filter((s) => access.classSections.includes(s.id)) : data.sections;

  return (
    <>
      <AttHead access={access} features={features} userId={current.user.id} href={path} sub={sub}
        actions={canRecord && data.types.length > 0 ? (
          <RecordLeaveButton action={recordStudentLeaveAction} preview={previewStudentLeave} find={findStudents} today={isoDay(today)} defaultOpen={raw.record === "1"}
            types={data.types.map((t) => ({ value: t.id, label: t.name }))} placeholder={ownOnly ? "Name or admission no. in your class" : "Name or admission no."}
            sub="For a parent who called, wrote or messaged. Parents have no login." />
        ) : undefined} />

      <div className="flex flex-col gap-5 lg:gap-6">
        {office && features.has(REASONS_FEATURE) && (
          <Banner tone="info" title="A parent called about an absence?" action={<Link href={`${BASE}/register/absences`} className={buttonClass("secondary", "sm")}><Words k="Open the absent list" /></Link>}>
            <Words k="Record why the student was absent in the day's absent list. Record leave here when the parent asks for days off." />
          </Banner>
        )}
        <Stats items={[
          { label: "Waiting", value: waiting, sub: waiting ? (ownOnly ? "For you to decide" : data.oldestWaiting ? `Oldest from ${formatDate(data.oldestWaiting.createdAt, tz)}` : "To decide") : "Nothing to decide", tone: waiting ? "warn" : "ok", icon: Hourglass, href: qs({ status: null }) },
          { label: "On leave today", value: data.onLeaveToday, sub: "Students, all approved", icon: CalendarCheck2 },
          { label: `Approved in ${new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" }).format(today)}`, value: data.approvedMonth.length, sub: `${approvedDays} school ${approvedDays === 1 ? "day" : "days"}`, icon: CircleCheck, href: qs({ status: "APPROVED" }) },
          { label: "Absence messages held", value: data.monthLeave, sub: "Not sent for approved leave this month", icon: BellOff },
        ]} />

        <Card className="overflow-hidden">
          <div className="px-3 pt-3">
            <Chips label="Leave status" value={status} options={[
              ...LEAVE_STATUSES.map((s) => ({ value: s, label: STUDENT_LEAVE_STATUS[s].label, count: data.counts[s] ?? 0, href: qs({ status: s === "WAITING" ? null : s }) })),
              { value: "all", label: "All", count: all, href: qs({ status: "all" }) },
            ]} />
          </div>
          <div className="flex flex-col lg:flex-row gap-2 p-3 border-b border-line">
            <UrlSearch placeholder="Student name or admission no." />
            <div className="grid grid-cols-2 sm:flex gap-2">
              {classes.length > 1 && <UrlSelect param="section" label="Class" className="sm:w-40" options={[{ value: "", label: "All classes" }, ...classes.map((s) => ({ value: s.id, label: s.name }))]} />}
              <UrlSelect param="type" label="Leave type" className="sm:w-40" options={[{ value: "", label: "All types" }, ...data.types.map((t) => ({ value: t.id, label: t.name }))]} />
              <PeriodFilter {...dates} allLabel="All dates" />
              <ExportMenu href={exportHref} />
            </div>
          </div>
          {bulkOn && <form id={BULK} className="hidden" />}
          {bulkOn && <BulkApprove formId={BULK} action={approveManyStudentLeaveAction} />}
          <DataList rows={data.rows} rowKey={(r) => r.id} href={(r) => qs({ open: r.id })} minWidth={880} caption="Student leave"
            lead={bulkOn ? { header: <AllTick formId={BULK} />, cell: (r) => (data.decidable.has(r.id) ? <RowTick formId={BULK} id={r.id} label={`Select ${name(r)}`} /> : null) } : undefined}
            columns={[
              { key: "name", label: "Student", render: (r) => <div className="flex items-center gap-3"><Avatar name={name(r)} size={34} /><div><p className="font-semibold leading-tight">{name(r)}</p><p className="text-[12.5px] text-ink3">{cls(r)}</p></div></div> },
              { key: "type", label: "Type", render: (r) => data.typeNames.get(r.leaveTypeId) ?? "Leave" },
              { key: "when", label: "Dates", render: (r) => <div><p className="tnum whitespace-nowrap">{when(r)}</p><p className="text-[12px] text-ink3">{days(r)}</p></div> },
              { key: "reason", label: "Reason", render: (r) => <p className="text-ink2 max-w-[220px] truncate">{r.documentFileId && <Paperclip size={13} className="inline mr-1 text-ink3" aria-label="Has a document" />}{r.reason}</p> },
              { key: "rec", label: "Recorded by", render: (r) => <p className="text-[13px] text-ink2 whitespace-nowrap">{data.users.get(r.recordedById ?? "") ?? "Staff"}</p> },
              { key: "st", label: "Status", render: (r) => <div>{statusPill(r)}{r.decidedById && r.status !== "WAITING" && <p className="text-[11.5px] text-ink3 mt-0.5 whitespace-nowrap">{data.users.get(r.decidedById)}</p>}</div> },
            ]}
            mobile={(r) => ({ avatar: name(r), title: `${name(r)} · ${cls(r)}`, sub: `${data.typeNames.get(r.leaveTypeId) ?? "Leave"} · ${when(r)}`, pills: statusPill(r) })}
            footer={<Pager page={params.page} pageSize={PAGE_SIZE} total={data.total} href={(p) => listHref(path, params, { page: p, status: status === "WAITING" ? null : status })} />}
            empty={<EmptyState bare Icon={CalendarCheck2} title={status === "WAITING" && !filtered ? "No leave waiting" : "No leave matches"}
              action={canRecord && data.types.length ? <a href={qs({ record: "1" })} className="text-[14px] font-semibold text-brand hover:underline inline-flex items-center gap-1.5"><Plus size={16} aria-hidden="true" /><Words k="Record leave" /></a> : undefined}>
              {status === "WAITING" && !filtered ? "When a parent asks for leave, record it here." : "Try another status, class or date."}
            </EmptyState>} />
        </Card>
        {!ownOnly && (
          <Banner tone="info" title="Who decides:">
            <Words k="class teachers decide for their own section up to" /> {data.settings.classTeacherLeaveDays} <Words k="days. Longer leave" />{data.settings.quotaOverNeedsApproval ? ", and leave over the quota," : ""} <Words k="goes to the Principal. Set in Attendance Settings, Student leave." />
          </Banner>
        )}
        {data.types.length === 0 && <Banner tone="warn" title="No leave types yet."><Words k="Add student leave types in Attendance Settings, Student leave." /></Banner>}
      </div>

      {o && (
        <UrlSheet wide title={`${name(o.r)} · ${o.classOf.get(o.r.studentId!) ?? ""}`} sub={`${o.typeNames.get(o.r.leaveTypeId) ?? "Leave"} leave · ${rangeText(o.r.fromDate, o.r.toDate)}`}
          footer={<>
            {canRecord && (o.r.status === "APPROVED" || o.r.status === "WAITING") && (
              <div className="mr-auto"><ReasonButton label="Cancel leave" variant="ghost" title={`Cancel leave for ${name(o.r)}?`} sub="The record stays, marked Cancelled, with your reason."
                confirm="Cancel leave" chips={["Parent called: child came to school", "Recorded by mistake", "Trip postponed"]} action={cancelStudentLeaveAction} hidden={{ requestId: o.r.id }} field="reason" closeParam="open" /></div>
            )}
            {o.decidable.has(o.r.id) ? (
              <>
                <ReasonButton label="Reject" title={`Reject leave for ${name(o.r)}?`} sub="The reason is saved with the request." confirm="Reject leave"
                  chips={["Falls on an exam day", "Too many days this term", "Please send a doctor's note"]} action={rejectStudentLeaveAction} hidden={{ requestId: o.r.id }} closeParam="open" />
                <TapButton label="Approve" pendingText="Approving…" action={approveStudentLeaveAction} hidden={{ requestId: o.r.id }} closeParam="open" />
              </>
            ) : <CloseSheetButton />}
          </>}>
          <div className="flex flex-col gap-4">
            {o.r.status === "WAITING" && !o.decidable.has(o.r.id) && (
              <Banner tone="info" title={`Waiting for ${o.waitingFor ?? "the approver"}.`}>
                {o.r.recordedById === current.user.id ? "You recorded it; someone else decides." : `It is past ${ownOnly ? "your" : "the class teacher's"} limit, or over the quota, so the Principal decides.`}
              </Banner>
            )}
            <div className="rounded-xl border border-line pt-4">
              <DL rows={[
                ["Student", name(o.r)],
                ["Class", `${o.classOf.get(o.r.studentId!) ?? ""}${o.rollOf.get(o.r.studentId!) ? ` · Roll ${o.rollOf.get(o.r.studentId!)}` : ""}`],
                ["Leave type", o.typeNames.get(o.r.leaveTypeId) ?? "Leave"],
                ["Dates", `${formatDate(o.r.fromDate, "UTC")} to ${formatDate(o.r.toDate, "UTC")}${o.r.halfDay ? " · half day" : ""}`],
                ["School days", Number(o.r.days) === 0.5 ? "Half a day" : String(Number(o.r.days))],
                ["Balance", o.quota ?? "No quota for this type"],
                ["Reason", o.r.reason],
                ["Recorded by", `${o.users.get(o.r.recordedById ?? "") ?? "Staff"} · for the parent`],
              ]} />
            </div>
            {o.r.documentFileId
              ? <a href={fileLink(o.r.documentFileId, current.ctx.schoolId)} target="_blank" rel="noopener" className="flex items-center gap-3 rounded-xl border border-line px-3 py-2.5 hover:bg-sunken"><Paperclip size={17} className="text-ink3" aria-hidden="true" /><span className="font-semibold text-[14px]"><Words k="Open the document" /></span></a>
              : <p className="text-[13px] text-ink3"><Words k="No document. A doctor's note can be added any time by recording it again." /></p>}
            <div>
              <p className="eyebrow text-ink3 mb-2"><Words k="History" /></p>
              <Timeline items={[
                ...(o.r.status !== "WAITING" && o.r.decidedAt ? [{
                  icon: o.r.status === "APPROVED" ? CircleCheck : o.r.status === "REJECTED" ? CircleX : Ban, tone: TONE[o.r.status] as "ok" | "bad" | "neutral",
                  what: `${STUDENT_LEAVE_STATUS[o.r.status]?.label ?? o.r.status}${o.r.decidedById ? ` by ${o.users.get(o.r.decidedById) ?? "staff"}` : ""}${o.r.decisionReason ? `: ${o.r.decisionReason}` : ""}`,
                  when: formatDateTime(o.r.decidedAt, tz),
                }] : []),
                { icon: ClipboardCheck, what: `Recorded by ${o.users.get(o.r.recordedById ?? "") ?? "staff"} for the parent.`, when: formatDateTime(o.r.createdAt, tz) },
              ]} />
            </div>
          </div>
        </UrlSheet>
      )}
    </>
  );
}
