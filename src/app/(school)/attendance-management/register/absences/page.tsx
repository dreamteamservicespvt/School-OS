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
import { staffDay } from "@/lib/attendance/staff";
import { classWise } from "@/lib/attendance/classwise";
import { dayInfo } from "@/lib/attendance/calendar";
import { isoDay } from "@/lib/staff/dates";
import { UUID_RE } from "@/lib/staff/act";
import { Card, CardHeader } from "@/components/ui/card";
import { Chips } from "@/components/ui/chips";
import { Pill } from "@/components/ui/badge";
import { Stats } from "@/components/ui/stats";
import { UrlDate, UrlSelect } from "@/components/ui/url-controls";
import { EmptyState } from "@/components/empty-state";
import { AttHead } from "../../_components/att-head";
import { DataList } from "../../_components/data-list";
import { ReasonButton } from "../../_components/reason-form";
import { setAbsenceReasonAction } from "../actions";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Absent list") };
}

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
    // The names show whether or not the school records reasons: a principal needs who is absent
    // first (layman loop 4: with reasons off the page showed only a settings message).
    const rows = await absentList(tx, current.ctx, access, { date, sectionId });
    // "Who is absent today" answers for staff too, for those who see all staff (layman loop 4: staff absence
    // was on another page).
    let staffOut: { id: string; name: string; designation: string; marked: boolean }[] | null = null;
    if (access.staff === "all" && access.pages.staff !== "hidden") {
      const all = await staffDay(tx, current.ctx, access, date);
      const info = await dayInfo(tx, current.ctx, date, access.campusId);
      staffOut = all.filter((r) => r.mark?.statusKey === "absent" || (info.on && !r.mark && !r.onLeave))
        .map((r) => ({ id: r.staffId, name: r.name, designation: r.designation, marked: Boolean(r.mark) }));
    }
    // Classes that have not taken attendance on this day come first: "Nobody absent" is only true for
    // classes that are marked (QA L6-53: the principal was told everyone was present before any class marked).
    const wanted = sectionId ? [sectionId] : sections.map((s) => s.id);
    const cw = wanted.length && access.yearIds.length
      ? await classWise(tx, current.ctx, { yearId: access.yearIds, from: date, to: date, today, sectionIds: wanted, campusId: access.campusId })
      : null;
    const notTaken = (cw?.sections ?? []).filter((x) => x.notMarked).map((x) => ({ id: x.sectionId, name: x.name, teacher: x.teacher?.name ?? null }));
    return { sections, rows, staffOut, notTaken, marked: (cw?.sections ?? []).filter((x) => !x.notMarked).length };
  });
  const wantedReason = !on ? "" : reasonFilter === "none" ? "not-known" : reasonFilter;
  const rows = wantedReason ? data.rows.filter((r) => r.reason?.key === wantedReason) : data.rows;
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
        {(
          <>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center flex-wrap">
              <UrlDate label="Date" value={iso} max={isoDay(today)} className="sm:w-44" />
              {data.sections.length > 1 && (
                <UrlSelect param="section" label="Class and section" className="sm:w-56" value=""
                  options={[{ value: "", label: "All my classes" }, ...data.sections.map((s) => ({ value: s.id, label: s.name }))]} />
              )}
              {on && <UrlSelect param="reason" label="Reason" className="sm:w-52" value=""
                options={[{ value: "", label: "Any reason" }, ...choices.map((r) => ({ value: r.key, label: r.label }))]} />}
            </div>
            <Stats items={[
              { label: "Absent", value: data.rows.length, sub: isToday ? "Today" : dayText(date), icon: UserX, tone: data.rows.length ? "bad" : undefined },
              ...(on ? [{ label: "Reason not known yet", value: notKnown, sub: "Call the family or wait for their reply", icon: CalendarX2, tone: notKnown ? "warn" as const : undefined }] : []),
            ]} />
            {data.notTaken.length > 0 && (
              <Card className="px-4 py-3 border-warn/40 bg-warn/8" role="status">
                <p className="font-semibold text-[14.5px] flex items-center gap-2"><CalendarX2 size={18} className="text-warn shrink-0" aria-hidden="true" /><Words k="Attendance not taken yet" />: {data.notTaken.length}</p>
                <ul className="mt-1.5 text-[14px] text-ink2 flex flex-col gap-0.5">
                  {data.notTaken.map((x) => (
                    <li key={x.id}><Words k="class" /> {x.name} · {x.teacher ?? <Words k="no class teacher" />}</li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[13px] text-ink3"><Words k="Students in these classes are not in the absent list until attendance is saved." /></p>
              </Card>
            )}
            <Card className="overflow-hidden">
              <DataList rows={rows} rowKey={(r) => r.studentId} caption={`Absent students, ${dayText(date)}`} minWidth={820}
                columns={[
                  { key: "who", label: "Student", render: (r) => <span className="font-semibold">{r.rollNo ? <span className="text-ink3 tnum mr-2">{r.rollNo}</span> : null}{r.name}</span> },
                  { key: "class", label: "Class", nowrap: true, render: (r) => r.className },
                  { key: "status", label: "Mark", render: (r) => <span className="text-ink2">{r.statusName}{r.periods.length ? ` (period ${r.periods.join(", ")})` : ""}</span> },
                  ...(!on ? [] : [{ key: "reason", label: "Reason", render: (r: (typeof rows)[number]) => (
                    <span className="flex flex-col">
                      <span><Pill tone={!r.reason || r.reason.key === "not-known" ? "warn" : "neutral"}>{r.reason?.label ?? "Not known yet"}</Pill></span>
                      {r.reason?.note && <span className="text-[12.5px] text-ink3 mt-0.5">{r.reason.note}</span>}
                      {r.reason?.source && <span className="text-[12px] text-ink3">{SOURCE_WORDS[r.reason.source] ?? r.reason.source}</span>}
                    </span>
                  ) }]),
                  { key: "leave", label: "Leave", render: (r) => <span className="text-ink2">{r.leave ?? ""}</span> },
                ]}
                actions={(r) => on && r.mayChange ? (
                  <ReasonButton action={setAbsenceReasonAction} studentId={r.studentId} date={iso} name={r.name} reasons={choices}
                    current={r.reason?.key ?? null} note={r.reason?.note ?? null} />
                ) : null}
                mobile={(r) => ({ avatar: r.name, title: r.name, sub: on ? `${r.className} · ${r.reason?.label ?? "Not known yet"}${r.reason?.note ? ` · ${r.reason.note}` : ""}` : `${r.className} · ${r.statusName}` })}
                empty={<EmptyState bare title={reasonFilter ? "Nobody with this reason" : data.notTaken.length && !data.marked ? "No class has taken attendance yet" : "Nobody absent"} Icon={UserX}>
                  {reasonFilter ? "Choose Any reason to see everyone absent on this day." : data.notTaken.length && !data.marked ? "Who is absent shows here once classes save attendance." : data.notTaken.length ? `No student is marked absent on ${dayText(date)} in the classes that took attendance.` : `No student is marked absent on ${dayText(date)} in your classes.`}
                </EmptyState>} />
            </Card>
            {data.staffOut && (
              <Card className="overflow-hidden">
                <CardHeader icon={UserX} title="Staff not in" description={data.staffOut.length ? undefined : "Every staff member is in."}
                  action={<Link href={`${BASE}/staff?date=${iso}`} className="text-[13.5px] font-medium text-brand underline"><Words k="Staff Attendance" /></Link>} />
                {data.staffOut.length > 0 && (
                  <ul className="divide-y divide-line border-t border-line">
                    {data.staffOut.map((x) => (
                      <li key={x.id} className="flex items-center gap-3 px-5 py-2.5 text-[14px]">
                        <span className="min-w-0 flex-1"><span className="font-semibold">{x.name}</span> <span className="text-ink3">· {x.designation}</span></span>
                        <Pill tone={x.marked ? "bad" : "neutral"}>{x.marked ? "Absent" : isToday ? "Not in yet" : "Not marked"}</Pill>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            )}
            {on ? <p className="text-[13px] text-ink3"><Words k="Setting a reason does not change the mark or the attendance %. The school keeps a record of who changed it and when." /></p>
              : access.admin && <p className="text-[13px] text-ink3 flex items-center gap-1.5 flex-wrap"><Settings2 size={14} aria-hidden="true" /><Words k="Switch on Absence reasons in Attendance Settings, under More options, to record why students were absent." /> <Link href={`${BASE}/settings?tab=punch`} className="font-medium text-brand underline"><Words k="Open Attendance Settings" /></Link></p>}
          </>
        )}
      </div>
    </>
  );
}
