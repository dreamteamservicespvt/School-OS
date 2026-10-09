import type { Metadata } from "next";
import Link from "next/link";
import { withSchool } from "@/lib/db";
import { attendancePage } from "@/lib/attendance/page";
import { BASE } from "@/lib/attendance/access";
import { registerChoices } from "@/lib/attendance/register";
import { lockState, roster, sectionInfo, dayText } from "@/lib/attendance/marks";
import { statusList, statusesFor } from "@/lib/attendance/settings";
import { dayInfo, offDayMessage } from "@/lib/attendance/calendar";
import { day, isoDay } from "@/lib/staff/dates";
import { UUID_RE } from "@/lib/staff/act";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { CorrectionForm } from "../../_components/correction-form";
import { UrlFilters } from "../../_components/url-filters";
import { requestCorrectionAction } from "../actions";

export const metadata: Metadata = { title: "Request a correction" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

export default async function CorrectionPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { current, access, settings, tz, today, now } = await attendancePage("edit");
  const forWhom = one(sp.for) === "staff" ? "staff" : "student";
  const wantedDate = one(sp.date);
  const date = wantedDate && /^\d{4}-\d{2}-\d{2}$/.test(wantedDate) && day(wantedDate) <= today ? day(wantedDate) : today;
  const periodNo = Math.max(0, Number.parseInt(one(sp.period) ?? "0", 10) || 0);
  const ticked = new Set(many(sp.student).concat(many(sp.staff)).filter((x) => UUID_RE.test(x)));

  const data = await withSchool(current.ctx, async (tx) => {
    const statuses = statusesFor(await statusList(tx, current.ctx), forWhom === "staff" ? "staff" : "students");
    if (forWhom === "staff") {
      if (access.staff !== "all") return { statuses, sections: [], section: null, people: null, info: await dayInfo(tx, current.ctx, date, access.campusId) };
      const staff = await tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, staffCode: true } });
      const marks = await tx.attendanceMark.findMany({ where: { staffId: { in: staff.map((s) => s.id) }, date, periodNo: 0, archivedAt: null }, select: { staffId: true, statusKey: true } });
      const staffNow = new Map(marks.map((m) => [m.staffId!, m.statusKey]));
      return {
        statuses, sections: [], section: null, info: await dayInfo(tx, current.ctx, date, access.campusId),
        people: staff.map((s) => ({ id: s.id, label: `${s.fullName} (${s.staffCode})`, current: staffNow.get(s.id) ?? null, checked: ticked.has(s.id) })),
      };
    }
    const sections = await registerChoices(tx, access);
    const section = sections.find((s) => s.id === one(sp.section)) ?? sections[0] ?? null;
    if (!section) return { statuses, sections, section: null, people: null, info: null };
    const info = await sectionInfo(tx, section.id);
    const students = info ? await roster(tx, section.id, info.academicYearId, settings.registerOrder) : [];
    const marks = await tx.attendanceMark.findMany({ where: { sectionId: section.id, date, periodNo, archivedAt: null, studentId: { not: null } }, select: { studentId: true, statusKey: true } });
    const nowMap = new Map(marks.map((m) => [m.studentId!, m.statusKey]));
    return {
      statuses, sections, section, info: await dayInfo(tx, current.ctx, date, info?.campusId ?? null),
      people: students.map((s) => ({ id: s.studentId, label: `${s.rollNo ? `${s.rollNo}. ` : ""}${s.name}`, current: nowMap.get(s.studentId) ?? null, checked: ticked.has(s.studentId) })),
    };
  });

  const lock = lockState(settings, date, now, tz);
  const back = forWhom === "staff" ? `${BASE}/staff?date=${isoDay(date)}` : `${BASE}/register?section=${data.section?.id ?? ""}&month=${isoDay(date).slice(0, 7)}`;

  return (
    <>
      <PageHeader title="Request a correction" href={`${BASE}/register/correction`} userId={current.user.id}>
        <Link href={back} className="font-medium text-brand-text hover:underline">Back to the {forWhom === "staff" ? "staff attendance" : "register"}</Link>
      </PageHeader>

      {forWhom === "staff" && access.staff !== "all" ? (
        <Alert tone="danger">Only HR, the School Admin or the Principal can correct staff attendance. Ask them if your own attendance is wrong.</Alert>
      ) : forWhom === "student" && data.sections.length === 0 ? (
        <EmptyState title="No classes to correct">You are not class teacher or subject teacher of any section this year.</EmptyState>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
          <Card>
            <CardHeader title={forWhom === "staff" ? `Staff attendance, ${dayText(date)}` : `${data.section?.name ?? ""}, ${dayText(date)}${periodNo ? `, period ${periodNo}` : ""}`}
              description="The request goes to Approvals. When it is approved the register changes, and the original marks stay in the audit log." />
            <CardBody>
              <UrlFilters fields={[
                ...(forWhom === "student" ? [{ name: "section", label: "Class and section", type: "select" as const, value: data.section?.id ?? "", options: data.sections.map((s) => ({ value: s.id, label: s.name })) }] : []),
                { name: "date", label: "Date", type: "date", value: isoDay(date), max: isoDay(today) },
              ]} reset={["student", "staff"]} />
              {data.info && !data.info.on && <Alert tone="warning" className="mb-4">{offDayMessage(data.info, date)} Corrections are only for days attendance is taken.</Alert>}
              {!lock.locked && !(data.info && !data.info.on) && (
                <Alert tone="info" className="mb-4">
                  Attendance for {dayText(date)} is not locked yet (it locks at {lock.atText}). You can still change it directly in{" "}
                  <Link className="font-medium underline" href={forWhom === "staff" ? `${BASE}/staff?date=${isoDay(date)}` : `${BASE}?section=${data.section?.id ?? ""}&date=${isoDay(date)}${periodNo ? `&period=${periodNo}` : ""}`}>{forWhom === "staff" ? "Staff Attendance" : "Take Attendance"}</Link>.
                </Alert>
              )}
              {data.people && data.people.length > 0 && !(data.info && !data.info.on) ? (
                <CorrectionForm key={`${data.section?.id}:${isoDay(date)}`} action={requestCorrectionAction} forWhom={forWhom} people={data.people}
                  statuses={data.statuses.map((s) => ({ key: s.key, name: s.name, letter: s.letter, tone: s.tone }))}
                  hidden={{ forWhom, sectionId: data.section?.id ?? "", date: isoDay(date), periodNo: String(periodNo) }} />
              ) : data.people && data.people.length === 0 ? (
                <EmptyState title="Nobody to correct">There are no {forWhom === "staff" ? "staff" : "students"} here.</EmptyState>
              ) : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="How corrections work" />
            <CardBody className="space-y-2 text-sm text-ink-2">
              <p>Attendance locks at {lock.atText} each day (Attendance Settings).</p>
              <p>After that, a change needs a correction request with a reason. The principal decides it in Approvals.</p>
              <p>When it is approved, the register, the % and the reports change. The marks as they were before stay in the audit log.</p>
              <p>A correction does not send a new absence message.</p>
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
