// Staff & HR Management on the Dashboard: staff head count, who is on leave
// today, leave requests waiting, documents expiring, open positions, staff
// birthdays and the person's own leave (01 §2 "Teacher panel", HR home).
import "server-only";

import { approvalsFor } from "../../approvals";
import { hrSettings } from "../../staff/settings";
import { docStatus } from "../../staff/documents";
import { balancesFor, leaveYearFor } from "../../staff/leave";
import { addDays, dayDate, dayWord, myStaff, n, plural, reach, shortDate, someNames } from "../common";
import type { AgendaItem, Birthday, DashContext, ListRow, Viewer, Widget } from "../types";

const BASE = "/staff-hr-management";
const isHr = (v: Viewer) => reach(v, "staff-hr-management") === "all";
const ACTIVE = ["ACTIVE", "ON_LEAVE", "SUSPENDED"] as const;

/** Approved leave covering today, read once. */
function onLeaveToday(c: DashContext) {
  return c.memo("on-leave-today", async () => {
    const rows = await c.tx.leaveRequest.findMany({
      where: { status: "APPROVED", archivedAt: null, staffId: { not: null }, fromDate: { lte: c.today }, toDate: { gte: c.today } },
      orderBy: { fromDate: "asc" },
    });
    const staff = await c.tx.staff.findMany({ where: { id: { in: rows.map((r) => r.staffId!) }, archivedAt: null }, select: { id: true, fullName: true, designation: true, staffCode: true } });
    const types = new Map((await c.tx.leaveType.findMany({ where: { id: { in: rows.map((r) => r.leaveTypeId) } }, select: { id: true, name: true } })).map((t) => [t.id, t.name]));
    return rows.flatMap((r) => {
      const s = staff.find((x) => x.id === r.staffId);
      return s ? [{ ...s, until: r.toDate, type: types.get(r.leaveTypeId) ?? "Leave", halfDay: r.halfDay }] : [];
    });
  });
}

const staffBand: Widget<"band"> = {
  id: "staff.head-count",
  module: "staff-hr-management",
  kind: "band",
  homes: ["leader", "hr"],
  allowed: isHr,
  async load(c) {
    const [active, away] = await Promise.all([c.tx.staff.count({ where: { archivedAt: null, status: "ACTIVE" } }), onLeaveToday(c)]);
    return { id: "staff.head-count", label: "Staff", big: n(active), foot: away.length ? `${plural(away.length, "person", "people")} on leave today` : "No one on leave today", href: BASE };
  },
};

const staffAway: Widget<"panel"> = {
  id: "staff.away-today",
  module: "staff-hr-management",
  kind: "panel",
  homes: ["leader", "hr"],
  allowed: isHr,
  async load(c) {
    const away = await onLeaveToday(c);
    // The leader's band already says "No one on leave today"; HR keeps the card.
    if (!away.length && c.homes[0] === "leader") return null;
    const rows: ListRow[] = away.slice(0, 8).map((s) => ({
      id: s.id, avatar: s.fullName, title: s.fullName, sub: `${s.designation} · ${s.type}${s.halfDay ? ", half day" : ""}`,
      href: `${BASE}/${s.id}`, right: s.until.getTime() === c.today.getTime() ? "Today" : `Until ${shortDate(s.until)}`, rightTone: "info",
    }));
    return { slot: "side", panel: { kind: "list", title: "Staff on leave today", sub: away.length ? `${plural(away.length, "person", "people")} · from approved leave` : "From approved leave", icon: "Users", rows, href: `${BASE}/leave?view=calendar`, linkLabel: "Calendar", empty: "Everyone is in today." } };
  },
};

/** Staff leave requests this person may decide (Approvals, kind staff leave). */
const leaveRequests: Widget<"band"> = {
  id: "staff.leave-requests",
  module: "staff-hr-management",
  kind: "band",
  homes: ["hr"],
  async load(c) {
    const where = await approvalsFor(c.tx, c.viewer.ctx, c.viewer.roles.map((r) => r.key), { type: "staff-leave" });
    const count = await c.tx.approval.count({ where });
    if (!count && !isHr(c.viewer)) return null;
    const oldest = count ? await c.tx.approval.findFirst({ where, orderBy: { createdAt: "asc" }, select: { createdAt: true } }) : null;
    return { id: "staff.leave-requests", label: "Leave requests", big: n(count), foot: oldest ? `Oldest from ${shortDate(oldest.createdAt)}` : "Nothing waiting for you", href: `${BASE}/leave?view=requests` };
  },
};

/** Staff documents Expired and Expiring soon, as Documents & ID Cards counts them. */
function documentStates(c: DashContext) {
  return c.memo("staff-docs", async () => {
    const settings = await hrSettings(c.tx, c.viewer.ctx);
    const soonDays = Math.max(...settings.reminderDays, 30);
    const docs = await c.tx.staffDocument.findMany({
      where: { archivedAt: null, expiresOn: { not: null }, staff: { archivedAt: null, status: { notIn: ["RESIGNED", "RETIRED", "TERMINATED"] } } },
      include: { staff: { select: { fullName: true } } }, orderBy: { expiresOn: "asc" },
    });
    const withState = docs.map((d) => ({ ...d, st: docStatus(d, c.today, soonDays) }));
    return { soonDays, expired: withState.filter((d) => d.st === "Expired"), soon: withState.filter((d) => d.st === "Expiring soon") };
  });
}

const docsBand: Widget<"band"> = {
  id: "staff.documents-expiring",
  module: "staff-hr-management",
  kind: "band",
  homes: ["hr"],
  allowed: isHr,
  async load(c) {
    const d = await documentStates(c);
    return { id: "staff.documents-expiring", label: "Documents expiring", big: n(d.soon.length), foot: d.soon[0] ? `Within ${d.soonDays} days · first ${shortDate(d.soon[0].expiresOn!)}` : `None in the next ${d.soonDays} days`, href: `${BASE}/documents?status=${encodeURIComponent("Expiring soon")}` };
  },
};

const docsAttention: Widget<"attention"> = {
  id: "staff.documents",
  module: "staff-hr-management",
  kind: "attention",
  homes: ["leader", "hr"],
  allowed: isHr,
  async load(c) {
    const d = await documentStates(c);
    const out = [];
    if (d.expired.length) out.push({
      id: "staff.documents-expired", tone: "bad" as const, icon: "FileWarning" as const,
      title: `${plural(d.expired.length, "staff document")} ${d.expired.length === 1 ? "has" : "have"} expired`,
      detail: someNames(d.expired.map((x) => `${x.kind} of ${x.staff.fullName}`)),
      action: "See list", href: `${BASE}/documents?status=Expired`, value: String(d.expired.length),
    });
    if (d.soon.length) out.push({
      id: "staff.documents-soon", tone: "warn" as const, icon: "FileWarning" as const,
      title: `${plural(d.soon.length, "staff document")} expire${d.soon.length === 1 ? "s" : ""} within ${d.soonDays} days`,
      detail: someNames(d.soon.map((x) => `${x.kind} of ${x.staff.fullName} (${shortDate(x.expiresOn!)})`)),
      action: "See list", href: `${BASE}/documents?status=${encodeURIComponent("Expiring soon")}`, value: String(d.soon.length),
    });
    return out;
  },
};

const openPositions: Widget<"band"> = {
  id: "staff.open-positions",
  module: "staff-hr-management",
  kind: "band",
  homes: ["hr"],
  allowed: (v) => reach(v, "staff-hr-management", "edit") === "all",
  async load(c) {
    const vacancies = await c.tx.vacancy.findMany({ where: { archivedAt: null, status: "OPEN" }, select: { openings: true, _count: { select: { applications: true } } } });
    if (!vacancies.length) return null;
    const openings = vacancies.reduce((s, v) => s + v.openings, 0);
    const applicants = vacancies.reduce((s, v) => s + v._count.applications, 0);
    return { id: "staff.open-positions", label: "Open positions", big: n(openings), foot: `${plural(applicants, "applicant")}`, href: `${BASE}/recruitment` };
  },
};

/** The person's own leave left this year, from their leave balances. */
const myLeave: Widget<"band"> = {
  id: "staff.my-leave",
  module: "staff-hr-management",
  kind: "band",
  homes: ["staff"],
  async load(c) {
    const me = await myStaff(c);
    if (!me) return null;
    const year = await leaveYearFor(c.tx, c.viewer.ctx, c.today, me.campusId);
    if (!year) return null;
    const rows = ((await balancesFor(c.tx, c.viewer.ctx, [me.id], year.id)).get(me.id) ?? []).filter((r) => r.limited && r.given + r.adjusted > 0);
    if (!rows.length) return null;
    const left = rows.reduce((s, r) => s + r.left, 0);
    const words = (v: number) => (Number.isInteger(v) ? String(v) : v.toFixed(1));
    return { id: "staff.my-leave", label: "My leave left", big: `${words(left)} ${left === 1 ? "day" : "days"}`, foot: rows.slice(0, 3).map((r) => `${r.type.name.replace(/ leave$/i, "")} ${words(r.left)}`).join(" · "), href: `${BASE}/leave?view=mine` };
  },
};

/** The person's own approved leave in the next 7 days. */
const myLeaveAgenda: Widget<"agenda"> = {
  id: "staff.my-leave-days",
  module: "staff-hr-management",
  kind: "agenda",
  homes: ["staff"],
  async load(c) {
    const me = await myStaff(c);
    if (!me) return [];
    const rows = await c.tx.leaveRequest.findMany({ where: { staffId: me.id, archivedAt: null, status: { in: ["APPROVED", "WAITING"] }, toDate: { gte: c.today }, fromDate: { lte: addDays(c.today, 7) } }, orderBy: { fromDate: "asc" } });
    const types = new Map((await c.tx.leaveType.findMany({ where: { id: { in: rows.map((r) => r.leaveTypeId) } }, select: { id: true, name: true } })).map((t) => [t.id, t.name]));
    return rows.map((r): AgendaItem => {
      const from = r.fromDate < c.today ? c.today : r.fromDate;
      return {
        id: `leave:${r.id}`, time: dayWord(from, c.today), title: `Your ${types.get(r.leaveTypeId)?.toLowerCase() ?? "leave"}${r.status === "WAITING" ? " (waiting for approval)" : ""}`,
        where: r.fromDate.getTime() === r.toDate.getTime() ? dayDate(r.fromDate) : `${dayDate(r.fromDate)} to ${dayDate(r.toDate)}`,
        tone: r.status === "WAITING" ? "warn" : "info", href: `${BASE}/leave?view=mine`, sort: Math.round((from.getTime() - c.today.getTime()) / 60_000),
      };
    });
  },
};

const staffBirthdays: Widget<"birthdays"> = {
  id: "staff.birthdays",
  module: "staff-hr-management",
  kind: "birthdays",
  homes: "any",
  async load(c) {
    const days = Array.from({ length: 7 }, (_, i) => addDays(c.today, i));
    const keys = days.map((d) => d.toISOString().slice(5, 10));
    const found = await c.tx.$queryRaw<{ id: string }[]>`SELECT id FROM staff WHERE archived_at IS NULL AND date_of_birth IS NOT NULL AND to_char(date_of_birth, 'MM-DD') = ANY(${keys})`;
    if (!found.length) return [];
    const staff = await c.tx.staff.findMany({ where: { id: { in: found.map((f) => f.id) }, status: { in: [...ACTIVE] } }, select: { id: true, fullName: true, dateOfBirth: true, userLoginId: true } });
    return staff.map((s): Birthday => {
      const day = days.find((d) => d.toISOString().slice(5, 10) === s.dateOfBirth!.toISOString().slice(5, 10))!;
      const mine = s.userLoginId === c.viewer.user.id;
      return { id: `staff:${s.id}`, name: mine ? "You" : `${s.fullName} (staff)`, when: dayWord(day, c.today), sort: day.getTime() };
    });
  },
};

export const STAFF_WIDGETS: Widget[] = [staffBand, leaveRequests, docsBand, openPositions, myLeave, docsAttention, staffAway, myLeaveAgenda, staffBirthdays] as Widget[];
