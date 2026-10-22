// Inventory Management rules (14-inventory-management.md §5 "Rules and
// mistake-proofing" and §9 "Done when"), on a real database: issuing more
// than in stock, stock never below zero, low-stock alerts, purchases only
// from approved requests, receiving more than ordered, the duplicate bill,
// bills paid into the Day Book, store-counter charges to fees, stock audits
// changing stock only after approval, warranty reminders, disposal with
// approval, maintenance requests with a photo and their cost, item codes,
// asset tags and vendors never reused, book sets, expired stock, the item
// and asset imports with Undo, transfers, depreciation, and never deleting.
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool, type Tx } from "@/lib/db";
import { decide } from "@/lib/approvals";
import "@/lib/approval-handlers";
import { importKind, previewImport, runImport, undoImport} from "@/lib/importer";
import { byHeadings } from "../helpers";
import "@/lib/import-registry";
import { saveFile } from "@/lib/files";
import { mainBankAccount } from "@/lib/finance/settings";
import { archiveItem } from "@/lib/inventory/items";
import { stockIn, stockOut, transferStock, decideTransfer, totalsFor, balanceOf } from "@/lib/inventory/stock";
import { issueStock, issueBookSet, saveBookSet, giveMissing } from "@/lib/inventory/issues";
import { createOrder, createRequest, payBill, receiveGoods, recordBill } from "@/lib/inventory/purchases";
import { saveInventoryVendor } from "@/lib/inventory/vendors";
import { addAssets, bookValue, depreciation, requestDisposal } from "@/lib/inventory/assets";
import { warrantyReminders } from "@/lib/inventory/alerts";
import { assignMaintenance, closeMaintenance, raiseMaintenance } from "@/lib/inventory/facilities";
import { saveCounts, startAudit, submitAudit } from "@/lib/inventory/audits";
import { inventorySettings } from "@/lib/inventory/settings";
import { ITEMS_IMPORT, ASSETS_IMPORT } from "@/lib/inventory/import";
import { TODAY, R, addTestItem, as, keeper, makeInventorySchool, plus, type InvFixture } from "./fixture";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

describe("Inventory Management rules", () => {
  let f: InvFixture;
  beforeAll(async () => {
    f = await makeInventorySchool();
  });
  const ctx = () => keeper(f);
  const run = <T,>(fn: (tx: Tx) => Promise<T>) => withSchool(ctx(), fn);
  const stock = (itemId: string) => run(async (tx) => (await totalsFor(tx, [itemId])).get(itemId) ?? 0);
  const issueTo = (itemId: string, qty: number, over: Record<string, unknown> = {}) =>
    run((tx) => issueStock(tx, ctx(), { toKind: "STAFF", staffId: f.teacherStaff.id, locationId: f.main, lines: [{ itemId, qty }], chargeToFees: false, returnable: false, note: null, date: TODAY, today: TODAY, ...over }));

  it("blocks issuing 20 notebooks when 12 are in stock, showing the stock (Done when 1)", async () => {
    const { item } = await addTestItem(f, "Notebook 200 pages", 12);
    await expect(issueTo(item.id, 20)).rejects.toThrow("Only 12 pieces of Notebook 200 pages in Main store. Transfer from another store, or issue fewer.");
    expect(await stock(item.id)).toBe(12);
    await issueTo(item.id, 12);
    expect(await stock(item.id)).toBe(0);
    await expect(issueTo(item.id, 1)).rejects.toThrow(/out of stock in Main store/);
  });

  it("never lets a movement take stock below zero", async () => {
    const { item } = await addTestItem(f, "Glue stick", 5);
    await expect(run((tx) => stockOut(tx, ctx(), { itemId: item.id, locationId: f.main, qty: 6, date: TODAY, kind: "DAMAGED", reason: "Dried up in the heat", batchId: null, today: TODAY }))).rejects.toThrow(/Only 5 pieces/);
    await expect(run((tx) => stockOut(tx, ctx(), { itemId: item.id, locationId: f.main, qty: 2, date: TODAY, kind: "LOST", reason: "x", batchId: null, today: TODAY }))).rejects.toThrow("Give the reason, in at least 5 characters.");
    await run((tx) => stockOut(tx, ctx(), { itemId: item.id, locationId: f.main, qty: 2, date: TODAY, kind: "DAMAGED", reason: "Dried up in the heat", batchId: null, today: TODAY }));
    expect(await stock(item.id)).toBe(3);
    const balances = await run((tx) => tx.stockBalance.findMany({ where: { qty: { lt: 0 } } }));
    expect(balances).toHaveLength(0);
  });

  it("tells the store keeper once when an item falls to its reorder level, with Raise purchase request (Done when 2)", async () => {
    // Earlier unread low-stock lines would merge with this one; mark them read.
    await run((tx) => tx.notification.updateMany({ where: { type: "low-stock" }, data: { readAt: new Date() } }));
    const { item } = await addTestItem(f, "Chalk box", 15, { reorderLevel: 10 });
    await issueTo(item.id, 4);
    expect(await run((tx) => tx.notification.count({ where: { userLoginId: f.store.id, type: "low-stock", text: { contains: "Chalk box" } } }))).toBe(0);
    await issueTo(item.id, 2);
    const notes = await run((tx) => tx.notification.findMany({ where: { userLoginId: f.store.id, type: "low-stock", text: { contains: "Chalk box" } } }));
    expect(notes).toHaveLength(1);
    expect(notes[0].text).toBe("Chalk box is low: 9 pieces left (reorder at 10). Raise a purchase request.");
    expect(notes[0].link).toBe(`/inventory-management/purchases?tab=requests&new=1&item=${item.id}`);
    await issueTo(item.id, 1);
    expect(await run((tx) => tx.notification.count({ where: { userLoginId: f.store.id, type: "low-stock", text: { contains: "Chalk box" } } }))).toBe(1);
  });

  it("keeps a request above the limit in Approvals, orders it once approved, and receiving raises stock (Done when 3)", async () => {
    const { item } = await addTestItem(f, "Bunsen burner", 2, { categoryId: f.labCat, pricePaise: R(450) });
    const r = await run((tx) => createRequest(tx, ctx(), { lines: [{ itemId: item.id, qty: 20, estUnitPaise: R(450) }], neededBy: null, reason: "Old burners leak", departmentId: null, estimatePaise: null, date: TODAY }));
    expect(r.waiting).toBe(true);
    expect(r.request.status).toBe("WAITING");
    const approvalId = (await run((tx) => tx.purchaseRequest.findUniqueOrThrow({ where: { id: r.request.id } }))).approvalId!;
    const approval = await run((tx) => tx.approval.findUniqueOrThrow({ where: { id: approvalId } }));
    expect(approval.type).toBe("purchase");
    const vendor = await run((tx) => saveInventoryVendor(tx, ctx(), { name: "Hyd Scientific", contactName: null, phone: "9866044552", email: null, gstin: null, address: null, itemsSupplied: null, bank: null }, null, { mayChangeBank: false }));
    const order = (requestId: string | null, qty = 20) => run((tx) => createOrder(tx, ctx(), { requestId, vendorId: vendor.id, locationId: f.labStore, expectedOn: null, note: null, date: TODAY, lines: [{ itemId: item.id, qty, unitPricePaise: R(440) }] }));
    await expect(order(r.request.id)).rejects.toThrow(/is waiting for approval/);
    // An order above the limit with no request is refused too.
    await expect(order(null)).rejects.toThrow(/need an approved purchase request/);
    // The store keeper cannot approve their own request.
    await expect(run((tx) => decide(tx, ctx(), approval.id, "approve", null))).rejects.toThrow();
    await withSchool(as(f, f.principal.id), (tx) => decide(tx, as(f, f.principal.id), approval.id, "approve", "Go ahead"));
    expect((await run((tx) => tx.purchaseRequest.findUniqueOrThrow({ where: { id: r.request.id } }))).status).toBe("APPROVED");
    const o = await order(r.request.id);
    expect(o.order.status).toBe("SENT");
    expect((await run((tx) => tx.purchaseRequest.findUniqueOrThrow({ where: { id: r.request.id } }))).status).toBe("ORDERED");
    const line = (await run((tx) => tx.purchaseOrderLine.findFirstOrThrow({ where: { orderId: o.order.id } })));
    // Receiving more than ordered needs a reason (14 §5).
    await expect(run((tx) => receiveGoods(tx, ctx(), { orderId: o.order.id, date: TODAY, locationId: f.labStore, extraReason: null, note: null, today: TODAY, lines: [{ orderLineId: line.id, qty: 24, batchNo: null, expiresOn: null }] })))
      .rejects.toThrow("Ordered 20, receiving 24. Correct the quantity, or give a reason to accept the extra.");
    const part = await run((tx) => receiveGoods(tx, ctx(), { orderId: o.order.id, date: TODAY, locationId: f.labStore, extraReason: null, note: null, today: TODAY, lines: [{ orderLineId: line.id, qty: 12, batchNo: null, expiresOn: null }] }));
    expect(part.full).toBe(false);
    expect(await stock(item.id)).toBe(14);
    const rest = await run((tx) => receiveGoods(tx, ctx(), { orderId: o.order.id, date: TODAY, locationId: f.labStore, extraReason: null, note: null, today: TODAY, lines: [{ orderLineId: line.id, qty: 8, batchNo: null, expiresOn: null }] }));
    expect(rest.full).toBe(true);
    expect(await stock(item.id)).toBe(22);
    expect((await run((tx) => tx.purchaseOrder.findUniqueOrThrow({ where: { id: o.order.id } }))).status).toBe("RECEIVED");

    // Done when 4: the vendor's bill, paid, shows in the Finance Day Book; the same bill twice is caught.
    const bill = await run((tx) => recordBill(tx, ctx(), { orderId: o.order.id, vendorId: null, billNo: "HS-1001", billDate: TODAY, dueDate: null, amountPaise: R(1500), fileId: null, note: null, duplicateReason: null }));
    expect(bill.outcome).toBe("approved");
    await expect(run((tx) => recordBill(tx, ctx(), { orderId: o.order.id, vendorId: null, billNo: "HS-1001", billDate: TODAY, dueDate: null, amountPaise: R(1500), fileId: null, note: null, duplicateReason: null }))).rejects.toThrow(/already/i);
    const acc = as(f, f.accountant.id);
    await withSchool(acc, async (tx) => payBill(tx, acc, bill.invoice.id, { date: TODAY, mode: "BANK_TRANSFER", reference: "NEFT1", accountId: (await mainBankAccount(tx, acc)).id }));
    const entry = await run((tx) => tx.dayBookEntry.findFirst({ where: { sourceType: "expense-payment", amountPaise: R(1500) } }));
    expect(entry).not.toBeNull();
    expect(entry!.date.toISOString().slice(0, 10)).toBe("2026-10-12");
  });

  it("adds a uniform issued at the counter to the student's fees (Done when 5)", async () => {
    const { item } = await addTestItem(f, "School shirt", 10, { categoryId: f.uniforms, size: "30", pricePaise: R(350) });
    const r = await run((tx) => issueStock(tx, ctx(), { toKind: "STUDENT", studentId: f.meena.id, locationId: f.main, lines: [{ itemId: item.id, qty: 2 }], chargeToFees: true, returnable: false, note: null, date: TODAY, today: TODAY }));
    expect(r.total).toBe(R(700));
    const due = await run((tx) => tx.studentFeeDue.findUniqueOrThrow({ where: { id: r.issue.feeDueId! } }));
    expect(due.studentId).toBe(f.meena.id);
    expect(due.amountPaise).toBe(R(700));
    expect(due.label).toMatch(/School shirt/);
    expect(await stock(item.id)).toBe(8);
    // A free item cannot be charged.
    const { item: free } = await addTestItem(f, "Badge", 5, { pricePaise: null });
    await expect(run((tx) => issueStock(tx, ctx(), { toKind: "STUDENT", studentId: f.ravi.id, locationId: f.main, lines: [{ itemId: free.id, qty: 1 }], chargeToFees: true, returnable: false, note: null, date: TODAY, today: TODAY }))).rejects.toThrow(/has no price/);
  });

  it("changes stock after a stock audit only once the differences are approved (Done when 6)", async () => {
    const { item } = await addTestItem(f, "Register book", 25, { pricePaise: R(120) });
    const { audit } = await run((tx) => startAudit(tx, ctx(), { locationId: f.main, name: "October count", categoryId: f.stationery, date: TODAY }));
    const lines = await run((tx) => tx.stockAuditLine.findMany({ where: { auditId: audit.id } }));
    await run((tx) => saveCounts(tx, ctx(), audit.id, lines.map((l) => ({ itemId: l.itemId, counted: l.itemId === item.id ? 22 : l.systemQty, note: null }))));
    const sent = await run((tx) => submitAudit(tx, ctx(), audit.id));
    expect(sent).toMatchObject({ waiting: true, differences: 1 });
    expect(await stock(item.id)).toBe(25);
    const a = await run((tx) => tx.stockAudit.findUniqueOrThrow({ where: { id: audit.id } }));
    await withSchool(as(f, f.principal.id), (tx) => decide(tx, as(f, f.principal.id), a.approvalId!, "approve", null));
    expect(await stock(item.id)).toBe(22);
    expect(await run((tx) => tx.stockMovement.count({ where: { itemId: item.id, kind: "AUDIT", qty: -3 } }))).toBe(1);
  });

  it("reminds before a warranty ends, once; disposal needs approval and the asset stays as Disposed (Done when 7)", async () => {
    const place = { roomId: f.room1.id, departmentId: null, staffId: null };
    const base = { ...place, serialNo: null, vendorId: null, amcEnd: null, condition: "Good", note: null, tag: null, purchaseDate: plus(TODAY, -400), costPaise: R(42000) };
    const [projector] = await run((tx) => addAssets(tx, ctx(), { ...base, name: "Projector", type: "IT", warrantyEnd: plus(TODAY, 30) }));
    await run((tx) => addAssets(tx, ctx(), { ...base, name: "Far warranty", type: "IT", warrantyEnd: plus(TODAY, 90) }));
    expect(await run((tx) => warrantyReminders(tx, ctx(), TODAY))).toBe(1);
    const note = await run((tx) => tx.notification.findFirst({ where: { userLoginId: f.store.id, type: "warranty" } }));
    expect(note?.text).toMatch(new RegExp(`Warranty of Projector ${projector.tag} ends on .* \\(in 30 days\\)`));
    expect(await run((tx) => warrantyReminders(tx, ctx(), plus(TODAY, 1)))).toBe(0);

    const d = await run((tx) => requestDisposal(tx, ctx(), { assetId: projector.id, method: "SCRAPPED", reason: "Lamp and board failed", date: TODAY, salePaise: null, buyer: null, saleMode: null, saleRef: null }));
    expect(d.disposal.status).toBe("WAITING");
    expect((await run((tx) => tx.asset.findUniqueOrThrow({ where: { id: projector.id } }))).status).toBe("IN_USE");
    const disposalApproval = (await run((tx) => tx.assetDisposal.findUniqueOrThrow({ where: { id: d.disposal.id } }))).approvalId!;
    const approval = await run((tx) => tx.approval.findUniqueOrThrow({ where: { id: disposalApproval } }));
    expect(approval.summary).toMatch(new RegExp(`Dispose of Projector ${projector.tag}`));
    await withSchool(as(f, f.principal.id), (tx) => decide(tx, as(f, f.principal.id), approval.id, "approve", null));
    const after = await run((tx) => tx.asset.findUniqueOrThrow({ where: { id: projector.id } }));
    expect(after.status).toBe("DISPOSED");
    expect(after.archivedAt).toBeNull();
    expect(bookValue(after, "SLM", 40, TODAY)).toBe(BigInt(0));

    // Rejected: nothing changes.
    const [other] = await run((tx) => addAssets(tx, ctx(), { ...base, name: "Desk", type: "Furniture", warrantyEnd: null }));
    const d2 = await run((tx) => requestDisposal(tx, ctx(), { assetId: other.id, method: "DONATED", reason: "Given to the village school", date: TODAY, salePaise: null, buyer: null, saleMode: null, saleRef: null }));
    await withSchool(as(f, f.principal.id), async (tx) => decide(tx, as(f, f.principal.id), (await tx.assetDisposal.findUniqueOrThrow({ where: { id: d2.disposal.id } })).approvalId!, "reject", "Still usable"));
    expect((await run((tx) => tx.asset.findUniqueOrThrow({ where: { id: other.id } }))).status).toBe("IN_USE");
  });

  it("refuses an asset tag in use, naming the asset and its place, and gives tags in sequence", async () => {
    const base = { roomId: f.room1.id, departmentId: null, staffId: null, serialNo: null, vendorId: null, amcEnd: null, warrantyEnd: null, condition: "Good", note: null, purchaseDate: null, costPaise: null, name: "Chair", type: "Furniture" };
    const made = await run((tx) => addAssets(tx, ctx(), { ...base, tag: null }, 3));
    const nums = made.map((a) => Number(a.tag.replace(/\D/g, "")));
    expect(nums[1] - nums[0]).toBe(1);
    expect(nums[2] - nums[1]).toBe(1);
    await expect(run((tx) => addAssets(tx, ctx(), { ...base, tag: made[0].tag.toLowerCase() }))).rejects.toThrow(new RegExp(`Tag ${made[0].tag} belongs to Chair, Room 12\\. Use the next tag: AT-`));
    await expect(run((tx) => addAssets(tx, ctx(), { ...base, tag: "X-1" }, 2))).rejects.toThrow(/Leave the tag empty/);
  });

  it("brings a maintenance request with a photo to the technician, and records its cost in Finance when closed (Done when 8)", async () => {
    const t = as(f, f.teacher.id);
    const photo = await withSchool(t, (tx) => saveFile(tx, t, { file: new File([PNG], "fan.png", { type: "image/png" }), purpose: "maintenance-photo", allowed: ["image/png"] }));
    const r = await withSchool(t, (tx) => raiseMaintenance(tx, t, { roomId: f.room1.id, assetId: null, problem: "Ceiling fan is not working", photoFileId: photo.id, priority: "HIGH" }));
    expect(r.request).toMatchObject({ status: "OPEN", priority: "HIGH", photoFileId: photo.id, raisedById: f.teacher.id });
    expect(await run((tx) => tx.notification.count({ where: { userLoginId: f.store.id, type: "maintenance" } }))).toBeGreaterThan(0);
    await run((tx) => assignMaintenance(tx, ctx(), r.request.id, { technicianStaffId: f.teacherStaff.id, technicianName: null, vendorId: null, priority: "HIGH" }));
    const told = await run((tx) => tx.notification.findFirst({ where: { userLoginId: f.teacher.id, type: "maintenance", text: { contains: "assigned to you" } } }));
    expect(told?.link).toBe(`/inventory-management/report-problem?request=${r.request.id}`);
    expect((await run((tx) => tx.maintenanceRequest.findUniqueOrThrow({ where: { id: r.request.id } }))).status).toBe("IN_PROGRESS");
    const closed = await run((tx) => closeMaintenance(tx, ctx(), r.request.id, { status: "DONE", doneOn: TODAY, costPaise: R(650), toFinance: true, billFileId: null, billNo: null, duplicateReason: null, closingNote: "Capacitor replaced" }));
    expect(closed.expenseId).toBeTruthy();
    const expense = await run((tx) => tx.expense.findUniqueOrThrow({ where: { id: closed.expenseId! } }));
    expect(expense.amountPaise).toBe(R(650));
    const done = await run((tx) => tx.maintenanceRequest.findUniqueOrThrow({ where: { id: r.request.id } }));
    expect(done).toMatchObject({ status: "DONE", costPaise: R(650), expenseId: closed.expenseId });
    // The teacher who raised it is told.
    expect(await withSchool(t, (tx) => tx.notification.count({ where: { userLoginId: f.teacher.id, type: "maintenance", text: { contains: "is done" } } }))).toBe(1);
  });

  it("blocks an item code in use and shows the next code; a vendor with a known GSTIN or phone shows the existing one (Done when 9)", async () => {
    const { item } = await addTestItem(f, "A4 notebook", 0, { size: "200 pages" });
    await expect(addTestItem(f, "Other notebook", 0, { code: item.code.toLowerCase() })).rejects.toThrow(new RegExp(`Code ${item.code} belongs to A4 notebook, size 200 pages\\. Use the next code: ST-\\d{4}\\.`));
    await expect(addTestItem(f, "a4 Notebook", 0, { size: "200 PAGES" })).rejects.toThrow(/is already an item/);
    const v = (o: Partial<{ name: string; phone: string; gstin: string }>) => run((tx) => saveInventoryVendor(tx, ctx(), { name: "Vendor", contactName: null, phone: null, email: null, gstin: null, address: null, itemsSupplied: null, bank: null, ...o }, null, { mayChangeBank: false }));
    await v({ name: "Sri Sai Stationers", gstin: "36AABCS1234K1Z5", phone: "98490 11223" });
    await expect(v({ name: "Sai Stationers", gstin: "36aabcs1234k1z5" })).rejects.toThrow("A vendor with this GSTIN already exists: Sri Sai Stationers");
    await expect(v({ name: "Sai Paper Mart", phone: "+91 9849011223" })).rejects.toThrow("A vendor with this phone number already exists: Sri Sai Stationers");
    await expect(v({ name: "Bad GST", gstin: "36AABCS1234" })).rejects.toThrow(/15 characters/);
  });

  it("issues a book set in one step: every item's stock goes down and the set price goes to the fees; missing items are listed first (Done when 10)", async () => {
    const reader = (await addTestItem(f, "English Reader 5", 10, { categoryId: f.books, pricePaise: R(180) })).item;
    const maths = (await addTestItem(f, "Maths 5", 10, { categoryId: f.books, pricePaise: R(160) })).item;
    const atlas = (await addTestItem(f, "Atlas 5", 1, { categoryId: f.books, pricePaise: R(300) })).item;
    const books = (await addTestItem(f, "Notebook small", 40, { pricePaise: R(30) })).item;
    const set = await run((tx) => saveBookSet(tx, ctx(), { id: null, name: "Class 5 book set", classIds: [], pricePaise: R(800), items: [{ itemId: reader.id, qty: 1 }, { itemId: maths.id, qty: 1 }, { itemId: atlas.id, qty: 1 }, { itemId: books.id, qty: 6 }] }));
    const issue = (studentId: string, allowMissing: boolean) => run((tx) => issueBookSet(tx, ctx(), { setId: set.id, studentId, locationId: f.main, chargeToFees: true, allowMissing, note: null, date: TODAY, today: TODAY }));
    const first = await issue(f.sita.id, false);
    expect(await stock(reader.id)).toBe(9);
    expect(await stock(maths.id)).toBe(9);
    expect(await stock(atlas.id)).toBe(0);
    expect(await stock(books.id)).toBe(34);
    const due = await run((tx) => tx.studentFeeDue.findUniqueOrThrow({ where: { id: first.issue.feeDueId! } }));
    expect(due.amountPaise).toBe(R(800));
    expect(due.label).toBe("Class 5 book set");
    // The atlas is out now: listed before issuing, and the rest can go with it given later.
    await expect(issue(f.arjun.id, false)).rejects.toThrow("1 of 4 items are out of stock: Atlas 5 (0 of 1). Issue the rest and give the missing items later, or wait.");
    const second = await issue(f.arjun.id, true);
    expect(await stock(reader.id)).toBe(8);
    await run((tx) => stockIn(tx, ctx(), { itemId: atlas.id, locationId: f.main, qty: 5, date: TODAY, source: "Late delivery from the publisher", unitCostPaise: null, batchNo: null, expiresOn: null, today: TODAY }));
    const given = await run((tx) => giveMissing(tx, ctx(), second.issue.id, TODAY));
    expect(given.still).toBe(0);
    expect(await stock(atlas.id)).toBe(4);
  });

  it("flags expired stock and refuses to issue it", async () => {
    const { item } = await addTestItem(f, "Hydrochloric acid", 0, { categoryId: f.labCat, tracksExpiry: true, store: f.labStore });
    await run((tx) => stockIn(tx, ctx(), { itemId: item.id, locationId: f.labStore, qty: 4, date: plus(TODAY, -200), source: "Bought last year", unitCostPaise: null, batchNo: "B-OLD", expiresOn: plus(TODAY, 30), today: plus(TODAY, -200) }));
    await run((tx) => tx.stockBatch.updateMany({ where: { itemId: item.id, batchNo: "B-OLD" }, data: { expiresOn: day("2026-09-01") } }));
    await expect(run((tx) => issueStock(tx, ctx(), { toKind: "DEPARTMENT", departmentId: f.dept.id, locationId: f.labStore, lines: [{ itemId: item.id, qty: 1 }], chargeToFees: false, returnable: false, note: null, date: TODAY, today: TODAY })))
      .rejects.toThrow("Batch B-OLD of Hydrochloric acid expired on 01-09-2026. Expired stock cannot be issued: record it as expired.");
    const batch = await run((tx) => tx.stockBatch.findFirstOrThrow({ where: { itemId: item.id, batchNo: "B-OLD" } }));
    await run((tx) => stockOut(tx, ctx(), { itemId: item.id, locationId: f.labStore, qty: 4, date: TODAY, kind: "EXPIRED", reason: "Batch expired in September", batchId: batch.id, today: TODAY }));
    expect(await run((tx) => balanceOf(tx, item.id, f.labStore))).toBe(0);
  });

  it("moves stock between stores, through Approvals when the settings say so", async () => {
    const { item } = await addTestItem(f, "Test tube", 50, { categoryId: f.labCat });
    const t = await run((tx) => transferStock(tx, ctx(), { fromLocationId: f.main, toLocationId: f.labStore, lines: [{ itemId: item.id, qty: 20 }], date: TODAY, note: null, today: TODAY }));
    expect(t.waiting).toBe(false);
    expect(await run((tx) => balanceOf(tx, item.id, f.labStore))).toBe(20);
    await run((tx) => tx.inventorySetting.update({ where: { schoolId: f.school.id }, data: { transfersNeedApproval: true } }));
    const w = await run((tx) => transferStock(tx, ctx(), { fromLocationId: f.main, toLocationId: f.labStore, lines: [{ itemId: item.id, qty: 10 }], date: TODAY, note: null, today: TODAY }));
    expect(w.waiting).toBe(true);
    expect(await run((tx) => balanceOf(tx, item.id, f.labStore))).toBe(20);
    await run((tx) => decideTransfer(tx, as(f, f.principal.id), w.transfer.id, "approve", null, TODAY));
    expect(await run((tx) => balanceOf(tx, item.id, f.labStore))).toBe(30);
    expect(await run((tx) => balanceOf(tx, item.id, f.main))).toBe(20);
    await run((tx) => tx.inventorySetting.update({ where: { schoolId: f.school.id }, data: { transfersNeedApproval: false } }));
  });

  it("works out depreciation by straight line and written-down value", () => {
    const a = { costPaise: R(100000), purchaseDate: day("2023-10-01") };
    const slm = depreciation(a, "SLM", 10, TODAY);
    expect(slm.map((r) => r.closing)).toEqual([R(90000), R(80000), R(70000)]);
    const wdv = depreciation(a, "WDV", 40, TODAY);
    expect(wdv.map((r) => r.closing)).toEqual([R(60000), R(36000), R(21600)]);
    expect(bookValue({ ...a, status: "IN_USE" }, "SLM", 10, day("2024-06-01"))).toBe(R(100000));
  });

  it("imports items with opening stock and assets, showing a preview, adding the good rows, and Undo takes them back (Done when 11)", async () => {
    const items = importKind(ITEMS_IMPORT)!;
    const headers = ["Item name", "Category", "Unit", "Reorder level", "Price per unit (₹)", "Opening stock", "Store"];
    const rows = [
      ["Duster", "Stationery", "piece", "10", "40", "60", ""],
      ["Phenyl", "Cleaning", "bottle", "5", "350", "Main store: 8; Lab store: 2", ""],
      ["", "Stationery", "piece", "", "", "1", ""],
      ["Stapler", "Stationery", "crate", "", "", "4", ""],
      ["Paint brush", "Art", "piece", "", "25", "30", ""],
    ];
    const pv = await run((tx) => previewImport(tx, ctx(), items, rows, byHeadings(items, headers)));
    expect(pv.good.map((g) => g.row.name)).toEqual(["Duster", "Phenyl", "Paint brush"]);
    expect(pv.bad).toHaveLength(2);
    const batch = await run((tx) => runImport(tx, ctx(), items, "items.csv", pv));
    expect(batch.added).toBe(3);
    const phenyl = await run((tx) => tx.item.findFirstOrThrow({ where: { name: "Phenyl", archivedAt: null } }));
    expect(await stock(phenyl.id)).toBe(10);
    expect(await run((tx) => tx.itemCategory.count({ where: { name: "Art" } }))).toBe(1);
    await run((tx) => undoImport(tx, ctx(), batch.id));
    expect(await stock(phenyl.id)).toBe(0);
    expect((await run((tx) => tx.item.findUniqueOrThrow({ where: { id: phenyl.id } }))).archivedAt).not.toBeNull();

    const assets = importKind(ASSETS_IMPORT)!;
    const aHeaders = ["Asset name", "Type", "Location or person", "Purchase date", "Cost (₹)"];
    const aRows = [
      ["Projector", "IT", "Room 12", "15-06-2024", "45000"],
      ["Bench", "Furniture", "Science", "", ""],
      ["Laptop", "IT", "Kiran Rao", "01-01-2025", "60000"],
      ["Ghost", "IT", "Nowhere room", "", ""],
      ["Bad type", "Spaceship", "Room 12", "", ""],
    ];
    const apv = await run((tx) => previewImport(tx, ctx(), assets, aRows, byHeadings(assets, aHeaders)));
    expect(apv.good.map((g) => g.row.name)).toEqual(["Projector", "Bench", "Laptop"]);
    expect(apv.bad).toHaveLength(2);
    const aBatch = await run((tx) => runImport(tx, ctx(), assets, "assets.csv", apv));
    expect(aBatch.added).toBe(3);
    const laptop = await run((tx) => tx.asset.findFirstOrThrow({ where: { name: "Laptop" } }));
    expect(laptop.staffId).toBe(f.teacherStaff.id);
    await run((tx) => undoImport(tx, ctx(), aBatch.id));
    expect((await run((tx) => tx.asset.findUniqueOrThrow({ where: { id: laptop.id } }))).archivedAt).not.toBeNull();
  });

  it("never deletes: archived items keep their movements, and the app cannot delete rows", async () => {
    const { item } = await addTestItem(f, "Old register", 0);
    await run((tx) => archiveItem(tx, ctx(), item.id, "No longer used"));
    expect((await run((tx) => tx.item.findUniqueOrThrow({ where: { id: item.id } }))).archivedAt).not.toBeNull();
    await expect(run((tx) => tx.item.delete({ where: { id: item.id } }))).rejects.toThrow();
    await expect(run((tx) => tx.stockMovement.deleteMany({}))).rejects.toThrow();
  });

  it("uses the default settings: categories, stores, units, asset types and a ₹5,000 approval limit", async () => {
    const s = await run((tx) => inventorySettings(tx, ctx()));
    expect(s.approveUpToPaise).toBe(R(5000));
    expect(s.warrantyReminderDays).toBe(30);
    expect(s.assetTypes).toEqual(["Furniture", "IT", "Lab", "Sports", "Vehicles", "Others"]);
    const stores = await run((tx) => tx.storeLocation.findMany({ orderBy: { sortOrder: "asc" } }));
    expect(stores.map((x) => x.name)).toEqual(["Main store", "Lab store", "Sports room"]);
    expect(stores.filter((x) => x.isMain)).toHaveLength(1);
  });
});

function day(s: string) {
  return new Date(`${s}T00:00:00Z`);
}
