// Transport Management's rules and "Done when" (12 §5, §9), against the real
// database: stop fees on the student's fees (A12), seats, fee coverage,
// changes and stopping, GPS checks, live status, "bus arriving" once per
// trip, the emergency button, licence reminders, route playback and a hired
// driver who sees only his own trips.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { createSchool } from "@/lib/schools";
import { accessIn } from "@/lib/auth/access";
import { trViewer } from "@/lib/transport/access";
import { addMissingFee, assignStudents, changePlace, feeCoverage, routeSeats, stopPlace } from "@/lib/transport/places";
import { driverTrips, endTrip, ensureTrips, ingestPoints, markStop, ownTrip, pressEmergency, startTrip, watchTrips } from "@/lib/transport/trips";
import { checkPoint } from "@/lib/transport/geo";
import { liveStatus } from "@/lib/transport/words";
import { sendTransportReminders } from "@/lib/transport/jobs";
import { transportOn, transportSettings } from "@/lib/transport/settings";
import { TR_REPORTS } from "@/lib/transport/reports";
import { tripsView } from "@/lib/transport/views";
import { TransportProblem } from "@/lib/transport/problem";
import { makeUser } from "../helpers";
import { makeTransportSchool, STOP1, STOP2, TZ, today, type TrFixture } from "./fixture";

const DAY = 86_400_000;
const monthStart = () => { const t = today(); return new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1)); };
const monthsLeft = () => { const t = monthStart(); return (2027 - t.getUTCFullYear()) * 12 + (2 - t.getUTCMonth()) + 1; };

let f: TrFixture;
const run = <T,>(work: Parameters<typeof withSchool<T>>[1]) => withSchool(f.ctx, work, { timeout: 60_000 });
const assign = (studentIds: string[], stopId: string, routeId = f.route1.id, type = "TWO_WAY", fromDate = monthStart()) =>
  run((tx) => assignStudents(tx, f.ctx, { studentIds, routeId, stopId, type, fromDate, reason: null }, today()));
const transportDues = (studentId: string) => run(async (tx) => {
  const heads = await tx.feeHead.findMany({ where: { kind: "transport" }, select: { id: true } });
  return tx.studentFeeDue.findMany({ where: { studentId, feeHeadId: { in: heads.map((h) => h.id) } }, orderBy: { dueDate: "asc" } });
});
/** Everyone's notifications (each person reads only their own on screen). */
const notesWhere = (where: { type: string; text?: { contains: string } }) => withSchool(f.sys, (tx) => tx.notification.findMany({ where }));

beforeAll(async () => {
  f = await makeTransportSchool("Transport Rules School");
});

describe("Transport is optional", () => {
  it("is off for a new school until switched on, so its pages are hidden and nothing runs", async () => {
    const other = await createSchool({ code: `TR${Date.now() % 100000}`, name: "No Buses School" });
    const ctx = { schoolId: other.school.id, userId: null };
    expect(await withSchool(ctx, (tx) => transportOn(tx, ctx))).toBe(false);
    const p = await makeUser({ schools: [{ id: other.school.id, roleKeys: ["principal"] }] });
    const view = (await accessIn(p.id, other.school.id))!;
    const v = trViewer(view);
    expect(Object.values(v.pages).every((m) => m === "hidden")).toBe(true);
  });

  it("hides Live Tracking until the school switches live tracking on", async () => {
    const view = (await accessIn(f.incharge.id, f.school.id))!;
    expect(trViewer(view).pages.live).toBe("full");
    const noLive = trViewer({ ...view, features: new Set() });
    expect(noLive.pages.live).toBe("hidden");
    expect(noLive.pages.routes).toBe("full");
  });
});

describe("Student Transport and the fee (A12)", () => {
  it("Done when 1: giving a stop adds that stop's fee to the student's fees from the start date, and the route's free seats drop by one", async () => {
    const [aarav] = f.students;
    const before = (await run((tx) => routeSeats(tx, today(), [f.route1.id]))).get(f.route1.id)!;
    const r = await assign([aarav.id], f.stop1.id);
    expect(r.monthlyPaise).toBe(BigInt(180000));
    const after = (await run((tx) => routeSeats(tx, today(), [f.route1.id]))).get(f.route1.id)!;
    expect(after.used).toBe(before.used + 1);
    const dues = await transportDues(aarav.id);
    expect(dues.length).toBe(monthsLeft());
    expect(dues[0].dueDate >= monthStart()).toBe(true);
    expect(dues.every((x) => x.amountPaise === BigInt(180000) && x.state === "OPEN")).toBe(true);
    expect(dues[0].label).toMatch(/^Transport · /);
  });

  it("charges the one-way fee for a one-way place", async () => {
    const meera = f.students[3];
    await assign([meera.id], f.stop3.id, f.route2.id, "PICKUP_ONLY");
    const dues = await transportDues(meera.id);
    expect(dues[0].amountPaise).toBe(BigInt(100000));
  });

  it("Done when 2: a full bus is refused with the route and the seats named", async () => {
    const [, diya, kabir, , rohan] = f.students;
    await assign([diya.id], f.stop2.id);
    await assign([kabir.id], f.stop2.id);
    await expect(assign([rohan.id], f.stop1.id)).rejects.toThrow(/Route 1 bus has 3 of 3 seats used/);
  });

  it("never gives one student two places at once", async () => {
    const [aarav] = f.students;
    await expect(assign([aarav.id], f.stop3.id, f.route2.id)).rejects.toThrow(/already has a place on Route 1/);
  });

  it("Done when 3: the fee coverage check lists every transport student without a transport fee, and Add fee fixes it", async () => {
    const sara = f.students[5];
    const place = await run((tx) => tx.transportAssignment.create({ data: { schoolId: f.school.id, studentId: sara.id, academicYearId: f.yearId, routeId: f.route2.id, stopId: f.stop3.id, fromDate: monthStart(), monthlyFeePaise: BigInt(150000) } }));
    const cov = await run((tx) => feeCoverage(tx, today()));
    expect(cov.noFee.map((x) => x.studentId)).toEqual([sara.id]);
    await run((tx) => addMissingFee(tx, f.ctx, place.id, today()));
    expect((await run((tx) => feeCoverage(tx, today()))).noFee).toHaveLength(0);
  });

  it("a route change waits for approval when the school asks for it; a stop change on the same route does not", async () => {
    await run((tx) => tx.transportSetting.update({ where: { schoolId: f.school.id }, data: { changeApproval: "ROUTE" } }));
    const kabir = f.students[2];
    const place = await run((tx) => tx.transportAssignment.findFirstOrThrow({ where: { studentId: kabir.id, status: "ACTIVE" } }));
    const toRoute2 = await run((tx) => changePlace(tx, f.ctx, place.id, { routeId: f.route2.id, stopId: f.stop3.id, type: "TWO_WAY", fromDate: today(), reason: "Moved house" }, today()));
    expect(toRoute2.status).toBe("waiting");
    const approval = await run((tx) => tx.approval.findFirst({ where: { type: "transport-change", recordType: "Transport Assignment" } }));
    expect(approval?.summary).toContain("Route 1 to Route 2");
    // Still on Route 1 until decided; the request holds no seat.
    expect((await run((tx) => tx.transportAssignment.findFirstOrThrow({ where: { id: place.id } }))).toDate).toBeNull();
    const diya = f.students[1];
    const diyaPlace = await run((tx) => tx.transportAssignment.findFirstOrThrow({ where: { studentId: diya.id, status: "ACTIVE" } }));
    const sameRoute = await run((tx) => changePlace(tx, f.ctx, diyaPlace.id, { routeId: f.route1.id, stopId: f.stop1.id, type: "TWO_WAY", fromDate: today(), reason: "Nearer stop" }, today()));
    expect(sameRoute.status).toBe("done");
    await run((tx) => tx.transportSetting.update({ where: { schoolId: f.school.id }, data: { changeApproval: "NONE" } }));
  });

  it("stopping transport removes the unpaid fee rows after the last day, keeps paid ones and deletes nothing", async () => {
    const meera = f.students[3];
    const place = await run((tx) => tx.transportAssignment.findFirstOrThrow({ where: { studentId: meera.id, status: "ACTIVE" } }));
    const dues = await transportDues(meera.id);
    const later = dues.filter((x) => x.dueDate > today());
    // A parent already paid one later month.
    await run((tx) => tx.studentFeeDue.update({ where: { id: later[1].id }, data: { paidPaise: later[1].amountPaise, balancePaise: BigInt(0) } }));
    const r = await run((tx) => stopPlace(tx, f.ctx, place.id, { lastDate: today(), reason: "Parent drops the child" }, today()));
    expect(r.status).toBe("done");
    if (r.status !== "done") return;
    expect(r.removed.kept).toHaveLength(1);
    const after = await transportDues(meera.id);
    expect(after).toHaveLength(dues.length);
    expect(after.filter((x) => x.state === "REMOVED").length).toBe(r.removed.removed);
    expect(after.find((x) => x.id === later[1].id)!.state).toBe("OPEN");
  });
});

describe("Trips and live tracking", () => {
  let tripId = "";
  beforeAll(async () => {
    await run((tx) => ensureTrips(tx, f.ctx, today()));
    tripId = (await run((tx) => tx.trip.findFirstOrThrow({ where: { routeId: f.route1.id, kind: "MORNING", date: today() } }))).id;
  });

  it("refuses bad GPS points: impossible numbers, the future, out of order and jumps", () => {
    const now = new Date();
    const started = new Date(now.getTime() - 30 * 60_000);
    const ctx = { now, tripStartedAt: started };
    const last = { at: new Date(now.getTime() - 60_000), lat: STOP1.lat, lng: STOP1.lng };
    expect(checkPoint({ at: now, lat: 0, lng: 0 }, null, ctx)).toEqual({ ok: false, why: "bad-number" });
    expect(checkPoint({ at: new Date(now.getTime() + 10 * 60_000), lat: STOP1.lat, lng: STOP1.lng }, null, ctx)).toEqual({ ok: false, why: "future" });
    expect(checkPoint({ at: new Date(now.getTime() - 2 * 60_000), lat: STOP1.lat, lng: STOP1.lng }, last, ctx)).toEqual({ ok: false, why: "out-of-order" });
    expect(checkPoint({ at: now, lat: STOP1.lat + 0.2, lng: STOP1.lng }, last, ctx)).toEqual({ ok: false, why: "jump" });
    expect(checkPoint({ at: now, lat: STOP2.lat, lng: STOP2.lng }, last, ctx)).toEqual({ ok: true });
  });

  it("takes no location before Start trip", async () => {
    await expect(run((tx) => ingestPoints(tx, f.ctx, tripId, [{ at: new Date(), lat: STOP1.lat, lng: STOP1.lng }], new Date(), TZ))).rejects.toThrow(/not running/);
    expect(await run((tx) => tx.gpsPoint.count({ where: { tripId } }))).toBe(0);
  });

  it("Done when 4: after Start trip the bus shows with its last location; bad points are counted, not used", async () => {
    const now = new Date();
    await run((tx) => startTrip(tx, f.ctx, tripId, { userId: f.rameshLogin.id, source: "APP" }, new Date(now.getTime() - 5 * 60_000)));
    const r = await run((tx) => ingestPoints(tx, f.ctx, tripId, [
      { at: new Date(now.getTime() - 150_000), lat: STOP1.lat + 0.0006, lng: STOP1.lng - 0.0006, speedKmh: 24 },
      { at: new Date(now.getTime() - 140_000), lat: 0, lng: 0 },
    ], now, TZ));
    expect(r).toMatchObject({ accepted: 1, rejected: 1 });
    const t = await run((tx) => tx.trip.findFirstOrThrow({ where: { id: tripId } }));
    expect(t.lastPointAt).not.toBeNull();
    const s = await run((tx) => transportSettings(tx, f.ctx));
    expect(liveStatus(t, new Date(t.lastPointAt!.getTime() + 10_000), s)).toEqual({ status: "Moving", stale: false });
  });

  it("Done when 6: parents at the next stop get one \"bus arriving\" message per trip", async () => {
    await run((tx) => markStop(tx, f.ctx, tripId, f.stop1.id, { userId: f.rameshLogin.id, source: "APP" }, new Date()));
    // About 370 m before Vasanth Nagar, on the road from Phase 9.
    const near = { lat: STOP1.lat + (STOP2.lat - STOP1.lat) * 0.75, lng: STOP1.lng + (STOP2.lng - STOP1.lng) * 0.75 };
    const now = new Date();
    await run((tx) => ingestPoints(tx, f.ctx, tripId, [{ at: new Date(now.getTime() - 20_000), ...near, speedKmh: 25 }], now, TZ));
    await run((tx) => ingestPoints(tx, f.ctx, tripId, [{ at: new Date(now.getTime() - 5_000), lat: near.lat + 0.0002, lng: near.lng + 0.0002, speedKmh: 22 }], new Date(), TZ));
    const riders = await run((tx) => tx.transportAssignment.count({ where: { routeId: f.route1.id, stopId: f.stop2.id, status: "ACTIVE", type: { in: ["TWO_WAY", "PICKUP_ONLY"] }, OR: [{ toDate: null }, { toDate: { gte: today() } }], fromDate: { lte: today() } } }));
    expect(riders).toBeGreaterThan(0);
    const logs = await run((tx) => tx.automationLog.findMany({ where: { ruleKey: "bus-arriving", eventKey: `bus-arriving:${tripId}:${f.stop2.id}` } }));
    expect(logs).toHaveLength(riders);
    expect(logs.every((l) => l.outcome === "sent")).toBe(true);
  });

  it("Done when 5: a quiet bus shows its last update, then stale, then offline, with one offline alert", async () => {
    const t = await run((tx) => tx.trip.findFirstOrThrow({ where: { id: tripId } }));
    const s = await run((tx) => transportSettings(tx, f.ctx));
    const last = t.lastPointAt!;
    expect(liveStatus(t, new Date(last.getTime() + (s.staleAfterSec + 5) * 1000), s).stale).toBe(true);
    expect(liveStatus(t, new Date(last.getTime() + (s.staleAfterSec + 5) * 1000), s).status).not.toBe("Offline");
    const later = new Date(last.getTime() + (s.offlineAfterMin + 1) * 60_000);
    expect(liveStatus(t, later, s)).toEqual({ status: "Offline", stale: true });
    expect((await run((tx) => watchTrips(tx, f.ctx, later, TZ))).offline).toBe(1);
    expect((await run((tx) => watchTrips(tx, f.ctx, new Date(later.getTime() + 60_000), TZ))).offline).toBe(0);
    expect(await run((tx) => tx.transportAlert.count({ where: { tripId, kind: "OFFLINE" } }))).toBe(1);
  });

  it("Done when 7: the emergency button alerts the Transport In-charge and the Principal with the location, and nothing goes to parents", async () => {
    const messagesBefore = await run((tx) => tx.message.count());
    // Pressed on the driver's phone.
    const driverCtx = { schoolId: f.school.id, userId: f.rameshLogin.id };
    const a = await withSchool(driverCtx, (tx) => pressEmergency(tx, driverCtx, tripId, { lat: 17.49, lng: 78.39, note: "Tyre burst", userId: f.rameshLogin.id }, new Date()));
    expect(a?.kind).toBe("EMERGENCY");
    expect(a?.lat).toBe(17.49);
    const notes = await notesWhere({ type: "transport-emergency" });
    expect(new Set(notes.map((n) => n.userLoginId))).toEqual(new Set([f.incharge.id, f.principal.id]));
    expect(notes[0].text).toContain("17.49000, 78.39000");
    expect(await run((tx) => tx.message.count())).toBe(messagesBefore);
  });

  it("Done when 4: after End trip no more locations are taken or shown", async () => {
    const before = await run((tx) => tx.gpsPoint.count({ where: { tripId } }));
    await run((tx) => endTrip(tx, f.ctx, tripId, { userId: f.rameshLogin.id, source: "APP" }, new Date(), TZ));
    await expect(run((tx) => ingestPoints(tx, f.ctx, tripId, [{ at: new Date(), lat: STOP2.lat, lng: STOP2.lng }], new Date(), TZ))).rejects.toThrow(/not running/);
    expect(await run((tx) => tx.gpsPoint.count({ where: { tripId } }))).toBe(before);
    const t = await run((tx) => tx.trip.findFirstOrThrow({ where: { id: tripId } }));
    expect(t.status).toBe("COMPLETED");
    expect(liveStatus(t, new Date(), await run((tx) => transportSettings(tx, f.ctx))).status).toBe("Parked");
  });

  it("Done when 9: a past trip keeps its path with times, in order, for playback", async () => {
    const points = await run((tx) => tx.gpsPoint.findMany({ where: { tripId }, orderBy: { at: "asc" } }));
    expect(points.length).toBeGreaterThanOrEqual(3);
    expect(points.every((p, i) => i === 0 || p.at > points[i - 1].at)).toBe(true);
    const history = await run((tx) => tripsView(tx, { id: tripId }));
    expect(history[0]).toMatchObject({ reached: 1 });
    expect(history[0].missed).toBeGreaterThan(0);
  });

  it("Done when 10: a hired driver with his own login sees and runs only his own trips", async () => {
    const mine = await run((tx) => driverTrips(tx, f.ctx, f.srinu.id, today()));
    expect(mine.length).toBe(2);
    expect(mine.every((t) => t.routeId === f.route2.id)).toBe(true);
    await expect(run((tx) => ownTrip(tx, f.srinu.id, tripId, today()))).rejects.toThrow(TransportProblem);
  });
});

describe("Reminders and reports", () => {
  it("Done when 8: a licence 30 days from expiry gives one reminder to the Transport In-charge", async () => {
    await run((tx) => tx.driver.update({ where: { id: f.srinu.id }, data: { licenceExpiry: new Date(today().getTime() + 30 * DAY) } }));
    // The timed job runs as nobody in particular.
    expect(await withSchool(f.sys, (tx) => sendTransportReminders(tx, f.sys, today()))).toBeGreaterThanOrEqual(1);
    const notes = await notesWhere({ type: "transport-reminder", text: { contains: "Licence of Srinu Naik" } });
    expect(notes.map((n) => n.userLoginId)).toEqual([f.incharge.id]);
    // The driver hears it too, in his own words.
    expect(await notesWhere({ type: "transport-reminder", text: { contains: "Your driving licence expires in 30 days" } })).toHaveLength(1);
    await withSchool(f.sys, (tx) => sendTransportReminders(tx, f.sys, today()));
    expect(await notesWhere({ type: "transport-reminder", text: { contains: "Licence of Srinu Naik" } })).toHaveLength(1);
  });

  it("every Transport report runs on the school's data", async () => {
    const range = { period: "last30" as const, from: new Date(today().getTime() - 29 * DAY).toISOString().slice(0, 10), to: today().toISOString().slice(0, 10), label: "Last 30 days" };
    for (const r of TR_REPORTS) {
      const table = await run((tx) => r.run({ tx, range: r.dated ? range : null, tz: TZ, today: today(), lateAfterMin: 10 }));
      expect(table.columns.length).toBeGreaterThan(0);
    }
    const trips = await run((tx) => TR_REPORTS.find((r) => r.key === "tr-trips")!.run({ tx, range, tz: TZ, today: today(), lateAfterMin: 10 }));
    expect(trips.rows.length).toBeGreaterThan(0);
  });
});
