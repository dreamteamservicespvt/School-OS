import { Fragment } from "react";
import Link from "next/link";
import { Building2, CalendarCheck2, CalendarClock, CalendarX2, ChartColumn, Link2, NotebookPen, Plus, Users, X } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { dateWhere } from "@/lib/periods";
import { placesOf, placeOrder } from "@/lib/events/places";
import { PTM_STATUS_TONE, absentParents, performance, ptmStatus, waitingQueue } from "@/lib/events/ptm";
import { clock, clockShort, dayOf, dmy, isoOf, niceDay, shortDay } from "@/lib/events/words";
import { homeworkDone } from "@/lib/homework/progress";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { MoreMenu } from "@/components/ui/more-menu";
import { PeriodFilter } from "@/components/list/period-filter";
import { Banner, Empty, HBars, Legend, ListRow, Progress, Stack } from "@/components/money/kit";
import { cx } from "@/components/ui/cx";
import { EvHead } from "../_components/head";
import { ActButton } from "../_components/bits";
import { BookSlotSheet, CancelPtmSheet, MeetingSheet, PlanPtmSheet, type BookPick, type MeetingView } from "../_components/ptm-sheets";
import { cancelBookingAction, queueAction, summaryAction } from "../actions";
import { BASE, UUID, evGuard, evPeriod, one, qs, type SearchParams } from "../_lib/page";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: await pageTitle("PTM") };
}

const HREF = `${BASE}/ptm`;

/** PTM (18 §2, mod-events.jsx PTMPage): PTM days, the teacher × slot grid, bookings, the meeting and its notes. */
export default async function PtmPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await evGuard("ptm");
  const sp = await searchParams;
  const ctx = p.current.ctx;
  const full = !p.can.own;
  const plan = p.can.ptmPlan;
  const vp = evPeriod(sp, p.dates, "acyear");
  const range = vp.range!;
  const wantDay = UUID.test(one(sp.day)) ? one(sp.day) : null;
  const doing = one(sp.do);
  const slotParam = UUID.test(one(sp.slot)) ? one(sp.slot) : null;
  const meId = p.me?.id ?? null;

  const d = await withSchool(ctx, async (tx) => {
    const ptms = await tx.ptm.findMany({ where: { archivedAt: null, date: dateWhere(range) }, orderBy: { date: "asc" } });
    const ids = ptms.map((x) => x.id);
    const [totals, booked, met, mine] = ids.length ? await Promise.all([
      tx.ptmSlot.groupBy({ by: ["ptmId"], where: { ptmId: { in: ids } }, _count: { _all: true } }),
      tx.ptmSlot.groupBy({ by: ["ptmId"], where: { ptmId: { in: ids }, studentId: { not: null } }, _count: { _all: true } }),
      tx.ptmSlot.groupBy({ by: ["ptmId"], where: { ptmId: { in: ids }, studentId: { not: null }, arrivedAt: { not: null } }, _count: { _all: true } }),
      meId ? tx.ptmSlot.findMany({ where: { ptmId: { in: ids }, staffId: meId }, select: { ptmId: true, studentId: true } }) : Promise.resolve([]),
    ]) : [[], [], [], []];
    const n = (rows: { ptmId: string; _count: { _all: number } }[]) => new Map(rows.map((r) => [r.ptmId, r._count._all]));
    const upcoming = ptms.find((x) => isoOf(x.date) >= p.today);
    const D = (wantDay && ptms.find((x) => x.id === wantDay)) || upcoming || ptms[ptms.length - 1] || null;
    if (!D) return { ptms, D: null as null };

    const [teachers, slots, notes] = await Promise.all([
      tx.ptmTeacher.findMany({ where: { ptmId: D.id }, orderBy: { sortOrder: "asc" } }),
      tx.ptmSlot.findMany({ where: { ptmId: D.id }, orderBy: [{ startMin: "asc" }] }),
      tx.ptmMeetingNote.findMany({ where: { ptmId: D.id } }),
    ]);
    const staff = await tx.staff.findMany({ where: { id: { in: teachers.map((t) => t.staffId) } }, select: { id: true, fullName: true } });
    const bookedIds = [...new Set(slots.map((s) => s.studentId).filter((x): x is string => Boolean(x)))];
    const students = bookedIds.length ? await tx.student.findMany({ where: { id: { in: bookedIds } }, select: { id: true, fullName: true, firstName: true, lastName: true } }) : [];
    const guardianIds = slots.map((s) => s.guardianId).filter((x): x is string => Boolean(x));
    const guardians = guardianIds.length ? await tx.guardian.findMany({ where: { id: { in: guardianIds } }, select: { id: true, name: true } }) : [];
    const places = await placesOf(tx, bookedIds, D.academicYearId);
    // Homework done this school year for each booked student (the same count as Learning Progress).
    const homework = await homeworkDone(tx, bookedIds, D.academicYearId, dayOf(p.today));
    // Bookings by class: parents who booked / students in the class.
    const enrolled = await tx.enrolment.groupBy({ by: ["classId"], where: { academicYearId: D.academicYearId, classId: { in: D.classIds }, archivedAt: null, status: "STUDYING" }, _count: { _all: true } });
    const classes = await tx.schoolClass.findMany({ where: { id: { in: D.classIds } }, select: { id: true, name: true, sortOrder: true }, orderBy: { sortOrder: "asc" } });
    const queue = ptmStatus(D, p.today) === "Today" ? await waitingQueue(tx, D.id) : [];
    const absent = ptmStatus(D, p.today) === "Done" && full ? await absentParents(tx, D.id) : [];
    // Recent meeting notes (whole school for the events team; own for teachers).
    const recent = full ? await tx.ptmMeetingNote.findMany({ orderBy: { createdAt: "desc" }, take: 4 }) : [];
    const rStudents = recent.length ? await tx.student.findMany({ where: { id: { in: recent.map((r) => r.studentId) } }, select: { id: true, fullName: true } }) : [];
    const rStaff = recent.length ? await tx.staff.findMany({ where: { id: { in: recent.map((r) => r.staffId) } }, select: { id: true, fullName: true } }) : [];
    const rPlaces = recent.length ? await placesOf(tx, recent.map((r) => r.studentId), D.academicYearId) : new Map();

    // The open sheet.
    const slot = slotParam ? slots.find((s) => s.id === slotParam) ?? null : null;
    let pickList: BookPick[] = [];
    if (doing === "book" && slot && !slot.studentId) {
      const t = teachers.find((x) => x.staffId === slot.staffId);
      const sections = await tx.section.findMany({ where: { academicYearId: D.academicYearId, classId: { in: D.classIds }, archivedAt: null }, select: { id: true } });
      const scope = p.can.own ? t?.sectionIds ?? [] : sections.map((s) => s.id);
      const enrol = scope.length ? await tx.enrolment.findMany({ where: { academicYearId: D.academicYearId, sectionId: { in: scope }, archivedAt: null, status: "STUDYING" }, select: { studentId: true, sectionId: true } }) : [];
      const sIds = enrol.map((e) => e.studentId);
      const [kids, links, pl] = await Promise.all([
        tx.student.findMany({ where: { id: { in: sIds }, archivedAt: null }, select: { id: true, fullName: true } }),
        tx.studentGuardian.findMany({ where: { studentId: { in: sIds }, archivedAt: null }, orderBy: [{ isPrimary: "desc" }, { emergencyOrder: "asc" }], select: { studentId: true, guardian: { select: { name: true } } } }),
        placesOf(tx, sIds, D.academicYearId),
      ]);
      const parent = new Map<string, string>();
      for (const l of links) if (!parent.has(l.studentId)) parent.set(l.studentId, l.guardian.name);
      const withT = new Map(slots.filter((s) => s.staffId === slot.staffId && s.studentId).map((s) => [s.studentId!, clock(s.startMin)]));
      const ownSecs = new Set(t?.sectionIds ?? []);
      pickList = kids.map((k) => ({ id: k.id, name: k.fullName, place: pl.get(k.id)?.label ?? "", parent: parent.get(k.id) ?? "No parent on record", hasSlot: withT.get(k.id) ?? null, own: ownSecs.has(enrol.find((e) => e.studentId === k.id)!.sectionId), sort: pl.get(k.id) }))
        .sort((a, b) => placeOrder(a.sort, b.sort)).map(({ sort, ...k }) => { void sort; return k; });
    }
    const perf = doing === "meet" && slot?.studentId ? await performance(tx, ctx, slot.studentId, D.academicYearId, p.today) : null;
    return {
      ptms, D, totals: n(totals), booked: n(booked), met: n(met), mine, teachers, slots, notes, staff, students, guardians, places, homework,
      enrolled: new Map(enrolled.map((e) => [e.classId, e._count._all])), classes, queue, absent, recent, rStudents, rStaff, rPlaces, slot, pickList, perf,
    };
  });

  const keepDay = d.D ? { day: d.D.id } : {};
  const here = (over: Record<string, string | null> = {}) => qs(HREF, { ...vp.keep, ...keepDay, ...over });
  const classOptions = async () => withSchool(ctx, (tx) => tx.schoolClass.findMany({ where: { archivedAt: null }, select: { id: true, name: true, sortOrder: true }, orderBy: { sortOrder: "asc" } }));
  const byParents = p.settings.ptmParentBooking;
  const sub = p.can.own
    ? `Only your own PTM slots and notes. ${byParents ? "Parents book a slot on Parent Link; the office can book for them." : "The office books slots for parents who call or come in."}`
    : `Parent–teacher meetings: slots per teacher, booked ${byParents ? "by parents on Parent Link or by the office" : "by the office for parents"}, with notes.`;
  const head = <EvHead pageName="PTM" href={HREF} sub={sub} actions={plan && <ButtonLink href={here({ do: "plan" })} scroll={false} variant="primary" icon={Plus}><Words k="Plan a PTM" /></ButtonLink>} />;
  const planSheet = plan && doing === "plan" ? await (async () => {
    const cls = await classOptions();
    const group = (label: string, test: (n: string) => boolean) => ({ label, ids: cls.filter((c) => test(c.name)).map((c) => c.id) });
    const num = (n: string) => Number(/(\d+)/.exec(n)?.[1] ?? NaN);
    const groups = [
      group("Pre-primary", (n) => Number.isNaN(num(n))),
      group("Classes 1–3", (n) => num(n) >= 1 && num(n) <= 3),
      group("Classes 4–10", (n) => num(n) >= 4 && num(n) <= 10),
      group("All classes", () => true),
    ].filter((g) => g.ids.length);
    return <PlanPtmSheet closeHref={here({ do: null })} classes={cls.map((c) => ({ value: c.id, label: c.name }))} groups={groups} slotMinutes={p.settings.ptmSlotMinutes} venues={p.settings.venues} start="" />;
  })() : null;

  if (!d.D) {
    return (
      <div>
        {head}
        <Stack>
          <div className="flex"><PeriodFilter {...p.dates} fallback="acyear" ahead /></div>
          <Card><Empty icon={CalendarX2} title="No PTM in these dates" body="Pick other dates to see earlier or later PTMs." action={<ButtonLink variant="secondary" href={HREF}><Words k="This academic year" /></ButtonLink>} /></Card>
        </Stack>
        {planSheet}
      </div>
    );
  }

  const D = d.D;
  const status = ptmStatus(D, p.today);
  const iso = isoOf(D.date);
  const past = iso < p.today;
  const window = `${clock(D.startMin)} – ${clock(D.endMin)}`;
  const name = (staffId: string) => d.staff.find((s) => s.id === staffId)?.fullName ?? "Teacher";
  const student = (id: string | null) => (id ? d.students.find((s) => s.id === id) : undefined);
  const firstL = (id: string | null) => { const s = student(id); return s ? `${s.firstName} ${s.lastName ? `${s.lastName[0]}.` : ""}`.trim() : ""; };
  const parentOf = (slot: (typeof d.slots)[number]) => d.guardians.find((g) => g.id === slot.guardianId)?.name ?? "Parent";
  const noted = new Set(d.notes.map((n) => n.slotId));
  // A break in the middle (no slots): its own column in the grid and a row in the teacher's list.
  const brk = D.breakStartMin != null && D.breakEndMin != null ? { from: D.breakStartMin, to: D.breakEndMin } : null;
  const times = [...new Set([...d.slots.map((s) => s.startMin), ...(brk ? [brk.from] : [])])].sort((a, b) => a - b);
  const cell = new Map(d.slots.map((s) => [`${s.staffId}:${s.startMin}`, s]));
  const bookable = !past && p.can.ptmBook;
  const officeBooked = d.slots.filter((s) => s.studentId).length;
  const byLink = d.slots.filter((s) => s.studentId && s.bookedVia === "parent-link").length;
  const hw = (studentId: string | null) => (studentId ? d.homework.get(studentId)?.pct ?? null : null);
  const myRow = meId ? d.teachers.find((t) => t.staffId === meId) : undefined;

  // The open sheet.
  let sheet: React.ReactNode = planSheet;
  const s = d.slot;
  const mayTouch = (x: { staffId: string }) => !p.can.own || x.staffId === meId;
  if (doing === "book" && s && !s.studentId && bookable && mayTouch(s)) {
    sheet = <BookSlotSheet closeHref={here({ do: null, slot: null })} slotId={s.id} title={`Book ${name(s.staffId)} · ${clock(s.startMin)}`} sub={`${shortDay(iso)} · ${D.slotMinutes} minutes · for a parent who called or came to the office`} students={d.pickList} />;
  }
  if (doing === "meet" && s && s.studentId && d.perf && mayTouch(s)) {
    const st = student(s.studentId);
    const note = d.notes.find((n) => n.slotId === s.id);
    const pf = d.perf;
    const m: MeetingView = {
      slotId: s.id,
      title: `${st?.fullName ?? "Student"} · ${d.places.get(s.studentId)?.label ?? ""}`,
      sub: `PTM with ${parentOf(s)} · ${name(s.staffId)} · ${clock(s.startMin)}`,
      stats: [
        { label: "Attendance", value: pf.attendance != null ? `${pf.attendance}%` : "—", tone: pf.attendance == null ? undefined : pf.attendance < 85 ? "warn" : "ok" },
        { label: "Homework done", value: pf.homework != null ? `${pf.homework}%` : "—" },
        { label: pf.latest?.exam ?? "Latest exam", value: pf.latest?.percent != null ? `${pf.latest.percent}%` : "—" },
      ],
      marks: pf.latest && pf.latest.subjects.length ? {
        heading: pf.latest.previous ? `Latest marks · ${pf.latest.previous} → ${pf.latest.exam}` : `Latest marks · ${pf.latest.exam}`,
        rows: pf.latest.subjects.map((x) => ({ name: x.name, before: x.before != null ? String(x.before) : null, now: x.marks != null ? `${x.marks}${x.max ? ` of ${x.max}` : ""}` : "Absent", low: x.low })),
      } : null,
      behaviour: pf.behaviour.length ? pf.behaviour.map((b) => `${dmy(b.date)}: ${b.text}`).join(" ") : "No behaviour notes this year.",
      canNotes: p.can.ptmNotes && iso <= p.today,
      notesWhen: iso > p.today ? `Notes are written on the day, ${dmy(iso)}.` : null,
      notes: { remarks: note?.remarks ?? "", feedback: note?.feedback ?? "", followUp: note?.followUp ?? "", saved: Boolean(note), arrived: Boolean(s.arrivedAt), arrivedAt: s.arrivedAt ? formatDateTime(s.arrivedAt, p.tz).split(", ").pop() ?? null : null },
    };
    const extra = !past && !note && p.can.ptmBook ? <div><ActButton action={cancelBookingAction} fields={{ slotId: s.id }} label="Free this slot" icon="X" variant="ghost" /></div> : null;
    sheet = <MeetingSheet closeHref={here({ do: null, slot: null })} m={m} extra={extra} />;
  }
  if (doing === "cancel" && plan && !past) {
    sheet = <CancelPtmSheet closeHref={here({ do: null })} ptmId={D.id} name={shortDay(iso)} booked={d.booked.get(D.id) ?? 0} />;
  }

  // Bookings by class.
  const byClass = new Map<string, Set<string>>();
  for (const sl of d.slots) {
    if (!sl.studentId) continue;
    const c = d.places.get(sl.studentId)?.classId;
    if (!c) continue;
    if (!byClass.has(c)) byClass.set(c, new Set());
    byClass.get(c)!.add(sl.studentId);
  }

  return (
    <div>
      {head}
      <Stack>
        <div className="flex flex-col md:flex-row md:items-center gap-2.5">
          <PeriodFilter {...p.dates} fallback="acyear" ahead />
          <p className="text-[13px] text-ink3"><Words k="Showing:" /> {vp.label} · {d.ptms.length} {d.ptms.length === 1 ? "PTM day" : "PTM days"}</p>
        </div>
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
          {d.ptms.map((x) => {
            const st = ptmStatus(x, p.today);
            const total = d.totals.get(x.id) ?? 0;
            const b = d.booked.get(x.id) ?? 0;
            const mine = d.mine.filter((m) => m.ptmId === x.id);
            const on = x.id === D.id;
            return (
              <Link key={x.id} href={qs(HREF, { ...vp.keep, day: x.id })} scroll={false} aria-current={on ? "true" : undefined}
                className={cx("rounded-2xl border bg-surface shadow-card p-3.5 md:p-4 text-left transition", on ? "border-brand ring-1 ring-brand" : "border-line/70 hover:border-ink3/40")}>
                <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1"><p className="font-display font-semibold text-[15px] md:text-[18px] leading-tight whitespace-nowrap">{shortDay(isoOf(x.date))}</p><Pill tone={PTM_STATUS_TONE[st]} className="!h-[22px] !text-[11px]">{st}</Pill></div>
                <p className="text-[12.5px] text-ink3 mt-1">{x.classesLabel} · {clock(x.startMin)} – {clock(x.endMin)}</p>
                {p.can.own ? (mine.length ? (
                  <><p className="text-[13px] mt-2 tnum"><b className="font-semibold">{mine.filter((m) => m.studentId).length}</b><span className="text-ink3"> <Words k="of" /> {mine.length} <Words k="of your slots booked" /></span></p><Progress value={(mine.filter((m) => m.studentId).length / mine.length) * 100} className="mt-1.5" /></>
                ) : <p className="text-[13px] mt-2 text-ink3"><Words k="No slots for you" /></p>) : (
                  <><p className="text-[13px] mt-2 tnum"><b className="font-semibold">{b}</b><span className="text-ink3"> <Words k="of" /> {total} <Words k="slots" /> {st === "Done" ? `· ${d.met.get(x.id) ?? 0} met` : "booked"}</span></p>
                    <Progress value={total ? (b / total) * 100 : 0} className="mt-1.5" tone={st === "Done" ? "ok" : "brand"} /></>
                )}
              </Link>
            );
          })}
        </div>

        {status === "Today" && (
          <Banner tone="brand" icon={Users} title={`PTM for ${D.classesLabel} today, ${window}${D.venue ? `, ${D.venue}` : ""}.`}
            action={plan && <ActButton action={queueAction} fields={{ ptmId: D.id, open: D.queueOpen ? "no" : "yes" }} label={D.queueOpen ? "Close queue" : "Open queue"} />}>
            {D.queueOpen ? `Waiting queue is open. ${d.queue.length} ${d.queue.length === 1 ? "parent is" : "parents are"} waiting; they are called by slot time.` : `${d.queue.length} ${d.queue.length === 1 ? "parent has" : "parents have"} checked in. Open the waiting queue to call them by slot time.`}
          </Banner>
        )}
        {status === "Done" && full && (
          <Banner tone="info" title={`Held on ${niceDay(iso)}: ${d.met.get(D.id) ?? 0} of ${d.booked.get(D.id) ?? 0} booked parents came.`}
            action={plan && (D.summarySentAt ? <Pill tone="ok"><Words k="Summary sent" /> {dmy(isoOf(D.summarySentAt))}</Pill> : d.absent.length ? <ActButton action={summaryAction} fields={{ ptmId: D.id }} icon="Send" label={`Send summary to ${d.absent.length} absent`} /> : null)}>
            <Words k="Notes are on each student’s profile, Activities tab." />
          </Banner>
        )}
        {status === "Booking open" && full && (
          <Banner tone="info" title={`Booking is open for ${shortDay(iso)}.`}
            action={plan && <MoreMenu label="More PTM actions" items={[{ label: "Cancel this PTM", href: here({ do: "cancel" }), icon: <X size={16} aria-hidden="true" />, tone: "bad" }]} />}>
            {d.teachers.length} <Words k="teachers," /> {D.slotMinutes}<Words k="-minute slots." /> {byParents ? "Parents book on Parent Link until the day before; the office can book for them. " : ""}<Words k="Parents get a confirmation when booked and a reminder the day before." />
          </Banner>
        )}

        {!p.can.own && (
          <Card className="overflow-hidden">
            <CardHeader icon={CalendarClock} title={`Teacher slots · ${shortDay(iso)}`}
              description={`${D.slotMinutes}-minute slots · ${officeBooked} booked${byLink ? ` (${byLink} by parents on Parent Link)` : ""}${bookable ? " · tap a free slot to book" : ""}`}
              action={<Legend items={[["bg-brand/15", "Booked"], ["bg-ok/15", "Notes saved"], ["bg-sunken border border-line", "Free"]]} />} />
            <div className="overflow-x-auto scroll-thin border-t border-line">
              <table className="text-[12.5px] min-w-full">
                <caption className="sr-only"><Words k="Teacher slots" /></caption>
                <thead>
                  <tr className="border-b border-line text-ink3">
                    <th scope="col" className="sticky left-0 z-10 bg-surface text-left font-semibold px-4 py-2 min-w-[170px]"><Words k="Teacher" /></th>
                    {times.map((t) => <th scope="col" key={t} className="font-semibold px-1 py-2 tnum whitespace-nowrap min-w-[96px]">{brk && t === brk.from ? "Break" : clockShort(t)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {d.teachers.map((t) => (
                    <tr key={t.id} className="border-b border-line/60 last:border-0">
                      <th scope="row" className="sticky left-0 z-10 bg-surface px-4 py-2 text-left font-normal"><p className="font-semibold text-[13.5px] whitespace-nowrap">{name(t.staffId)}</p><p className="text-[11.5px] text-ink3 whitespace-nowrap">{t.label}</p></th>
                      {times.map((tm) => {
                        const c = brk && tm === brk.from ? undefined : cell.get(`${t.staffId}:${tm}`);
                        if (!c) return <td key={tm} className="px-1 py-1.5"><span className="block h-11 rounded-lg bg-sunken/50" /></td>;
                        if (!c.studentId) {
                          return (
                            <td key={tm} className="px-1 py-1.5">
                              {bookable ? (
                                <Link href={here({ do: "book", slot: c.id })} scroll={false} aria-label={`Book ${name(t.staffId)} at ${clock(tm)}`} className="w-full h-11 rounded-lg border border-dashed border-line text-ink3 hover:border-brand hover:text-brand grid place-items-center transition"><Plus size={15} aria-hidden="true" /></Link>
                              ) : <span className="block h-11 rounded-lg border border-dashed border-line" />}
                            </td>
                          );
                        }
                        const done = noted.has(c.id);
                        const viaLink = c.bookedVia === "parent-link";
                        const h = hw(c.studentId);
                        return (
                          <td key={tm} className="px-1 py-1.5">
                            <Link href={here({ do: "meet", slot: c.id })} scroll={false} aria-label={`${student(c.studentId)?.fullName ?? "Student"} at ${clock(tm)}, booked ${viaLink ? "on Parent Link" : "by the office"}${h != null ? `, homework ${h}% done` : ""}`}
                              className={cx("block w-full h-11 rounded-lg px-1.5 py-1 text-left transition hover:brightness-95", done ? "bg-ok/12 text-ok" : "bg-brand/12 text-brand")}>
                              <span className="flex items-baseline gap-1 leading-tight"><span className="font-semibold truncate min-w-0 flex-1">{firstL(c.studentId)}</span>{h != null && <span className="text-[10px] font-semibold tnum shrink-0 opacity-80">{h}%</span>}</span>
                              <span className="flex items-center gap-1 text-[10.5px] opacity-90">{viaLink ? <Link2 size={10} aria-hidden="true" /> : <Building2 size={10} aria-hidden="true" />}{done ? "Notes saved" : c.arrivedAt ? "Arrived" : viaLink ? "Parent Link" : "Office"}</span>
                            </Link>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="px-5 py-3 text-[12.5px] text-ink3 border-t border-line"><Words k="One parent per slot. The % on a booked slot is the student’s homework done this year. Parents get a confirmation and a reminder the evening before" />{byParents ? ", and can change or cancel on Parent Link until the day before" : ""}. {d.teachers.length} <Words k="teachers." /></p>
          </Card>
        )}

        {p.can.own && (myRow ? (
          <Card>
            <CardHeader icon={CalendarClock} title={`Your slots · ${shortDay(iso)}`} description={`${myRow.label} · ${window}`} />
            <ul className="px-2 pb-2">
              {d.slots.filter((x) => x.staffId === meId).map((c, i, mineList) => {
                const done = noted.has(c.id);
                const breakHere = brk && c.startMin > brk.from && (i === 0 || mineList[i - 1].startMin < brk.from);
                return (<Fragment key={c.id}>
                  {breakHere && <li className="px-3 py-2 text-[12.5px] text-ink3 font-semibold border-t border-line/70 tnum">{clock(brk.from)} – {clock(brk.to)} <Words k="· Break" /></li>}
                  <li key={c.id} className="border-t border-line/70 first:border-0">
                    <div className="flex items-center gap-3 px-3 py-2.5">
                      <span className="w-14 text-[13px] font-semibold tnum text-ink2 shrink-0">{clockShort(c.startMin)}</span>
                      {!c.studentId ? <span className="flex-1 text-[13.5px] text-ink3"><Words k="Free" /></span> : (
                        <>
                          <Avatar name={student(c.studentId)?.fullName ?? "Student"} size={32} />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-[14px] truncate">{parentOf(c)}</p>
                            <p className="text-[12px] text-ink3 truncate"><Words k="Parent of" /> {student(c.studentId)?.fullName} · {d.places.get(c.studentId)?.label}{c.bookedVia === "parent-link" ? " · booked on Parent Link" : ""}</p>
                            <p className="text-[12px] text-ink2 tnum">{hw(c.studentId) != null ? `Homework ${hw(c.studentId)}% done this year` : "No homework given yet"}</p>
                          </div>
                          {done ? <Pill tone="ok"><Words k="Notes saved" /></Pill> : c.arrivedAt ? <Pill tone="brand"><Words k="Arrived" /></Pill> : null}
                        </>
                      )}
                      {!c.studentId ? (bookable ? <ButtonLink size="sm" variant="ghost" icon={Plus} href={here({ do: "book", slot: c.id })} scroll={false}><Words k="Book" /></ButtonLink> : null)
                        : <ButtonLink size="sm" variant="secondary" href={here({ do: "meet", slot: c.id })} scroll={false}><Words k="Open" /></ButtonLink>}
                    </div>
                  </li>
                </Fragment>);
              })}
            </ul>
          </Card>
        ) : (
          <Card><Empty icon={CalendarCheck2} title="No slots for you on this day" body={`This PTM is for ${D.classesLabel}. Only class teachers (and subject teachers, when added) of these classes get slots.`} /></Card>
        ))}

        {full && (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 lg:gap-6 items-start">
            <Card>
              <CardHeader icon={ChartColumn} title="Bookings by class" description={`${shortDay(iso)} · parents who booked a slot`} />
              <div className="px-5 pb-5">
                <HBars labelWidth={72} valueWidth={110} rows={d.classes.map((c) => {
                  const total = d.enrolled.get(c.id) ?? 0;
                  const b = byClass.get(c.id)?.size ?? 0;
                  const pct = total ? Math.round((b / total) * 100) : 0;
                  return { key: c.id, label: c.name.replace(/^Class /, "Class "), value: pct, text: `${pct}% · ${b} of ${total}`, tone: pct < 50 && !past ? "warn" as const : "brand" as const };
                })} />
              </div>
            </Card>
            <Card>
              <CardHeader icon={NotebookPen} title="Recent meeting notes" description="Saved to each student’s profile, Activities tab" />
              {d.recent.length ? (
                <ul className="px-2 pb-2">
                  {d.recent.map((r) => {
                    const st = d.rStudents.find((x) => x.id === r.studentId);
                    const t = d.rStaff.find((x) => x.id === r.staffId);
                    return <li key={r.id}><ListRow avatar={st?.fullName ?? "Student"} title={`${st?.fullName ?? "Student"}${d.rPlaces.get(r.studentId) ? `, ${d.rPlaces.get(r.studentId).label}` : ""}`} sub={`${t?.fullName ?? "Teacher"}: ${r.remarks ?? r.followUp ?? r.feedback ?? ""}`} href={`/student-management/students/${r.studentId}?tab=activities`} /></li>;
                  })}
                </ul>
              ) : <Empty icon={NotebookPen} title="No meeting notes yet" body="Teachers write them at the meeting." />}
            </Card>
          </div>
        )}
      </Stack>
      {sheet}
    </div>
  );
}

