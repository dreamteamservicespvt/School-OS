// Front Office on the Dashboard (16 "Connects to": "01 Dashboard: Visitors
// today in the operations panel"; Done when "Reception dashboard: today's
// visitors, enquiries, appointments, calls"). Counts use the same filters as
// the Front Office lists they open, within the person's reach: Gate Security
// (own) sees today's visitors only. The staff member being visited gets their
// own lines ("A visitor is here for you", their appointments today) even
// without access to Front Office, so those two are registered under the
// Dashboard and check that Front Office is built and switched on themselves.
import "server-only";

import { BUILT_MODULES } from "../../modules";
import { staffForUser } from "../../people";
import { foCan, foViewer, visitorScope } from "../../front-office/access";
import { foFeaturesOn } from "../../front-office/settings";
import { clockAt, instantOf } from "../../front-office/time";
import { clockOf } from "../../front-office/words";
import { addDays, iso, n, plural, someNames } from "../common";
import type { AgendaItem, DashContext, ListRow, Viewer, Widget } from "../types";

const BASE = "/front-office";

function fo(c: DashContext) {
  return c.memo("front-office-viewer", async () => {
    const v = foViewer(c.viewer as unknown as Parameters<typeof foViewer>[0]);
    return { v, can: foCan(v), scope: visitorScope(v, c.today) };
  });
}

const frontOfficeOn = (v: Viewer) => BUILT_MODULES.has("front-office") && v.modulesOn.has("front-office");

/** "In the building now": visitors with a pass still running. */
const insideNow: Widget<"band"> = {
  id: "front-office.inside",
  module: "front-office",
  kind: "band",
  homes: ["leader", "receptionist", "gate", "office"],
  async load(c) {
    const { scope } = await fo(c);
    const live = { AND: [{ archivedAt: null, timeOut: null, passExpiresAt: { gt: c.now } }, scope] };
    const [count, today] = await Promise.all([
      c.tx.visitorEntry.count({ where: live }),
      c.tx.visitorEntry.count({ where: { AND: [{ archivedAt: null, visitDate: c.today }, scope] } }),
    ]);
    return { id: "front-office.inside", label: "Visitors inside now", big: n(count), foot: `${plural(today, "visitor")} today`, href: `${BASE}/visitors?status=In&view=log` };
  },
};

/** Enquiries and calls at the desk today (the reception dashboard). */
const deskToday: Widget<"band"> = {
  id: "front-office.desk-today",
  module: "front-office",
  kind: "band",
  homes: ["receptionist"],
  allowed: (v) => foCan(foViewer(v as unknown as Parameters<typeof foViewer>[0])).desk,
  async load(c) {
    const from = instantOf(iso(c.today), 0, c.tz);
    const to = instantOf(iso(addDays(c.today, 1)), 0, c.tz);
    // Appointments: today's not cancelled, as Appointments says "N booked"; the ones still to come in the foot.
    const [calls, appts, toCome] = await Promise.all([
      c.tx.callLogEntry.count({ where: { archivedAt: null, at: { gte: from, lt: to } } }),
      c.tx.appointment.count({ where: { archivedAt: null, date: c.today, status: { not: "CANCELLED" } } }),
      c.tx.appointment.count({ where: { archivedAt: null, date: c.today, status: { in: ["BOOKED", "ARRIVED"] } } }),
    ]);
    return { id: "front-office.desk-today", label: "Appointments today", big: n(appts), foot: `${n(toCome)} still to come · ${plural(calls, "call")} logged`, href: `${BASE}/appointments` };
  },
};

/** Passes past their time with nobody checked out. */
const expiredPasses: Widget<"attention"> = {
  id: "front-office.expired-passes",
  module: "front-office",
  kind: "attention",
  homes: ["leader", "receptionist", "gate"],
  async load(c) {
    const { scope } = await fo(c);
    const where = { AND: [{ archivedAt: null, timeOut: null, passExpiresAt: { lte: c.now } }, scope] };
    const [count, rows] = await Promise.all([
      c.tx.visitorEntry.count({ where }),
      c.tx.visitorEntry.findMany({ where, orderBy: { passExpiresAt: "asc" }, take: 2, select: { name: true, passNo: true } }),
    ]);
    if (!count) return null;
    return {
      id: "front-office.expired-passes", tone: "bad", icon: "TriangleAlert",
      title: `${plural(count, "visitor pass", "visitor passes")} expired with nobody checked out`,
      detail: `${someNames(rows.map((r) => `${r.name} (${r.passNo})`))}${count > 2 ? ` and ${n(count - 2)} more` : ""}. Check they have left.`,
      // view=log: the visitor log, also for Gate Security when the gate log is on (it opens on gate entries otherwise).
      action: "Review", href: `${BASE}/visitors?status=Expired&view=log`, value: String(count),
    };
  },
};

/** Letters and parcels waiting at the desk (Postal & Deliveries, when switched on). */
const postalAtDesk: Widget<"attention"> = {
  id: "front-office.postal-at-desk",
  module: "front-office",
  kind: "attention",
  homes: ["receptionist"],
  allowed: (v) => foCan(foViewer(v as unknown as Parameters<typeof foViewer>[0])).desk,
  async load(c) {
    if (!(await foFeaturesOn(c.tx, c.viewer.ctx)).has("front-office-postal")) return null;
    const where = { archivedAt: null, status: "AT_DESK" };
    const [count, oldest] = await Promise.all([
      c.tx.postalEntry.count({ where }),
      c.tx.postalEntry.findFirst({ where, orderBy: { at: "asc" }, select: { at: true } }),
    ]);
    if (!count || !oldest) return null;
    const days = Math.floor((c.now.getTime() - oldest.at.getTime()) / 86_400_000);
    if (days < 1) return null;
    return {
      id: "front-office.postal-at-desk", tone: "info", icon: "Send",
      title: `${plural(count, "item")} waiting at the desk`,
      detail: `The oldest has waited ${plural(days, "day")}. Remind the person or hand it over.`,
      action: "Hand over", href: `${BASE}/postal?status=AT_DESK`, value: String(count),
    };
  },
};

/** Visitors inside now (the operations panel on the leader's home). */
const visitorsPanel: Widget<"panel"> = {
  id: "front-office.visitors-panel",
  module: "front-office",
  kind: "panel",
  homes: ["leader", "receptionist"],
  async load(c) {
    const { scope, can } = await fo(c);
    const rows = await c.tx.visitorEntry.findMany({
      where: { AND: [{ archivedAt: null, timeOut: null, passExpiresAt: { gt: c.now } }, scope] },
      orderBy: { timeIn: "desc" }, take: 5, select: { id: true, name: true, purpose: true, timeIn: true, meetStaffId: true },
    });
    const staff = await c.tx.staff.findMany({ where: { id: { in: rows.map((r) => r.meetStaffId).filter((x): x is string => Boolean(x)) } }, select: { id: true, fullName: true } });
    const list: ListRow[] = rows.map((r) => {
      const met = staff.find((s) => s.id === r.meetStaffId)?.fullName;
      return { id: r.id, title: r.name, sub: `${r.purpose}${met ? ` · ${met}` : ""}`, avatar: r.name, right: `In ${clockAt(r.timeIn, c.tz)}`, rightTone: "ok", href: can.desk ? `${BASE}/visit/${r.id}` : undefined };
    });
    return { slot: "side", panel: { kind: "list", title: "Visitors in the building", sub: "Passes still running", icon: "Users", rows: list, href: `${BASE}/visitors?status=In`, linkLabel: "Visitor log", empty: "No visitors inside right now." } };
  },
};

/** "A visitor is here for you": the staff member being visited answers Send in, Wait or Not available. */
const visitorForMe: Widget<"attention"> = {
  id: "front-office.visitor-for-me",
  module: "dashboard",
  kind: "attention",
  homes: "any",
  allowed: frontOfficeOn,
  async load(c) {
    const me = await staffForUser(c.tx, c.viewer.ctx);
    if (!me) return [];
    const rows = await c.tx.visitorEntry.findMany({
      where: { archivedAt: null, meetStaffId: me.id, visitDate: c.today, timeOut: null, passExpiresAt: { gt: c.now }, staffReply: null },
      orderBy: { timeIn: "asc" }, take: 3, select: { id: true, name: true, purpose: true, timeIn: true },
    });
    return rows.map((r) => ({
      id: `front-office.visitor:${r.id}`, tone: "warn" as const, icon: "UserCheck" as const,
      title: `${r.name} is at the front desk for you`,
      detail: `${r.purpose} · came in at ${clockAt(r.timeIn, c.tz)}`,
      action: "Answer", href: `${BASE}/visit/${r.id}`, value: r.id,
    }));
  },
};

/** The person's own appointments today, on "Today and next". */
const myAppointments: Widget<"agenda"> = {
  id: "front-office.my-appointments",
  module: "dashboard",
  kind: "agenda",
  homes: "any",
  allowed: frontOfficeOn,
  async load(c) {
    const me = await staffForUser(c.tx, c.viewer.ctx);
    if (!me) return [];
    const rows = await c.tx.appointment.findMany({
      where: { archivedAt: null, staffId: me.id, date: c.today, status: { in: ["BOOKED", "ARRIVED"] }, startMin: { gte: c.minuteNow - 30 } },
      orderBy: { startMin: "asc" }, take: 5,
    });
    return rows.map((a): AgendaItem => ({
      id: `appointment:${a.id}`, time: clockOf(a.startMin).replace(/\s?[AP]M$/i, ""),
      title: `Appointment: ${a.visitorName}`, where: `${a.purpose} · ${a.lengthMin} min${a.status === "ARRIVED" ? " · arrived" : ""}`,
      tone: a.status === "ARRIVED" ? "ok" : "info", sort: a.startMin,
    }));
  },
};

export const FRONT_OFFICE_WIDGETS: Widget[] = [insideNow, deskToday, expiredPasses, postalAtDesk, visitorsPanel, visitorForMe, myAppointments] as Widget[];
