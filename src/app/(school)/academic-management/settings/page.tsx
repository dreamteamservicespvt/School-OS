import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { closeChecks, openYearPreview, removeCheck, TERM_PRESETS, yearNameFor } from "@/lib/academic/lifecycle";
import { academicSettings, periodSlots } from "@/lib/academic/settings";
import { roomsFor, ROOM_KINDS } from "@/lib/academic/rooms";
import { inCampus } from "@/lib/campus";
import { ACADEMIC_FEATURES, featureOn } from "@/lib/academic/scope";
import { DAY_NAMES, DAY_SHORT, addDays, isoDay, time12 } from "@/lib/academic/common";
import { EmptyState } from "@/components/empty-state";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { academicPage, one, type SearchParams } from "../_lib/page";
import { PageTop } from "../_components/page-top";
import {
  ArchiveCondition, ArchiveRoom, ArchiveSlot, ArchiveTerm, CloseYear, ConditionButton, EditYear, FeatureToggle, FinancialYearButton, NewYearButton,
  OpenYear, PreferenceButton, RemoveYear, RoomButton, SlotButton, TermButton, TimingsForm,
} from "./settings-ui";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Academic Settings") };
}
const PATH = "/academic-management/settings";
const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: "Active", tone: "success" }, UPCOMING: { label: "Upcoming", tone: "brand" }, OPEN: { label: "Open, not active", tone: "warning" }, CLOSED: { label: "Closed", tone: "neutral" },
};

export default async function AcademicSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const raw = await searchParams;
  const page = await academicPage(raw);
  if (!page.scope.manage) redirect("/academic-management");
  const tabs = [
    { value: "years", label: "Years" }, { value: "terms", label: "Terms" }, { value: "timings", label: "Timings and limits" }, { value: "periods", label: "Period master" },
    { value: "teachers", label: "Teacher preferences" }, { value: "conditions", label: "Subject conditions" }, { value: "options", label: "Options" },
  ];
  const tab = tabs.some((t) => t.value === one(raw.tab)) ? one(raw.tab) : "years";
  const ctx = page.current.ctx;
  const rooms = featureOn(page.current, "academic-rooms");
  const pageYearId = page.year?.id ?? "";

  const data = await withSchool(ctx, async (tx) => {
    const settings = await academicSettings(tx, ctx, page.campusId);
    const slots = await periodSlots(tx, ctx, page.campusId);
    if (tab === "years") {
      const years = await tx.academicYear.findMany({ where: { campusId: page.campusId, archivedAt: null }, orderBy: { startDate: "desc" } });
      const info = [];
      for (const y of years) {
        const [preview, close, remove] = await Promise.all([
          y.status === "UPCOMING" || y.status === "OPEN" ? openYearPreview(tx, y.id) : null,
          y.status !== "CLOSED" ? closeChecks(tx, y.id) : null,
          y.status === "UPCOMING" || y.status === "OPEN" ? removeCheck(tx, y.id) : null,
        ]);
        info.push({ y, preview, close, remove });
      }
      const fys = await tx.financialYear.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null }, orderBy: { startDate: "desc" } });
      return { kind: "years" as const, settings, slots, info, fys };
    }
    if (tab === "terms") {
      const terms = page.year ? await tx.term.findMany({ where: { academicYearId: page.year.id, archivedAt: null }, orderBy: { startDate: "asc" } }) : [];
      return { kind: "terms" as const, settings, slots, terms };
    }
    if (tab === "teachers") {
      const teachers = await tx.staff.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] }, staffType: "Teaching", ...inCampus(page.current) }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, designation: true } });
      const prefs = await tx.teacherPreference.findMany({ where: { schoolId: ctx.schoolId } });
      return { kind: "teachers" as const, settings, slots, teachers, prefs };
    }
    if (tab === "conditions") {
      // One campus: the whole school's conditions and those for the campus's classes.
      const campusClassIds = page.current.campusId ? (await tx.schoolClass.findMany({ where: { campusId: page.current.campusId }, select: { id: true } })).map((c) => c.id) : null;
      const conditions = await tx.subjectCondition.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null, ...(campusClassIds ? { OR: [{ classId: null }, { classId: { in: campusClassIds } }] } : {}) }, orderBy: { createdAt: "asc" } });
      const subjects = await tx.subject.findMany({ where: { schoolId: ctx.schoolId, archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } });
      const classes = await tx.schoolClass.findMany({ where: { campusId: page.campusId, archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } });
      return { kind: "conditions" as const, settings, slots, conditions, subjects, classes };
    }
    if (tab === "options") {
      const roomList = rooms ? await roomsFor(tx, ctx, page.campusId) : [];
      return { kind: "options" as const, settings, slots, roomList };
    }
    return { kind: tab === "timings" ? ("timings" as const) : ("periods" as const), settings, slots };
  });

  const lastYear = page.years[0];
  const suggestedStart = lastYear ? addDays(lastYear.endDate, 1) : new Date(Date.UTC(page.today.getUTCFullYear(), 3, 1));
  const suggestedEnd = new Date(Date.UTC(suggestedStart.getUTCFullYear() + 1, suggestedStart.getUTCMonth(), suggestedStart.getUTCDate() - 1));
  const tabHref = (t: string) => `${PATH}?tab=${t}${page.yearQuery ? `&${page.yearQuery}` : ""}`;
  const teaching = data.slots.filter((s) => !s.isBreak);

  return (
    <>
      <PageTop page={page} title="Academic Settings" href={PATH} showYear={tab === "terms"} />
      <nav aria-label="Settings sections" className="no-print mb-5 flex max-w-full gap-1 overflow-x-auto rounded-xl bg-surface-2 p-1">
        {tabs.map((t) => (
          <Link key={t.value} href={tabHref(t.value)} aria-current={t.value === tab ? "page" : undefined}
            className={`flex min-h-10 items-center whitespace-nowrap rounded-lg px-3 text-[15px] ${t.value === tab ? "bg-surface font-medium shadow-card" : "text-ink-2 hover:text-ink"}`}>{t.label}</Link>
        ))}
      </nav>

      {data.kind === "years" && (
        <div className="space-y-8">
          <section aria-labelledby="years-h">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="years-h" className="text-lg font-semibold"><Words k="Academic years" /></h2>
              <NewYearButton years={page.years.map((y) => ({ value: y.id, label: y.name }))} presets={TERM_PRESETS} suggested={{ name: yearNameFor(suggestedStart, suggestedEnd), start: isoDay(suggestedStart), end: isoDay(suggestedEnd) }} pageYearId={pageYearId} />
            </div>
            <p className="mb-3 text-sm text-ink-2"><Words k="One year is active at a time. Closed years are read-only, except corrections by the Principal or School Admin with a reason." /></p>
            {data.info.length === 0 ? <EmptyState title="No academic year yet"><Words k="Start the current year with its dates and terms. Classes, the Time Table and every record belong to a year." /></EmptyState> : (
              <ul className="space-y-3">
                {data.info.map(({ y, preview, close, remove }) => (
                  <li key={y.id} className="rounded-2xl border border-line bg-surface p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="flex flex-wrap items-center gap-2 text-lg font-semibold">{y.name} <Badge tone={STATUS[y.status]?.tone ?? "neutral"}>{STATUS[y.status]?.label ?? y.status}</Badge></p>
                        <p className="text-sm text-ink-2">{formatDate(y.startDate)} <Words k="to" /> {formatDate(y.endDate)}{y.closedAt ? ` · closed on ${formatDate(y.closedAt)}` : ""}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1">
                        {preview && <OpenYear yearId={y.id} yearName={y.name} message={preview.message} activeName={preview.active?.name ?? null} />}
                        {y.status !== "CLOSED" && <EditYear year={{ id: y.id, name: y.name, start: isoDay(y.startDate), end: isoDay(y.endDate) }} />}
                        {close && <CloseYear yearId={y.id} yearName={y.name} notes={close.notes} />}
                        {remove && <RemoveYear yearId={y.id} yearName={y.name} canRemove={remove.canRemove} message={remove.message} />}
                        <Link className="min-h-11 rounded-lg px-3 py-2.5 text-sm font-medium text-brand-text hover:bg-surface-2" href={`/academic-management?year=${y.id}`}><Words k="Classes" /></Link>
                      </div>
                    </div>
                    {remove && !remove.canRemove && <p className="mt-2 text-sm text-ink-2">{remove.message}</p>}
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section aria-labelledby="fy-h">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 id="fy-h" className="text-lg font-semibold"><Words k="Financial years" /></h2>
              <FinancialYearButton suggested={nextFy(data.fys[0]?.endDate, page.today)} />
            </div>
            {data.fys.length === 0 ? <p className="text-ink-2"><Words k="No financial year yet. Add the current one (1 April to 31 March)." /></p> : (
              <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
                {data.fys.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <span className="font-medium">{f.name}</span>
                    <span className="text-sm text-ink-2">{formatDate(f.startDate)} <Words k="to" /> {formatDate(f.endDate)} · {f.status === "OPEN" ? "Open" : "Closed"}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}

      {data.kind === "terms" && (
        !page.year ? <EmptyState title="No academic year yet"><Words k="Create a year in the Years tab first." /></EmptyState> : (
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-semibold"><Words k="Terms in" /> {page.year.name}</h2>
              {page.writable && <TermButton yearId={page.year.id} suggested={{ name: `Term ${data.terms.length + 1}`, start: isoDay(data.terms.length ? addDays(data.terms[data.terms.length - 1].endDate, 1) : page.year.startDate), end: isoDay(page.year.endDate) }} />}
            </div>
            {data.terms.length === 0 ? <EmptyState title="No terms yet"><Words k="Add the terms or semesters of" /> {page.year.name}<Words k=". Exams and report cards are grouped by term." /></EmptyState> : (
              <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
                {data.terms.map((t, i) => {
                  const prev = data.terms[i - 1];
                  const gap = prev && addDays(prev.endDate, 1) < t.startDate;
                  return (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                      <span><strong>{t.name}</strong> <span className="text-ink-2">· {formatDate(t.startDate)} <Words k="to" /> {formatDate(t.endDate)}</span>{gap && <Badge tone="warning" className="ml-2"><Words k="Gap before it" /></Badge>}</span>
                      {page.writable && <span className="flex gap-1"><TermButton yearId={page.year!.id} term={{ id: t.id, name: t.name, start: isoDay(t.startDate), end: isoDay(t.endDate) }} /><ArchiveTerm id={t.id} name={t.name} /></span>}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )
      )}

      {data.kind === "timings" && <TimingsForm s={data.settings} pageYearId={pageYearId} />}

      {data.kind === "periods" && (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold"><Words k="Period master" /></h2>
            <SlotButton workingDays={data.settings.workingDays} nextNumber={Math.max(0, ...teaching.map((s) => s.number)) + 1} pageYearId={pageYearId} />
          </div>
          <p className="mb-3 text-sm text-ink-2"><Words k="The rows of every Time Table: periods, breaks and lunch, with times and the days each runs." /></p>
          {data.slots.length === 0 ? <EmptyState title="No periods yet"><Words k="Add Period 1, the breaks and lunch with their times. The Time Table uses these rows." /></EmptyState> : (
            <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {data.slots.map((s) => (
                <li key={s.id} className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 ${s.isBreak ? "bg-surface-2" : ""}`}>
                  <span>
                    <strong>{s.label}</strong> <span className="text-ink-2">· {time12(s.startTime)} <Words k="to" /> {time12(s.endTime)}</span>
                    <span className="block text-sm text-ink-2">{s.days.length === data.settings.workingDays.length && data.settings.workingDays.every((d) => s.days.includes(d)) ? "Every working day" : s.days.map((d) => DAY_SHORT[d]).join(", ")}{s.isBreak ? " · break" : ""}</span>
                  </span>
                  <span className="flex gap-1">
                    <SlotButton slot={{ id: s.id, label: s.label, number: s.number, startTime: s.startTime, endTime: s.endTime, isBreak: s.isBreak, days: s.days }} workingDays={data.settings.workingDays} nextNumber={s.number} pageYearId={pageYearId} />
                    <ArchiveSlot id={s.id} label={s.label} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {data.kind === "teachers" && (
        <section>
          <h2 className="mb-1 text-lg font-semibold"><Words k="Teacher preferences" /></h2>
          <p className="mb-3 text-sm text-ink-2"><Words k="Lower limits and rest times for a teacher, used when the Time Table is made automatically. Empty means the school limits (" />{data.settings.maxPeriodsPerDay} <Words k="a day," /> {data.settings.maxPeriodsPerWeek} <Words k="a week)." /></p>
          {data.teachers.length === 0 ? <EmptyState title="No teachers yet"><Words k={"Teachers appear here once they are added in Staff & HR."} /></EmptyState> : (
            <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {data.teachers.map((t) => {
                const p = data.prefs.find((x) => x.staffId === t.id) ?? null;
                return (
                  <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <span>
                      <strong>{t.fullName}</strong> <span className="text-ink-2">· {t.designation}</span>
                      <span className="block text-sm text-ink-2">{p ? [p.maxPerDay && `${p.maxPerDay} a day`, p.maxPerWeek && `${p.maxPerWeek} a week`, p.unavailable.length && `not available in ${p.unavailable.length} periods`, p.note].filter(Boolean).join(" · ") || "School limits" : "School limits"}</span>
                    </span>
                    <PreferenceButton teacher={{ id: t.id, name: t.fullName }} pref={p ? { maxPerDay: p.maxPerDay, maxPerWeek: p.maxPerWeek, unavailable: p.unavailable, note: p.note } : null} days={data.settings.workingDays} slots={teaching.map((s) => ({ number: s.number, label: s.label }))} />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      )}

      {data.kind === "conditions" && (
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold"><Words k="Subject conditions" /></h2>
            <ConditionButton subjects={data.subjects.map((s) => ({ value: s.id, label: s.name }))} classes={data.classes.map((c) => ({ value: c.id, label: c.name }))} days={data.settings.workingDays} slots={teaching.map((s) => ({ value: String(s.number), label: s.label }))} />
          </div>
          {data.conditions.length === 0 ? <EmptyState title="No conditions"><Words k="Keep a subject out of a period, like no Maths in period 8. Conditions win over teacher preferences when the Time Table is made automatically." /></EmptyState> : (
            <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
              {data.conditions.map((c) => {
                const words = `No ${data.subjects.find((s) => s.id === c.subjectId)?.name ?? "subject"} in period ${c.periodNo}${c.dayOfWeek ? ` on ${DAY_NAMES[c.dayOfWeek]}` : ""}, ${c.classId ? data.classes.find((x) => x.id === c.classId)?.name ?? "one class" : "all classes"}`;
                return <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2"><span>{words}</span><ArchiveCondition id={c.id} words={words} /></li>;
              })}
            </ul>
          )}
        </section>
      )}

      {data.kind === "options" && (
        <div className="space-y-8">
          <section>
            <h2 className="mb-1 text-lg font-semibold"><Words k="Optional parts" /></h2>
            <p className="mb-2 text-sm text-ink-2"><Words k="Switch on only what this school uses. Screens and fields for an option stay hidden while it is off." /></p>
            <div className="divide-y divide-line rounded-2xl border border-line bg-surface px-4">
              {ACADEMIC_FEATURES.map((f) => <FeatureToggle key={f.key} featureKey={f.key} label={f.label} help={f.help} on={page.current.features.has(f.key)} />)}
            </div>
          </section>
          {rooms && (
            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold"><Words k="Rooms and labs" /></h2>
                <RoomButton pageYearId={pageYearId} />
              </div>
              {data.roomList.length === 0 ? <EmptyState title="No rooms yet"><Words k="Add labs and shared rooms. Each gets its own Time Table, and labs can be booked for a period." /></EmptyState> : (
                <ul className="divide-y divide-line rounded-2xl border border-line bg-surface">
                  {data.roomList.map((r) => (
                    <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2">
                      <span><strong>{r.name}</strong> <span className="text-ink-2">· {ROOM_KINDS.find((k) => k.value === r.kind)?.label ?? r.kind}{r.capacity ? ` · ${r.capacity} seats` : ""}</span></span>
                      <ArchiveRoom id={r.id} name={r.name} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>
      )}
    </>
  );
}

function nextFy(lastEnd: Date | undefined, today: Date) {
  const start = lastEnd ? addDays(lastEnd, 1) : new Date(Date.UTC(today.getUTCMonth() >= 3 ? today.getUTCFullYear() : today.getUTCFullYear() - 1, 3, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear() + 1, start.getUTCMonth(), start.getUTCDate() - 1));
  return { name: `FY ${start.getUTCFullYear()}-${String(end.getUTCFullYear()).slice(-2)}`, start: isoDay(start), end: isoDay(end) };
}
