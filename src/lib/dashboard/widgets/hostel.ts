// Hostel Management on the Dashboard (15 §4: "Hostel occupancy in the
// operations panel", inferred; the approved design's warden home). The
// warden sees their own hostel: who is in, who is out, tonight's roll call and
// late returns. The leaders see every hostel's occupancy, missing roll calls
// (with Remind) and late returns. Widgets show only when the hostel is built,
// switched on and open to the person (the registry checks the module).
import "server-only";

import type { Prisma } from "@prisma/client";
import { hostelCan, hostelViewer } from "../../hostel/access";
import { myHostelIds, type Mine } from "../../hostel/scope";
import { hostelSettings } from "../../hostel/settings";
import { occupancy } from "../../hostel/rooms";
import { studentsInfo } from "../../hostel/allocation";
import { clockAt } from "../../front-office/time";
import { BASE, minuteWords } from "../../hostel/words";
import { n, plural } from "../common";
import type { DashContext, ListRow, Viewer, Widget } from "../types";

const viewerOf = (v: Viewer) => hostelViewer(v as unknown as Parameters<typeof hostelViewer>[0]);
const worker = (v: Viewer) => hostelCan(viewerOf(v)).rollcall;
const reads = (v: Viewer) => viewerOf(v).pages.rollcall !== "hidden";

const mineOf = (c: DashContext) => c.memo<Mine>("hostel.mine", () => myHostelIds(c.tx, c.viewer.ctx, viewerOf(c.viewer)));
const scoped = (mine: Mine): Prisma.BedAllocationWhereInput => (mine === null ? {} : { hostelId: { in: mine } });

/** Residents in the hostel now, and out on passes. */
const residentsBand: Widget<"band"> = {
  id: "hostel.residents",
  module: "hostel-management",
  kind: "band",
  homes: ["warden", "leader"],
  allowed: reads,
  async load(c) {
    const mine = await mineOf(c);
    if (mine && !mine.length) return null;
    const [living, out] = await Promise.all([
      c.tx.bedAllocation.count({ where: { status: "ACTIVE", checkedInAt: { not: null }, ...scoped(mine) } }),
      c.tx.gatePass.count({ where: { kind: "HOSTEL_OUTING", status: "OUT", archivedAt: null, ...(mine ? { hostelId: { in: mine } } : {}) } }),
    ]);
    return { id: "hostel.residents", label: "In the hostel now", big: n(living - out), of: `/ ${n(living)}`, foot: out ? `${plural(out, "student")} out on passes` : "Everyone is in", href: `${BASE}/allocation` };
  },
};

/** Beds free across the hostels (the operations panel number). */
const bedsBand: Widget<"band"> = {
  id: "hostel.beds",
  module: "hostel-management",
  kind: "band",
  homes: ["leader"],
  allowed: reads,
  async load(c) {
    const occ = await occupancy(c.tx);
    if (!occ.total.beds) return null;
    return { id: "hostel.beds", label: "Hostel beds taken", big: n(occ.total.taken), of: `/ ${n(occ.total.beds)}`, foot: `${plural(occ.total.free, "bed")} free`, ring: Math.round((occ.total.taken / occ.total.beds) * 100), href: `${BASE}/rooms` };
  },
};

/** Tonight's roll call not taken after its time: take it (warden) or remind the warden (leaders). */
const rollCallMissing: Widget<"attention"> = {
  id: "hostel.rollcall-missing",
  module: "hostel-management",
  kind: "attention",
  homes: ["warden", "leader"],
  allowed: reads,
  async load(c) {
    const s = await hostelSettings(c.tx, c.viewer.ctx);
    const session = c.minuteNow >= s.nightRollMinute ? "NIGHT" : c.minuteNow >= s.morningRollMinute + 60 ? "MORNING" : null;
    if (!session) return null;
    const mine = await mineOf(c);
    const hostels = await c.tx.hostel.findMany({ where: { archivedAt: null, ...(mine ? { id: { in: mine } } : {}) }, select: { id: true, name: true } });
    if (!hostels.length) return null;
    const done = await c.tx.rollCall.findMany({ where: { date: c.today, session, hostelId: { in: hostels.map((h) => h.id) } }, select: { hostelId: true } });
    const living = await c.tx.bedAllocation.groupBy({ by: ["hostelId"], where: { status: "ACTIVE", checkedInAt: { not: null }, hostelId: { in: hostels.map((h) => h.id) } }, _count: { _all: true } });
    const missing = hostels.filter((h) => !done.some((d) => d.hostelId === h.id) && living.some((l) => l.hostelId === h.id));
    if (!missing.length) return null;
    const work = worker(c.viewer);
    const word = session === "NIGHT" ? "Night" : "Morning";
    return {
      id: `hostel.rollcall-missing.${session}`, tone: "warn", icon: "ListChecks",
      title: `${word} roll call not taken: ${missing.map((h) => h.name).join(", ")}`,
      detail: work ? `It was due at ${minuteWords(session === "NIGHT" ? s.nightRollMinute : s.morningRollMinute)}.` : "Remind the warden from the roll call page.",
      action: work ? "Take roll call" : "Remind", href: `${BASE}?hostel=${missing[0].id}&session=${session.toLowerCase()}`, value: `${c.today.toISOString().slice(0, 10)}:${missing.length}`,
    };
  },
};

/** Students not back by the return time. */
const lateReturns: Widget<"attention"> = {
  id: "hostel.late",
  module: "hostel-management",
  kind: "attention",
  homes: ["warden", "leader"],
  allowed: reads,
  async load(c) {
    const mine = await mineOf(c);
    const late = await c.tx.gatePass.findMany({ where: { kind: "HOSTEL_OUTING", status: "OUT", archivedAt: null, toAt: { lt: c.now }, ...(mine ? { hostelId: { in: mine } } : {}) }, orderBy: { toAt: "asc" }, take: 20 });
    if (!late.length) return null;
    const info = await studentsInfo(c.tx, c.viewer.ctx, late.map((p) => p.studentId));
    const first = info.get(late[0].studentId);
    return {
      id: "hostel.late", tone: "bad", icon: "Clock",
      title: late.length === 1 ? `${first?.first ?? "A student"} not returned (due ${clockAt(late[0].toAt!, c.tz)})` : `${plural(late.length, "student")} not back by the return time`,
      detail: worker(c.viewer) ? `Out with ${late[0].collectorName}. Call them, then mark returned.` : "The warden is following up.",
      action: "Open", href: `${BASE}/outings?status=LATE`, value: String(late.length),
    };
  },
};

/** Out now: who is away on a pass and when they are due back (warden home). */
const outNowPanel: Widget<"panel"> = {
  id: "hostel.out-now",
  module: "hostel-management",
  kind: "panel",
  homes: ["warden"],
  allowed: worker,
  async load(c) {
    const mine = await mineOf(c);
    const rows = await c.tx.gatePass.findMany({ where: { kind: "HOSTEL_OUTING", status: { in: ["OUT", "APPROVED"] }, archivedAt: null, ...(mine ? { hostelId: { in: mine } } : {}) }, orderBy: { toAt: "asc" }, take: 8 });
    const info = await studentsInfo(c.tx, c.viewer.ctx, rows.map((p) => p.studentId));
    const list: ListRow[] = rows.map((p) => {
      const s = info.get(p.studentId);
      const late = p.status === "OUT" && p.toAt && p.toAt < c.now;
      return {
        id: p.id, title: s?.name ?? "Student", sub: `${p.status === "OUT" ? "Out" : "Approved"} with ${p.collectorName} · back by ${p.toAt ? clockAt(p.toAt, c.tz) : ""}`,
        right: late ? "Late" : p.status === "OUT" ? "Out" : "Not left yet", rightTone: late ? "bad" : p.status === "OUT" ? "info" : "neutral", href: `${BASE}/outings?pass=${p.id}`,
      };
    });
    return { slot: "side", panel: { kind: "list", title: "Outings today", sub: "Out now and approved to go", icon: "Users", rows: list, href: `${BASE}/outings`, linkLabel: "All passes", empty: "Nobody is out." } };
  },
};

/** Occupancy by hostel (the operations panel). */
const occupancyPanel: Widget<"panel"> = {
  id: "hostel.occupancy",
  module: "hostel-management",
  kind: "panel",
  homes: ["leader"],
  allowed: reads,
  async load(c) {
    const occ = await occupancy(c.tx);
    if (!occ.rows.length) return null;
    return {
      slot: "side",
      panel: {
        kind: "bars", title: "Hostel occupancy", sub: `${occ.total.taken} of ${occ.total.beds} beds taken`, icon: "Users",
        rows: occ.rows.map((r) => ({ key: r.hostel.id, label: r.hostel.name, value: r.beds ? Math.round((r.taken / r.beds) * 100) : 0, href: `${BASE}/rooms?hostel=${r.hostel.id}` })),
        href: `${BASE}/reports`, linkLabel: "Hostel reports", empty: "No beds yet.",
      },
    };
  },
};

export const HOSTEL_WIDGETS: Widget[] = [residentsBand, bedsBand, rollCallMissing, lateReturns, outNowPanel, occupancyPanel];
