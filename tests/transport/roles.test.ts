// Who may do what in Transport Management, checked on the server (05-roles.md
// column 12 and src/lib/transport/access.ts): the Transport In-charge works
// every page; the Principal reads every page; the School Admin reads every
// page and keeps Transport Settings; the Vice Principal reads every page but
// Transport Settings; a driver sees only Trips (his own, and the driver app);
// a Teacher or an Accountant sees nothing. These call the real server actions,
// the export route and the driver API as each person, so a hidden button is
// also a refused request.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { requirePermission } from "@/lib/permissions";
import { PAGES, type PageKey } from "@/lib/transport/words";
import { pageAllowed } from "@/lib/transport/access";
import { issueDriverKey, revokeDriverKey } from "@/lib/transport/fleet";
import { ensureTrips } from "@/lib/transport/trips";
import { TRANSPORT_WIDGETS } from "@/lib/dashboard/widgets/transport";
import { makeTransportSchool, today, trFor, STOP1, type TrFixture } from "./fixture";

const who = vi.hoisted(() => ({ userId: "", schoolId: "" }));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/navigation", () => ({ redirect: () => {}, notFound: () => { throw new Error("not found"); } }));
vi.mock("@/lib/flash", async (original) => ({ ...(await original<typeof import("@/lib/flash")>()), flash: async () => {} }));
vi.mock("@/lib/current", () => {
  const currentNow = async () => {
    if (!who.userId) return null;
    const view = await accessIn(who.userId, who.schoolId);
    if (!view) return null;
    return { ...view, user: { id: who.userId, displayName: "Tester" }, ctx: { schoolId: who.schoolId, userId: who.userId } };
  };
  return {
    getCurrent: currentNow,
    requireCurrent: async () => {
      const c = await currentNow();
      if (!c) throw new Error("not signed in");
      return c;
    },
    isPaused: (c: { schoolStatus: string }) => c.schoolStatus === "SUSPENDED" || c.schoolStatus === "CLOSED",
    requireAction: async (module: string, action: string) => {
      const current = await currentNow();
      if (!current) throw new Error("no access");
      // The real role check runs first, exactly as in src/lib/current.ts.
      const reach = requirePermission(current.permissions, module as never, action as never);
      return { current, reach };
    },
  };
});

const actions = await import("@/app/(school)/transport-management/actions");
const exporter = await import("@/app/(school)/transport-management/export/route");
const driverApi = await import("@/app/api/v1/transport/driver/[action]/route");

const form = (o: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of [v].flat()) fd.append(k, x);
  return fd;
};
const api = (action: string, opts: { key?: string; schoolId?: string; body?: object; method?: "GET" | "POST" } = {}) => {
  const method = opts.method ?? (opts.body ? "POST" : "GET");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.key) headers.authorization = `Bearer ${opts.key}`;
  else headers["sec-fetch-site"] = "same-origin";
  const req = new Request(`http://localhost/api/v1/transport/driver/${action}${opts.schoolId ? `?s=${opts.schoolId}` : ""}`, { method, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  const params = { params: Promise.resolve({ action }) };
  return method === "GET" ? driverApi.GET(req, params) : driverApi.POST(req, params);
};

describe("Transport Management by role", () => {
  let f: TrFixture;
  const asUser = (id: string) => { who.userId = id; who.schoolId = f.school.id; };
  let rameshTrip = "";
  let srinuTrip = "";

  beforeAll(async () => {
    f = await makeTransportSchool("Transport Roles School");
    await withSchool(f.ctx, (tx) => ensureTrips(tx, f.ctx, today()));
    const trips = await withSchool(f.ctx, (tx) => tx.trip.findMany({ where: { date: today(), kind: "MORNING" } }));
    rameshTrip = trips.find((t) => t.routeId === f.route1.id)!.id;
    srinuTrip = trips.find((t) => t.routeId === f.route2.id)!.id;
  });

  const pagesOf = async (id: string) => {
    const { v } = await trFor(f, id);
    return Object.fromEntries(PAGES.filter((p) => pageAllowed(v, p.key)).map((p) => [p.key, v.pages[p.key]])) as Partial<Record<PageKey, string>>;
  };

  it("opens only the pages each role works in, and nothing while Transport is off", async () => {
    const all = (mode: string) => Object.fromEntries(PAGES.map((p) => [p.key, mode]));
    expect(await pagesOf(f.incharge.id)).toEqual(all("full"));
    expect(await pagesOf(f.principal.id)).toEqual(all("view"));
    expect(await pagesOf(f.admin.id)).toEqual({ ...all("view"), settings: "full" });
    const { settings: _s, ...vpPages } = all("view");
    expect(await pagesOf(f.vp.id)).toEqual(vpPages);
    expect(await pagesOf(f.rameshLogin.id)).toEqual({ trips: "view" });
    expect(await pagesOf(f.teacher.id)).toEqual({});
    expect(await pagesOf(f.accountant.id)).toEqual({});

    // Live Tracking hides when the school has not switched live tracking on.
    await withSchool(f.sys, (tx) => tx.schoolFeature.updateMany({ where: { featureKey: "transport-live-tracking" }, data: { isOn: false } }));
    expect((await pagesOf(f.incharge.id)).live).toBeUndefined();
    await withSchool(f.sys, (tx) => tx.schoolFeature.updateMany({ where: { featureKey: "transport-live-tracking" }, data: { isOn: true } }));

    const off = await makeTransportSchool("Transport Off School", { on: false });
    const { v } = await trFor(off, off.incharge.id);
    expect(PAGES.filter((p) => pageAllowed(v, p.key))).toEqual([]);
  });

  it("gives the work only to the In-charge; leaders oversee and remind; everyone who reads may export", async () => {
    const c = async (id: string) => (await trFor(f, id)).can;
    const incharge = await c(f.incharge.id);
    expect([incharge.routes, incharge.fleet, incharge.students, incharge.trips, incharge.live, incharge.settings, incharge.export, incharge.vendorBank, incharge.remind]).toEqual([true, true, true, true, true, true, true, true, false]);
    const principal = await c(f.principal.id);
    expect([principal.routes, principal.fleet, principal.students, principal.trips, principal.settings, principal.export, principal.remind, principal.emergencyMessage]).toEqual([false, false, false, false, false, true, true, true]);
    const admin = await c(f.admin.id);
    expect([admin.routes, admin.students, admin.trips, admin.settings, admin.export, admin.remind]).toEqual([false, false, false, true, true, true]);
    const vp = await c(f.vp.id);
    expect([vp.routes, vp.students, vp.trips, vp.settings, vp.export, vp.vendorBank]).toEqual([false, false, false, false, true, false]);
    const driver = await c(f.rameshLogin.id);
    expect([driver.routes, driver.trips, driver.settings, driver.export, driver.reports]).toEqual([false, false, false, false, false]);
  });

  it("shows the dashboard widgets only to those who see all of Transport", async () => {
    for (const w of TRANSPORT_WIDGETS) {
      const view = async (id: string) => { const a = (await accessIn(id, f.school.id))!; return w.allowed?.(a as never) ?? true; };
      expect(await view(f.incharge.id)).toBe(true);
      expect(await view(f.vp.id)).toBe(true);
      expect(await view(f.teacher.id)).toBe(false);
      expect(await view(f.rameshLogin.id)).toBe(false);
    }
  });

  it("refuses changes on the server to roles that only read, or have no Transport", async () => {
    const route = { name: "Moosapet", feeMode: "stop" };
    for (const id of [f.teacher.id, f.accountant.id, f.vp.id, f.principal.id, f.rameshLogin.id]) {
      asUser(id);
      expect((await actions.addRouteAction(null, form(route)))?.ok).toBe(false);
      expect((await actions.assignAction(null, form({ studentIds: f.students[0].id, routeId: f.route1.id, stopId: f.stop1.id, fromDate: "2026-06-15" })))?.ok).toBe(false);
      expect((await actions.saveSettingsAction(null, form({ section: "Live tracking", locationIntervalSec: "45" })))?.ok).toBe(false);
      expect((await actions.startTripAction(null, form({ tripId: rameshTrip })))?.ok).toBe(false);
    }
    // Nothing was made by those refusals.
    const run = <T,>(fn: Parameters<typeof withSchool<T>>[1]) => withSchool(f.sys, fn);
    expect(await run((tx) => tx.route.count({ where: { name: "Moosapet" } }))).toBe(0);
    expect(await run((tx) => tx.transportAssignment.count())).toBe(0);
    expect((await run((tx) => tx.trip.findUniqueOrThrow({ where: { id: rameshTrip } }))).status).toBe("SCHEDULED");

    // The School Admin keeps Transport Settings; the In-charge does the work.
    asUser(f.admin.id);
    expect((await actions.saveSettingsAction(null, form({ section: "Live tracking", locationIntervalSec: "45" })))?.ok).toBe(true);
    asUser(f.incharge.id);
    expect((await actions.addRouteAction(null, form(route)))?.ok).toBe(true);
    expect((await actions.assignAction(null, form({ studentIds: f.students[0].id, routeId: f.route1.id, stopId: f.stop1.id, fromDate: "2026-06-15" })))?.ok).toBe(true);
    expect(await run((tx) => tx.route.count({ where: { name: "Moosapet" } }))).toBe(1);
    expect(await run((tx) => tx.transportAssignment.count())).toBe(1);

    // A leader who only reads (src/lib/duty.ts) may remind the In-charge instead; others may not.
    const remind = () => actions.remindAction(null, form({ text: "Please renew Bus 1's insurance before it runs out.", link: "/transport-management/vehicles" }));
    for (const id of [f.principal.id, f.vp.id]) { asUser(id); expect((await remind())?.ok).toBe(true); }
    for (const id of [f.incharge.id, f.teacher.id, f.rameshLogin.id]) { asUser(id); expect((await remind())?.ok).toBe(false); }
  });

  it("lets readers export what they can see, and refuses everyone else", async () => {
    const get = (list: string) => exporter.GET(new Request(`http://localhost/transport-management/export?list=${list}&format=csv`));
    asUser(f.vp.id);
    expect((await get("routes")).status).toBe(200);
    expect((await get("vehicles")).status).toBe(200);
    asUser(f.incharge.id);
    expect((await get("students")).status).toBe(200);
    asUser(f.teacher.id);
    expect((await get("routes")).status).toBe(403);
    asUser(f.rameshLogin.id);
    expect((await get("routes")).status).toBe(403);
    // Every export is in the audit log.
    expect(await withSchool(f.sys, (tx) => tx.auditLogEntry.count({ where: { action: "exported" } }))).toBeGreaterThanOrEqual(3);
  });

  describe("the driver API", () => {
    let rameshKey = "";
    beforeAll(async () => {
      rameshKey = (await withSchool(f.ctx, (tx) => issueDriverKey(tx, f.ctx, f.ramesh.id, "Ramesh's phone"))).key;
      who.userId = "";
    });

    it("works with the phone's key, only for the driver's own trips today", async () => {
      const list = await api("trips", { key: rameshKey, schoolId: f.school.id });
      expect(list.status).toBe(200);
      const body = await list.json();
      expect(body.trips.map((t: { id: string }) => t.id)).toContain(rameshTrip);
      expect(body.trips.map((t: { id: string }) => t.id)).not.toContain(srinuTrip);

      expect((await api("start", { key: rameshKey, schoolId: f.school.id, body: { tripId: srinuTrip } })).status).toBe(409);
      expect((await api("start", { key: rameshKey, schoolId: f.school.id, body: { tripId: rameshTrip } })).status).toBe(200);
      const pts = await api("points", { key: rameshKey, schoolId: f.school.id, body: { tripId: rameshTrip, points: [{ at: new Date(Date.now() - 20_000).toISOString(), ...STOP1, speed: 20, accuracy: 10 }] } });
      expect(pts.status).toBe(200);
      expect((await pts.json()).accepted).toBe(1);
      // Only the key's hash is kept.
      const dev = await withSchool(f.sys, (tx) => tx.driverDevice.findFirstOrThrow({ where: { driverId: f.ramesh.id } }));
      expect(dev.keyHash).not.toContain(rameshKey);
      expect(JSON.stringify(dev)).not.toContain(rameshKey);
    });

    it("refuses a missing, wrong, turned-off or other school's key, and bad bodies", async () => {
      expect((await api("trips")).status).toBe(401);
      expect((await api("trips", { key: "sosdrv_not-a-real-key-at-all-000000", schoolId: f.school.id })).status).toBe(401);
      const other = await makeTransportSchool("Transport Key Other School");
      expect((await api("trips", { key: rameshKey, schoolId: other.school.id })).status).toBe(401);
      expect((await api("start", { key: rameshKey, schoolId: f.school.id, body: { tripId: "nope" } })).status).toBe(400);
      expect((await api("fly", { key: rameshKey, schoolId: f.school.id, body: { tripId: rameshTrip } })).status).toBe(404);
      const tooMany = Array.from({ length: 501 }, () => ({ at: new Date().toISOString(), ...STOP1 }));
      expect((await api("points", { key: rameshKey, schoolId: f.school.id, body: { tripId: rameshTrip, points: tooMany } })).status).toBe(409);

      const second = await withSchool(f.ctx, (tx) => issueDriverKey(tx, f.ctx, f.ramesh.id, "Spare phone"));
      expect((await api("trips", { key: second.key, schoolId: f.school.id })).status).toBe(200);
      await withSchool(f.ctx, (tx) => revokeDriverKey(tx, f.ctx, second.device.id));
      expect((await api("trips", { key: second.key, schoolId: f.school.id })).status).toBe(401);
    });

    it("refuses every call while Transport is switched off for the school", async () => {
      await withSchool(f.sys, (tx) => tx.schoolModule.update({ where: { schoolId_moduleKey: { schoolId: f.school.id, moduleKey: "transport-management" } }, data: { isOn: false } }));
      try {
        expect((await api("trips", { key: rameshKey, schoolId: f.school.id })).status).toBe(403);
        asUser(f.srinuLogin.id);
        expect((await api("trips")).status).toBe(403);
        asUser(f.incharge.id);
        expect((await actions.addRouteAction(null, form({ name: "While off", feeMode: "stop" })))?.ok).toBe(false);
      } finally {
        await withSchool(f.sys, (tx) => tx.schoolModule.update({ where: { schoolId_moduleKey: { schoolId: f.school.id, moduleKey: "transport-management" } }, data: { isOn: true } }));
        who.userId = "";
      }
    });

    it("works for a signed-in driver from this site, and refuses other logins and other sites", async () => {
      asUser(f.srinuLogin.id);
      const list = await api("trips");
      expect(list.status).toBe(200);
      expect((await list.json()).trips.map((t: { id: string }) => t.id)).toEqual(expect.arrayContaining([srinuTrip]));
      expect((await api("start", { body: { tripId: rameshTrip } })).status).toBe(409);
      // A post from another site with the driver's cookie is refused.
      const cross = new Request("http://localhost/api/v1/transport/driver/emergency", { method: "POST", headers: { "sec-fetch-site": "cross-site", "content-type": "application/json" }, body: JSON.stringify({ tripId: srinuTrip }) });
      expect((await driverApi.POST(cross, { params: Promise.resolve({ action: "emergency" }) })).status).toBe(403);

      for (const id of [f.incharge.id, f.principal.id, f.teacher.id]) {
        asUser(id);
        expect((await api("trips")).status).toBe(403);
      }
      who.userId = "";
    });

    it("slows down a phone that sends too much", async () => {
      const k = (await withSchool(f.ctx, (tx) => issueDriverKey(tx, f.ctx, f.srinu.id, "Busy phone"))).key;
      const codes: number[] = [];
      for (let i = 0; i < 92; i++) codes.push((await api("trips", { key: k, schoolId: f.school.id })).status);
      expect(codes.slice(0, 90).every((s) => s === 200)).toBe(true);
      expect(codes.at(-1)).toBe(429);
    });
  });
});
