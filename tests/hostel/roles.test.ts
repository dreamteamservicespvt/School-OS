// Who may see and do what in Hostel Management, checked on the server
// (05-roles.md: Principal, School Admin and Hostel Warden Full, Vice
// Principal View, everyone else none; and the owner's rules in
// src/lib/duty.ts): the Warden does the daily work in their own hostel only
// and never adds hostels or chooses wardens; the Principal reads every page,
// Hostel Settings included, and reminds the warden instead; the School Admin
// reads every page and keeps Hostel Settings; the Vice Principal reads Rooms
// & Beds, Allocation, Roll Call, Outings, Mess and Hostel Reports; Teachers,
// the Accountant and the Receptionist have no hostel at all. Nobody approves
// their own pass, and hostel fee amounts show only with Fee Management. With
// the module switched off, everything is refused. These call the real
// server actions and export routes as each role.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { requirePermission } from "@/lib/permissions";
import { HOSTEL_PAGES, landingPage, pageOpen } from "@/lib/hostel/access";
import { CATALOGUE } from "@/lib/reports/catalogue";
import { HOSTEL_WIDGETS } from "@/lib/dashboard/widgets/hostel";
import type { Viewer } from "@/lib/dashboard/types";
import "@/lib/hostel/handlers";
import { as, giveBed, hostelFor, makeHostelSchool, type HostelFixture } from "./fixture";

const who = vi.hoisted(() => ({ userId: "", schoolId: "" }));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/flash", async (original) => ({ ...(await original<typeof import("@/lib/flash")>()), flash: async () => {} }));
vi.mock("@/lib/current", () => ({
  requireAction: async (module: string, action: string) => {
    const view = await accessIn(who.userId, who.schoolId);
    if (!view) throw new Error("no access");
    const current = { ...view, user: { id: who.userId, displayName: "Tester" }, ctx: { schoolId: who.schoolId, userId: who.userId }, school: { ...view.school, timeZone: "Asia/Kolkata", name: "Hostel Roles School" } };
    // The real role check runs first, exactly as in src/lib/current.ts.
    const reach = requirePermission(view.permissions, module as never, action as never);
    return { current, reach };
  },
}));

const actions = await import("@/app/(school)/hostel-management/actions");
const roomsExport = await import("@/app/(school)/hostel-management/rooms/export/route");
const allocationExport = await import("@/app/(school)/hostel-management/allocation/export/route");
const reportsExport = await import("@/app/(school)/hostel-management/reports/export/route");

const form = (o: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
  return fd;
};
const get = (mod: { GET: (r: Request) => Promise<Response> }, path: string) => mod.GET(new Request(`http://localhost${path}`));
const PERMISSION = { ok: false, message: expect.stringMatching(/permission/i) };

describe("Hostel Management by role", () => {
  let f: HostelFixture;
  const asUser = (id: string) => { who.userId = id; who.schoolId = f.school.id; };
  const todayIso = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

  beforeAll(async () => {
    f = await makeHostelSchool("Hostel Roles School");
    await giveBed(f, f.ravi, f.bed("B-1", 1).id);
    await giveBed(f, f.meena, f.bed("G-1", 1).id);
  });

  const modes = async (id: string) => {
    const { v } = await hostelFor(f, id);
    return Object.fromEntries(HOSTEL_PAGES.map((p) => [p, v.pages[p]]));
  };

  it("opens only the pages each role works in, full or to read", async () => {
    const all = (m: string) => Object.fromEntries(HOSTEL_PAGES.map((p) => [p, m]));
    expect(await modes(f.warden.id)).toEqual(all("full"));
    expect(await modes(f.principal.id)).toEqual(all("view"));
    expect(await modes(f.admin.id)).toEqual({ ...all("view"), settings: "full" });
    expect(await modes(f.vp.id)).toEqual({ ...all("view"), settings: "hidden" });
    for (const id of [f.teacher.id, f.accountant.id, f.frontdesk.id]) {
      expect(Object.values(await modes(id)).every((m) => m === "hidden")).toBe(true);
    }
    expect(landingPage((await hostelFor(f, f.warden.id)).v)).toBe("rollcall");
    expect(landingPage((await hostelFor(f, f.vp.id)).v)).toBe("rollcall");
    expect(landingPage((await hostelFor(f, f.teacher.id)).v)).toBeNull();
    expect(pageOpen((await hostelFor(f, f.vp.id)).v, "settings")).toBe(false);
  });

  it("gives the daily work to the Warden in their own hostel, Remind to the leaders, and hostels and wardens never to the Warden", async () => {
    const warden = await hostelFor(f, f.warden.id);
    expect(warden.can).toMatchObject({ rooms: true, allocate: true, rollcall: true, outings: true, mess: true, settings: true, hostels: false, remind: false, export: true });
    expect(warden.v.wardenOnly).toBe(true);
    expect(warden.mine).toEqual([f.boys.id]);
    const principal = await hostelFor(f, f.principal.id);
    expect(principal.can).toMatchObject({ rooms: false, allocate: false, rollcall: false, outings: false, mess: false, settings: false, hostels: false, remind: true, export: true });
    expect(principal.mine).toBeNull();
    const admin = await hostelFor(f, f.admin.id);
    expect(admin.can).toMatchObject({ allocate: false, rollcall: false, settings: true, hostels: true, remind: true });
    const vp = await hostelFor(f, f.vp.id);
    expect(vp.can).toMatchObject({ rooms: false, allocate: false, rollcall: false, outings: false, mess: false, settings: false, hostels: false, remind: false });
  });

  it("shows hostel fee amounts only to people with Fee Management", async () => {
    expect((await hostelFor(f, f.warden.id)).can.seeFees).toBe(false);
    expect((await hostelFor(f, f.warden.id)).can.feePlans).toBe(false);
    expect((await hostelFor(f, f.principal.id)).can.seeFees).toBe(true);
    // The warden's residents file has no fees column; the Principal's does.
    asUser(f.warden.id);
    const mine = await (await get(allocationExport, "/hostel-management/allocation/export?format=csv")).text();
    expect(mine).toContain("Ravi Reddy");
    expect(mine).not.toContain("Hostel fees due");
    asUser(f.principal.id);
    expect(await (await get(allocationExport, "/hostel-management/allocation/export?format=csv")).text()).toContain("Hostel fees due");
    // Setting hostel fee plans is refused to the warden on the server.
    asUser(f.warden.id);
    expect(await actions.saveFeePlanAction(null, form({ name: "Warden plan", instLabel: "Term 1", instDue: "2026-11-01", instAmount: "1000" }))).toMatchObject({ ok: false, message: "Your role cannot set hostel fee plans. Ask the hostel warden." });
  });

  it("lets the Warden give a bed, and refuses the Teacher, the Vice Principal and the Principal on the server", async () => {
    const fd = () => form({ studentId: f.arjun.id, bedId: f.bed("B-1", 2).id, startDate: todayIso(), checkedIn: "on", feePlanId: "none" });
    asUser(f.teacher.id);
    expect(await actions.allocateAction(null, fd())).toMatchObject(PERMISSION);
    asUser(f.accountant.id);
    expect(await actions.allocateAction(null, fd())).toMatchObject(PERMISSION);
    asUser(f.vp.id);
    expect(await actions.allocateAction(null, fd())).toMatchObject(PERMISSION);
    asUser(f.principal.id);
    expect(await actions.allocateAction(null, fd())).toMatchObject({ ok: false, message: "Your role cannot give beds. Ask the hostel warden." });
    asUser(f.admin.id);
    expect(await actions.allocateAction(null, fd())).toMatchObject({ ok: false, message: "Your role cannot give beds. Ask the hostel warden." });
    asUser(f.warden.id);
    expect(await actions.allocateAction(null, fd())).toMatchObject({ ok: true });
    expect(await withSchool(as(f, f.warden.id), (tx) => tx.bedAllocation.count({ where: { studentId: f.arjun.id, status: "ACTIVE" } }))).toBe(1);
  });

  it("keeps the Warden to their own hostel: other hostels are refused on the server", async () => {
    asUser(f.gwarden.id);
    expect(await actions.allocateAction(null, form({ studentId: f.kiran.id, bedId: f.bed("B-2", 1).id, startDate: todayIso(), checkedIn: "on", feePlanId: "none" }))).toMatchObject({ ok: false, message: expect.stringMatching(/This is not your hostel/) });
    expect(await actions.addRoomAction(null, form({ hostelId: f.boys.id, floor: "Ground", roomNo: "B-9", beds: "2" }))).toMatchObject({ ok: false, message: expect.stringMatching(/This is not your hostel/) });
    expect(await actions.saveRollCallAction(null, form({ hostelId: f.boys.id, date: todayIso(), session: "MORNING" }))).toMatchObject({ ok: false, message: expect.stringMatching(/This is not your hostel/) });
    expect(await actions.blockBedAction(null, form({ bedId: f.bed("B-2", 2).id, reason: "Broken plank" }))).toMatchObject({ ok: false, message: expect.stringMatching(/This is not your hostel/) });
    // In their own hostel the same work is allowed.
    expect(await actions.addRoomAction(null, form({ hostelId: f.girls.id, floor: "Ground", roomNo: "G-9", beds: "2" }))).toMatchObject({ ok: true });
    // A warden's exports hold their own hostel only.
    const text = await (await get(allocationExport, "/hostel-management/allocation/export?format=csv")).text();
    expect(text).toContain("Meena Reddy");
    expect(text).not.toContain("Ravi Reddy");
  });

  it("never lets the Warden add hostels or choose wardens; the School Admin can", async () => {
    asUser(f.warden.id);
    expect(await actions.saveHostelAction(null, form({ name: "Annexe", gender: "BOYS", floors: "Ground" }))).toMatchObject({ ok: false, message: "Your role cannot add or change hostels. Ask the hostel warden." });
    expect(await actions.setWardensAction(null, form({ hostelId: f.boys.id, staffId: [f.wardenStaff.id], title: ["Warden"] }))).toMatchObject({ ok: false, message: "Your role cannot choose wardens. Ask the hostel warden." });
    asUser(f.principal.id);
    expect(await actions.saveHostelAction(null, form({ name: "Annexe", gender: "BOYS", floors: "Ground" }))).toMatchObject({ ok: false });
    asUser(f.admin.id);
    expect(await actions.saveHostelAction(null, form({ name: "Annexe", gender: "BOYS", floors: "Ground" }))).toMatchObject({ ok: true });
    expect(await actions.saveRulesAction(null, form({ rules: "Lights out at 10 PM." }))).toMatchObject({ ok: true });
    asUser(f.principal.id);
    expect(await actions.saveRulesAction(null, form({ rules: "Changed by the Principal" }))).toMatchObject({ ok: false, message: "Your role cannot change Hostel Settings. Ask the hostel warden." });
    asUser(f.vp.id);
    expect(await actions.saveRulesAction(null, form({ rules: "Changed by the VP" }))).toMatchObject(PERMISSION);
  });

  it("never lets a person approve their own outing pass", async () => {
    const g = await withSchool(as(f, f.warden.id), (tx) => tx.studentGuardian.findFirstOrThrow({ where: { studentId: f.ravi.id } }));
    const tomorrow = new Date(Date.now() + 330 * 60_000 + 86_400_000).toISOString().slice(0, 10);
    asUser(f.warden.id);
    const r = await actions.requestPassAction(null, form({ studentId: f.ravi.id, outingType: "OUTING", fromDate: tomorrow, fromTime: "10:00", toTime: "17:00", guardianId: g.guardianId, reason: "Family lunch" }));
    expect(r).toMatchObject({ ok: true });
    const pass = await withSchool(as(f, f.warden.id), (tx) => tx.gatePass.findFirstOrThrow({ where: { kind: "HOSTEL_OUTING", studentId: f.ravi.id, status: "WAITING" } }));
    expect(await actions.decidePassAction(null, form({ passId: pass.id, decision: "approve" }))).toMatchObject({ ok: false, message: "You asked for this pass, so someone else approves it." });
    // Not marked out before approval, even by the warden.
    expect(await actions.markOutAction(null, form({ passId: pass.id }))).toMatchObject({ ok: false, message: "Outing waiting for approval" });
    // The girls' warden is not this pass's approver.
    asUser(f.gwarden.id);
    expect(await actions.decidePassAction(null, form({ passId: pass.id, decision: "approve" }))).toMatchObject({ ok: false, message: "This pass is waiting for someone else's approval." });
    // The other warden of the hostel approves.
    asUser(f.warden2.id);
    expect(await actions.decidePassAction(null, form({ passId: pass.id, decision: "approve" }))).toMatchObject({ ok: true });
    expect((await withSchool(as(f, f.warden.id), (tx) => tx.gatePass.findUniqueOrThrow({ where: { id: pass.id } }))).status).toBe("APPROVED");
  });

  it("lets the leaders remind the warden, but not the Warden or the Vice Principal", async () => {
    asUser(f.principal.id);
    expect(await actions.remindRollCallAction(null, form({ hostelId: f.girls.id, date: todayIso(), session: "NIGHT" }))).toMatchObject({ ok: true });
    const note = await withSchool(as(f, f.gwarden.id), (tx) => tx.notification.findFirst({ where: { userLoginId: f.gwarden.id, type: "hostel" } }));
    expect(note?.text).toMatch(/night roll call for Girls' Hostel/);
    asUser(f.warden.id);
    expect(await actions.remindRollCallAction(null, form({ hostelId: f.girls.id, date: todayIso(), session: "NIGHT" }))).toMatchObject({ ok: false });
    asUser(f.vp.id);
    expect(await actions.remindRollCallAction(null, form({ hostelId: f.girls.id, date: todayIso(), session: "NIGHT" }))).toMatchObject({ ok: false });
  });

  it("exports only for people who read the hostel", async () => {
    asUser(f.vp.id);
    const rooms = await get(roomsExport, "/hostel-management/rooms/export?format=csv");
    expect(rooms.status).toBe(200);
    expect(await rooms.text()).toContain("B-1");
    expect((await get(reportsExport, "/hostel-management/reports/export?format=csv&r=hostel-occupancy")).status).toBe(200);
    for (const id of [f.teacher.id, f.accountant.id, f.frontdesk.id]) {
      asUser(id);
      expect((await get(roomsExport, "/hostel-management/rooms/export?format=csv")).status).toBe(403);
    }
  });

  it("puts the warden's widgets on the warden's home and the totals on the leaders'", () => {
    const v = (perms: Viewer["permissions"], roles: string[]) => ({ permissions: perms, roles: roles.map((key) => ({ key })), user: { id: "x" } }) as unknown as Viewer;
    const full = { "hostel-management": { see: "all", change: "all" } } as unknown as Viewer["permissions"];
    const out = HOSTEL_WIDGETS.find((w) => w.id === "hostel.out-now")!;
    expect(out.allowed ? out.allowed(v(full, ["hostel-warden"])) : true).toBe(true);
    const beds = HOSTEL_WIDGETS.find((w) => w.id === "hostel.beds")!;
    expect(beds.allowed ? beds.allowed(v(full, ["principal"])) : true).toBe(true);
    const none = { "hostel-management": { see: "none", change: "none" } } as unknown as Viewer["permissions"];
    for (const w of HOSTEL_WIDGETS) expect(w.allowed ? w.allowed(v(none, ["teacher"])) : false, w.id).toBe(false);
  });

  it("lists the hostel reports in the Reports & Analytics catalogue", () => {
    const keys = CATALOGUE.filter((e) => e.category === "Hostel").map((e) => e.key);
    expect(keys).toEqual(expect.arrayContaining(["hostel-occupancy", "hostel-absences", "hostel-outings", "hostel-outings-month", "hostel-incidents", "hostel-visitors", "hostel-mess"]));
  });

  it("refuses everything when the school switches the hostel off", async () => {
    await withSchool({ schoolId: f.school.id, userId: null }, (tx) => tx.schoolModule.update({ where: { schoolId_moduleKey: { schoolId: f.school.id, moduleKey: "hostel-management" } }, data: { isOn: false } }));
    asUser(f.warden.id);
    expect(await actions.allocateAction(null, form({ studentId: f.kiran.id, bedId: f.bed("B-2", 1).id, startDate: todayIso(), checkedIn: "on", feePlanId: "none" }))).toMatchObject({ ok: false, message: expect.stringMatching(/switched off/) });
    expect((await get(roomsExport, "/hostel-management/rooms/export?format=csv")).status).toBe(404);
    await withSchool({ schoolId: f.school.id, userId: null }, (tx) => tx.schoolModule.update({ where: { schoolId_moduleKey: { schoolId: f.school.id, moduleKey: "hostel-management" } }, data: { isOn: true } }));
  });
});
