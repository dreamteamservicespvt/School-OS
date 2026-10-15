// Events & Calendar on the Dashboard (18 "Connects to": "01 Dashboard: today's
// events, upcoming PTMs"). Today's events and PTMs already reach every home
// through the School Calendar agenda (academic.calendar); these add what
// each role acts on: the events team sees a PTM that is filling slowly, the
// Accountant sees event fees still due, and a teacher sees their own PTM
// bookings for today and tomorrow.
import "server-only";

import { evCan, evViewer } from "../../events/access";
import { eventMoney } from "../../events/events";
import { formatRupees } from "../../format";
import { addDays, dayWord, plural, shortDate } from "../common";
import type { AgendaItem, DashContext, Viewer, Widget } from "../types";

const BASE = "/events-calendar";
const ZERO = BigInt(0);
const ev = (v: Viewer) => evViewer(v as unknown as Parameters<typeof evViewer>[0]);
const clockOf = (min: number) => { const h = Math.floor(min / 60); const m = min % 60; return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")}`; };

/** A PTM in the next 10 days with fewer than 60% of slots booked. */
const ptmFilling: Widget<"attention"> = {
  id: "events.ptm-booking",
  module: "events-calendar",
  kind: "attention",
  homes: ["leader"],
  allowed: (v) => evCan(ev(v)).ptmPlan,
  async load(c: DashContext) {
    const ptms = await c.tx.ptm.findMany({ where: { archivedAt: null, date: { gte: c.today, lte: addDays(c.today, 10) } }, orderBy: { date: "asc" }, take: 3 });
    const out = [];
    for (const p of ptms) {
      const [total, booked] = await Promise.all([c.tx.ptmSlot.count({ where: { ptmId: p.id } }), c.tx.ptmSlot.count({ where: { ptmId: p.id, studentId: { not: null } } })]);
      if (!total || booked / total >= 0.6) continue;
      out.push({
        id: `events.ptm-booking:${p.id}`, tone: "warn" as const, icon: "Users" as const,
        title: `PTM ${dayWord(p.date, c.today) === "Today" ? "today" : `on ${shortDate(p.date)}`}: ${booked} of ${plural(total, "slot")} booked`,
        detail: `${p.classesLabel}. Parents get a confirmation when the office books their slot.`,
        action: "Open", href: `${BASE}/ptm?day=${p.id}`, value: String(booked),
      });
    }
    return out;
  },
};

/** Event fees still due for events that have not happened yet (the Accountant and the events team). */
const feesDue: Widget<"attention"> = {
  id: "events.fees-due",
  module: "events-calendar",
  kind: "attention",
  homes: ["accountant", "leader"],
  allowed: (v) => evCan(ev(v)).money,
  async load(c) {
    const events = await c.tx.event.findMany({ where: { archivedAt: null, cancelledAt: null, feePaise: { gt: ZERO }, date: { gte: c.today } }, select: { id: true, number: true, name: true, date: true } });
    if (!events.length) return null;
    const money = await eventMoney(c.tx, events);
    let due = ZERO;
    let students = 0;
    for (const m of money.values()) { due += m.due; students += m.dueStudents; }
    if (due <= ZERO) return null;
    const next = events.sort((a, b) => a.date.getTime() - b.date.getTime()).find((e) => (money.get(e.id)?.due ?? ZERO) > ZERO);
    return {
      id: "events.fees-due", tone: "info", icon: "CreditCard",
      title: `Event fees due: ${formatRupees(due)} from ${plural(students, "student")}`,
      detail: next ? `Next: ${next.name}, ${shortDate(next.date)}. Collected through Fee Management.` : "Collected through Fee Management.",
      action: "Open", href: `${BASE}/events?f=up`, value: due.toString(),
    };
  },
};

/** A teacher's own PTM bookings today and tomorrow. */
const myPtm: Widget<"agenda"> = {
  id: "events.my-ptm",
  module: "events-calendar",
  kind: "agenda",
  homes: ["teacher", "class-teacher"],
  allowed: (v) => evCan(ev(v)).ptmBook,
  async load(c) {
    const me = await c.tx.staff.findFirst({ where: { userLoginId: c.viewer.user.id, archivedAt: null }, select: { id: true } });
    if (!me) return null;
    const ptms = await c.tx.ptm.findMany({ where: { archivedAt: null, date: { gte: c.today, lte: addDays(c.today, 1) } } });
    const out: AgendaItem[] = [];
    for (const p of ptms) {
      const slots = await c.tx.ptmSlot.findMany({ where: { ptmId: p.id, staffId: me.id }, orderBy: { startMin: "asc" } });
      if (!slots.length) continue;
      const booked = slots.filter((s) => s.studentId);
      const word = dayWord(p.date, c.today);
      out.push({
        id: `events.my-ptm:${p.id}`, time: word === "Today" ? clockOf(slots[0].startMin) : word,
        title: `PTM: ${plural(booked.length, "parent")} booked with you`, where: `${p.classesLabel}${p.venue ? ` · ${p.venue}` : ""}`,
        tone: "brand", href: `${BASE}/ptm?day=${p.id}`,
        sort: word === "Today" ? slots[0].startMin : 24 * 60 + slots[0].startMin,
      });
    }
    return out;
  },
};

export const EVENTS_WIDGETS: Widget[] = [ptmFilling, feesDue, myPtm] as Widget[];
