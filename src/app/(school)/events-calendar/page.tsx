import Link from "next/link";
import { CalendarClock, CalendarDays, CalendarX2, ChevronLeft, ChevronRight, FileSpreadsheet, History, List, Plus, Sun, Trash2, Upload } from "lucide-react";
import { withSchool } from "@/lib/db";
import { calendarItems, closesSchool, holidayList, lastYearHolidays, type CalItem } from "@/lib/events/calendar";
import { schoolCalendar } from "@/lib/calendar/school-days";
import { ENTRY_TYPES, MONTHS, TYPE_CHIPS, addDaysIso, dayCount, dayOf, dmy, isoOf, niceDay, spanWords, type EntryType } from "@/lib/events/words";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { ExportButton } from "@/components/ui/export-button";
import { UrlSheet } from "@/components/ui/url-sheet";
import { Chips, SegLinks } from "@/components/ui/blocks";
import { PeriodFilter } from "@/components/list/period-filter";
import { cx } from "@/components/ui/cx";
import { Col, DataList, Empty, Split, Stack, TONE_SOFT, Toolbar } from "@/components/money/kit";
import { EvHead } from "./_components/head";
import { EvIcon } from "./_components/icons";
import { JumpSelect } from "./_components/bits";
import { AddEntrySheet, CopyHolidaysSheet, RemoveEntrySheet } from "./_components/calendar-sheets";
import { BASE, evGuard, evPeriod, one, qs, type SearchParams } from "./_lib/page";
import { Any, Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: await pageTitle("School Calendar") };
}

const pad = (n: number) => String(n).padStart(2, "0");
const ym = (iso: string) => iso.slice(0, 7);
const monthStart = (m: string) => `${m}-01`;
const monthEnd = (m: string) => { const [y, mo] = m.split("-").map(Number); return `${m}-${pad(new Date(Date.UTC(y, mo, 0)).getUTCDate())}`; };
const stepMonth = (m: string, k: number) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo - 1 + k, 1)); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; };
const DOW_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthLabel = (m: string) => { const [y, mo] = m.split("-").map(Number); return `${MONTHS[mo - 1]} ${y}`; };

/** School Calendar (18 §2, mod-events.jsx SchoolCalendar): holidays, vacations, exams, events, PTMs and admission tests. */
export default async function CalendarPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await evGuard("calendar");
  const sp = await searchParams;
  const ctx = p.current.ctx;
  const full = p.can.calendar;
  const type = TYPE_CHIPS.some((t) => t.value === one(sp.type)) ? one(sp.type) : "all";
  const view = one(sp.view) === "list" ? "list" : "month";
  const doing = full ? one(sp.do) : "";

  const data = await withSchool(ctx, async (tx) => {
    const [years, classes] = await Promise.all([
      tx.academicYear.findMany({ where: { archivedAt: null }, orderBy: { startDate: "asc" }, select: { id: true, name: true, startDate: true, endDate: true, status: true } }),
      tx.schoolClass.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }),
    ]);
    return { years, classes };
  });
  const firstMonth = data.years.length ? ym(isoOf(data.years[0].startDate)) : stepMonth(ym(p.today), -12);
  const lastMonth = data.years.length ? ym(isoOf(data.years[data.years.length - 1].endDate)) : stepMonth(ym(p.today), 12);
  const wanted = /^\d{4}-\d{2}$/.test(one(sp.m)) ? one(sp.m) : ym(p.today);
  const month = wanted < firstMonth ? firstMonth : wanted > lastMonth ? lastMonth : wanted;
  const selRaw = one(sp.d);
  const sel = /^\d{4}-\d{2}-\d{2}$/.test(selRaw) && ym(selRaw) === month ? selRaw : ym(p.today) === month ? p.today : monthStart(month);
  const classId = data.classes.some((c) => c.id === one(sp.class)) ? one(sp.class) : "";
  // A person limited to one campus sees that campus (and entries for every campus), whatever is asked for.
  const campusId = (p.campuses.length > 1 ? p.current.campusId : null) || (p.campuses.length > 1 && p.campuses.some((c) => c.id === one(sp.campus)) ? one(sp.campus) : "");
  const vp = evPeriod(sp, p.dates, "acyear");
  const range = vp.range!;
  const keep = { m: month, d: sel, type: type === "all" ? null : type, class: classId || null, campus: campusId || null, view: view === "list" ? "list" : null, ...(view === "list" ? vp.keep : {}) };
  const here = (over: Record<string, string | null> = {}) => qs(BASE, { ...keep, ...over });
  const closeHref = here({ do: null, entry: null });

  // The academic year of the month on screen (for the holiday list).
  const mid = `${month}-15`;
  const yearOnScreen = data.years.find((y) => isoOf(y.startDate) <= mid && isoOf(y.endDate) >= mid) ?? data.years.find((y) => y.id === p.year?.id) ?? null;

  const out = await withSchool(ctx, async (tx) => {
    // Entries link only to pages this person can open (the Accountant: events with a fee).
    const opts = { campusId: campusId || null, classId: classId || null, eventLinks: !p.may("events") ? "none" as const : p.accountant ? "paid" as const : "all" as const, ptmLinks: p.may("ptm") };
    const [monthItems, coming, listItems, holidays, copyRows, days] = await Promise.all([
      calendarItems(tx, ctx, monthStart(month), monthEnd(month), opts),
      calendarItems(tx, ctx, p.today, addDaysIso(p.today, 180), opts),
      view === "list" ? calendarItems(tx, ctx, range.from, range.to, opts) : Promise.resolve([] as CalItem[]),
      yearOnScreen ? holidayList(tx, ctx, yearOnScreen.id, campusId || null) : Promise.resolve([]),
      doing === "copy" && p.year ? lastYearHolidays(tx, ctx, p.year.id) : Promise.resolve([]),
      // The school's one rule for a school day, for the campus and class shown.
      schoolCalendar(tx, ctx, dayOf(monthStart(month)), dayOf(monthEnd(month)), campusId || null),
    ]);
    const entry = doing === "remove" && one(sp.entry) ? await tx.calendarEntry.findFirst({ where: { id: one(sp.entry), archivedAt: null, source: null } }) : null;
    return { monthItems, coming, listItems, holidays, copyRows, entry, days };
  });

  const typeOk = (i: CalItem) => type === "all" || i.type === type || (type === "holiday" && i.type === "vacation");
  const shown = out.monthItems.filter(typeOk);
  const onDay = (iso: string) => shown.filter((i) => i.from <= iso && i.to >= iso);
  const [y, mo] = month.split("-").map(Number);
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const lead = (new Date(Date.UTC(y, mo - 1, 1)).getUTCDay() + 6) % 7;
  const s = p.settings;
  const selEntries = onDay(sel);
  const dayRule = (iso: string) => out.days.info(dayOf(iso), { classId: classId || null });
  const weekendOn = (iso: string) => { const i = dayRule(iso); return !i.on && i.reason !== "holiday" ? i.title : null; };
  const selInfo = dayRule(sel);
  const selWeekend = weekendOn(sel);
  const coming = out.coming.filter(typeOk).filter((i) => i.to >= p.today).slice(0, 7);
  const listed = out.listItems.filter(typeOk);
  // The month as a list for phones: each entry once, on its first day in this month.
  const agenda: { iso: string; items: CalItem[] }[] = [];
  for (const e of [...shown].sort((a, b) => (a.from < b.from ? -1 : a.from > b.from ? 1 : 0))) {
    const iso = e.from < monthStart(month) ? monthStart(month) : e.from;
    const g = agenda.find((x) => x.iso === iso);
    if (g) g.items.push(e); else agenda.push({ iso, items: [e] });
  }
  agenda.sort((a, b) => (a.iso < b.iso ? -1 : 1));
  const weekendWords = ["Sundays", s.secondSaturdayOff && "the second Saturday", s.fourthSaturdayOff && "the fourth Saturday"].filter(Boolean).join(s.fourthSaturdayOff && s.secondSaturdayOff ? ", " : " and ").replace(/, (?=[^,]*$)/, " and ");
  const monthsList: { value: string; label: string; href: string }[] = [];
  for (let m = lastMonth; m >= firstMonth; m = stepMonth(m, -1)) monthsList.push({ value: m, label: monthLabel(m), href: here({ m, d: null }) });
  const prev = stepMonth(month, -1);
  const next = stepMonth(month, 1);
  const own = p.v.level === "own";
  const sub = own ? "The whole school’s calendar. Your PTM slots are on the PTM page."
    : !full ? "Holidays, exams, events and PTMs. Read only."
      : "Holidays, exams, events and PTMs for the year.";
  const yearLabel = yearOnScreen?.name.replace("-", "–") ?? "";
  const holidayDays = (e: { startDate: Date; endDate: Date }) => dayCount(isoOf(e.startDate), isoOf(e.endDate));
  const removing = out.entry ? { id: out.entry.id, title: out.entry.title, closes: !out.entry.attendanceOn && ["holiday", "vacation"].includes(out.entry.type), when: out.entry.endDate > out.entry.startDate ? `${dmy(isoOf(out.entry.startDate))} to ${dmy(isoOf(out.entry.endDate))}` : dmy(isoOf(out.entry.startDate)) } : null;

  return (
    <div>
      <EvHead pageName="School Calendar" href={BASE} sub={sub}
        actions={full && <>
          <ButtonLink href={here({ do: "import" })} scroll={false} variant="secondary" icon={Upload} className="hidden md:inline-flex"><Words k="Import" /></ButtonLink>
          <ButtonLink href={here({ do: "add" })} scroll={false} variant="primary" icon={Plus}><Words k="Add to calendar" /></ButtonLink>
        </>} />
      <Stack>
        <div className="flex flex-col lg:flex-row gap-2.5 lg:items-center">
          <div className="flex items-center gap-1">
            <MonthArrow href={month > firstMonth ? here({ m: prev, d: null }) : null} label="Earlier month" dir="prev" />
            <JumpSelect id="cal-jump" label="Jump to month" value={month} options={monthsList} className="w-44 min-w-0" />
            <MonthArrow href={month < lastMonth ? here({ m: next, d: null }) : null} label="Later month" dir="next" />
            <ButtonLink href={here({ m: ym(p.today), d: p.today })} variant="ghost" className="ml-1" scroll={false}><Words k="Today" /></ButtonLink>
          </div>
          <div className="flex-1" />
          {p.campuses.length > 1 && !p.current.campusId && (
            <JumpSelect id="cal-campus" label="Campus" value={campusId || "all"} className="lg:w-44"
              options={[{ value: "all", label: "All campuses", href: here({ campus: null }) }, ...p.campuses.map((c) => ({ value: c.id, label: c.name, href: here({ campus: c.id }) }))]} />
          )}
          <JumpSelect id="cal-cls" label="Class" value={classId || "all"} className="lg:w-44"
            options={[{ value: "all", label: "All classes", href: here({ class: null }) }, ...data.classes.map((c) => ({ value: c.id, label: c.name, href: here({ class: c.id }) }))]} />
          <SegLinks label="Calendar view" value={view} options={[
            { value: "month", label: <span className="flex items-center gap-1.5"><CalendarDays size={15} aria-hidden="true" /><Words k="Month" /></span>, href: here({ view: null, period: null, from: null, to: null }) },
            { value: "list", label: <span className="flex items-center gap-1.5"><List size={15} aria-hidden="true" /><Words k="Year list" /></span>, href: here({ view: "list" }) },
          ]} />
        </div>
        <Chips label="Entry type" value={type} options={TYPE_CHIPS.map((t) => ({ value: t.value, href: here({ type: t.value === "all" ? null : t.value }),
          // The chip's colour dot is the key to the colours on the calendar.
          label: t.value === "all" ? t.label : <span className="flex items-center gap-2"><span className={cx("w-2.5 h-2.5 rounded-full", ENTRY_TYPES[t.value as EntryType].dot)} aria-hidden="true" /><Any text={t.label} /></span> }))} />

        {view === "month" ? (
          <Split side={340}>
            <>
            {/* Phones and tablets: the month as a list, day by day (a 7-column grid of tiny chips cannot be read there). */}
            <Card className="lg:hidden overflow-hidden min-w-0">
              {agenda.length ? (
                <ul className="divide-y divide-line/70">
                  {agenda.map((g) => (
                    <li key={g.iso} className={cx("flex gap-3 px-4 py-3", g.iso === p.today && "bg-brand/[.04]")}>
                      <span className="w-12 shrink-0 text-center pt-0.5">
                        <span className="block text-[11px] font-semibold text-ink3 uppercase"><Any text={DOW_SHORT[dayOf(g.iso).getUTCDay()]} /></span>
                        <span className={cx("mx-auto mt-0.5 w-9 h-9 rounded-full grid place-items-center font-display text-[18px] font-semibold tnum", g.iso === p.today && "bg-brand text-brandink")}>{Number(g.iso.slice(8))}</span>
                      </span>
                      <ul className="min-w-0 flex-1 flex flex-col gap-2">
                        {g.items.map((e) => <EntryRow key={e.id} e={e} removeHref={full && e.removable ? here({ do: "remove", entry: e.id }) : null} />)}
                      </ul>
                    </li>
                  ))}
                </ul>
              ) : <Empty icon={CalendarX2} title="Nothing on the calendar this month" action={full ? <ButtonLink variant="secondary" icon={Plus} href={here({ do: "add" })} scroll={false}><Words k="Add to calendar" /></ButtonLink> : undefined} />}
            </Card>
            <Card className="hidden lg:block overflow-hidden min-w-0">
              <div className="px-5 py-3 flex items-center justify-between gap-x-4 gap-y-2 flex-wrap">
                <ColourKey />
                <span className="text-[12.5px] text-ink3"><Words k="Pick a day to see everything on it." /></span>
              </div>
              <div className="grid grid-cols-7 border-t border-line/70 text-center text-[11.5px] font-semibold text-ink3" aria-hidden="true">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <span key={d} className="py-2">{d}</span>)}
              </div>
              <div className="grid grid-cols-7 border-t border-line/70">
                {Array.from({ length: lead }).map((_, i) => <span key={"b" + i} className="border-r border-b border-line/50 bg-sunken/30" />)}
                {Array.from({ length: days }, (_, i) => i + 1).map((d) => {
                  const iso = `${month}-${pad(d)}`;
                  const es = onDay(iso);
                  const wk = weekendOn(iso);
                  const dr = dayRule(iso);
                  const off = !dr.on && dr.reason === "holiday";
                  const isSel = iso === sel;
                  return (
                    <Link key={d} href={here({ d: iso })} scroll={false} aria-current={isSel ? "date" : undefined}
                      aria-label={`${d} ${MONTHS[mo - 1]}${es.length ? ": " + es.map((e) => e.title).join(", ") : ""}${wk ? ", " + wk : ""}`}
                      className={cx("relative min-h-[112px] border-r border-b border-line/50 p-1.5 text-left flex flex-col gap-1 transition hover:bg-brand/[.06] min-w-0 cursor-pointer",
                        off ? "bg-bad/[.05]" : wk ? "bg-sunken/60" : "", isSel && "ring-2 ring-inset ring-brand")}>
                      <span className="flex items-center gap-1">
                        <span className={cx("w-7 h-7 rounded-full grid place-items-center text-[13px] font-semibold tnum shrink-0", iso === p.today ? "bg-brand text-brandink" : off ? "text-bad" : wk ? "text-ink3" : "text-ink2")}>{d}</span>
                        {(wk === "Second Saturday" || wk === "Fourth Saturday") && <span className="hidden xl:inline text-[10.5px] text-ink3 truncate">{wk === "Second Saturday" ? "2nd Sat" : "4th Sat"}</span>}
                      </span>
                      {/* Names wrap to two lines instead of being cut; a busy day says how many more. */}
                      <span className="flex flex-col gap-0.5 min-w-0">
                        {es.slice(0, 2).map((e) => <span key={e.id} title={e.title} className={cx("line-clamp-2 break-words rounded-md px-1.5 py-0.5 text-[11.5px] font-semibold leading-tight", ENTRY_TYPES[e.type].chip)}>{e.title.replace(/^PTM: /, "PTM ")}</span>)}
                        {es.length > 2 && <span className="text-[11.5px] text-ink2 font-semibold px-1">+{es.length - 2} <Words k="more" /></span>}
                      </span>
                    </Link>
                  );
                })}
              </div>
              <p className="px-5 py-3 text-[12.5px] text-ink3"><Words k={"Holiday: no attendance. Event: the day stays as it is. \"Attendance allowed\": the date was opened for attendance. Grey: a weekend ({weekends}) or a day off."} vars={{ weekends: weekendWords }} /></p>
            </Card>
            </>
            <Col>
              {/* The day picked on the grid (computers); phones read the list above. */}
              <Card className="hidden lg:block">
                <CardHeader icon={CalendarDays} title={sel === p.today ? `Today, ${niceDay(sel).split(", ")[1]}` : niceDay(sel)}
                  description={selInfo.on ? (selInfo.opened ? "School day: attendance allowed" : "School day") : selWeekend ? `${selWeekend} · no school` : "Holiday: no attendance"}
                  action={full ? <ButtonLink size="sm" variant="soft" icon={Plus} href={here({ do: "add" })} scroll={false}><Words k="Add on this day" /></ButtonLink> : undefined} />
                {selEntries.length ? (
                  <ul className="px-3 pb-3 flex flex-col gap-1">
                    {selEntries.map((e) => <EntryRow key={e.id} e={e} big removeHref={full && e.removable ? here({ do: "remove", entry: e.id }) : null} />)}
                  </ul>
                ) : <p className="px-5 pb-5 text-[14px] text-ink3"><Words k="Nothing planned." /></p>}
              </Card>
              <Card>
                <CardHeader icon={CalendarClock} title="Coming up" />
                {coming.length ? (
                  <ul className="px-3 pb-3">
                    {coming.map((e) => (
                      <li key={e.id}>
                        <Link href={here({ m: ym(e.from < p.today ? p.today : e.from), d: e.from < p.today ? p.today : e.from })} scroll={false} className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-sunken/60 text-left">
                          <span className="w-11 shrink-0 text-center"><span className="block text-[11px] font-semibold text-ink3 uppercase">{MONTHS[Number(e.from.slice(5, 7)) - 1].slice(0, 3)}</span><span className="block font-display text-[18px] font-semibold tnum leading-none">{Number(e.from.slice(8))}</span></span>
                          <span className="min-w-0 flex-1"><span className="block font-semibold text-[14px] leading-snug line-clamp-2 break-words">{e.title}</span><span className="block text-[12.5px] text-ink3 truncate">{e.from !== e.to ? spanWords(e.from, e.to) : [e.time, e.where].filter(Boolean).join(" · ") || ENTRY_TYPES[e.type].label}</span></span>
                          <span className={cx("w-2 h-2 rounded-full shrink-0", ENTRY_TYPES[e.type].dot)} aria-hidden="true" />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : <p className="px-5 pb-5 text-[14px] text-ink3"><Words k="Nothing planned in the next six months." /></p>}
              </Card>
            </Col>
          </Split>
        ) : (
          <Card className="overflow-hidden">
            <CardHeader title="Calendar list"
              action={p.can.export ? <ExportButton href={qs(`${BASE}/export`, { kind: "calendar", type: type === "all" ? null : type, class: classId || null, campus: campusId || null, ...vp.keep })} size="sm" /> : undefined} />
            <Toolbar><PeriodFilter {...p.dates} fallback="acyear" ahead earliest={data.years[0] ? isoOf(data.years[0].startDate) : undefined} /></Toolbar>
            <DataList rows={listed} rowKey={(e) => e.id} rowHref={(e) => e.href ?? null} minWidth={720} caption="Calendar list"
              footer={`Showing: ${vp.label} · ${spanWords(range.from, range.to)} · ${listed.length} entries`}
              empty={<Empty icon={CalendarX2} title="Nothing on the calendar in these dates" body="Pick other dates." action={<ButtonLink variant="secondary" href={here({ period: null, from: null, to: null })}><Words k="This academic year" /></ButtonLink>} />}
              columns={[
                { key: "from", label: "Date", nowrap: true, render: (e) => <span className="tnum">{spanWords(e.from, e.to)}</span> },
                { key: "name", label: "Name", render: (e) => <span className="font-semibold">{e.title}</span> },
                { key: "type", label: "Type", render: (e) => <Pill tone={ENTRY_TYPES[e.type].tone}>{ENTRY_TYPES[e.type].label}</Pill> },
                { key: "att", label: "Attendance", render: (e) => (closesSchool(e) ? <span className="text-bad font-semibold"><Words k="Off" /></span> : e.attendanceOn && !e.source ? <span className="text-ink2"><Words k="Allowed" /></span> : <span className="text-ink2"><Words k="As usual" /></span>) },
                { key: "cls", label: "Applies to", render: (e) => <span className="text-[13px] text-ink2">{appliesWords(e, data.classes, p.campuses)}</span> },
              ]}
              phone={(e) => ({ title: e.title, sub: spanWords(e.from, e.to), icon: CalendarDays, iconTone: ENTRY_TYPES[e.type].tone, pills: <Pill tone={ENTRY_TYPES[e.type].tone} className="!h-[22px] !text-[11.5px]">{ENTRY_TYPES[e.type].label}</Pill> })} />
          </Card>
        )}

        <Card className="overflow-hidden">
          <CardHeader icon={Sun} title={`Holiday list ${yearLabel}`} description={`${out.holidays.length} holidays and vacations`}
            action={p.can.export && yearOnScreen ? <ExportButton href={qs(`${BASE}/export`, { kind: "holidays", year: yearOnScreen.id, campus: campusId || null })} size="sm" /> : undefined} />
          {out.holidays.length ? (
            <div className="overflow-x-auto scroll-thin border-t border-line">
              <table className="w-full text-[14px] min-w-[520px]">
                <caption className="sr-only"><Words k="Holiday list" /> {yearLabel}</caption>
                <thead><tr className="text-[12px] text-ink3 text-left border-b border-line"><th scope="col" className="px-5 py-2.5 font-semibold"><Words k="Date" /></th><th scope="col" className="px-3 py-2.5 font-semibold"><Words k="Name" /></th><th scope="col" className="px-3 py-2.5 font-semibold"><Words k="Type" /></th><th scope="col" className="px-5 py-2.5 font-semibold text-right"><Words k="Days" /></th></tr></thead>
                <tbody>
                  {out.holidays.map((e) => (
                    <tr key={e.id} className={cx("border-b border-line/70 last:border-0", isoOf(e.endDate) < p.today && "text-ink3")}>
                      <td className="px-5 py-2.5 tnum whitespace-nowrap">{spanWords(isoOf(e.startDate), isoOf(e.endDate))}</td>
                      <td className="px-3 py-2.5 font-semibold">{e.title}</td>
                      <td className="px-3 py-2.5"><Pill tone="bad">{ENTRY_TYPES[e.type as EntryType]?.label ?? "Holiday"}</Pill></td>
                      <td className="px-5 py-2.5 text-right tnum">{holidayDays(e)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty icon={Sun} title="No holidays yet" body={full ? "Add them one by one, import a spreadsheet, or copy last year’s list." : "The school has not added holidays for this year yet."}
            action={full ? <ButtonLink variant="secondary" icon={History} href={here({ do: "copy" })} scroll={false}><Words k="Copy last year’s holidays" /></ButtonLink> : undefined} />}
        </Card>
      </Stack>

      {doing === "add" && <AddEntrySheet closeHref={closeHref} defDate={sel} classes={data.classes.map((c) => ({ value: c.id, label: c.name }))} campuses={p.campuses.length > 1 ? p.campuses.map((c) => ({ value: c.id, label: c.name })) : []} />}
      {doing === "remove" && removing && <RemoveEntrySheet closeHref={closeHref} entry={removing} />}
      {doing === "copy" && <CopyHolidaysSheet closeHref={closeHref} rows={out.copyRows.map((r) => ({ id: r.id, title: r.title, type: r.type, from: r.from, to: r.to, lastWhen: spanWords(r.lastFrom, r.lastFrom) }))} />}
      {doing === "import" && (
        <UrlSheet title="Import the holiday list" sub="Copy last year's list with dates to check, or pick a spreadsheet." closeHref={closeHref}>
          <div className="flex flex-col gap-2">
            <ButtonLink href={here({ do: "copy" })} scroll={false} variant="secondary" icon={History} className="justify-start"><Words k="Copy last year's holidays" /></ButtonLink>
            <ButtonLink href={`${BASE}/import`} variant="secondary" icon={FileSpreadsheet} className="justify-start"><Words k="From a spreadsheet (Excel or CSV)" /></ButtonLink>
          </div>
        </UrlSheet>
      )}
    </div>
  );
}

/** What each colour on the calendar means (the filter chips carry the same dots). */
function ColourKey() {
  const keys: [string, string][] = [["bg-bad", "Holiday"], ["bg-info", "Exam day"], ["bg-ok", "Event"], ["bg-brand", "PTM"], ["bg-warn", "Admission test"]];
  return (
    <ul className="flex gap-x-4 gap-y-1.5 flex-wrap text-[12.5px] text-ink2" aria-label="Colours">
      {keys.map(([dot, label]) => <li key={label} className="flex items-center gap-1.5"><span className={cx("w-2.5 h-2.5 rounded-full", dot)} aria-hidden="true" /><Any text={label} /></li>)}
      <li className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-sunken border border-line" aria-hidden="true" /><Words k="Weekend or day off" /></li>
    </ul>
  );
}

/** One calendar entry: its name in full, when and where, and its type. Opens its page when it has one. */
function EntryRow({ e, big, removeHref }: { e: CalItem; big?: boolean; removeHref: string | null }) {
  const t = ENTRY_TYPES[e.type];
  const body = (
    <>
      <span className={cx("rounded-xl grid place-items-center shrink-0", big ? "w-10 h-10" : "w-9 h-9", TONE_SOFT[t.tone])}><EvIcon name={t.icon} size={big ? 18 : 16} /></span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-[14.5px] leading-snug break-words">{e.title}</span>
        {[e.time, e.where, e.from !== e.to && spanWords(e.from, e.to)].some(Boolean) && <span className="block text-[12.5px] text-ink3">{[e.time, e.where, e.from !== e.to && spanWords(e.from, e.to)].filter(Boolean).join(" · ")}</span>}
        {e.details && <span className="block text-[12.5px] text-ink2 mt-0.5">{e.details}</span>}
        <span className="flex gap-1.5 mt-1.5 flex-wrap">
          <Pill tone={t.tone} className="!h-[22px] !text-[11.5px]">{t.label}</Pill>
          {e.source === "datesheet" && <Pill tone="neutral" className="!h-[22px] !text-[11.5px]"><Words k="From the datesheet" /></Pill>}
          {e.source === "admission" && <Pill tone="neutral" className="!h-[22px] !text-[11.5px]"><Words k="From Admission" /></Pill>}
          {e.attendanceOn && !e.source && <Pill tone="neutral" className="!h-[22px] !text-[11.5px]"><Words k="Attendance allowed" /></Pill>}
        </span>
      </span>
      {e.href && <ChevronRight size={18} className="text-ink3 shrink-0 self-center" aria-hidden="true" />}
    </>
  );
  const cls = "min-w-0 flex-1 flex items-start gap-3 px-2 py-2 rounded-xl text-left";
  return (
    <li className="flex items-start gap-1">
      {e.href ? <Link href={e.href} className={cx(cls, "hover:bg-sunken/60")}>{body}</Link> : <div className={cls}>{body}</div>}
      {removeHref && (
        <Link href={removeHref} scroll={false} aria-label={`Remove ${e.title}`} className="w-11 h-11 grid place-items-center rounded-lg text-ink3 hover:bg-sunken hover:text-bad shrink-0"><Trash2 size={16} aria-hidden="true" /></Link>
      )}
    </li>
  );
}

function MonthArrow({ href, label, dir }: { href: string | null; label: string; dir: "prev" | "next" }) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  const cls = "w-10 h-10 grid place-items-center rounded-xl border border-line bg-surface text-ink2";
  if (!href) return <Button variant="secondary" disabled aria-label={label} className={cx(cls, "!p-0 opacity-40")}><Icon size={18} aria-hidden="true" /></Button>;
  return <Link href={href} scroll={false} aria-label={label} className={cx(cls, "hover:bg-sunken")}><Icon size={18} aria-hidden="true" /></Link>;
}

function appliesWords(e: CalItem, classes: { id: string; name: string }[], campuses: { id: string; name: string }[]) {
  if (e.classIds.length) {
    const names = classes.filter((c) => e.classIds.includes(c.id)).map((c) => c.name);
    return names.length > 3 ? `${names[0]} to ${names[names.length - 1]}` : names.join(", ");
  }
  if (e.campusId) return campuses.find((c) => c.id === e.campusId)?.name ?? "One campus";
  return "Whole school";
}

