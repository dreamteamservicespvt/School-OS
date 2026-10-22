import Link from "next/link";
import { CalendarClock, CalendarPlus, CalendarX2, UsersRound } from "lucide-react";
import { withSchool } from "@/lib/db";
import { dayPlan, type DayPlan } from "@/lib/front-office/appointments";
import { rank } from "@/lib/front-office/staff";
import { addDaysIso, shortDay } from "@/lib/front-office/time";
import { APPOINTMENT_STATUS, clockOf } from "@/lib/front-office/words";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ExportButton } from "@/components/ui/export-button";
import { UrlSheet } from "@/components/ui/url-sheet";
import { SheetForm } from "@/components/ui/url-sheet";
import { cx } from "@/components/ui/cx";
import { Chips, SegLinks } from "@/components/ui/blocks";
import { UrlSelect } from "@/components/money/url-filters";
import { Col, Empty, Split } from "@/components/money/kit";
import { FoHead } from "../_components/head";
import { CommonSheets } from "../_components/common-sheets";
import { BookSheet } from "../_components/appointment-sheets";
import { RowMenu, type RowItem } from "../_components/row-menu";
import { appointmentStatusAction, remindAction } from "../actions";
import { BASE, UUID, addQ, foGuard, one, qs, type SearchParams } from "../_lib/page";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: await pageTitle("Appointments") };
}

const HREF = `${BASE}/appointments`;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const SEG: Record<string, string> = {
  teach: "bg-sunken text-ink2 bg-[repeating-linear-gradient(135deg,transparent,transparent_6px,rgb(var(--line)/.6)_6px,rgb(var(--line)/.6)_8px)]",
  booked: "bg-info/10 text-info", arrived: "bg-brand/10 text-brand", now: "bg-brand/12 text-brand ring-1 ring-brand", done: "bg-ok/10 text-ok", noshow: "bg-bad/[.07] text-bad",
};
const SORT: Record<string, number> = { ARRIVED: 0, BOOKED: 1, DONE: 2, NO_SHOW: 3, CANCELLED: 4 };

/** Appointments (16 §2, mod-frontoffice.jsx AppointmentsPage): a staff member's day with free slots, and the day's appointments. */
export default async function AppointmentsPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await foGuard("appointments");
  const sp = await searchParams;
  const ctx = p.current.ctx;
  const desk = p.can.book;
  const dayIso = ISO.test(one(sp.day)) && one(sp.day) >= addDaysIso(p.todayStr, -365) && one(sp.day) <= addDaysIso(p.todayStr, 180) ? one(sp.day) : p.todayStr;
  const isToday = dayIso === p.todayStr;

  const data = await withSchool(ctx, async (tx) => {
    const [staffRows, slots] = await Promise.all([
      tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] } }, select: { id: true, fullName: true, designation: true } }),
      tx.periodSlot.findMany({ where: { archivedAt: null }, select: { days: true } }),
    ]);
    const staff = staffRows.sort((a, b) => rank(a.designation) - rank(b.designation) || a.fullName.localeCompare(b.fullName));
    const chosen = staff.find((s) => s.id === one(sp.staff)) ?? staff[0] ?? null;
    const schoolDays = new Set(slots.flatMap((s) => s.days));
    const plan = chosen ? await dayPlan(tx, ctx, chosen.id, dayIso, { timeZone: p.tz, now: p.now }) : null;
    const appts = await tx.appointment.findMany({ where: { archivedAt: null, date: new Date(`${dayIso}T00:00:00Z`) }, orderBy: { startMin: "asc" } });
    // Sheets
    const reId = UUID.test(one(sp.re)) ? one(sp.re) : null;
    const re = desk && reId ? await tx.appointment.findFirst({ where: { id: reId, archivedAt: null, status: "BOOKED" } }) : null;
    const cancelId = UUID.test(one(sp.cancel)) ? one(sp.cancel) : null;
    const cancel = desk && cancelId ? await tx.appointment.findFirst({ where: { id: cancelId, archivedAt: null, status: "BOOKED" } }) : null;
    const bookOpen = desk && (one(sp.do) === "book" || Boolean(re));
    const bookStaff = re?.staffId ?? (UUID.test(one(sp.with)) ? one(sp.with) : chosen?.id ?? null);
    const bookDay = re ? re.date.toISOString().slice(0, 10) : ISO.test(one(sp.on)) ? one(sp.on) : dayIso >= p.todayStr ? dayIso : p.todayStr;
    const bookLength = re?.lengthMin ?? p.settings.slotMinutes;
    const bookPlan = bookOpen && bookStaff ? await dayPlan(tx, ctx, bookStaff, bookDay, { timeZone: p.tz, now: p.now, length: [15, 30, 45].includes(bookLength) ? bookLength : 15, ignoreId: re?.id ?? null }) : null;
    return { staff, chosen, schoolDays, plan, appts, re, cancel, bookOpen, bookStaff, bookDay, bookLength, bookPlan };
  });

  const staffName = (id: string) => data.staff.find((s) => s.id === id)?.fullName ?? "Staff";
  const weekday = (iso: string) => ((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
  const open = (iso: string) => data.schoolDays.size === 0 ? weekday(iso) !== 7 : data.schoolDays.has(weekday(iso));
  const nextDays: string[] = [];
  for (let i = 0; nextDays.length < 3 && i < 14; i++) { const d = addDaysIso(p.todayStr, i); if (i === 0 || open(d)) nextDays.push(d); }
  const bookDays: string[] = [];
  for (let i = 0; bookDays.length < 30 && i < 60; i++) { const d = addDaysIso(p.todayStr, i); if (i === 0 || open(d)) bookDays.push(d); }
  if (!bookDays.includes(data.bookDay)) bookDays.unshift(data.bookDay);
  const dayLabel = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`); const w = shortDay(d).split(",")[0]; return `${iso === p.todayStr ? "Today, " : ""}${w} ${d.getUTCDate()}`; };
  const chosen = data.chosen;
  const keep = { staff: chosen && chosen.id !== data.staff[0]?.id ? chosen.id : null, day: isToday ? null : dayIso };
  const here = qs(HREF, keep);
  const chips = data.staff.slice(0, 5);
  if (chosen && !chips.some((c) => c.id === chosen.id)) chips.push(chosen);
  const sorted = [...data.appts].sort((a, b) => (SORT[a.status] ?? 9) - (SORT[b.status] ?? 9) || a.startMin - b.startMin);
  const live = data.appts.filter((a) => a.status !== "CANCELLED").length;
  const needsDesk = p.settings.photoRequired || p.settings.idProofRequired;

  return (
    <div>
      <FoHead pageName="Appointments" href={HREF} sub="Meetings with the Principal and staff. Booked, leave and teaching times cannot be chosen."
        actions={desk ? <ButtonLink href={addQ(here, { do: "book" })} scroll={false} variant="primary" icon={CalendarPlus}><Words k="Book appointment" /></ButtonLink> : null} />
      {!chosen ? (
        <Card><Empty icon={UsersRound} title="No staff yet" body="Appointments are booked with staff members. Add staff in Staff & HR Management first." action={<ButtonLink href="/staff-hr-management" variant="secondary"><Words k={"Open Staff & HR"} /></ButtonLink>} /></Card>
      ) : (
        <Split side={380}>
          <Card className="overflow-hidden">
            <div className="p-3 flex flex-col gap-3 border-b border-line">
              <div>
                <Chips value={chosen.id} label="Whose day" options={chips.map((s) => ({ value: s.id, label: s.fullName, href: qs(HREF, { staff: s.id === data.staff[0]?.id ? null : s.id, day: keep.day }) }))} />
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <SegLinks size="sm" value={dayIso} label="Day" options={[...nextDays.map((d) => ({ value: d, label: dayLabel(d), href: qs(HREF, { staff: keep.staff, day: d === p.todayStr ? null : d }) })),
                  ...(nextDays.includes(dayIso) ? [] : [{ value: dayIso, label: dayLabel(dayIso), href: here }])]} />
                <form action={HREF} className="flex items-center gap-2">
                  {keep.staff && <input type="hidden" name="staff" value={keep.staff} />}
                  <label htmlFor="ap-day" className="sr-only"><Words k="Another day" /></label>
                  <input id="ap-day" name="day" type="date" defaultValue={dayIso} className="h-9 rounded-xl border border-line bg-surface px-2.5 text-[13px] tnum" />
                  <button type="submit" className="h-9 px-3 rounded-xl border border-line text-[13px] font-semibold hover:bg-sunken"><Words k="Show" /></button>
                </form>
                {data.staff.length > 5 && <UrlSelect id="ap-staff" param="staff" label="Someone else" className="w-full sm:w-60 [&_select]:h-9 [&_select]:text-[13px]" options={data.staff.map((s) => ({ value: s.id, label: `${s.fullName} · ${s.designation}` }))} />}
                <span className="text-[12.5px] text-ink3">{chosen.designation} · {p.settings.slotMinutes}<Words k="-minute slots" /></span>
              </div>
            </div>
            {data.plan && <Timeline plan={data.plan} dayIso={dayIso} today={p.todayStr} minute={p.minute} desk={desk} bookHref={(m) => addQ(here, { do: "book", with: chosen.id, on: dayIso, at: String(m) })} />}
          </Card>
          <Col>
            <Card>
              <CardHeader title={isToday ? "Today’s appointments" : `Appointments on ${shortDay(new Date(`${dayIso}T00:00:00Z`))}`} description={`${live} booked · next one first`} icon={CalendarClock}
                action={p.can.export ? <ExportButton href={qs(`${HREF}/export`, { day: dayIso })} size="sm" /> : undefined} />
              {sorted.length === 0 ? (
                <Empty icon={CalendarX2} title="No appointments on this day" body="Free slots show on the left. Booked times cannot be booked twice."
                  action={desk ? <ButtonLink href={addQ(here, { do: "book" })} scroll={false} variant="secondary" icon={CalendarPlus}><Words k="Book appointment" /></ButtonLink> : undefined} />
              ) : (
                <ul className="px-2 pb-2">
                  {sorted.map((a) => {
                    const st = APPOINTMENT_STATUS[a.status] ?? APPOINTMENT_STATUS.BOOKED;
                    const inMeeting = isToday && a.status === "ARRIVED" && a.startMin <= p.minute && p.minute < a.startMin + a.lengthMin;
                    const clock = clockOf(a.startMin);
                    return (
                      <li key={a.id} className={cx("flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/60", a.status === "CANCELLED" && "opacity-60")}>
                        <span className="w-14 shrink-0 text-[13px] font-semibold tnum">{clock.replace(/ (AM|PM)$/, "")}<span className="block text-[11px] text-ink3 font-medium">{clock.slice(-2)} · {a.lengthMin}m</span></span>
                        <div className="min-w-0 flex-1">
                          <p className={cx("font-semibold text-[14px] truncate", a.status === "CANCELLED" && "line-through")}>{a.visitorName}</p>
                          <p className="text-[12.5px] text-ink3 truncate"><Words k="With" /> {staffName(a.staffId)} · {a.purpose}</p>
                          <Pill tone={inMeeting ? "brand" : st.tone} dot={inMeeting} className="!h-5 !text-[11px] mt-1">{inMeeting ? "In meeting" : st.label}</Pill>
                        </div>
                        {desk && <RowMenu label={`Actions for ${a.visitorName}`} items={apptItems(a, here, isToday, needsDesk)} />}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </Col>
        </Split>
      )}
      {data.bookOpen && data.bookStaff && (
        <BookSheet closeHref={here}
          staff={data.staff.map((s) => ({ value: s.id, label: `${s.fullName} · ${s.designation}` }))}
          days={bookDays.map((d) => ({ value: d, label: dayLabel(d) }))}
          start={{ staffId: data.bookStaff, day: data.bookDay, at: /^\d+$/.test(one(sp.at)) ? Number(one(sp.at)) : null, length: data.bookLength }}
          slots={data.bookPlan ? { leave: data.bookPlan.leave, free: data.bookPlan.free, taken: data.bookPlan.segments.filter((s) => s.kind !== "noshow" && s.appointmentId !== data.re?.id).map((s) => ({ start: s.start, label: s.label, kind: s.kind })) } : null}
          reschedule={data.re ? { id: data.re.id, name: data.re.visitorName, phone: data.re.visitorPhone, purpose: data.re.purpose } : null} />
      )}
      {data.cancel && (
        <SheetForm title={`Cancel ${data.cancel.visitorName}’s appointment?`} sub={`${shortDay(data.cancel.date)}, ${clockOf(data.cancel.startMin)} with ${staffName(data.cancel.staffId)}. A message goes to the visitor.`}
          closeHref={here} action={appointmentStatusAction} hidden={{ appointmentId: data.cancel.id, status: "CANCELLED" }} submitLabel="Cancel appointment" submitVariant="danger" pendingText="Cancelling…">
          <p className="text-[14px] text-ink2"><Words k="The time becomes free for someone else. You can undo this for a short while." /></p>
        </SheetForm>
      )}
      {(one(sp.re) || one(sp.cancel)) && !data.re && !data.cancel && (
        <UrlSheet title="Appointment not open" closeHref={here}><p className="text-[14px] text-ink2 pb-4"><Words k="This appointment was not found, or it is no longer booked." /></p></UrlSheet>
      )}
      <CommonSheets sp={sp} href={HREF} keepKeys={["staff", "day"]} />
    </div>
  );
}

type Appt = { id: string; status: string; staffId: string; date: Date };

function apptItems(a: Appt, here: string, isToday: boolean, needsDesk: boolean): RowItem[] {
  if (a.status === "ARRIVED") return [{ label: "Mark done", icon: "done", action: appointmentStatusAction, fields: { appointmentId: a.id, status: "DONE" } }];
  if (a.status !== "BOOKED") return [];
  const items: RowItem[] = [];
  if (isToday) {
    items.push(needsDesk
      ? { label: "Mark arrived", icon: "arrive", href: addQ(here, { do: "visitor", appointment: a.id }) }
      : { label: "Mark arrived", icon: "arrive", action: appointmentStatusAction, fields: { appointmentId: a.id, status: "ARRIVED" } });
  }
  items.push(
    { label: "Mark done", icon: "done", action: appointmentStatusAction, fields: { appointmentId: a.id, status: "DONE" } },
    { label: "Mark no-show", icon: "noshow", action: appointmentStatusAction, fields: { appointmentId: a.id, status: "NO_SHOW" } },
    { label: "Reschedule", icon: "move", href: addQ(here, { re: a.id }) },
    { label: "Send reminder", icon: "message", action: remindAction, fields: { appointmentId: a.id } },
    { label: "Cancel", icon: "cancel", href: addQ(here, { cancel: a.id }), tone: "bad" },
  );
  return items;
}

/** The staff member's day: busy blocks and free slots between them (mod-frontoffice.jsx scheduleFor). */
function Timeline({ plan, dayIso, today, minute, desk, bookHref }: { plan: DayPlan; dayIso: string; today: string; minute: number; desk: boolean; bookHref: (m: number) => string }) {
  if (plan.leave) {
    return (
      <ol className="p-3 md:p-4">
        <li className="grid grid-cols-[64px_1fr] gap-3 items-start">
          <span className="text-[12.5px] font-semibold text-ink3 tnum pt-2.5">{clockOf(plan.start)}</span>
          <div className="rounded-xl px-3.5 py-2.5 bg-bad/10 text-bad"><p className="text-[13.5px] font-semibold">{plan.leave}{dayIso === today ? " today" : ""}</p><p className="text-[12px] opacity-80 tnum">{clockOf(plan.start)} – {clockOf(plan.end)} <Words k="· no meetings can be booked" /></p></div>
        </li>
      </ol>
    );
  }
  type Row = { at: number; kind: "free"; slots: number[] } | { at: number; kind: "seg"; seg: DayPlan["segments"][number] };
  const rows: Row[] = [];
  const segs = plan.segments.filter((s) => s.end > plan.start && s.start < plan.end);
  let cur = plan.start;
  const pushFree = (to: number) => {
    const slots = plan.free.filter((m) => m >= cur && m < to);
    if (slots.length) rows.push({ at: slots[0], kind: "free", slots });
  };
  for (const s of segs) {
    if (s.start > cur) pushFree(s.start);
    rows.push({ at: s.start, kind: "seg", seg: s });
    cur = Math.max(cur, s.end);
  }
  if (cur < plan.end) pushFree(plan.end);
  const past = dayIso < today;
  if (!rows.length) {
    return <p className="p-5 text-[13.5px] text-ink3">{past ? "This day has passed. Nothing was booked." : "No free slots left on this day."}</p>;
  }
  return (
    <ol className="p-3 md:p-4 flex flex-col gap-1.5">
      {rows.map((r) => (
        <li key={`${r.kind}-${r.at}`} className="grid grid-cols-[64px_1fr] gap-3 items-start">
          <span className="text-[12.5px] font-semibold text-ink3 tnum pt-2.5">{clockOf(r.at)}</span>
          {r.kind === "free" ? (
            <div className="flex flex-wrap gap-1.5 py-1">
              {r.slots.map((m) => {
                const words = <>{clockOf(m).replace(/ (AM|PM)$/, "")} <span className="font-normal"><Words k="free" /></span></>;
                return desk
                  ? <Link key={m} href={bookHref(m)} scroll={false} className="h-9 px-3 rounded-lg text-[12.5px] font-semibold tnum transition border border-dashed border-line text-ink3 hover:border-brand hover:text-brand hover:bg-brand/5 inline-flex items-center gap-1" aria-label={`Book ${clockOf(m)}`}>{words}</Link>
                  : <span key={m} className="h-9 px-3 rounded-lg text-[12.5px] font-semibold tnum border border-dashed border-line text-ink3 inline-flex items-center gap-1">{words}</span>;
              })}
            </div>
          ) : (() => {
            const s = r.seg;
            const now = dayIso === today && (s.kind === "arrived" || s.kind === "booked") && s.start <= minute && minute < s.end;
            const kind = now ? "now" : s.kind;
            const st = s.status ? APPOINTMENT_STATUS[s.status] : null;
            return (
              <div className={cx("rounded-xl px-3.5 py-2.5 flex items-center gap-2", SEG[kind])}>
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-semibold leading-snug">{s.label}</p>
                  <p className="text-[12px] opacity-80 tnum">{clockOf(s.start)} – {clockOf(s.end)}{s.kind === "teach" ? " · from the Time Table" : ""}</p>
                </div>
                {now ? <Pill tone="brand" dot><Words k="In progress" /></Pill> : st ? <Pill tone={st.tone}>{st.label}</Pill> : null}
              </div>
            );
          })()}
        </li>
      ))}
    </ol>
  );
}
