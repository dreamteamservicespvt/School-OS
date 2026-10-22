// Who may do what in Front Office, checked on the server (05-roles.md and the
// approved design's role rules of 12 to 14 Oct 2026): the Receptionist runs
// the desk; the Principal reads Visitors and Enquiries & Calls and books
// appointments; the School Admin reads every page but the Reception Desk; the
// Vice Principal reads Visitors and Appointments; Office Staff see only
// Visitors and Student Pickup; Gate Security registers visitors and checks
// passes but exports nothing. Office Staff and Gate Security see visitors'
// phones masked, and a role without "see parent phone numbers" sees only the
// last 4 digits of parents' numbers, also in the export. These call the real
// server actions and export routes as each role.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { requirePermission } from "@/lib/permissions";
import { FO_PAGES, foLanding, foPageAllowed, type FoPageKey } from "@/lib/front-office/access";
import { registerVisitor } from "@/lib/front-office/visitors";
import { logCall } from "@/lib/front-office/calls";
import { FRONT_OFFICE_WIDGETS } from "@/lib/dashboard/widgets/front-office";
import type { Viewer } from "@/lib/dashboard/types";
import { as, currentOf, foFor, makeFrontOfficeSchool, TZ, type FoFixture } from "./fixture";

const who = vi.hoisted(() => ({ userId: "", schoolId: "" }));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/flash", async (original) => ({ ...(await original<typeof import("@/lib/flash")>()), flash: async () => {} }));
vi.mock("@/lib/current", () => ({
  requireAction: async (module: string, action: string) => {
    const view = await accessIn(who.userId, who.schoolId);
    if (!view) throw new Error("no access");
    const current = { ...view, user: { id: who.userId, displayName: "Tester" }, ctx: { schoolId: who.schoolId, userId: who.userId } };
    // The real role check runs first, exactly as in src/lib/current.ts.
    const reach = requirePermission(view.permissions, module as never, action as never);
    return { current, reach };
  },
}));

const actions = await import("@/app/(school)/front-office/actions");
const visitorExport = await import("@/app/(school)/front-office/visitors/export/route");
const gateExport = await import("@/app/(school)/front-office/visitors/gate-export/route");
const callExport = await import("@/app/(school)/front-office/enquiries/export/route");
const postalExport = await import("@/app/(school)/front-office/postal/export/route");
const apptExport = await import("@/app/(school)/front-office/appointments/export/route");

const form = (o: Record<string, string>) => { const fd = new FormData(); for (const [k, v] of Object.entries(o)) fd.set(k, v); return fd; };
const get = (mod: { GET: (r: Request) => Promise<Response> }, path: string) => mod.GET(new Request(`http://localhost${path}`));

describe("Front Office by role", () => {
  let f: FoFixture;
  let expiredId = "";
  const asUser = (id: string) => { who.userId = id; who.schoolId = f.school.id; };

  beforeAll(async () => {
    f = await makeFrontOfficeSchool("Front Office Roles School");
    const desk = as(f, f.frontdesk.id);
    // A visitor from yesterday whose pass expired without a check-out, and a parent's call today.
    const y = new Date(Date.now() - 86_400_000);
    const r = await withSchool(desk, (tx) => registerVisitor(tx, desk, { phone: "9866321450", name: "Venu Gopal", purpose: "Delivery", meetStaffId: null, note: null, peopleCount: 1, photo: null, idProofType: null, idProofNo: null, vehicleNo: "TS 08 EZ 4410" }, { timeZone: TZ, now: y }));
    expiredId = r.visitor.id;
    await withSchool(desk, async (tx) => {
      await tx.visitorEntry.update({ where: { id: expiredId }, data: { passExpiresAt: new Date(y.getTime() + 60_000) } });
      await tx.schoolFeature.createMany({ data: [{ schoolId: f.school.id, featureKey: "front-office-gate-log", isOn: true }, { schoolId: f.school.id, featureKey: "front-office-postal", isOn: true }] });
    });
    const current = await currentOf(f, f.frontdesk.id);
    await withSchool(desk, (tx) => logCall(tx, desk, current, { direction: "IN", phone: "9849031277", name: "Rajesh Sharma", purpose: "Fee", note: "Asked for the Q3 amount", childName: null, classId: null, followUp: null }, { timeZone: TZ }));
  });

  const pagesOf = async (id: string) => { const { v } = await foFor(f, id); return (Object.keys(FO_PAGES) as FoPageKey[]).filter((k) => foPageAllowed(v, k)); };

  it("opens only the pages each role works in", async () => {
    expect(await pagesOf(f.frontdesk.id)).toEqual(["desk", "visitors", "pickup", "enquiries", "appointments", "postal"]);
    expect(await pagesOf(f.custom.id)).toEqual(["desk", "visitors", "pickup", "enquiries", "appointments", "postal"]);
    expect(await pagesOf(f.principal.id)).toEqual(["visitors", "enquiries", "appointments"]);
    expect(await pagesOf(f.admin.id)).toEqual(["visitors", "pickup", "enquiries", "appointments", "postal"]);
    expect(await pagesOf(f.vp.id)).toEqual(["visitors", "appointments"]);
    expect(await pagesOf(f.office.id)).toEqual(["visitors", "pickup"]);
    expect(await pagesOf(f.gate.id)).toEqual(["visitors", "pickup"]);
    expect(await pagesOf(f.teacher.id)).toEqual([]);
  });

  it("opens the menu link straight on a page the role can see, with no redirect on the way (QA PERF-01)", async () => {
    const landing = async (id: string) => foLanding((await foFor(f, id)).v);
    expect(await landing(f.frontdesk.id)).toBe("/front-office");
    for (const id of [f.principal.id, f.admin.id, f.vp.id, f.office.id, f.gate.id]) expect(await landing(id)).toBe("/front-office/visitors");
    expect(await landing(f.teacher.id)).toBeNull();
  });

  it("gives desk work only to the desk, booking to the Principal too, and masks phones for Office Staff and Gate Security", async () => {
    const c = async (id: string) => (await foFor(f, id)).can;
    expect(await c(f.frontdesk.id)).toMatchObject({ desk: true, register: true, release: true, book: true, remind: false, manage: false, visitorPhones: true, parentPhones: true });
    expect(await c(f.principal.id)).toMatchObject({ desk: false, register: false, release: false, book: true, remind: true, manage: true, visitorPhones: true });
    expect(await c(f.admin.id)).toMatchObject({ desk: false, register: false, release: false, book: false, remind: true, manage: true });
    expect(await c(f.vp.id)).toMatchObject({ desk: false, register: false, book: false, remind: true, manage: false, visitorPhones: true });
    expect(await c(f.office.id)).toMatchObject({ desk: false, register: false, release: false, visitorPhones: false, export: true });
    expect(await c(f.gate.id)).toMatchObject({ desk: false, register: true, checkOut: true, gateWork: true, release: false, visitorPhones: false, pickupPhones: false, export: false, exportGate: false });
    expect(await c(f.custom.id)).toMatchObject({ desk: true, parentPhones: false });
  });

  it("refuses desk work on the server for roles that do not do it", async () => {
    const visitorForm = () => form({ phone: "9700000011", name: "Refused Visitor", purpose: "Delivery", peopleCount: "1" });
    for (const id of [f.office.id, f.vp.id, f.principal.id, f.admin.id, f.teacher.id]) {
      asUser(id);
      const r = await actions.registerVisitorAction(null, visitorForm());
      expect(r?.ok, `register as ${id}`).toBe(false);
    }
    expect(await withSchool(as(f, f.frontdesk.id), (tx) => tx.visitorEntry.count({ where: { name: "Refused Visitor" } }))).toBe(0);

    const release = form({ studentId: f.aarav.id, guardianId: f.father.id, photoMatch: "on", reason: "Unwell" });
    for (const id of [f.gate.id, f.office.id, f.principal.id, f.admin.id]) {
      asUser(id);
      const r = await actions.releaseAction(null, release);
      expect(r?.ok).toBe(false);
    }
    asUser(f.gate.id);
    expect((await actions.releaseAction(null, release))?.message).toBe("Your role cannot release students. Ask the front desk or your School Admin.");
    expect(await withSchool(as(f, f.frontdesk.id), (tx) => tx.gatePass.count())).toBe(0);

    for (const id of [f.principal.id, f.admin.id, f.gate.id]) {
      asUser(id);
      expect((await actions.logCallAction(null, form({ direction: "IN", phone: "9700000012", name: "Caller", purpose: "Other" })))?.ok).toBe(false);
      expect((await actions.walkInAction(null, form({ fromName: "Walk In", request: "Fee statement", department: "Accounts", givenBy: "slip" })))?.ok).toBe(false);
      expect((await actions.addNoteAction(null, form({ text: "Principal out till 12" })))?.ok).toBe(false);
      expect((await actions.postalAction(null, form({ direction: "RECEIVED", itemType: "COURIER", party: "Blue Dart", for: "Office" })))?.ok).toBe(false);
    }
    const counts = await withSchool(as(f, f.frontdesk.id), async (tx) => [await tx.callLogEntry.count({ where: { name: "Caller" } }), await tx.walkInRequest.count(), await tx.frontOfficeNote.count(), await tx.postalEntry.count()]);
    expect(counts).toEqual([0, 0, 0, 0]);
  });

  it("lets the Principal book appointments but not the School Admin or the Vice Principal", async () => {
    // The next day that is not a Sunday, so the test does not depend on the day it runs.
    let ahead = Date.now() + 86_400_000;
    if (new Date(ahead).getUTCDay() === 0) ahead += 86_400_000;
    const tomorrow = new Date(ahead).toISOString().slice(0, 10);
    const book = (startMin: number) => form({ staffId: f.principalStaff.id, date: tomorrow, startMin: String(startMin), lengthMin: "15", visitorName: "Padmini Rao", visitorPhone: "9701230098", purpose: "Behaviour in class" });
    for (const id of [f.admin.id, f.vp.id, f.office.id, f.gate.id]) {
      asUser(id);
      expect((await actions.bookAction(null, book(10 * 60)))?.ok).toBe(false);
    }
    asUser(f.principal.id);
    const ok = await actions.bookAction(null, book(10 * 60));
    expect(ok?.ok, ok?.message).toBe(true);
  });

  it("lets the Principal, School Admin and Vice Principal remind the desk about an expired pass, and nobody else", async () => {
    for (const id of [f.frontdesk.id, f.office.id, f.gate.id]) {
      asUser(id);
      expect((await actions.remindDeskAction(null, form({ visitorId: expiredId })))?.ok).toBe(false);
    }
    asUser(f.vp.id);
    const r = await actions.remindDeskAction(null, form({ visitorId: expiredId }));
    expect(r?.ok, r?.message).toBe(true);
    const n = await withSchool(as(f, f.frontdesk.id), (tx) => tx.notification.findFirst({ where: { userLoginId: f.frontdesk.id, type: "visitor-pass-open" } }));
    expect(n?.text).toContain("Venu Gopal");
  });

  it("refuses Front Office settings to everyone but the Principal and School Admin", async () => {
    for (const id of [f.frontdesk.id, f.vp.id, f.office.id, f.gate.id]) {
      asUser(id);
      expect((await actions.settingsAction(null, form({ idProofRequired: "on", slotMinutes: "15" })))?.ok).toBe(false);
    }
    asUser(f.admin.id);
    expect((await actions.settingsAction(null, form({ slotMinutes: "15", "front-office-gate-log": "on", "front-office-postal": "on" })))?.ok).toBe(true);
  });

  it("lets Gate Security export nothing, not even the gate log", async () => {
    asUser(f.gate.id);
    expect((await get(gateExport, "/front-office/visitors/gate-export?format=csv")).status).toBe(403);
    expect((await get(visitorExport, "/front-office/visitors/export?format=csv")).status).toBe(403);
    expect((await get(callExport, "/front-office/enquiries/export?format=csv")).status).toBe(403);
    asUser(f.frontdesk.id);
    expect((await get(gateExport, "/front-office/visitors/gate-export?format=csv")).status).toBe(200);
  });

  it("keeps exports to the pages a role can open", async () => {
    asUser(f.office.id);
    expect((await get(callExport, "/front-office/enquiries/export?format=csv")).status).toBe(403);
    expect((await get(postalExport, "/front-office/postal/export?format=csv")).status).toBe(403);
    expect((await get(apptExport, "/front-office/appointments/export?format=csv")).status).toBe(403);
    asUser(f.vp.id);
    expect((await get(callExport, "/front-office/enquiries/export?format=csv")).status).toBe(403);
    expect((await get(apptExport, "/front-office/appointments/export?format=csv")).status).toBe(200);
    asUser(f.teacher.id);
    expect((await get(visitorExport, "/front-office/visitors/export?format=csv")).status).toBe(403);
  });

  it("masks visitors' phones for Office Staff, also in the export", async () => {
    const period = "period=custom&from=2026-01-01&to=2030-12-31";
    asUser(f.office.id);
    const masked = await (await get(visitorExport, `/front-office/visitors/export?format=csv&${period}`)).text();
    expect(masked).toContain("••••••1450");
    expect(masked).not.toContain("98663");
    asUser(f.frontdesk.id);
    const full = await (await get(visitorExport, `/front-office/visitors/export?format=csv&${period}`)).text();
    expect(full).toContain("98663 21450");
  });

  it("shows only the last 4 digits of parents' numbers in the call log export without the permission (Done when 10)", async () => {
    asUser(f.custom.id);
    const masked = await (await get(callExport, "/front-office/enquiries/export?format=csv")).text();
    expect(masked).toContain("Rajesh Sharma");
    expect(masked).toContain("••••••1277");
    expect(masked).not.toContain("98490");
    // Searching by a parent's number finds nothing for them, so it cannot be guessed digit by digit.
    const searched = await (await get(callExport, "/front-office/enquiries/export?format=csv&q=31277")).text();
    expect(searched).not.toContain("Rajesh Sharma");
    asUser(f.frontdesk.id);
    const full = await (await get(callExport, "/front-office/enquiries/export?format=csv")).text();
    expect(full).toContain("98490 31277");
  });

  it("shows desk to-do cards only to the desk", () => {
    const v = (perms: Viewer["permissions"], roles: string[]) => ({ permissions: perms, roles: roles.map((key) => ({ key })), user: { id: "x" } }) as unknown as Viewer;
    const full = { "front-office": { see: "all", change: "all" } } as unknown as Viewer["permissions"];
    for (const w of FRONT_OFFICE_WIDGETS.filter((x) => x.allowed && x.module === "front-office")) {
      expect(w.allowed!(v(full, ["receptionist"])), w.id).toBe(true);
      expect(w.allowed!(v(full, ["principal"])), w.id).toBe(false);
    }
  });

  it("records the changes that were allowed in the audit log", async () => {
    const audits = await withSchool(as(f, f.frontdesk.id), (tx) => tx.auditLogEntry.count({ where: { recordType: { in: ["Visitor Entry", "Call Log Entry", "Appointment"] } } }));
    expect(audits).toBeGreaterThanOrEqual(3);
  });
});
