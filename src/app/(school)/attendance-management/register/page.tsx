import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, CalendarDays, CalendarX2, ClipboardPen, Users } from "lucide-react";
import { periodFromSearch } from "@/lib/periods";
import { periodSetup } from "@/lib/period-setup";
import { classWise } from "@/lib/attendance/classwise";
import { notMarkedOn } from "@/lib/attendance/remind";
import { absenceMessagesOn, messageCountText } from "@/lib/attendance/alerts";
import { Banner } from "@/components/ui/banner";
import { dayStartUtc } from "@/lib/periods";
import { ClassWiseView, NotMarkedCard } from "../_components/class-wise";
import { withSchool } from "@/lib/db";
import { attendancePage } from "@/lib/attendance/page";
import { BASE } from "@/lib/attendance/access";
import { readMonth, registerChoices, registerMonth, registerYears } from "@/lib/attendance/register";
import { clampMonth } from "@/lib/attendance/calendar-months";
import { studentMonth } from "@/lib/attendance/integrations";
import { attendanceSummary, percentText } from "@/lib/attendance/summary";
import { dayText, lockState } from "@/lib/attendance/marks";
import { time12 } from "@/lib/attendance/time";
import { isoDay, monthStart } from "@/lib/staff/dates";
import { Card } from "@/components/ui/card";
import { Chips } from "@/components/ui/chips";
import { Stats } from "@/components/ui/stats";
import { UrlSelect } from "@/components/ui/url-controls";
import { cx } from "@/components/ui/cx";
import { EmptyState } from "@/components/empty-state";
import { AttHead } from "../_components/att-head";
import { MonthSelect } from "@/components/attendance/month-select";
import { ExportMenu } from "../_components/export-menu";
import { cellClass, Legend, type StatusView } from "../_components/status";
import { REASONS_FEATURE } from "@/lib/attendance/absence-reasons";

export const metadata: Metadata = { title: "Attendance Register" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const ym = (d: Date) => isoDay(d).slice(0, 7);
const HOLIDAY_CELL = "bg-info/10 text-info";
const CORE = ["present", "absent", "late", "leave"];

export default async function RegisterPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { current, access, features, settings, tz, today, now } = await attendancePage();
  if (access.pages.register === "hidden") redirect(`${BASE}/reports`);
  // People who see every section open on the whole school, class by class; a tile opens one section's register.
  if (access.classWise && !one(sp.section)) return <WholeSchool sp={sp} />;
  const asked = readMonth(one(sp.month)) ?? monthStart(today);
  const view = one(sp.view) === "student" ? "student" : "class";
  const statusFilter = one(sp.status) ?? "";

  const data = await withSchool(current.ctx, async (tx) => {
    // Any month from the first year this person may see up to this month (owner's rule, 12 Oct).
    const { years, bounds } = await registerYears(tx, access, today);
    const month = clampMonth(asked, bounds);
    const year = years.find((y) => y.startDate <= month && y.endDate >= month) ?? years.find((y) => y.id === access.yearId) ?? null;
    const sections = await registerChoices(tx, access, year?.id ?? access.yearId);
    const wanted = one(sp.section);
    const wantedName = wanted ? (await registerChoices(tx, access)).find((s) => s.id === wanted)?.name ?? null : null;
    const section = sections.find((s) => s.id === wanted) ?? sections.find((s) => s.name === wantedName) ?? sections.find((s) => access.classSections.includes(s.id)) ?? sections[0] ?? null;
    const current_ = await registerChoices(tx, access);
    const waiting = await tx.attendanceCorrection.count({ where: { status: "WAITING", archivedAt: null, forWhom: "student", ...(access.students === "all" ? {} : { sectionId: { in: current_.map((s) => s.id) } }) } });
    const base = { month, bounds, year, waiting };
    if (!section) return { ...base, sections, section: null, grid: null, student: null };
    const grid = await registerMonth(tx, current.ctx, { sectionId: section.id, month, today, status: view === "class" ? statusFilter || null : null, reasons: features.has(REASONS_FEATURE) ? { seesFees: access.seesFees } : null });
    if (view === "class" || !grid) return { ...base, sections, section, grid, student: null };
    const sid = one(sp.student);
    const pick = grid.rows.find((r) => r.id === sid) ?? grid.rows[0] ?? null;
    if (!pick) return { ...base, sections, section, grid, student: null };
    const cal = await studentMonth(tx, current.ctx, pick.id, month, today);
    const yearSum = year ? (await attendanceSummary(tx, current.ctx, { studentId: pick.id, from: year.startDate, to: year.endDate, today })).people.get(pick.id) ?? null : null;
    return { ...base, sections, section, grid, student: { row: pick, cal, yearSum, options: grid.rows.map((r) => ({ value: r.id, label: `${r.roll ? `${r.roll}. ` : ""}${r.name}` })) }};
  });
  const month = data.month;

  const statuses: StatusView[] = (data.grid?.statuses ?? []).map((s) => ({ key: s.key, name: s.name, letter: s.letter, tone: s.tone }));
  const byKey = new Map(statuses.map((s) => [s.key, s]));
  const qs = (change: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | null> = { section: one(sp.section) ?? null, month: one(sp.month) ?? null, view: view === "student" ? "student" : null, student: one(sp.student) ?? null, status: statusFilter || null, ...change };
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
    return p.size ? `${BASE}/register?${p}` : `${BASE}/register`;
  };
  // The School Admin reads the register; the Principal and Vice Principal may still correct a mark (prototype attendance.jsx).
  const canChange = access.change !== "none" && access.pages.register === "full";
  const cellHref = (studentId: string, iso: string) => {
    if (!canChange || !data.section || data.year?.id !== access.yearId) return null;
    const d = new Date(`${iso}T00:00:00Z`);
    if (d > today) return null;
    const lock = lockState(settings, d, now, tz);
    if (!lock.locked || access.lockOverride) return `${BASE}?section=${data.section.id}&date=${iso}`;
    return `${BASE}/register/correction?section=${data.section.id}&date=${iso}&student=${studentId}`;
  };
  const exportHref = data.section ? `${BASE}/register/export?section=${data.section.id}&month=${ym(month)}${statusFilter ? `&status=${statusFilter}` : ""}` : null;
  const sub = data.section ? `${data.section.name} · ${data.grid?.label ?? ""}` : "No classes yet";

  return (
    <>
      <AttHead access={access} features={features} userId={current.user.id} href={`${BASE}/register`} sub={sub}
        actions={exportHref && view === "class" ? <ExportMenu href={exportHref} print /> : undefined} />

      {data.sections.length === 0 ? (
        <EmptyState title="No classes to show" Icon={Users}>
          {access.students === "all" ? "No sections are set up for this academic year yet. Add them in Academic Setup." : "You are not class teacher or subject teacher of any section this year."}
        </EmptyState>
      ) : (
        <div className="flex flex-col gap-4">
          {access.classWise && (
            <Link href={`${BASE}/register`} className="self-start inline-flex items-center gap-1.5 min-h-11 px-3.5 rounded-xl border border-line bg-surface text-[14px] font-semibold hover:bg-sunken">
              <ArrowLeft size={16} aria-hidden="true" />All classes
            </Link>
          )}
          <Chips label="Register views" value={view} options={[
            { value: "class", label: "Class register", href: qs({ view: null, student: null }) },
            { value: "student", label: "Student calendar", href: qs({ view: "student", status: null }) },
            ...(features.has(REASONS_FEATURE) ? [{ value: "absences", label: "Absent list", href: `${BASE}/register/absences` }] : []),
            { value: "corrections", label: "Corrections", count: data.waiting || null, href: `${BASE}/register/corrections` },
          ]} />
          <div className="flex flex-col sm:flex-row gap-2 sm:items-center flex-wrap">
            {data.sections.length > 1 && (
              <UrlSelect param="section" label="Class and section" value={data.section?.id ?? ""} className="sm:w-56"
                options={data.sections.map((s) => ({ value: s.id, label: s.name }))} />
            )}
            <MonthSelect value={ym(month)} min={data.bounds.min} max={data.bounds.max} className="sm:w-64" />
            {view === "class" && (
              <UrlSelect param="status" label="Status" value="" className="sm:w-48"
                options={[{ value: "", label: "Any status" }, ...statuses.map((s) => ({ value: s.key, label: `Has ${s.name.toLowerCase()}` }))]} />
            )}
            {view === "student" && data.student && (
              <UrlSelect param="student" label="Student" value={data.student.row.id} className="sm:w-64" options={data.student.options} />
            )}
          </div>

          {view === "class" && data.grid && (
            <ClassGrid grid={data.grid} byKey={byKey} statuses={statuses} cellHref={cellHref} statusFilter={statusFilter} threshold={settings.thresholdPercent} today={today} />
          )}
          {view === "student" && (data.student ? (
            <StudentCalendar s={data.student} byKey={byKey} statuses={statuses} sectionName={data.section?.name ?? ""} yearName={data.year?.name ?? null} cellHref={cellHref} threshold={settings.thresholdPercent} />
          ) : (
            <EmptyState title="No students in this section" Icon={Users}>Students appear here once they are placed in the section.</EmptyState>
          ))}
          {canChange && (
            <p className="text-[13px] text-ink3">Tap a mark to change it. After the lock time ({time12(settings.lockTime)}) a change goes to Approvals as a correction request.</p>
          )}
        </div>
      )}
    </>
  );
}

type Grid = NonNullable<Awaited<ReturnType<typeof registerMonth>>>;

function ClassGrid({ grid, byKey, statuses, cellHref, statusFilter, threshold, today }: {
  grid: Grid; byKey: Map<string, StatusView>; statuses: StatusView[]; cellHref: (studentId: string, iso: string) => string | null; statusFilter: string; threshold: number; today: Date;
}) {
  // Like the approved register: school days so far, Sundays left out, holidays shown greyed.
  const shown = grid.dates.filter((d) => !d.future && d.off !== "Sunday");
  const anyPast = grid.dates.some((d) => !d.future);
  const thisMonth = grid.month === isoDay(today).slice(0, 7);
  const used = new Set(grid.rows.flatMap((r) => Object.values(r.days)));
  const anyNotKnown = grid.rows.some((r) => Object.values(r.reasons).some((x) => x.key === "not-known"));
  const why = (r: Grid["rows"][number], iso: string) => { const x = r.reasons[iso]; return x ? ` · ${x.label}${x.note ? `: ${x.note}` : ""}` : ""; };
  const legend = statuses.filter((s) => CORE.includes(s.key) || used.has(s.key));
  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-5 py-4 flex-wrap">
        <div>
          <h2 className="font-semibold">{grid.label}</h2>
          <p className="text-[13px] text-ink3">{grid.section.name} · {grid.rows.length} {grid.rows.length === 1 ? "student" : "students"} · {grid.workingDays} school {grid.workingDays === 1 ? "day" : "days"}{thisMonth ? " so far" : ""} · {percentText(grid.overall.percent)} present</p>
        </div>
        <Legend statuses={legend} extra={<>
          {shown.some((d) => d.off) && <li className="flex items-center gap-1.5"><span aria-hidden="true" className={cx("w-4 h-4 rounded grid place-items-center text-[9px] font-bold", HOLIDAY_CELL)}>H</span>Holiday</li>}
          {anyNotKnown && <li className="flex items-center gap-1.5"><span aria-hidden="true" className="w-2 h-2 rounded-full bg-warn" />Reason not known yet</li>}
        </>} />
      </div>
      {!anyPast ? (
        <div className="border-t border-line"><EmptyState bare title="This month has not started" Icon={CalendarDays}>Marks show here from the first school day of {grid.label}.</EmptyState></div>
      ) : grid.rows.length === 0 ? (
        <div className="border-t border-line">
          <EmptyState bare title={statusFilter ? "No student matches this status" : "No students in this section"} Icon={Users}>
            {statusFilter ? "Nobody in this section had that status this month. Choose Any status to see everyone." : "Students appear here once they are placed in the section."}
          </EmptyState>
        </div>
      ) : (
        <div className="relative overflow-x-auto scroll-thin" tabIndex={0} role="region" aria-label={`Register for ${grid.section.name}, ${grid.label}`}>
          <table className="text-[13px] min-w-full border-separate border-spacing-0">
            <caption className="sr-only">{grid.section.name}, {grid.label}: students down the side, school days across</caption>
            <thead>
              <tr className="text-ink3">
                <th scope="col" className="sticky left-0 z-10 bg-surface text-left font-semibold px-4 py-2 min-w-[180px] border-y border-line">Student</th>
                {shown.map((d) => (
                  <th key={d.iso} scope="col" title={d.off ?? undefined} className="font-semibold px-1 py-2 w-10 tnum border-y border-line">
                    {d.day}<span className="block text-[10px] font-medium">{d.weekday.slice(0, 2)}</span>
                  </th>
                ))}
                <th scope="col" className="font-semibold px-4 py-2 text-right border-y border-line">%</th>
              </tr>
            </thead>
            <tbody>
              {grid.rows.map((r) => {
                const p = r.summary.percent;
                return (
                  <tr key={r.id} className="group">
                    <th scope="row" className="sticky left-0 z-10 bg-surface px-4 py-1.5 font-medium text-left whitespace-nowrap border-b border-line/60 group-last:border-0">
                      <span className="text-ink3 tnum mr-2 inline-block w-5">{r.roll ?? "–"}</span>{r.name}
                    </th>
                    {shown.map((d) => {
                      const label = `${r.name}, ${d.day} ${grid.label}`;
                      if (d.off) return <td key={d.iso} className="px-1 py-1.5 text-center border-b border-line/60 group-last:border-0"><span title={d.off} className={cx("inline-grid place-items-center w-7 h-7 rounded-md text-[10.5px] font-bold", HOLIDAY_CELL)}><span aria-hidden="true">H</span><span className="sr-only">{label}: {d.off}</span></span></td>;
                      const key = r.days[d.iso];
                      const st = key ? byKey.get(key) ?? { key, name: key, letter: "?", tone: "neutral" } : undefined;
                      const href = cellHref(r.id, d.iso);
                      const unknown = r.reasons[d.iso]?.key === "not-known";
                      const box = st
                        ? <span className={cx("relative inline-grid place-items-center min-w-7 h-7 px-0.5 rounded-md text-[10.5px] font-bold", cellClass(st))}><span aria-hidden="true">{st.letter}</span>{unknown && <span aria-hidden="true" className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-warn ring-2 ring-surface" />}</span>
                        : <span className="inline-grid place-items-center w-7 h-7 rounded-md border border-dashed border-line text-ink3/60" aria-hidden="true">·</span>;
                      return (
                        <td key={d.iso} className="px-1 py-1.5 text-center border-b border-line/60 group-last:border-0">
                          {href
                            ? <Link href={href} title={`${label}: ${st?.name ?? "Not marked"}${why(r, d.iso)}`} aria-label={`${label}: ${st?.name ?? "not marked"}${why(r, d.iso)}. Change`} className="inline-grid rounded-md outline-none hover:ring-2 hover:ring-brand/60 focus-visible:ring-2 focus-visible:ring-brand">{box}</Link>
                            : <span title={`${label}: ${st?.name ?? "Not marked"}${why(r, d.iso)}`}>{box}<span className="sr-only">{label}: {st?.name ?? "not marked"}{why(r, d.iso)}</span></span>}
                        </td>
                      );
                    })}
                    <td className={cx("px-4 text-right font-semibold tnum border-b border-line/60 group-last:border-0", p !== null && p < threshold ? "text-bad" : p !== null && p < 85 && "text-warn")}>{percentText(p)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {anyPast && grid.rows.length > 0 && (
        <p className="px-5 py-3 border-t border-line text-[12.5px] text-ink3">Holidays, Sundays, days off and days not marked are not counted. A half day counts as half. Below {threshold}% is shown in red.</p>
      )}
    </Card>
  );
}

function StudentCalendar({ s, byKey, statuses, sectionName, yearName, cellHref, threshold }: {
  s: { row: Grid["rows"][number]; cal: Awaited<ReturnType<typeof studentMonth>>; yearSum: { percent: number | null; countedDays: number; workingDays: number } | null };
  byKey: Map<string, StatusView>; statuses: StatusView[]; sectionName: string; yearName: string | null; cellHref: (studentId: string, iso: string) => string | null; threshold: number;
}) {
  const first = s.cal.cells[0];
  const lead = first ? (first.weekday + 6) % 7 : 0;
  const m = s.cal.summary;
  const tone = (p: number | null | undefined) => (p == null ? undefined : p < threshold ? "bad" as const : p < 85 ? "warn" as const : "ok" as const);
  return (
    <div className="flex flex-col gap-4">
      <Stats items={[
        { label: s.cal.label, value: percentText(m.percent), sub: `${m.countedDays} of ${m.workingDays} school days counted`, tone: tone(m.percent), icon: CalendarDays },
        { label: yearName ? `Year ${yearName}` : "This year", value: s.yearSum ? percentText(s.yearSum.percent) : "Not marked", sub: s.yearSum ? `${s.yearSum.workingDays} school days so far` : "No marks this year yet", tone: tone(s.yearSum?.percent), icon: ClipboardPen },
        { label: "Absent this month", value: m.absent, sub: `${m.late} late`, tone: m.absent ? "bad" : undefined, icon: CalendarX2 },
        { label: "Leave this month", value: m.leave, sub: "Not counted in the %", icon: CalendarDays },
      ]} />
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 flex-wrap">
          <div>
            <h2 className="font-semibold">{s.row.name}</h2>
            <p className="text-[13px] text-ink3">{sectionName} · {s.cal.label} · Admission no. {s.row.admissionNo}</p>
          </div>
          <Legend statuses={statuses.filter((x) => CORE.includes(x.key) || s.cal.cells.some((c) => c.statusKey === x.key))}
            extra={s.cal.cells.some((c) => c.off && c.off !== "Sunday") ? <li className="flex items-center gap-1.5"><span aria-hidden="true" className={cx("w-4 h-4 rounded grid place-items-center text-[9px] font-bold", HOLIDAY_CELL)}>H</span>Holiday</li> : undefined} />
        </div>
        <div className="px-3 sm:px-5 pb-5">
          <div className="grid grid-cols-7 gap-1 sm:gap-1.5 text-center" role="grid" aria-label={`${s.row.name}, ${s.cal.label}`}>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => <div key={w} role="columnheader" className="py-1 text-[12px] font-semibold text-ink3">{w}</div>)}
            {Array.from({ length: lead }).map((_, i) => <div key={`x${i}`} aria-hidden="true" />)}
            {s.cal.cells.map((c) => {
              const st = c.statusKey ? byKey.get(c.statusKey) : undefined;
              const href = !c.off && !c.future ? cellHref(s.row.id, c.date) : null;
              const body = (
                <>
                  <span className="text-[11.5px] opacity-80 tnum">{c.day}</span>
                  <span className="text-[13px] font-bold">{c.off ? (c.off === "Sunday" ? "" : "H") : st ? st.letter : ""}</span>
                  <span className="sr-only">{c.off ? c.off : st ? st.name : c.future ? "Not yet" : "Not marked"}</span>
                </>
              );
              const cls = cx("flex h-14 sm:h-16 flex-col items-center justify-center rounded-xl", c.off ? (c.off === "Sunday" ? "bg-sunken/60 text-ink3" : HOLIDAY_CELL) : st ? cellClass(st) : c.future ? "text-ink3" : "border border-dashed border-line text-ink3");
              const reason = s.row.reasons[c.date];
              return (
                <div key={c.date} role="gridcell" title={c.off ?? (st ? `${st.name}${reason ? ` · ${reason.label}` : ""}` : undefined)}>
                  {href ? <Link href={href} className={cx(cls, "hover:ring-2 hover:ring-brand/60")}>{body}</Link> : <div className={cls}>{body}</div>}
                </div>
              );
            })}
          </div>
        </div>
      </Card>
      {Object.keys(s.row.reasons).length > 0 && (
        <Card className="overflow-hidden">
          <h2 className="px-5 pt-4 font-semibold">Reasons for absences</h2>
          <ul className="px-2 pb-2 divide-y divide-line/70">
            {Object.entries(s.row.reasons).sort(([a], [b]) => a.localeCompare(b)).map(([iso, r]) => (
              <li key={iso} className="flex items-center gap-3 px-3 py-2.5 text-[14px]">
                <span className="w-24 shrink-0 tnum text-ink2">{dayText(new Date(`${iso}T00:00:00Z`))}</span>
                <span className="min-w-0 flex-1"><span className="font-semibold">{r.label}</span>{r.note ? <span className="text-ink3"> · {r.note}</span> : null}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

/** The class-wise view of every section (Principal, Vice Principal, School Admin, Academic Head). */
async function WholeSchool({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const { current, access, features, settings, tz, today, now } = await attendancePage();
  const dates = await periodSetup(current);
  const range = periodFromSearch(sp, { ...dates, fallback: "today" });
  const from = range ? new Date(`${range.from}T00:00:00Z`) : today;
  const to = range ? new Date(`${range.to}T00:00:00Z`) : today;
  const isToday = isoDay(from) === isoDay(today) && isoDay(to) === isoDay(today);
  const sort = one(sp.sort) === "class" ? "class" : "low";
  const lock = lockState(settings, today, now, tz);

  const data = await withSchool(current.ctx, async (tx) => {
    if (!access.yearId) return null;
    const [cw, notMarked] = await Promise.all([
      classWise(tx, current.ctx, { yearId: access.yearId, from, to, today, campusId: access.campusId }),
      isToday ? notMarkedOn(tx, current.ctx, access, today, dayStartUtc(isoDay(today), tz)) : Promise.resolve([]),
    ]);
    // One day: what happened to that day's absence messages across these classes (sent, or not and why).
    const messages = isoDay(from) === isoDay(to) ? await absenceMessagesOn(tx, from, cw.sections.map((s) => s.sectionId)) : null;
    return { cw, notMarked, messages };
  });
  const groupParam = one(sp.group) ?? "all";
  const group = data?.cw.groups.some((g) => g.key === groupParam) ? groupParam : "all";
  const href = (change: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const keep: Record<string, string | null> = { period: one(sp.period) ?? null, from: one(sp.from) ?? null, to: one(sp.to) ?? null, sort: one(sp.sort) ?? null, group: group === "all" ? null : group, ...change };
    for (const [k, v] of Object.entries(keep)) if (v) p.set(k, v);
    return p.size ? `${BASE}/register?${p}` : `${BASE}/register`;
  };
  const t = data?.cw.totals;
  const sub = !data || !t ? "No academic year running now"
    : isToday ? `Whole school · today · ${t.markedSections} of ${t.sections} sections marked`
      : `Whole school · ${range?.label ?? "these dates"}`;

  return (
    <>
      <AttHead access={access} features={features} userId={current.user.id} href={`${BASE}/register`} sub={sub} />
      {!data ? (
        <EmptyState title="No academic year running now" Icon={CalendarDays}>Attendance shows here once the academic year has started and its sections are set up in Academic Management.</EmptyState>
      ) : data.cw.sections.length === 0 ? (
        <EmptyState title="No classes to show" Icon={Users}>No sections are set up for this academic year yet. Add them in Academic Setup.</EmptyState>
      ) : (
        <div className="flex flex-col gap-5 lg:gap-6">
          <NotMarkedCard rows={data.notMarked} lockText={lock.atText} locked={lock.locked} canRemind={access.students === "all"} tz={tz} />
          {messageCountText(data.messages, isToday) && (
            <Banner tone={data.messages?.notSent ? "warn" : "info"} title={`${messageCountText(data.messages, isToday)}.`}>
              {data.messages?.notSent ? "Those parents were not told by message. The class teacher sees the same line on Take Attendance." : "Parents of students marked absent are told once for the day."}
            </Banner>
          )}
          <ClassWiseView cw={data.cw} sort={sort} group={group} href={href} period={{ ...dates }} today={isToday} />
        </div>
      )}
    </>
  );
}
