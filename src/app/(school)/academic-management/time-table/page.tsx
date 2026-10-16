import type { Metadata } from "next";
import Link from "next/link";
import { withSchool } from "@/lib/db";
import { allocationActiveOn, limitsFor } from "@/lib/academic/allocation";
import { subjectsForClass } from "@/lib/academic/subjects";
import { clashCheck, effectiveVersion, gridRows, publishedVersionForYear, roomGrid, sectionGrid, staffGrid, versionCells, versionsForYear, type PeriodCell } from "@/lib/academic/timetable";
import { bookingsBetween, roomNames, roomsFor } from "@/lib/academic/rooms";
import { featureOn } from "@/lib/academic/scope";
import { DAY_NAMES, addDays, isoDay, plural, weekday } from "@/lib/academic/common";
import { EmptyState } from "@/components/empty-state";
import { Alert } from "@/components/ui/alert";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { academicPage, one, type SearchParams } from "../_lib/page";
import { NoYear, PageTop } from "../_components/page-top";
import { ExportLinks } from "../_components/export-links";
import { ParamSelect, ViewSwitch } from "../_components/pickers";
import { Legend, TimetableGrid, type Cell, type EditContext } from "./grid";
import { VersionBar, type VersionRow } from "./version-bar";
import { LabBookings } from "./lab-bookings";
import { PrintPicker } from "./print-picker";

export const metadata: Metadata = { title: "Time Table" };
const PATH = "/academic-management/time-table";

const plain = (c: PeriodCell): Cell => ({ id: c.id, sectionId: c.sectionId, sectionLabel: c.sectionLabel, dayOfWeek: c.dayOfWeek, periodNo: c.periodNo, startTime: c.startTime, endTime: c.endTime, subjectId: c.subjectId, subjectName: c.subjectName, subjectCode: c.subjectCode, staffId: c.staffId, staffName: c.staffName, room: c.room, isBreak: c.isBreak, label: c.label });
const short = (name: string | null) => (name ? name.replace(/^(Mr|Mrs|Ms|Dr)\.?\s+/i, "").split(/\s+/).map((p, i, a) => (i === a.length - 1 ? p : `${p[0]}.`)).join(" ") : "");

export default async function TimeTablePage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const page = await academicPage(raw);
  if (!page.year) return (<><PageTop page={page} title="Time Table" href={PATH} /><NoYear page={page} /></>);
  const year = page.year;
  const { scope, current } = page;
  const ctx = current.ctx;
  const own = scope.see === "own" && !scope.arrange;
  const rooms = featureOn(current, "academic-rooms");
  const views = [
    { value: "class", label: "Class" },
    { value: "teacher", label: own ? "My Time Table" : "Teacher" },
    ...(rooms ? [{ value: "room", label: "Room and lab" }] : []),
    ...(!own ? [{ value: "free", label: "Free periods" }, { value: "overview", label: "School overview" }] : []),
  ];
  const view = views.some((x) => x.value === one(raw.view)) ? one(raw.view) : "class";
  const todayDay = weekday(page.today);

  const data = await withSchool(ctx, async (tx) => {
    const versions = await versionsForYear(tx, year.id);
    const inForce = await effectiveVersion(tx, ctx, page.campusId, page.today);
    const publishedNow = await publishedVersionForYear(tx, year.id, page.today);
    const draft = versions.find((x) => x.status === "DRAFT") ?? null;
    const vParam = one(raw.version);
    let shown = vParam === "draft" && scope.arrange ? draft : versions.find((x) => x.id === vParam && (scope.arrange || x.status === "PUBLISHED")) ?? null;
    shown ??= versions.find((x) => x.id === publishedNow?.id) ?? (scope.arrange ? draft : null);
    const { slots, days } = await gridRows(tx, ctx, page.campusId);
    const sections = await tx.section.findMany({
      where: { academicYearId: year.id, archivedAt: null, schoolClass: { campusId: page.campusId, archivedAt: null }, ...(scope.sectionIds ? { id: { in: scope.sectionIds } } : {}) },
      include: { schoolClass: true }, orderBy: [{ schoolClass: { sortOrder: "asc" } }, { name: "asc" }],
    });
    const teachers = await tx.staff.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] }, staffType: "Teaching" }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, designation: true } });
    const clashes = shown && scope.arrange ? await clashCheck(tx, ctx, shown.id) : [];
    const classes = [...new Map(sections.map((s) => [s.classId, { id: s.classId, name: s.schoolClass.name }])).values()];

    let cells: PeriodCell[] = [];
    let edit: EditContext | null = null;
    let sectionId = "";
    let staffId = "";
    let room = "";
    let roomList: string[] = [];
    let labRooms: { id: string; name: string }[] = [];
    let bookings: Awaited<ReturnType<typeof bookingsBetween>> = [];
    let workload: { id: string; name: string; periods: number; limit: number }[] = [];
    let all: PeriodCell[] = [];

    if (view === "class") {
      sectionId = sections.some((s) => s.id === one(raw.section)) ? one(raw.section) : sections[0]?.id ?? "";
      const section = sections.find((s) => s.id === sectionId);
      if (shown && section) {
        cells = await sectionGrid(tx, shown.id, section.id);
        if (shown.status === "DRAFT" && scope.arrange && page.writable) {
          const date = shown.effectiveFrom && shown.effectiveFrom > page.today ? shown.effectiveFrom : page.today < year.startDate ? year.startDate : page.today;
          const subjects = await subjectsForClass(tx, section.classId, date);
          const allocations = await tx.teacherAllocation.findMany({ where: { sectionId: section.id, ...allocationActiveOn(date) }, orderBy: { isMain: "desc" } });
          const nameOf = new Map(teachers.map((t) => [t.id, t.fullName]));
          const assigned: EditContext["assigned"] = {};
          for (const a of allocations) if (nameOf.has(a.staffId)) (assigned[a.subjectId] ??= []).push({ id: a.staffId, name: nameOf.get(a.staffId)! });
          edit = { versionId: shown.id, sectionId: section.id, sectionLabel: `${section.schoolClass.name} ${section.name}`, sectionRoom: section.room, subjects: subjects.map((s) => ({ id: s.id, name: s.name })), assigned, teachers: teachers.map((t) => ({ id: t.id, name: t.fullName })) };
        }
      }
    } else if (view === "teacher") {
      staffId = own ? scope.staffId ?? "" : teachers.some((t) => t.id === one(raw.staff)) ? one(raw.staff) : scope.staffId && teachers.some((t) => t.id === scope.staffId) ? scope.staffId : teachers[0]?.id ?? "";
      if (shown && staffId) cells = await staffGrid(tx, shown.id, staffId);
    } else if (view === "room") {
      roomList = await roomNames(tx, ctx, page.campusId, year.id);
      room = roomList.find((r) => r === one(raw.room)) ?? roomList[0] ?? "";
      if (shown && room) cells = await roomGrid(tx, shown.id, room);
      labRooms = (await roomsFor(tx, ctx, page.campusId)).map((r) => ({ id: r.id, name: r.name }));
      const labRoom = (await roomsFor(tx, ctx, page.campusId)).find((r) => r.name.toLowerCase() === room.toLowerCase());
      if (labRoom) bookings = await bookingsBetween(tx, labRoom.id, page.today, addDays(page.today, 13));
    } else if (shown) {
      all = await versionCells(tx, shown.id);
      if (view === "overview") {
        const ids = [...new Set(all.map((c) => c.staffId).filter((x): x is string => Boolean(x)))];
        const limit = await limitsFor(tx, ctx, page.campusId, ids);
        workload = ids.map((id) => ({ id, name: all.find((c) => c.staffId === id)?.staffName ?? "", periods: all.filter((c) => c.staffId === id && !c.isBreak).length, limit: limit(id).perWeek })).sort((a, b) => b.periods - a.periods);
      }
    }
    return {
      versions: versions.map((x): VersionRow => ({ id: x.id, name: x.name, status: x.status as VersionRow["status"], effectiveFrom: x.effectiveFrom ? isoDay(x.effectiveFrom) : null, periods: x._count.periods, inForce: inForce?.id === x.id })),
      shownId: shown?.id ?? null, slots, days, sections, teachers, clashes, classes, cells, edit, sectionId, staffId, room, roomList, labRooms, bookings, workload, all,
      otherYears: page.years.filter((y) => y.status !== "CLOSED").map((y) => ({ id: y.id, name: y.name })),
    };
  });

  const shown = data.versions.find((x) => x.id === data.shownId) ?? null;
  const q = (change: Record<string, string | null>) => {
    const next = new URLSearchParams();
    for (const [k, val] of Object.entries(raw)) if (typeof val === "string" && val) next.set(k, val);
    for (const [k, val] of Object.entries(change)) { if (val) next.set(k, val); else next.delete(k); }
    return `${PATH}?${next}`;
  };
  const versionQ = shown ? `&version=${shown.id}` : "";
  const yearQ = page.yearQuery ? `&${page.yearQuery}` : "";
  const hard = data.clashes.filter((c) => c.hard);
  const soft = data.clashes.filter((c) => !c.hard);
  const sectionLabel = (id: string) => { const s = data.sections.find((x) => x.id === id); return s ? `${s.schoolClass.name} ${s.name}` : ""; };
  const slots = data.slots.map((s) => ({ number: s.number, label: s.label, startTime: s.startTime, endTime: s.endTime, isBreak: s.isBreak, days: s.days }));
  const freeDay = data.days.includes(Number(one(raw.day))) ? Number(one(raw.day)) : data.days.includes(todayDay) ? todayDay : data.days[0];

  return (
    <>
      <PageTop page={page} title="Time Table" href={PATH}>
        <ButtonLink href="/academic-management/time-table/mine" size="sm">My day</ButtonLink>
      </PageTop>
      <ViewSwitch views={views} current={view} keep={["version"]} />
      {(scope.arrange || data.versions.length > 0) && (
        <VersionBar versions={data.versions.filter((x) => scope.arrange || x.status === "PUBLISHED")} shown={shown} yearId={year.id} canArrange={scope.arrange} writable={page.writable}
          classes={data.classes} years={data.otherYears} today={isoDay(page.today)} hardClashes={hard.length} />
      )}

      {scope.arrange && shown && (hard.length > 0 || soft.length > 0) && (
        <section aria-label="Clashes" className="no-print mb-4">
          {hard.length > 0 && (
            <Alert tone="danger" title={`${plural(hard.length, "clash", "clashes")} to fix before publishing`}>
              <ul className="mt-1 space-y-1">
                {hard.slice(0, 20).map((c, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">{c.message} <Link className="font-medium underline" href={q({ view: "class", section: c.sectionId, at: `${c.dayOfWeek}:${c.periodNo}` })}>Go to {sectionLabel(c.sectionId)}</Link></li>
                ))}
              </ul>
            </Alert>
          )}
          {soft.length > 0 && (
            <details className="mt-2 rounded-xl border border-line bg-warn-bg px-4 py-2 text-sm text-warn-text">
              <summary className="min-h-10 cursor-pointer py-2 font-medium">{plural(soft.length, "thing")} to check (limits and conditions)</summary>
              <ul className="space-y-1 pb-2">
                {soft.slice(0, 40).map((c, i) => <li key={i}>{c.message} <Link className="underline" href={q({ view: "class", section: c.sectionId, at: `${c.dayOfWeek}:${c.periodNo}` })}>Go to</Link></li>)}
              </ul>
            </details>
          )}
        </section>
      )}

      {!shown ? (
        <EmptyState title="No Time Table yet">
          {scope.arrange ? "Start the Time Table above. Fill it by hand or make it automatically from Teacher Allocation, then publish it." : "The Time Table appears here once the school publishes it."}
        </EmptyState>
      ) : data.slots.length === 0 ? (
        <EmptyState title="No periods set up">
          {scope.manage ? <>Add the periods, breaks and lunch with their times first. <Link className="font-medium text-brand-text underline" href="/academic-management/settings?tab=periods">Open the period master</Link></> : "Ask the Principal to set up the periods in Academic Settings."}
        </EmptyState>
      ) : view === "class" ? (
        data.sections.length === 0 ? (
          <EmptyState title={own ? "No classes given to you yet" : "No sections in this year"}>{own ? "Your classes appear here once they are assigned to you." : "Add classes and sections first, in Classes & Sections."}</EmptyState>
        ) : (
          <>
            <div className="no-print mb-3 flex flex-wrap items-end justify-between gap-3">
              <ParamSelect name="section" label="Class and section" current={data.sectionId} clear={["at"]}
                options={data.sections.map((s) => ({ value: s.id, label: `${s.schoolClass.name} ${s.name}`, group: s.schoolClass.name }))} />
              <div className="flex flex-wrap gap-2">
                <a href={`${PATH}/print?section=${data.sectionId}${versionQ}`} target="_blank" rel="noopener" className={buttonClass("secondary", "sm")}>Print</a>
                <PrintPicker base={`${PATH}/print?x=1${versionQ}`} sections={data.sections.map((s) => ({ id: s.id, label: `${s.schoolClass.name} ${s.name}` }))} />
                <ExportLinks href={`/academic-management/export?kind=timetable&section=${data.sectionId}${versionQ}${yearQ}`} label="This Time Table" />
              </div>
            </div>
            {data.edit && <p className="no-print mb-2 text-sm text-ink-2">Click a period to change it. Clashes are checked as you choose.</p>}
            <TimetableGrid slots={slots} days={data.days} cells={data.cells.map(plain)} mode="class" edit={data.edit} highlight={one(raw.at) || null} today={todayDay}
              clashKeys={hard.filter((c) => c.sectionId === data.sectionId).map((c) => `${c.dayOfWeek}:${c.periodNo}`)} />
            <div className="mt-3"><Legend /></div>
          </>
        )
      ) : view === "teacher" ? (
        !data.staffId ? (
          <EmptyState title="No teacher record">Your login is not linked to a staff record. Ask the office to link it in Staff &amp; HR.</EmptyState>
        ) : (
          <>
            <div className="no-print mb-3 flex flex-wrap items-end justify-between gap-3">
              {!own ? <ParamSelect name="staff" label="Teacher" current={data.staffId} options={data.teachers.map((t) => ({ value: t.id, label: t.fullName }))} /> : <span />}
              <div className="flex flex-wrap gap-2">
                <a href={`${PATH}/print?staff=${data.staffId}${versionQ}`} target="_blank" rel="noopener" className={buttonClass("secondary", "sm")}>Print</a>
                <ExportLinks href={`/academic-management/export?kind=timetable&staff=${data.staffId}${versionQ}${yearQ}`} label="This Time Table" />
              </div>
            </div>
            <p className="mb-2 text-sm text-ink-2">{plural(data.cells.filter((c) => !c.isBreak).length, "period")} a week.{scope.arrange ? " Click a period to open its class." : ""}</p>
            <TimetableGrid slots={slots} days={data.days} cells={data.cells.map(plain)} mode="teacher" today={todayDay}
              linkFor={scope.arrange || !own ? Object.fromEntries(data.cells.map((c) => [c.sectionId, q({ view: "class", section: c.sectionId, staff: null, at: `${c.dayOfWeek}:${c.periodNo}` })])) : undefined} />
            <div className="mt-3"><Legend /></div>
          </>
        )
      ) : view === "room" ? (
        data.roomList.length === 0 ? (
          <EmptyState title="No rooms yet">{scope.manage ? <>Add rooms and labs in <Link className="font-medium text-brand-text underline" href="/academic-management/settings?tab=options">Academic Settings</Link>, or give sections a room.</> : "Rooms appear once the school adds them."}</EmptyState>
        ) : (
          <>
            <div className="no-print mb-3 flex flex-wrap items-end justify-between gap-3">
              <ParamSelect name="room" label="Room or lab" current={data.room} options={data.roomList.map((r) => ({ value: r, label: r }))} />
              <a href={`${PATH}/print?room=${encodeURIComponent(data.room)}${versionQ}`} target="_blank" rel="noopener" className={buttonClass("secondary", "sm")}>Print</a>
            </div>
            <TimetableGrid slots={slots} days={data.days} cells={data.cells.map(plain)} mode="room" today={todayDay} />
            {data.labRooms.some((r) => r.name.toLowerCase() === data.room.toLowerCase()) && (
              <LabBookings room={data.labRooms.find((r) => r.name.toLowerCase() === data.room.toLowerCase())!} today={isoDay(page.today)} canBook={page.writable}
                slots={slots.filter((s) => !s.isBreak).map((s) => ({ number: s.number, label: s.label }))}
                sections={data.sections.map((s) => ({ id: s.id, label: `${s.schoolClass.name} ${s.name}` }))}
                bookings={data.bookings.map((b) => ({ id: b.id, date: isoDay(b.date), periodNo: b.periodNo, sectionLabel: b.sectionLabel, staffName: b.staffName, purpose: b.purpose, mine: b.staffId === scope.staffId }))}
                canCancelAll={scope.arrange} />
            )}
          </>
        )
      ) : view === "free" ? (
        <>
          <div className="no-print mb-3 flex flex-wrap items-end justify-between gap-3">
            <ParamSelect name="day" label="Day" current={String(freeDay)} options={data.days.map((d) => ({ value: String(d), label: DAY_NAMES[d] }))} />
            <ExportLinks href={`/academic-management/export?kind=free-periods&day=${freeDay}${versionQ}${yearQ}`} label="Free periods" />
          </div>
          <ul className="space-y-2">
            {data.slots.filter((s) => !s.isBreak && s.days.includes(freeDay)).map((s) => {
              const busy = new Set(data.all.filter((c) => c.dayOfWeek === freeDay && c.periodNo === s.number && c.staffId).map((c) => c.staffId));
              const free = data.teachers.filter((t) => !busy.has(t.id));
              return (
                <li key={s.number} className="rounded-2xl border border-line bg-surface p-4">
                  <p className="font-semibold">{s.label} <span className="font-normal text-ink-2">· {s.startTime} to {s.endTime} · {plural(free.length, "teacher")} free</span></p>
                  {free.length === 0 ? <p className="mt-1 text-sm text-ink-2">Every teacher is teaching.</p> : <p className="mt-1 text-sm">{free.map((t) => t.fullName).join(", ")}</p>}
                </li>
              );
            })}
          </ul>
        </>
      ) : (
        <Overview data={data} day={freeDay} q={q} versionQ={versionQ} clashAt={hard.map((c) => `${c.sectionId}:${c.dayOfWeek}:${c.periodNo}`)} />
      )}
    </>
  );
}

type OverviewData = {
slots: { number: number; label: string; isBreak: boolean; days: number[] }[];
days: number[];
sections: { id: string; name: string; schoolClass: { name: string } }[];
all: PeriodCell[];
workload: { id: string; name: string; periods: number; limit: number }[];
};

function Overview({ data, day, q, versionQ, clashAt: clashList }: { data: OverviewData; day: number; q: (change: Record<string, string | null>) => string; versionQ: string; clashAt: string[] }) {
  const teaching = data.slots.filter((s) => !s.isBreak && s.days.includes(day));
  const clashAt = new Set(clashList);
  return (
    <div className="space-y-6">
      <div className="no-print flex flex-wrap items-end justify-between gap-3">
        <ParamSelect name="day" label="Day" current={String(day)} options={data.days.map((d) => ({ value: String(d), label: DAY_NAMES[d] }))} />
        <a href={`${PATH}/print?all=1${versionQ}`} target="_blank" rel="noopener" className={buttonClass("secondary", "sm")}>Print all classes</a>
      </div>
      <section aria-labelledby="ov-classes">
        <h2 id="ov-classes" className="mb-2 font-semibold">All classes on {DAY_NAMES[day]}</h2>
        <div className="relative overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="bg-surface-2">
              <tr><th scope="col" className="sticky left-0 bg-surface-2 px-3 py-2 font-medium">Section</th>{teaching.map((s) => <th key={s.number} scope="col" className="px-2 py-2 font-medium">{s.label}</th>)}</tr>
            </thead>
            <tbody>
              {data.sections.map((sec) => (
                <tr key={sec.id} className="border-t border-line">
                  <th scope="row" className="sticky left-0 whitespace-nowrap bg-surface px-3 py-2 font-medium"><Link className="hover:underline" href={q({ view: "class", section: sec.id })}>{sec.schoolClass.name} {sec.name}</Link></th>
                  {teaching.map((s) => {
                    const c = data.all.find((x) => x.sectionId === sec.id && x.dayOfWeek === day && x.periodNo === s.number);
                    const bad = clashAt.has(`${sec.id}:${day}:${s.number}`);
                    return (
                      <td key={s.number} className={`px-2 py-1.5 align-top ${bad ? "bg-danger-soft text-danger" : !c ? "text-ink-2" : ""}`}>
                        {c ? <><span className="block font-medium">{c.subjectCode || c.subjectName || c.label}</span><span className="block text-xs text-ink-2">{short(c.staffName)}</span></> : "·"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <section aria-labelledby="ov-load">
        <h2 id="ov-load" className="mb-2 font-semibold">Teacher workload in this Time Table</h2>
        {data.workload.length === 0 ? <p className="text-ink-2">No teacher has periods yet.</p> : (
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {data.workload.map((w) => (
              <li key={w.id} className={`flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 ${w.periods > w.limit ? "bg-danger-soft" : "bg-surface"}`}>
                <Link href={q({ view: "teacher", staff: w.id })} className="font-medium hover:underline">{w.name}</Link>
                <span className={w.periods > w.limit ? "font-medium text-danger" : "text-ink-2"}>{w.periods} of {w.limit}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
