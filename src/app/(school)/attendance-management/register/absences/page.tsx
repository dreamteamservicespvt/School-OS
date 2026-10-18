import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarX2, Settings2, UserX } from "lucide-react";
import { withSchool } from "@/lib/db";
import { sectionInCampus } from "@/lib/campus";
import { attendancePage } from "@/lib/attendance/page";
import { BASE } from "@/lib/attendance/access";
import { absentList, mayOpenAbsentList, reasonChoices, REASONS_FEATURE, SOURCE_WORDS } from "@/lib/attendance/absence-reasons";
import { registerChoices } from "@/lib/attendance/register";
import { dayText } from "@/lib/attendance/marks";
import { isoDay } from "@/lib/staff/dates";
import { UUID_RE } from "@/lib/staff/act";
import { Card } from "@/components/ui/card";
import { Chips } from "@/components/ui/chips";
import { Pill } from "@/components/ui/badge";
import { Stats } from "@/components/ui/stats";
import { buttonClass } from "@/components/ui/button";
import { UrlDate, UrlSelect } from "@/components/ui/url-controls";
import { EmptyState } from "@/components/empty-state";
import { AttHead } from "../../_components/att-head";
import { DataList } from "../../_components/data-list";
import { ReasonButton } from "../../_components/reason-form";
import { setAbsenceReasonAction } from "../actions";

export const metadata: Metadata = { title: "Absent list" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);

/**
 * The day's absent list (Attendance Register): who was absent on a date and
 * why. The class teacher or the office sets the reason later, for example
 * after the parent calls back. Only the reason changes, never the mark.
 */
export default async function AbsentListPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { current, access, features, today } = await attendancePage();
  if (!mayOpenAbsentList(access)) redirect(`${BASE}/reports`);
  const path = `${BASE}/register/absences`;
  const on = features.has(REASONS_FEATURE);
  const asked = one(sp.date);
  const date = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) && new Date(`${asked}T00:00:00Z`) <= today ? new Date(`${asked}T00:00:00Z`) : today;
  const wantedSection = one(sp.section);
  const reasonFilter = one(sp.reason) ?? "";
  const choices = reasonChoices(access.seesFees);

  const data = await withSchool(current.ctx, async (tx) => {
    // Every campus's current year; only their campus's sections when their access is limited to one campus.
    const sections = access.students === "all" || access.studentLeave === "all"
      ? (await tx.section.findMany({ where: { ...(access.yearIds.length ? { academicYearId: { in: access.yearIds } } : {}), archivedAt: null, ...sectionInCampus({ campusId: access.campusLimit }) }, include: { schoolClass: { select: { name: true, sortOrder: true } } } }))
        .sort((a, b) => a.schoolClass.sortOrder - b.schoolClass.sortOrder || a.name.localeCompare(b.name)).map((s) => ({ id: s.id, name: `${s.schoolClass.name} ${s.name}` }))
      : await registerChoices(tx, access);
    const sectionId = wantedSection && UUID_RE.test(wantedSection) && sections.some((s) => s.id === wantedSection) ? wantedSection : null;
    const rows = on ? await absentList(tx, current.ctx, access, { date, sectionId }) : [];
    return { sections, rows };
  });
  const rows = reasonFilter ? data.rows.filter((r) => (reasonFilter === "none" ? !r.reason : r.reason?.key === reasonFilter)) : data.rows;
  const notKnown = data.rows.filter((r) => !r.reason || r.reason.key === "not-known").length;
  const iso = isoDay(date);
  const isToday = iso === isoDay(today);

  return (
    <>
      <AttHead access={access} features={features} userId={current.user.id} href={path} sub={`Absent list · ${isToday ? "today" : dayText(date)}`} />
      <div className="flex flex-col gap-4">
        {access.students !== "none" && access.pages.register !== "hidden" && (
          <Chips label="Register views" value="absences" options={[
            { value: "class", label: "Class register", href: `${BASE}/register` },
            { value: "student", label: "Student calendar", href: `${BASE}/register?view=student` },
            { value: "absences", label: "Absent list", href: path },
            { value: "corrections", label: "Corrections", href: `${BASE}/register/corrections` },
          ]} />
        )}
        {!on ? (
          <EmptyState title="Absence reasons are off" Icon={Settings2}
            action={access.admin ? <Link href={`${BASE}/settings`} className={buttonClass("secondary", "md")}>Open Attendance Settings</Link> : undefined}>
            {access.admin ? "Switch on Absence reasons in Attendance Settings, Punch methods, More options, to record why students were absent." : "The school does not record absence reasons. Ask the School Admin to switch them on."}
          </EmptyState>
        ) : (
          <>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center flex-wrap">
              <UrlDate label="Date" value={iso} max={isoDay(today)} className="sm:w-44" />
              {data.sections.length > 1 && (
                <UrlSelect param="section" label="Class and section" className="sm:w-56" value=""
                  options={[{ value: "", label: "All my classes" }, ...data.sections.map((s) => ({ value: s.id, label: s.name }))]} />
              )}
              <UrlSelect param="reason" label="Reason" className="sm:w-52" value=""
                options={[{ value: "", label: "Any reason" }, ...choices.map((r) => ({ value: r.key, label: r.label })), { value: "none", label: "Not recorded" }]} />
            </div>
            <Stats items={[
              { label: "Absent", value: data.rows.length, sub: isToday ? "Today" : dayText(date), icon: UserX, tone: data.rows.length ? "bad" : undefined },
              { label: "Reason not known yet", value: notKnown, sub: "Call the family or wait for their reply", icon: CalendarX2, tone: notKnown ? "warn" : undefined },
            ]} />
            <Card className="overflow-hidden">
              <DataList rows={rows} rowKey={(r) => r.studentId} caption={`Absent students, ${dayText(date)}`} minWidth={820}
                columns={[
                  { key: "who", label: "Student", render: (r) => <span className="font-semibold">{r.rollNo ? <span className="text-ink3 tnum mr-2">{r.rollNo}</span> : null}{r.name}</span> },
                  { key: "class", label: "Class", nowrap: true, render: (r) => r.className },
                  { key: "status", label: "Mark", render: (r) => <span className="text-ink2">{r.statusName}{r.periods.length ? ` (period ${r.periods.join(", ")})` : ""}</span> },
                  { key: "reason", label: "Reason", render: (r) => (
                    <span className="flex flex-col">
                      <span><Pill tone={!r.reason || r.reason.key === "not-known" ? "warn" : "neutral"}>{r.reason?.label ?? "Not recorded"}</Pill></span>
                      {r.reason?.note && <span className="text-[12.5px] text-ink3 mt-0.5">{r.reason.note}</span>}
                      {r.reason?.source && <span className="text-[12px] text-ink3">{SOURCE_WORDS[r.reason.source] ?? r.reason.source}</span>}
                    </span>
                  ) },
                  { key: "leave", label: "Leave", render: (r) => <span className="text-ink2">{r.leave ?? ""}</span> },
                ]}
                actions={(r) => r.mayChange ? (
                  <ReasonButton action={setAbsenceReasonAction} studentId={r.studentId} date={iso} name={r.name} reasons={choices}
                    current={r.reason?.key ?? null} note={r.reason?.note ?? null} />
                ) : null}
                mobile={(r) => ({ avatar: r.name, title: r.name, sub: `${r.className} · ${r.reason?.label ?? "Not recorded"}${r.reason?.note ? ` · ${r.reason.note}` : ""}` })}
                empty={<EmptyState bare title={reasonFilter ? "Nobody with this reason" : "Nobody absent"} Icon={UserX}>
                  {reasonFilter ? "Choose Any reason to see everyone absent on this day." : `No student is marked absent on ${dayText(date)} in your classes.`}
                </EmptyState>} />
            </Card>
            <p className="text-[13px] text-ink3">Setting a reason does not change the mark or the attendance %. Every change is kept in the audit log.</p>
          </>
        )}
      </div>
    </>
  );
}
