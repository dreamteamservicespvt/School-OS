import type { Metadata } from "next";
import Link from "next/link";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { needsOn, periodsCoveredOn, substitutionLoads, substituteTimetable, reasonWords } from "@/lib/academic/substitutions";
import { inCampus } from "@/lib/campus";
import { DAY_NAMES, addDays, isoDay, parseDay, plural, time12, weekday } from "@/lib/academic/common";
import { EmptyState } from "@/components/empty-state";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { academicPage, one, type SearchParams } from "../_lib/page";
import { PageTop } from "../_components/page-top";
import { ExportLinks } from "../_components/export-links";
import { DateParam, ViewSwitch } from "../_components/pickers";
import { EndCover, MarkAbsentButton, NeedsList, TemporaryTeacherButton, UnmarkAbsent, type Need } from "./substitutions-ui";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Substitutions") };
}
const PATH = "/academic-management/substitutions";

export default async function SubstitutionsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const page = await academicPage(raw, { notForOwn: "no-access", arrangerOk: true });
  const { scope } = page;
  const date = parseDay(one(raw.date)) ?? page.today;
  const views = [
    { value: "needed", label: "Needed" },
    { value: "by-teacher", label: "Substitute Time Table" },
    ...(scope.arrange ? [{ value: "load", label: "Load per teacher" }, { value: "temporary", label: "Temporary teachers" }] : []),
  ];
  const view = views.some((x) => x.value === one(raw.view)) ? one(raw.view) : "needed";
  const ctx = page.current.ctx;
  const mineOnly = !scope.arrange;

  const data = await withSchool(ctx, async (tx) => {
    const needs = await needsOn(tx, ctx, page.campusId, date);
    // The day's periods with a teacher, the same numbers as the Dashboard's "Periods covered today" (gap list G36).
    const covered = mineOnly ? null : await periodsCoveredOn(tx, ctx, page.campusId, date, needs);
    let rows = needs.rows;
    if (mineOnly) rows = rows.filter((r) => r.absentStaffId === scope.staffId || r.substitution?.substituteId === scope.staffId);
    // One campus: that campus's teachers, absences and temporary teachers only.
    const campusStaff = page.current.campusId ? { in: (await tx.staff.findMany({ where: { schoolId: ctx.schoolId, ...inCampus(page.current) }, select: { id: true } })).map((s) => s.id) } : undefined;
    const teachers = scope.arrange ? await tx.staff.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] }, staffType: "Teaching", ...inCampus(page.current) }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true } }) : [];
    const absences = scope.arrange ? await tx.staffAbsence.findMany({ where: { schoolId: ctx.schoolId, date, archivedAt: null, ...(campusStaff ? { staffId: campusStaff } : {}) } }) : [];
    const bySub = view === "by-teacher" ? (await substituteTimetable(tx, ctx, page.campusId, date)).filter((s) => !mineOnly || s.id === scope.staffId) : [];
    let loads: { id: string; name: string; week: number; month: number }[] = [];
    if (view === "load") {
      const l = await substitutionLoads(tx, ctx, date);
      loads = teachers.map((t) => ({ id: t.id, name: t.fullName, week: l.week.get(t.id) ?? 0, month: l.month.get(t.id) ?? 0 })).sort((a, b) => b.month - a.month || b.week - a.week || a.name.localeCompare(b.name));
    }
    const covers = view === "temporary" ? await tx.temporaryCover.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null, toDate: { gte: page.today }, ...(campusStaff ? { absentStaffId: campusStaff } : {}) }, orderBy: { fromDate: "asc" } }) : [];
    const names = new Map((await tx.staff.findMany({ where: { id: { in: [...absences.map((a) => a.staffId), ...covers.flatMap((c) => [c.absentStaffId, c.tempStaffId])] } }, select: { id: true, fullName: true } })).map((s) => [s.id, s.fullName]));
    return { off: needs.off, covered, rows, teachers, absences, bySub, loads, covers, names };
  });

  const link = (d: Date) => { const p = new URLSearchParams(); p.set("date", isoDay(d)); if (view !== "needed") p.set("view", view); return `${PATH}?${p}`; };
  // Exports work on the page's campus (the year's, when another campus's year is open).
  const yearQ = page.yearQuery ? `&${page.yearQuery}` : "";
  const isToday = isoDay(date) === isoDay(page.today);
  const needed = data.rows.filter((r) => r.substitution?.status !== "ARRANGED").length;
  const teachers = data.teachers.map((t) => ({ id: t.id, name: t.fullName }));
  const rows: Need[] = data.rows.map((r) => ({ periodId: r.id, periodNo: r.periodNo, startTime: r.startTime, endTime: r.endTime, sectionLabel: r.sectionLabel, subjectName: r.subjectName, absentStaffId: r.absentStaffId, absentName: r.absentName, reason: r.reason, substitution: r.substitution }));

  return (
    <>
      <PageTop page={page} title="Substitutions" href={PATH} showYear={false}>
        {scope.arrange && page.writable !== false && (
          <>
            <MarkAbsentButton teachers={teachers} date={isoDay(date < page.today ? page.today : date)} />
            <TemporaryTeacherButton teachers={teachers} today={isoDay(page.today)} />
          </>
        )}
      </PageTop>
      <ViewSwitch views={views} current={view} keep={["date"]} />
      {(view === "needed" || view === "by-teacher") && (
        <div className="no-print mb-4 flex flex-wrap items-end gap-3">
          <DateParam current={isoDay(date)} />
          <div className="flex gap-2">
            <Link href={link(addDays(date, -1))} className={buttonClass("secondary", "md")}><Words k="Previous" /></Link>
            {!isToday && <Link href={link(page.today)} className={buttonClass("secondary", "md")}><Words k="Today" /></Link>}
            <Link href={link(addDays(date, 1))} className={buttonClass("secondary", "md")}><Words k="Next" /></Link>
          </div>
        </div>
      )}

      {(view === "needed" || view === "by-teacher") && <h2 className="mb-3 text-lg font-semibold">{isToday ? "Today, " : ""}{DAY_NAMES[weekday(date)]} {formatDate(date)}</h2>}

      {view === "needed" && (
        data.off ? <Alert tone="info" title={data.off.kind === "holiday" ? `Holiday: ${data.off.title}` : `${data.off.title}: no school`}><Words k="No periods, so no substitutions." /></Alert> : (
          <>
            {data.absences.length > 0 && (
              <div className="mb-4 rounded-2xl border border-line bg-surface px-4 py-2">
                <p className="text-sm font-medium"><Words k="Marked absent by hand" /></p>
                <ul className="divide-y divide-line">
                  {data.absences.map((a) => (
                    <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-1 text-sm">
                      <span>{data.names.get(a.staffId)}{a.note ? ` · ${a.note}` : ""}</span>
                      {page.writable && <UnmarkAbsent id={a.id} name={data.names.get(a.staffId) ?? "this teacher"} />}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {data.covered && (
              <p className="mb-3 text-ink-2"><Words k="Periods covered:" /> <strong className="tnum">{data.covered.covered}</strong> <Words k="of" /> {data.covered.total}</p>
            )}
            {rows.length === 0 ? (
              <EmptyState title={mineOnly ? "Nothing for you on this day" : "No substitutions needed"}>
                {mineOnly ? "Extra periods you are asked to take appear here and on My Time Table." : "No teacher is on leave or marked absent on this day. If someone is absent, mark them absent and their periods appear here."}
              </EmptyState>
            ) : (
              <>
                {!mineOnly && <p className="mb-3 text-ink-2">{needed ? <><strong className="text-danger">{plural(needed, "period")} <Words k="still needed" /></strong> <Words k="of" /> {rows.length}.</> : `All ${plural(rows.length, "period")} arranged.`}</p>}
                <NeedsList rows={rows} date={isoDay(date)} canArrange={scope.arrange && page.writable !== false} />
              </>
            )}
            {!mineOnly && rows.length > 0 && <div className="mt-4"><ExportLinks href={`/academic-management/export?kind=substitutions&date=${isoDay(date)}${yearQ}`} label="Substitutions" /></div>}
          </>
        )
      )}

      {view === "by-teacher" && (
        data.bySub.length === 0 ? <EmptyState title="No substitutions arranged on this day"><Words k="Arranged substitutions show here, grouped by the teacher who covers them." /></EmptyState> : (
          <ul className="grid gap-3 md:grid-cols-2">
            {data.bySub.map((s) => (
              <li key={s.id} className="rounded-2xl border border-line bg-surface p-4">
                <h2 className="font-semibold">{s.name} <span className="font-normal text-ink-2">· {plural(s.periods.length, "extra period")}</span></h2>
                <ol className="mt-2 space-y-1 text-sm">
                  {s.periods.map((p) => <li key={p.id}><strong><Words k="Period" /> {p.periodNo}</strong> ({time12(p.startTime)}) · {p.sectionLabel} · {p.subjectName ?? "Period"} <Words k="· for" /> {p.absentName} ({reasonWords(p.reason).toLowerCase()})</li>)}
                </ol>
              </li>
            ))}
          </ul>
        )
      )}

      {view === "load" && (
        <>
          <p className="mb-3 text-ink-2"><Words k="Substitutions taken in the week and month of" /> {formatDate(date)}<Words k=". Helps share extra periods fairly." /></p>
          {data.loads.length === 0 ? <EmptyState title="No teachers yet"><Words k={"Teachers appear here once they are added in Staff & HR."} /></EmptyState> : (
            <div className="relative overflow-x-auto rounded-2xl border border-line bg-surface">
              <table className="w-full text-left text-sm">
                <thead className="bg-surface-2"><tr><th scope="col" className="px-4 py-2 font-medium"><Words k="Teacher" /></th><th scope="col" className="px-4 py-2 text-right font-medium"><Words k="This week" /></th><th scope="col" className="px-4 py-2 text-right font-medium"><Words k="This month" /></th></tr></thead>
                <tbody>{data.loads.map((l) => <tr key={l.id} className="border-t border-line"><td className="px-4 py-2">{l.name}</td><td className="px-4 py-2 text-right tabular-nums">{l.week}</td><td className="px-4 py-2 text-right tabular-nums">{l.month}</td></tr>)}</tbody>
              </table>
            </div>
          )}
          <div className="mt-4"><ExportLinks href={`/academic-management/export?kind=substitution-load&date=${isoDay(date)}${yearQ}`} label="Substitution load" /></div>
        </>
      )}

      {view === "temporary" && (
        data.covers.length === 0 ? <EmptyState title="No temporary teachers now"><Words k="For a longer absence, name a temporary teacher with the button above. They take the absent teacher's periods for the dates you choose." /></EmptyState> : (
          <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
            {data.covers.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span><strong>{data.names.get(c.tempStaffId)}</strong> <Words k="for" /> {data.names.get(c.absentStaffId)} · {formatDate(c.fromDate)} <Words k="to" /> {formatDate(c.toDate)}{c.note ? ` · ${c.note}` : ""}</span>
                {page.writable && <EndCover id={c.id} name={data.names.get(c.tempStaffId) ?? "the temporary teacher"} />}
              </li>
            ))}
          </ul>
        )
      )}
    </>
  );
}
