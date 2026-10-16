// A hostel maintenance incident raises a maintenance request in Inventory
// Management (15 Roll Call & Incidents, 14 Rooms, Labs & Maintenance): the
// request is Inventory's own (numbered, the store keeper told), the place is
// the hostel (added to the facility register once) or a place from the
// register, once per incident, only for a maintenance incident, only in the
// warden's own hostel, and only while Inventory Management is switched on.
import { beforeAll, describe, expect, it } from "vitest";
import type { Tx } from "@/lib/db";
import { withSchool } from "@/lib/db";
import { recordIncident } from "@/lib/hostel/incidents";
import { raiseFromIncident } from "@/lib/hostel/maintenance";
import { assertHostel } from "@/lib/hostel/scope";
import { addRoom } from "@/lib/academic/rooms";
import { TZ, anyHostel, as, giveBed, hostelFor, ist, makeHostelSchool, type HostelFixture } from "./fixture";

describe("raising a maintenance request from a hostel incident", () => {
  let f: HostelFixture;
  const W = () => as(f, f.warden.id);
  const run = <T,>(fn: (tx: Tx) => Promise<T>, ctx = W()) => withSchool(ctx, fn);
  const opts = { now: ist("2026-10-12", 21), tz: TZ, assertHostel: anyHostel, mayAddBehaviour: false };
  const maint = (place: string, description: string, ctx = W(), hostelId?: string) => run((tx) => recordIncident(tx, ctx, { type: "MAINTENANCE", studentIds: [], hostelId: hostelId ?? f.boys.id, place, description, at: ist("2026-10-12", 20), actionTaken: null, informParent: false, behaviourTypeKey: null }, opts), ctx);

  beforeAll(async () => {
    f = await makeHostelSchool("Hostel Maintenance Test School");
    await withSchool({ schoolId: f.school.id, userId: null }, (tx) => tx.schoolModule.upsert({ where: { schoolId_moduleKey: { schoolId: f.school.id, moduleKey: "inventory-management" } }, create: { schoolId: f.school.id, moduleKey: "inventory-management", isOn: true }, update: { isOn: true } }));
  });

  it("raises Inventory's request for the hostel, adding the hostel to the facility register once", async () => {
    const a = await maint("Room B-12, ceiling fan", "Fan not working since evening");
    const r = await run((tx) => raiseFromIncident(tx, W(), a.incident.id, { placeId: `hostel:${f.boys.id}`, priority: "HIGH", photoFileId: null }, { assertHostel: anyHostel, inventoryOn: true }));
    expect(r.request.number).toMatch(/^MR-\d{4}$/);
    expect(r.request).toMatchObject({ problem: "Room B-12, ceiling fan: Fan not working since evening", priority: "HIGH", status: "OPEN", raisedById: f.warden.id });
    expect(r.room.name).toBe(f.boys.name);
    const facility = await run((tx) => tx.facility.findUnique({ where: { roomId: r.room.id } }));
    expect(facility?.type).toBe("Other");
    const inc = await run((tx) => tx.hostelIncident.findUniqueOrThrow({ where: { id: a.incident.id } }));
    expect(inc.maintenanceRequestId).toBe(r.request.id);

    // A second incident in the same hostel uses the same place.
    const b = await maint("Room B-14, tap", "Bathroom tap leaking");
    const r2 = await run((tx) => raiseFromIncident(tx, W(), b.incident.id, { placeId: `hostel:${f.boys.id}`, priority: "NORMAL", photoFileId: null }, { assertHostel: anyHostel, inventoryOn: true }));
    expect(r2.room.id).toBe(r.room.id);
    expect(await run((tx) => tx.room.count({ where: { name: f.boys.name } }))).toBe(1);

    // The store keeper (here the School Admin, as no store keeper is set) is told; it is all audited.
    const told = await run((tx) => tx.notification.findFirst({ where: { userLoginId: f.admin.id, type: "maintenance" } }), as(f, f.admin.id));
    expect(told?.text).toMatch(new RegExp(`${r.request.number}|2 new maintenance requests`));
    const audit = await run((tx) => tx.auditLogEntry.findMany({ where: { OR: [{ recordType: "Hostel Incident", recordId: a.incident.id }, { recordType: "Maintenance Request", recordId: r.request.id }] } }));
    expect(audit.map((x) => x.action)).toEqual(expect.arrayContaining(["created", "maintenance-request-raised", "raised"]));
  });

  it("raises once per incident, and only for a maintenance incident", async () => {
    const a = await maint("Room B-21", "Window glass cracked");
    await run((tx) => raiseFromIncident(tx, W(), a.incident.id, { placeId: `hostel:${f.boys.id}`, priority: "NORMAL", photoFileId: null }, { assertHostel: anyHostel, inventoryOn: true }));
    await expect(run((tx) => raiseFromIncident(tx, W(), a.incident.id, { placeId: `hostel:${f.boys.id}`, priority: "NORMAL", photoFileId: null }, { assertHostel: anyHostel, inventoryOn: true }))).rejects.toThrow(/^MR-\d{4} is already raised for HI-/);
    if (!(await run((tx) => tx.bedAllocation.findFirst({ where: { studentId: f.rahul.id, status: "ACTIVE" } })))) await giveBed(f, f.rahul, f.bed("B-2", 2).id);
    const med = await run((tx) => recordIncident(tx, W(), { type: "MEDICAL", studentIds: [f.rahul.id], hostelId: null, place: null, description: "Fever after dinner", at: ist("2026-10-12", 20), actionTaken: null, informParent: false, behaviourTypeKey: null }, opts));
    await expect(run((tx) => raiseFromIncident(tx, W(), med.incident.id, { placeId: `hostel:${f.boys.id}`, priority: "NORMAL", photoFileId: null }, { assertHostel: anyHostel, inventoryOn: true }))).rejects.toThrow("Only a maintenance incident raises a maintenance request.");
  });

  it("can go to another place from the facility register", async () => {
    const lab = await run(async (tx) => addRoom(tx, W(), f.school.campus.id, { name: "Hostel laundry", kind: "activity", capacity: null }));
    const a = await maint("Laundry", "Washing machine stopped mid-cycle");
    const r = await run((tx) => raiseFromIncident(tx, W(), a.incident.id, { placeId: lab.id, priority: "URGENT", photoFileId: null }, { assertHostel: anyHostel, inventoryOn: true }));
    expect(r.room.id).toBe(lab.id);
    await expect(run(async (tx) => raiseFromIncident(tx, W(), (await maint("Room B-1", "Door hinge broken")).incident.id, { placeId: "00000000-0000-4000-8000-000000000000", priority: "NORMAL", photoFileId: null }, { assertHostel: anyHostel, inventoryOn: true }))).rejects.toThrow("Choose the place from the list.");
  });

  it("is refused while Inventory Management is off", async () => {
    const a = await maint("Room B-5", "Light flickering");
    await expect(run((tx) => raiseFromIncident(tx, W(), a.incident.id, { placeId: `hostel:${f.boys.id}`, priority: "NORMAL", photoFileId: null }, { assertHostel: anyHostel, inventoryOn: false }))).rejects.toThrow(/Inventory Management is switched off/);
  });

  it("keeps a warden to their own hostel", async () => {
    const a = await maint("Room B-6", "Cupboard lock broken");
    const girls = await hostelFor(f, f.gwarden.id);
    const G = as(f, f.gwarden.id);
    const mine = (id: string | null) => assertHostel(girls.mine, id);
    await expect(run((tx) => raiseFromIncident(tx, G, a.incident.id, { placeId: `hostel:${f.girls.id}`, priority: "NORMAL", photoFileId: null }, { assertHostel: mine, inventoryOn: true }), G)).rejects.toThrow();
    const g = await maint("Room G-3, geyser", "No hot water", as(f, f.gwarden.id), f.girls.id);
    await expect(run((tx) => raiseFromIncident(tx, G, g.incident.id, { placeId: `hostel:${f.boys.id}`, priority: "NORMAL", photoFileId: null }, { assertHostel: mine, inventoryOn: true }), G)).rejects.toThrow();
    const ok = await run((tx) => raiseFromIncident(tx, G, g.incident.id, { placeId: `hostel:${f.girls.id}`, priority: "NORMAL", photoFileId: null }, { assertHostel: mine, inventoryOn: true }), G);
    expect(ok.room.name).toBe(f.girls.name);
  });
});
