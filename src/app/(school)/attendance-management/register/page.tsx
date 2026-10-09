import type { Metadata } from "next";
import Link from "next/link";
import { withSchool } from "@/lib/db";
import { attendancePage } from "@/lib/attendance/page";
import { BASE } from "@/lib/attendance/access";
import { readMonth, registerChoices, registerMonth } from "@/lib/attendance/register";
import { studentMonth } from "@/lib/attendance/integrations";
import { attendanceSummary, percentText } from "@/lib/attendance/summary";
import { lockState } from "@/lib/attendance/marks";
import { isoDay, monthStart } from "@/lib/staff/dates";
import { UUID_RE } from "@/lib/staff/act";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";
import { ExportLinks, Stat, SubNav } from "../../staff-hr-management/_components/bits";
import { Cell, Legend, toneClass, type StatusView } from "../_components/status";
import { UrlFilters } from "../_components/url-filters";

export const metadata: Metadata = { title: "Attendance Register" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const one = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
const shift = (m: Date, n: number) => new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + n, 1));
const ym = (d: Date) => isoDay(d).slice(0, 7);

export default async function RegisterPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { current, access, settings, tz, today, now } = await attendancePage();
  const month = readMonth(one(sp.month)) ?? monthStart(today);
  const view = one(sp.view) === "student" ? "student" : "class";
  const statusFilter = one(sp.status) ?? "";

  const data = await withSchool(current.ctx, async (tx) => {
    const sections = await registerChoices(tx, access);
    const wanted = one(sp.section);
    const section = sections.find((s) => s.id === wanted) ?? sections.find((s) => access.classSections.includes(s.id)) ?? sections[0] ?? null;
    const waiting = await tx.attendanceCorrection.count({ where: { status: "WAITING", archivedAt: null, forWhom: "student", ...(access.students === "all" ? {} : { sectionId: { in: sections.map((s) => s.id) } }) } });
    const year = access.yearId ? await tx.academicYear.findUnique({ where: { id: access.yearId } }) : null;
    if (!section) return { sections, section: null, grid: null, student: null, waiting, year };
    if (view === "class") {
      const grid = await registerMonth(tx, current.ctx, { sectionId: section.id, month, today, status: statusFilter || null });
      return { sections, section, grid, student: null, waiting, year };
    }
    const grid = await registerMonth(tx, current.ctx, { sectionId: section.id, month, today });
    const sid = one(sp.student);
    const pick = grid?.rows.find((r) => r.id === sid) ?? grid?.rows[0] ?? null;
    if (!pick || !grid) return { sections, section, grid, student: null, waiting, year };
    const cal = await studentMonth(tx, current.ctx, pick.id, month, today);
    const yearSum = year ? (await attendanceSummary(tx, current.ctx, { studentId: pick.id, from: year.startDate, to: year.endDate, today })).people.get(pick.id) ?? null : null;
    return { sections, section, grid, student: { row: pick, cal, yearSum, options: grid.rows.map((r) => ({ value: r.id, label: `${r.roll ? `${r.roll}. ` : ""}${r.name}` })) }, waiting, year };
  });

  const statuses: StatusView[] = (data.grid?.statuses ?? []).map((s) => ({ key: s.key, name: s.name, letter: s.letter, tone: s.tone }));
  const byKey = new Map(statuses.map((s) => [s.key, s]));
  const qs = (change: Record<string, string | null>) => {
    const p = new URLSearchParams();
    const base: Record<string, string | null> = { section: data.section?.id ?? null, month: ym(month), view: view === "student" ? "student" : null, student: one(sp.student) ?? null, status: statusFilter || null, ...change };
    for (const [k, v] of Object.entries(base)) if (v) p.set(k, v);
    return `${BASE}/register?${p}`;
  };
  const canChange = access.change !== "none";
  const cellHref = (studentId: string, iso: string) => {
    if (!canChange || !data.section) return null;
    const d = new Date(`${iso}T00:00:00Z`);
    if (d > today) return null;
    const lock = lockState(settings, d, now, tz);
    if (!lock.locked || access.lockOverride) return `${BASE}?section=${data.section.id}&date=${iso}`;
    return `${BASE}/register/correction?section=${data.section.id}&date=${iso}&student=${studentId}`;
  };
  const views = [
    { key: "class", label: "Class register", href: qs({ view: null, student: null }) },
    { key: "student", label: "Student calendar", href: qs({ view: "student", status: null }) },
    { key: "corrections", label: "Corrections", href: `${BASE}/register/corrections`, count: data.waiting },
  ];
  const exportHref = data.section ? `${BASE}/register/export?section=${data.section.id}&month=${ym(month)}${statusFilter ? `&status=${statusFilter}` : ""}` : null;
  const monthNav = (
    <div className="flex items-center gap-1">
      <Link href={qs({ month: ym(shift(month, -1)) })} className={buttonClass("secondary", "sm")} aria-label="Previous month">‹</Link>
      <Link href={qs({ month: ym(shift(month, 1)) })} className={buttonClass("secondary", "sm")} aria-label="Next month">›</Link>
      {ym(month) !== ym(today) && <Link href={qs({ month: ym(today) })} className={buttonClass("ghost", "sm")}>This month</Link>}
    </div>
  );

  return (
    <>
      <PageHeader title="Attendance Register" href={`${BASE}/register`} userId={current.user.id}>
        {exportHref && view === "class" && (
          <div className="flex flex-wrap gap-2">
            <a href={`${exportHref}&format=pdf&print=1`} className={buttonClass("secondary")} target="_blank" rel="noopener">Print</a>
            <ExportLinks href={exportHref} />
          </div>
        )}
      </PageHeader>
      <SubNav items={views} current={view} />

      {data.sections.length === 0 ? (
        <EmptyState title="No classes to show">
          {access.students === "all" ? "No sections are set up for this academic year yet. Add them in Academic Setup." : "You are not class teacher or subject teacher of any section this year."}
        </EmptyState>
      ) : (
        <>
          <UrlFilters reset={view === "student" ? ["student"] : []} fields={[
            { name: "section", label: "Class and section", type: "select", value: data.section?.id ?? "", options: data.sections.map((s) => ({ value: s.id, label: s.name })) },
            { name: "month", label: "Month", type: "month", value: ym(month), min: data.year ? ym(data.year.startDate) : undefined, max: data.year ? ym(data.year.endDate) : undefined },
            ...(view === "class"
              ? [{ name: "status", label: "Status", type: "select" as const, value: statusFilter, allLabel: "Any status", options: statuses.map((s) => ({ value: s.key, label: `Has ${s.name.toLowerCase()}` })) }]
              : data.student ? [{ name: "student", label: "Student", type: "select" as const, value: data.student.row.id, options: data.student.options }] : []),
          ]}>
            {monthNav}
          </UrlFilters>

          {view === "class" && data.grid && (
            <ClassGrid grid={data.grid} byKey={byKey} statuses={statuses} cellHref={cellHref} statusFilter={statusFilter} />
          )}
          {view === "student" && (data.student ? (
            <StudentCalendar s={data.student} byKey={byKey} statuses={statuses} sectionName={data.section?.name ?? ""} yearName={data.year?.name ?? null} cellHref={cellHref} />
          ) : (
            <EmptyState title="No students in this section">Students appear here once they are placed in the section.</EmptyState>
          ))}
        </>
      )}
    </>
  );
}

type Grid = NonNullable<Awaited<ReturnType<typeof registerMonth>>>;

function ClassGrid({ grid, byKey, statuses, cellHref, statusFilter }: {
  grid: Grid; byKey: Map<string, StatusView>; statuses: StatusView[]; cellHref: (studentId: string, iso: string) => string | null; statusFilter: string;
}) {
  const future = grid.dates.some((d) => d.future);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Working days" value={grid.workingDays} />
        <Stat label="Class attendance" value={percentText(grid.overall.percent)} tone={grid.overall.percent !== null && grid.overall.percent < 75 ? "warning" : undefined} />
        <Stat label="Absent days" value={grid.overall.absent} />
        <Stat label="Late marks" value={grid.overall.late} />
      </div>
      <Legend statuses={statuses} extra={<li className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="inline-block h-6 w-6 rounded border border-line bg-surface-3" />Holiday or Sunday (not counted)</li>} />
      {grid.rows.length === 0 ? (
        <EmptyState title={statusFilter ? "No student matches this status" : "No students in this section"}>
          {statusFilter ? "Nobody in this section had that status this month. Choose another status or Any status." : "Students appear here once they are placed in the section."}
        </EmptyState>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface" tabIndex={0} role="region" aria-label={`Register for ${grid.section.name}, ${grid.label}`}>
          <table className="w-max min-w-full border-collapse text-sm">
            <caption className="sr-only">{grid.section.name}, {grid.label}: students down the side, dates across</caption>
            <thead className="bg-surface-2 text-ink-2">
              <tr>
                <th scope="col" className="sticky left-0 z-10 min-w-44 border-b border-r border-line bg-surface-2 px-3 py-2 text-left font-medium">Student</th>
                {grid.dates.map((d) => (
                  <th key={d.iso} scope="col" className={`w-8 border-b border-line px-0.5 py-1 text-center font-medium ${d.off ? "bg-surface-3" : ""}`} title={d.off ?? undefined}>
                    <span className="block text-[11px] font-normal">{d.weekday.slice(0, 2)}</span>{d.day}
                  </th>
                ))}
                <th scope="col" className="border-b border-l border-line px-2 py-2 text-right font-medium">Present</th>
                <th scope="col" className="border-b border-line px-2 py-2 text-right font-medium">Counted</th>
                <th scope="col" className="border-b border-line px-3 py-2 text-right font-medium">%</th>
              </tr>
            </thead>
            <tbody>
              {grid.rows.map((r) => (
                <tr key={r.id} className="border-b border-line last:border-0">
                  <th scope="row" className="sticky left-0 z-10 border-r border-line bg-surface px-3 py-1.5 text-left font-normal">
                    <span className="mr-1 text-ink-2 tabular-nums">{r.roll ?? "–"}</span> <span className="font-medium">{r.name}</span>
                  </th>
                  {grid.dates.map((d) => {
                    if (d.off) return <td key={d.iso} className="bg-surface-3 text-center" title={d.off}><span className="sr-only">{d.off}</span></td>;
                    const st = r.days[d.iso] ? byKey.get(r.days[d.iso]) ?? { key: r.days[d.iso], name: r.days[d.iso], letter: "?", tone: "neutral" } : undefined;
                    const href = cellHref(r.id, d.iso);
                    const label = `${r.name}, ${d.day} ${grid.label}`;
                    const inner = <Cell status={st} label={label} />;
                    return (
                      <td key={d.iso} className="px-0.5 py-0.5 text-center">
                        {href ? <Link href={href} className="inline-grid min-h-7 min-w-7 place-items-center rounded hover:ring-2 hover:ring-brand" aria-label={`${label}: ${st?.name ?? "not marked"}. Change`}>{inner}</Link> : inner}
                      </td>
                    );
                  })}
                  <td className="border-l border-line px-2 text-right tabular-nums">{r.summary.present}</td>
                  <td className="px-2 text-right tabular-nums">{r.summary.countedDays}</td>
                  <td className={`px-3 text-right font-medium tabular-nums ${r.summary.percent !== null && r.summary.percent < 75 ? "text-danger" : ""}`}>{percentText(r.summary.percent)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="bg-surface-2">
                <td colSpan={grid.dates.length + 4} className="px-3 py-2 text-ink-2">
                  {grid.workingDays} working day{grid.workingDays === 1 ? "" : "s"}{future ? " so far" : ""}. Holidays, Sundays and unmarked days are not counted. A half day counts as half.
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-sm text-ink-2">Tap a mark to change it. After the lock time a change goes to Approvals as a correction request.</p>
    </div>
  );
}

function StudentCalendar({ s, byKey, statuses, sectionName, yearName, cellHref }: {
  s: { row: Grid["rows"][number]; cal: Awaited<ReturnType<typeof studentMonth>>; yearSum: { percent: number | null; countedDays: number } | null };
  byKey: Map<string, StatusView>; statuses: StatusView[]; sectionName: string; yearName: string | null; cellHref: (studentId: string, iso: string) => string | null;
}) {
  const first = s.cal.cells[0];
  const lead = first ? (first.weekday + 6) % 7 : 0;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label={`${s.cal.label}`} value={percentText(s.cal.summary.percent)} tone={s.cal.summary.percent !== null && s.cal.summary.percent < 75 ? "warning" : undefined} />
        <Stat label={yearName ? `Year ${yearName}` : "This year"} value={s.yearSum ? percentText(s.yearSum.percent) : "Not marked yet"} tone={s.yearSum?.percent != null && s.yearSum.percent < 75 ? "danger" : undefined} />
        <Stat label="Present days this month" value={s.cal.summary.present} />
        <Stat label="Absent days this month" value={s.cal.summary.absent} />
      </div>
      <Card>
        <CardBody>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold">{s.row.name} <span className="font-normal text-ink-2">· {sectionName} · {s.cal.label}</span></h2>
            <span className="text-sm text-ink-2">Admission no. {s.row.admissionNo}</span>
          </div>
          <Legend statuses={statuses} />
          <div className="mt-4 grid grid-cols-7 gap-1 text-center text-sm" role="grid" aria-label={`${s.row.name}, ${s.cal.label}`}>
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((w) => <div key={w} role="columnheader" className="py-1 text-xs font-medium text-ink-2">{w}</div>)}
            {Array.from({ length: lead }).map((_, i) => <div key={`x${i}`} aria-hidden="true" />)}
            {s.cal.cells.map((c) => {
              const st = c.statusKey ? byKey.get(c.statusKey) : undefined;
              const href = !c.off && !c.future ? cellHref(s.row.id, c.date) : null;
              const body = (
                <>
                  <span className="text-xs">{c.day}</span>
                  <span className="text-sm font-semibold">{c.off ? "" : st ? st.letter : c.future ? "" : "–"}</span>
                  <span className="sr-only">{c.off ? c.off : st ? st.name : c.future ? "Not yet" : "Not marked"}</span>
                </>
              );
              const cls = `flex min-h-14 flex-col items-center justify-center rounded-lg border ${c.off ? "border-line bg-surface-3 text-ink-2" : st ? toneClass(st.tone) : "border-line"}`;
              return (
                <div key={c.date} role="gridcell" title={c.off ?? st?.name}>
                  {href ? <Link href={href} className={`${cls} hover:ring-2 hover:ring-brand`}>{body}</Link> : <div className={cls}>{body}</div>}
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-sm text-ink-2">{s.cal.summary.workingDays} working days · {s.cal.summary.countedDays} counted · {s.cal.summary.late} late · {s.cal.summary.leave} on leave</p>
        </CardBody>
      </Card>
      {s.yearSum === null && <Alert tone="info">This student has no marks in the current academic year yet.</Alert>}
    </div>
  );
}
