// Fixes from the Chaitanya EM School QA audit (campus area): a driver whose
// licence has ended is not put on a route or a trip schedule, a route's
// evening trip leaves after the morning trip reaches school, and a driver app
// invite is called sent only when a message channel carried it.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { addDriver } from "@/lib/transport/fleet";
import { addRoute, addStop, editRoute } from "@/lib/transport/routes";
import { saveSchedule } from "@/lib/transport/trips";
import { inviteWords, rupeesShort } from "@/lib/transport/words";
import { d, makeTransportSchool, type TrFixture } from "./fixture";

let f: TrFixture;
let expiredId = "";
const run = <T,>(work: Parameters<typeof withSchool<T>>[1]) => withSchool(f.ctx, work, { timeout: 60_000 });
const route = (name: string, extra: Partial<Parameters<typeof addRoute>[2]> = {}) =>
  run((tx) => addRoute(tx, f.ctx, { name, vehicleId: null, driverId: null, attendantId: null, feeTwoWayPaise: null, feeOneWayPaise: null, schoolArrivalMin: 8 * 60 + 30, eveningDepartMin: 15 * 60 + 30, ...extra }));

beforeAll(async () => {
  f = await makeTransportSchool("Transport QA Campus School");
  expiredId = (await run((tx) => addDriver(tx, f.ctx, { name: "Demo Expired Driver", phone: "9701100199", role: "DRIVER", employment: "HIRED", vendorId: null, licenceNo: "AP3920150001", licenceExpiry: d("2025-01-01"), invite: false }))).driver.id;
}, 120_000);

describe("drivers whose licence has ended", () => {
  it("are not put on a new route", async () => {
    await expect(route("Demo Expired Route", { driverId: expiredId })).rejects.toThrow(/Licence of Demo Expired Driver expired on 01-01-2025/);
  });

  it("are not put on a route by editing it, but a route that already has them can still be edited", async () => {
    const r = await route("Demo Edit Route");
    const input = { name: r.name, vehicleId: null, driverId: expiredId, attendantId: null, feeTwoWayPaise: null, feeOneWayPaise: null, schoolArrivalMin: r.schoolArrivalMin, eveningDepartMin: r.eveningDepartMin };
    await expect(run((tx) => editRoute(tx, f.ctx, r.id, input))).rejects.toThrow(/expired/);
    // An old route that had the driver before the licence ended keeps working.
    await run((tx) => tx.route.update({ where: { id: r.id }, data: { driverId: expiredId } }));
    const after = await run((tx) => editRoute(tx, f.ctx, r.id, { ...input, name: "Demo Edit Route Renamed" }));
    expect(after.name).toBe("Demo Edit Route Renamed");
  });

  it("are not put on a trip schedule", async () => {
    await expect(run((tx) => saveSchedule(tx, f.ctx, { routeId: f.route1.id, kind: "MORNING", vehicleId: null, driverId: expiredId, attendantId: null, startMin: 7 * 60, days: [1, 2, 3] }))).rejects.toThrow(/expired/);
  });

  it("a driver is not taken as a trip's attendant", async () => {
    await expect(run((tx) => saveSchedule(tx, f.ctx, { routeId: f.route1.id, kind: "MORNING", vehicleId: null, driverId: null, attendantId: f.ramesh.id, startMin: 7 * 60, days: [1, 2, 3] }))).rejects.toThrow(/attendant/);
  });
});

describe("route times", () => {
  it("refuse an evening trip that leaves before the morning trip reaches school", async () => {
    await expect(route("Demo Backwards Route", { schoolArrivalMin: 8 * 60 + 45, eveningDepartMin: 8 * 60 })).rejects.toThrow(/evening trip must leave school after/);
    await expect(route("Demo Same Time Route", { schoolArrivalMin: 8 * 60 + 45, eveningDepartMin: 8 * 60 + 45 })).rejects.toThrow(/evening/);
    expect((await route("Demo Fine Route", { schoolArrivalMin: 8 * 60 + 45, eveningDepartMin: 16 * 60 + 10 })).name).toBe("Demo Fine Route");
  });
});

describe("stop times", () => {
  it("pick up before the bus reaches school and drop after it leaves", async () => {
    const r = await route("Demo Stop Times Route", { schoolArrivalMin: 8 * 60 + 45, eveningDepartMin: 16 * 60 + 10 });
    const stop = (pickupMin: number, dropMin: number | null) => run((tx) => addStop(tx, f.ctx, r.id, { name: `Demo Village ${pickupMin}-${dropMin}`, before: null, pickupMin, dropMin, lat: null, lng: null, feeTwoWayPaise: BigInt(80000), feeOneWayPaise: null }));
    await expect(stop(9 * 60 + 30, null)).rejects.toThrow(/pickup must be before the bus reaches school at 8:45 AM/);
    await expect(stop(7 * 60 + 30, 16 * 60)).rejects.toThrow(/drop must be after the bus leaves school/);
    expect((await stop(7 * 60 + 30, 16 * 60 + 40)).seq).toBe(1);
  });

  it("show a fee with paise as it is charged", () => {
    expect(rupeesShort(BigInt(60050))).toBe("₹600.50");
    expect(rupeesShort(BigInt(180000))).toBe("₹1,800");
  });
});

describe("driver app invite words", () => {
  it("never say sent when no channel carried the invite", () => {
    expect(inviteWords([], "9000010023")).toMatch(/not sent/);
    expect(inviteWords([], "9000010023")).not.toMatch(/invite sent/);
    expect(inviteWords(["WhatsApp"], "9000010023")).toBe("Driver app invite sent to 9000010023 by WhatsApp");
  });
});
