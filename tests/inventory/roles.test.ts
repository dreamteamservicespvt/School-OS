// Who may do what in Inventory Management, checked on the server (05-roles.md:
// Principal, School Admin and Store Keeper Full; Accountant and Vice
// Principal View; everyone else none; and the owner's rules in
// src/lib/duty.ts and src/lib/inventory/access.ts): the Store Keeper does the
// work on every page, records vendor bills but does not pay them and never
// sees vendor bank details; the Principal reads the store's pages and works
// Purchases & Vendors; the School Admin reads every page and keeps Inventory
// Settings; the Vice Principal reads Items & Stock, Purchases & Vendors,
// Assets and the reports; the Accountant reads Purchases & Vendors and the
// reports and pays the bills; Teachers have no inventory pages but may
// report a problem. With the module switched off, everything is refused.
// These call the real server actions and export routes as each role.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { withSchool } from "@/lib/db";
import { accessIn } from "@/lib/auth/access";
import { requirePermission } from "@/lib/permissions";
import { INV_PAGES, landingPage, pageOpen } from "@/lib/inventory/access";
import { CATALOGUE } from "@/lib/reports/catalogue";
import { INVENTORY_WIDGETS } from "@/lib/dashboard/widgets/inventory";
import type { Viewer } from "@/lib/dashboard/types";
import { addTestItem, as, invFor, keeper, makeInventorySchool, type InvFixture } from "./fixture";

const who = vi.hoisted(() => ({ userId: "", schoolId: "" }));

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/flash", async (original) => ({ ...(await original<typeof import("@/lib/flash")>()), flash: async () => {} }));
vi.mock("@/lib/current", () => {
  const current = async () => {
    const view = await accessIn(who.userId, who.schoolId);
    if (!view) throw new Error("no access");
    return { ...view, user: { id: who.userId, displayName: "Tester" }, ctx: { schoolId: who.schoolId, userId: who.userId }, school: { ...view.school, timeZone: "Asia/Kolkata", name: "Inventory Roles School" } };
  };
  return {
    requireCurrent: current,
    requireAction: async (module: string, action: string) => {
      const c = await current();
      // The real role check runs first, exactly as in src/lib/current.ts.
      const reach = requirePermission(c.permissions, module as never, action as never);
      return { current: c, reach };
    },
  };
});

const actions = await import("@/app/(school)/inventory-management/actions");
const purchases = await import("@/app/(school)/inventory-management/purchases/actions");
const assets = await import("@/app/(school)/inventory-management/assets/actions");
const rooms = await import("@/app/(school)/inventory-management/rooms/actions");
const report = await import("@/app/(school)/inventory-management/report-problem/actions");
const itemsExport = await import("@/app/(school)/inventory-management/items/export/route");
const issuesExport = await import("@/app/(school)/inventory-management/issues/export/route");
const purchasesExport = await import("@/app/(school)/inventory-management/purchases/export/route");
const assetsExport = await import("@/app/(school)/inventory-management/assets/export/route");
const roomsExport = await import("@/app/(school)/inventory-management/rooms/export/route");
const reportsExport = await import("@/app/(school)/inventory-management/reports/export/route");

const form = (o: Record<string, string | string[]>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(o)) for (const x of Array.isArray(v) ? v : [v]) fd.append(k, x);
  return fd;
};
const get = (mod: { GET: (r: Request) => Promise<Response> }, path: string) => mod.GET(new Request(`http://localhost/inventory-management${path}`));
const DENIED = expect.stringMatching(/permission|Your role cannot/i);

describe("Inventory Management by role", () => {
  let f: InvFixture;
  let notebook = "";
  const asUser = (id: string) => { who.userId = id; who.schoolId = f.school.id; };

  beforeAll(async () => {
    f = await makeInventorySchool("Inventory Roles School");
    notebook = (await addTestItem(f, "Long notebook", 30)).item.id;
  });

  const modes = async (id: string) => {
    const { v } = await invFor(f, id);
    return Object.fromEntries(INV_PAGES.map((p) => [p, v.pages[p]]));
  };

  it("opens only the pages each role works in, full or to read", async () => {
    expect(await modes(f.store.id)).toEqual({ items: "full", issue: "full", purchases: "full", assets: "full", rooms: "full", reports: "full", settings: "full" });
    expect(await modes(f.principal.id)).toEqual({ items: "view", issue: "view", purchases: "full", assets: "view", rooms: "view", reports: "view", settings: "view" });
    expect(await modes(f.admin.id)).toEqual({ items: "view", issue: "view", purchases: "view", assets: "view", rooms: "view", reports: "view", settings: "full" });
    expect(await modes(f.vp.id)).toEqual({ items: "view", issue: "hidden", purchases: "view", assets: "view", rooms: "hidden", reports: "view", settings: "hidden" });
    expect(await modes(f.accountant.id)).toEqual({ items: "hidden", issue: "hidden", purchases: "view", assets: "hidden", rooms: "hidden", reports: "view", settings: "hidden" });
    for (const id of [f.teacher.id, f.frontdesk.id]) {
      expect(Object.values(await modes(id)).every((m) => m === "hidden")).toBe(true);
    }
    expect(landingPage((await invFor(f, f.store.id)).v)).toBe("issue");
    expect(landingPage((await invFor(f, f.accountant.id)).v)).toBe("purchases");
    expect(landingPage((await invFor(f, f.teacher.id)).v)).toBeNull();
    expect(pageOpen((await invFor(f, f.vp.id)).v, "rooms")).toBe(false);
  });

  it("gives the store work to the Store Keeper, paying and bank details to those who pay, and Remind to the leaders", async () => {
    expect((await invFor(f, f.store.id)).can).toEqual({ stock: true, issue: true, purchase: true, pay: false, bank: false, assets: true, rooms: true, settings: true, remind: false, export: true });
    expect((await invFor(f, f.principal.id)).can).toMatchObject({ stock: false, issue: false, purchase: true, pay: true, bank: true, assets: false, rooms: false, settings: false, remind: true });
    expect((await invFor(f, f.admin.id)).can).toMatchObject({ stock: false, issue: false, purchase: false, assets: false, settings: true, remind: true });
    expect((await invFor(f, f.accountant.id)).can).toMatchObject({ stock: false, issue: false, purchase: false, pay: true, bank: true, settings: false, remind: false, export: true });
    expect((await invFor(f, f.vp.id)).can).toMatchObject({ stock: false, issue: false, purchase: false, pay: false, bank: false, remind: false });
    expect((await invFor(f, f.teacher.id)).can).toMatchObject({ stock: false, issue: false, export: false });
  });

  it("lets the Store Keeper issue stock, and refuses the Teacher, the Accountant, the Vice Principal and the Principal on the server", async () => {
    const fd = () => form({ toKind: "STAFF", staffId: f.teacherStaff.id, locationId: f.main, itemId: notebook, qty: "4" });
    for (const id of [f.teacher.id, f.accountant.id, f.vp.id, f.frontdesk.id]) {
      asUser(id);
      expect(await actions.issueAction(null, fd())).toMatchObject({ ok: false, message: DENIED });
    }
    asUser(f.principal.id);
    expect(await actions.issueAction(null, fd())).toMatchObject({ ok: false, message: "Your role cannot issue stock. Ask the store keeper." });
    asUser(f.admin.id);
    expect(await actions.saveItemAction(null, form({ name: "Admin item", categoryId: f.stationery, unit: "piece" }))).toMatchObject({ ok: false, message: "Your role cannot add items. Ask the store keeper." });
    expect(await withSchool(keeper(f), (tx) => tx.stockIssue.count())).toBe(0);
    asUser(f.store.id);
    expect(await actions.issueAction(null, fd())).toMatchObject({ ok: true });
    expect(await withSchool(keeper(f), (tx) => tx.stockIssue.count())).toBe(1);
  });

  it("lets the Store Keeper record a vendor bill but not pay it or keep bank details; the Accountant pays", async () => {
    asUser(f.store.id);
    const saved = await purchases.saveVendorAction(null, form({ name: "Sri Venkateswara Traders", phone: "9849022334", bankName: "SBI", accountNo: "123456789012", ifsc: "SBIN0001234" }));
    expect(saved).toMatchObject({ ok: true });
    const vendorId = (saved.data as { id: string }).id;
    const detail = await withSchool(keeper(f), (tx) => tx.vendorDetail.findUniqueOrThrow({ where: { vendorId } }));
    expect(detail).toMatchObject({ bankName: null, accountNoEnc: null, accountLast4: null });
    const bill = await purchases.billAction(null, form({ vendorId, billNo: "SVT-77", billDate: "2026-10-10", amount: "1200" }));
    expect(bill).toMatchObject({ ok: true });
    const inv = await withSchool(keeper(f), (tx) => tx.purchaseInvoice.findFirstOrThrow({ where: { billNo: "SVT-77" } }));
    const pay = () => form({ invoiceId: inv.id, date: "2026-10-12", mode: "CASH" });
    expect(await purchases.payBillAction(null, pay())).toMatchObject({ ok: false, message: "Your role cannot pay vendor bills. Ask the Accountant." });
    asUser(f.vp.id);
    expect(await purchases.payBillAction(null, pay())).toMatchObject({ ok: false });
    expect(await purchases.billAction(null, form({ vendorId, billNo: "SVT-78", billDate: "2026-10-10", amount: "100" }))).toMatchObject({ ok: false, message: DENIED });
    // The Accountant keeps the bank details.
    asUser(f.accountant.id);
    expect(await purchases.saveVendorAction(null, form({ vendorId, name: "Sri Venkateswara Traders", phone: "9849022334", bankName: "SBI", accountNo: "123456789012", ifsc: "SBIN0001234" }))).toMatchObject({ ok: true });
    expect(await withSchool(keeper(f), (tx) => tx.vendorDetail.findUniqueOrThrow({ where: { vendorId } }))).toMatchObject({ bankName: "SBI", accountLast4: "9012" });
    // And the audit log never holds the account number.
    const logs = await withSchool(keeper(f), (tx) => tx.auditLogEntry.findMany({ where: { recordType: "Vendor", recordId: vendorId } }));
    expect(JSON.stringify(logs)).not.toContain("123456789012");
  });

  it("refuses asset, room and settings work to roles that only read them", async () => {
    const asset = () => form({ name: "Steel almirah", type: "Furniture", placeKind: "ROOM", roomId: f.room1.id });
    for (const id of [f.principal.id, f.admin.id, f.vp.id, f.accountant.id, f.teacher.id]) {
      asUser(id);
      expect(await assets.addAssetAction(null, asset())).toMatchObject({ ok: false, message: DENIED });
      expect(await rooms.saveFacilityAction(null, form({ name: "Room 99", type: "classroom" }))).toMatchObject({ ok: false, message: DENIED });
    }
    asUser(f.principal.id);
    expect(await actions.saveCategoryAction(null, form({ name: "Sports kit" }))).toMatchObject({ ok: false, message: DENIED });
    asUser(f.admin.id);
    expect(await actions.saveCategoryAction(null, form({ name: "Sports kit" }))).toMatchObject({ ok: true });
    asUser(f.store.id);
    expect(await assets.addAssetAction(null, asset())).toMatchObject({ ok: true });
  });

  it("lets the Principal and School Admin remind the store keeper, but not the Store Keeper or the Vice Principal", async () => {
    asUser(f.principal.id);
    expect(await actions.remindStoreAction(null, form({ what: "low" }))).toMatchObject({ ok: true });
    const note = await withSchool(keeper(f), (tx) => tx.notification.findFirst({ where: { userLoginId: f.store.id, type: "inventory-remind" } }));
    expect(note?.text).toMatch(/purchase requests for the items at or below their reorder level/);
    asUser(f.store.id);
    expect(await actions.remindStoreAction(null, form({ what: "low" }))).toMatchObject({ ok: false });
    asUser(f.vp.id);
    expect(await actions.remindStoreAction(null, form({ what: "low" }))).toMatchObject({ ok: false });
  });

  it("lets any staff member report a problem, but not someone who is not on the staff", async () => {
    const fd = () => form({ placeId: f.room1.id, problem: "Window glass is broken", priority: "HIGH" });
    asUser(f.teacher.id);
    expect(await report.reportProblemAction(null, fd())).toMatchObject({ ok: true });
    const req = await withSchool(as(f, f.teacher.id), (tx) => tx.maintenanceRequest.findFirstOrThrow({ where: { raisedById: f.teacher.id } }));
    expect(req.priority).toBe("HIGH");
    // The receptionist has a staff record in the admission fixture; the VP has none.
    asUser(f.vp.id);
    expect(await report.reportProblemAction(null, fd())).toMatchObject({ ok: false, message: expect.stringMatching(/Only staff members/) });
    // The teacher cannot work the request from the Rooms page.
    asUser(f.teacher.id);
    expect(await rooms.assignMaintenanceAction(null, form({ requestId: req.id, technicianStaffId: f.teacherStaff.id, priority: "HIGH" }))).toMatchObject({ ok: false, message: DENIED });
  });

  it("exports only from pages a role reads", async () => {
    const csv = "?format=csv";
    asUser(f.vp.id);
    const items = await get(itemsExport, `/items/export${csv}`);
    expect(items.status).toBe(200);
    expect(await items.text()).toContain("Long notebook");
    expect((await get(assetsExport, `/assets/export${csv}`)).status).toBe(200);
    expect((await get(issuesExport, `/issues/export${csv}`)).status).toBe(403);
    expect((await get(roomsExport, `/rooms/export${csv}`)).status).toBe(403);
    asUser(f.accountant.id);
    expect((await get(purchasesExport, `/purchases/export${csv}&tab=bills`)).status).toBe(200);
    expect((await get(reportsExport, `/reports/export${csv}&r=inv-purchases`)).status).toBe(200);
    expect((await get(itemsExport, `/items/export${csv}`)).status).toBe(403);
    expect((await get(assetsExport, `/assets/export${csv}`)).status).toBe(403);
    asUser(f.store.id);
    expect((await get(roomsExport, `/rooms/export${csv}`)).status).toBe(200);
    expect((await get(issuesExport, `/issues/export${csv}`)).status).toBe(200);
    asUser(f.teacher.id);
    expect((await get(itemsExport, `/items/export${csv}`)).status).toBe(403);
  });

  it("puts the store widgets on the Store Keeper's home and stock numbers on the leaders'", () => {
    const v = (perms: Viewer["permissions"], roles: string[]) => ({ permissions: perms, roles: roles.map((key) => ({ key })), user: { id: "x" } }) as unknown as Viewer;
    const full = { "inventory-management": { see: "all", change: "all" } } as unknown as Viewer["permissions"];
    const none = { "inventory-management": { see: "none", change: "none" } } as unknown as Viewer["permissions"];
    expect(INVENTORY_WIDGETS.length).toBeGreaterThan(0);
    for (const w of INVENTORY_WIDGETS) {
      if (w.allowed) {
        expect(w.allowed(v(full, ["store-keeper"])), w.id).toBe(true);
        expect(w.allowed(v(none, ["teacher"])), w.id).toBe(false);
      }
    }
    const low = INVENTORY_WIDGETS.find((w) => w.id === "inventory.low-stock")!;
    expect(low.homes).toEqual(expect.arrayContaining(["store", "leader"]));
  });

  it("lists the inventory reports in the Reports & Analytics catalogue", () => {
    expect(CATALOGUE.filter((e) => e.key.startsWith("inv-")).length).toBeGreaterThanOrEqual(5);
  });

  it("refuses everything when the school switches Inventory Management off", async () => {
    const sys = { schoolId: f.school.id, userId: null };
    const set = (isOn: boolean) => withSchool(sys, (tx) => tx.schoolModule.update({ where: { schoolId_moduleKey: { schoolId: f.school.id, moduleKey: "inventory-management" } }, data: { isOn } }));
    await set(false);
    try {
      asUser(f.store.id);
      expect(await actions.issueAction(null, form({ toKind: "STAFF", staffId: f.teacherStaff.id, locationId: f.main, itemId: notebook, qty: "1" }))).toMatchObject({ ok: false, message: expect.stringMatching(/switched off/) });
      expect((await get(itemsExport, "/items/export?format=csv")).status).toBe(404);
      asUser(f.teacher.id);
      expect(await report.reportProblemAction(null, form({ placeId: f.room1.id, problem: "Tap is leaking badly", priority: "NORMAL" }))).toMatchObject({ ok: false, message: expect.stringMatching(/switched off/) });
    } finally {
      await set(true);
    }
  });
});
