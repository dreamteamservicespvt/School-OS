import type { Metadata } from "next";
import Link from "next/link";
import { withSchool } from "@/lib/db";
import { attendancePage } from "@/lib/attendance/page";
import { BASE, staffLimit } from "@/lib/attendance/access";
import { registerChoices } from "@/lib/attendance/register";
import { lockState, roster, sectionInfo, dayText } from "@/lib/attendance/marks";
import { statusList, statusesFor } from "@/lib/attendance/settings";
import { dayInfo, offDayMessage } from "@/lib/attendance/calendar";
import { day, isoDay } from "@/lib/staff/dates";
import { UUID_RE } from "@/lib/staff/act";
import { ArrowLeft, CalendarX2, ClipboardPen as ClipboardIcon, Info, Lock, ShieldCheck, Users } from "lucide-react";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Banner } from "@/components/ui/banner";
import { ButtonLink } from "@/components/ui/button";
import { Timeline } from "@/components/ui/rows";
import { EmptyState } from "@/components/empty-state";
import { AttHead } from "../../_components/att-head";
import { CorrectionForm } from "../../_components/correction-form";
import { UrlFilters } from "../../_components/url-filters";
import { requestCorrectionAction } from "../actions";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Request a correction" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

export default async function CorrectionPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { current, access, features, settings, tz, today, now } = await attendancePage("edit");
  const forWhom = one(sp.for) === "staff" ? "staff" : "student";
  const wantedDate = one(sp.date);
  const date = wantedDate && /^\d{4}-\d{2}-\d{2}$/.test(wantedDate) && day(wantedDate) <= today ? day(wantedDate) : today;
  const periodNo = Math.max(0, Number.parseInt(one(sp.period) ?? "0", 10) || 0);
  const ticked = new Set(many(sp.student).concat(many(sp.staff)).filter((x) => UUID_RE.test(x)));

  const data = await withSchool(current.ctx, async (tx) => {
    const statuses = statusesFor(await statusList(tx, current.ctx), forWhom === "staff" ? "staff" : "students");
    if (forWhom === "staff") {
      if (access.staff !== "all") return { statuses, sections: [], section: null, people: null, info: await dayInfo(tx, current.ctx, date, access.campusId) };
      const staff = await tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] }, AND: [staffLimit(access)] }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, staffCode: true } });
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
      <AttHead access={access} features={features} userId={current.user.id} href={`${BASE}/register/correction`} sub="Request a correction: the principal approves it, and the original stays in the audit log"
        actions={<ButtonLink href={back} icon={ArrowLeft}><Words k="Back to the" /> {forWhom === "staff" ? "staff attendance" : "register"}</ButtonLink>} />

      {forWhom === "staff" && access.staff !== "all" ? (
        <Banner tone="bad" title="Not for your role."><Words k="Only HR, the School Admin or the Principal can correct staff attendance. Ask them if your own attendance is wrong." /></Banner>
      ) : forWhom === "student" && data.sections.length === 0 ? (
        <EmptyState title="No classes to correct" Icon={Users}><Words k="You are not class teacher or subject teacher of any section this year." /></EmptyState>
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
              {data.info && !data.info.on && <Banner tone="warn" icon={CalendarX2} className="mb-4">{offDayMessage(data.info, date)} <Words k="Corrections are only for days attendance is taken." /></Banner>}
              {!lock.locked && !(data.info && !data.info.on) && (
                <Banner tone="info" icon={Info} className="mb-4">
                  <Words k="Attendance for" /> {dayText(date)} <Words k="is not locked yet (it locks at" /> {lock.atText}<Words k="). You can still change it directly in" />{" "}
                  <Link className="font-medium underline" href={forWhom === "staff" ? `${BASE}/staff?date=${isoDay(date)}` : `${BASE}?section=${data.section?.id ?? ""}&date=${isoDay(date)}${periodNo ? `&period=${periodNo}` : ""}`}>{forWhom === "staff" ? "Staff Attendance" : "Take Attendance"}</Link>.
                </Banner>
              )}
              {data.people && data.people.length > 0 && !(data.info && !data.info.on) ? (
                <CorrectionForm key={`${data.section?.id}:${isoDay(date)}`} action={requestCorrectionAction} forWhom={forWhom} people={data.people}
                  statuses={data.statuses.map((s) => ({ key: s.key, name: s.name, letter: s.letter, tone: s.tone }))}
                  hidden={{ forWhom, sectionId: data.section?.id ?? "", date: isoDay(date), periodNo: String(periodNo) }} />
              ) : data.people && data.people.length === 0 ? (
                <EmptyState bare title="Nobody to correct" Icon={Users}><Words k="There are no" /> {forWhom === "staff" ? "staff" : "students"} <Words k="here." /></EmptyState>
              ) : null}
            </CardBody>
          </Card>
          <Card className="self-start">
            <CardHeader title="How corrections work" />
            <CardBody>
              <Timeline items={[
                { icon: Lock, tone: "warn", what: `Attendance locks at ${lock.atText} each day`, when: "Set in Attendance Settings" },
                { icon: ClipboardIcon, tone: "brand", what: "You ask for the change with a reason", when: "It goes to Approvals" },
                { icon: ShieldCheck, tone: "ok", what: "The principal approves it", when: "The register, % and reports change. The original stays in the audit log." },
              ]} />
              <p className="mt-4 text-[13px] text-ink3"><Words k="A correction does not send a new absence message to parents." /></p>
            </CardBody>
          </Card>
        </div>
      )}
    </>
  );
}
