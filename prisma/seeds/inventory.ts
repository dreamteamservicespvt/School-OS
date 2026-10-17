// Inventory Management demo (14): switched on for Sunrise only (it is an
// optional module, off for every other school). Items in each category with
// opening stock in three stores, some low and one out of stock; lab
// chemicals with expiry dates (one batch expired); book sets for Class 1 and
// Class 6 issued to students and charged to their fees (one with an item
// still to give); issues to staff, departments and classes; vendors with
// GSTIN; purchase requests (one waiting for the Principal), orders (one part
// received, one late), goods received, vendor bills (one paid, one unpaid);
// assets in rooms, a department and with a person, tags in sequence,
// warranties and an AMC ending soon, repairs, one disposal waiting and one
// done; the facility register; maintenance requests raised by teachers;
// lab experiments and safety checks; a stock audit waiting for approval and
// a closed asset check. Dates are set from the day the demo is seeded.
import { withSchool, type SchoolContext } from "../../src/lib/db";
import { decide } from "../../src/lib/approvals";
import { inventorySettings } from "../../src/lib/inventory/settings";
import { addItem } from "../../src/lib/inventory/items";
import { stockIn, stockOut, transferStock } from "../../src/lib/inventory/stock";
import { issueBookSet, issueStock, saveBookSet } from "../../src/lib/inventory/issues";
import { saveInventoryVendor } from "../../src/lib/inventory/vendors";
import { createOrder, createRequest, payBill, receiveGoods, recordBill } from "../../src/lib/inventory/purchases";
import { addAssets, addRepair, assignAsset, linkItem, requestDisposal, scanTag, startAssetAudit, closeAssetAudit, updateRepair } from "../../src/lib/inventory/assets";
import { assignMaintenance, closeMaintenance, raiseMaintenance, recordSafetyCheck, saveExperiment, saveFacility } from "../../src/lib/inventory/facilities";
import { saveCounts, startAudit, submitAudit } from "../../src/lib/inventory/audits";
import { mainBankAccount } from "../../src/lib/finance/settings";
import { LAB_CHECKLIST } from "../../src/lib/inventory/words";
import type { SeedSchool } from "./types";

const OFFSET = 330 * 60_000; // Asia/Kolkata
const today = () => new Date(`${new Date(Date.now() + OFFSET).toISOString().slice(0, 10)}T00:00:00Z`);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const R = (rupees: number) => BigInt(Math.round(rupees * 100));
const plainCtx = (school: SeedSchool, userId: string | null): SchoolContext => ({ schoolId: school.schoolId, userId });

// [name, category, unit, size, reorder, price ₹, main store, other store name, other qty, tracks expiry]
type I = [string, string, string, string | null, number | null, number, number, string | null, number, boolean];
const ITEMS: I[] = [
  ["A4 paper", "Stationery", "ream", null, 20, 260, 45, null, 0, false],
  ["Notebook long, 200 pages", "Stationery", "piece", null, 100, 55, 640, null, 0, false],
  ["Notebook small, 100 pages", "Stationery", "piece", null, 100, 30, 820, null, 0, false],
  ["Blue ball pens", "Stationery", "box", null, 20, 100, 12, null, 0, false],
  ["Whiteboard markers", "Stationery", "box", null, 10, 180, 14, null, 0, false],
  ["Chalk", "Stationery", "box", null, 30, 45, 0, null, 0, false],
  ["Chart paper", "Stationery", "piece", null, 50, 10, 300, null, 0, false],
  ["Glue sticks", "Stationery", "piece", null, 20, 25, 80, null, 0, false],
  ["Exam answer booklets", "Stationery", "piece", null, 500, 6, 2400, null, 0, false],
  ["Attendance register", "Stationery", "piece", null, 10, 120, 25, null, 0, false],
  ["Printer toner cartridge", "Stationery", "piece", "HP 88A", 2, 2850, 3, null, 0, false],
  ["Phenyl, 5 litre", "Cleaning", "bottle", null, 10, 350, 8, null, 0, false],
  ["Floor broom", "Cleaning", "piece", null, 10, 90, 24, null, 0, false],
  ["Toilet cleaner", "Cleaning", "bottle", null, 12, 110, 30, null, 0, false],
  ["Hand wash", "Cleaning", "bottle", null, 15, 95, 3, null, 0, false],
  ["Hydrochloric acid, 500 ml", "Lab", "bottle", null, 4, 240, 0, "Lab store", 10, true],
  ["Sodium hydroxide pellets, 500 g", "Lab", "bottle", null, 3, 310, 0, "Lab store", 6, true],
  ["Litmus paper booklet", "Lab", "packet", null, 10, 40, 0, "Lab store", 25, true],
  ["Test tubes", "Lab", "piece", null, 50, 12, 100, "Lab store", 200, false],
  ["Beaker, 250 ml", "Lab", "piece", null, 10, 85, 0, "Lab store", 40, false],
  ["Bunsen burner", "Lab", "piece", null, 2, 450, 0, "Lab store", 12, false],
  ["Football", "Sports", "piece", "5", 4, 650, 0, "Sports room", 6, false],
  ["Cricket ball", "Sports", "piece", null, 6, 220, 0, "Sports room", 3, false],
  ["Badminton shuttles", "Sports", "box", null, 3, 480, 0, "Sports room", 4, false],
  ["Skipping rope", "Sports", "piece", null, 10, 80, 0, "Sports room", 30, false],
  ["School shirt", "Uniforms", "piece", "28", 10, 350, 40, null, 0, false],
  ["School shirt", "Uniforms", "piece", "30", 10, 350, 35, null, 0, false],
  ["School shirt", "Uniforms", "piece", "32", 10, 370, 6, null, 0, false],
  ["School shirt", "Uniforms", "piece", "34", 10, 370, 22, null, 0, false],
  ["School tie", "Uniforms", "piece", null, 20, 90, 120, null, 0, false],
  ["School belt", "Uniforms", "piece", null, 20, 120, 95, null, 0, false],
  ["English Reader Class 1", "Books", "piece", null, 10, 180, 60, null, 0, false],
  ["Mathematics Class 1", "Books", "piece", null, 10, 160, 60, null, 0, false],
  ["EVS Class 1", "Books", "piece", null, 10, 150, 60, null, 0, false],
  ["Science Class 6", "Books", "piece", null, 10, 220, 50, null, 0, false],
  ["Mathematics Class 6", "Books", "piece", null, 10, 240, 50, null, 0, false],
  ["Social Science Class 6", "Books", "piece", null, 10, 210, 8, null, 0, false],
  ["English Class 6", "Books", "piece", null, 10, 200, 50, null, 0, false],
];

const VENDORS = [
  { name: "Sri Lakshmi Stationers", contactName: "K. Srinivas", phone: "9849022331", email: "orders@srilakshmistationers.in", gstin: "36AAKFS4821K1Z5", address: "Ameerpet, Hyderabad", itemsSupplied: "Paper, notebooks, pens, registers", bank: { bankName: "State Bank of India", accountNo: "30012345678", ifsc: "SBIN0004567" } },
  { name: "Hyderabad Scientific Co.", contactName: "Farhan Ali", phone: "9866044552", email: "sales@hydscientific.in", gstin: "36AAECH7713M1Z2", address: "Koti, Hyderabad", itemsSupplied: "Lab glassware, chemicals, microscopes", bank: { bankName: "HDFC Bank", accountNo: "50200012345671", ifsc: "HDFC0001234" } },
  { name: "Champion Sports", contactName: "Ravi Teja", phone: "9010055663", email: "championsports.hyd@gmail.com", gstin: "36ABDPT2211L1Z9", address: "Abids, Hyderabad", itemsSupplied: "Balls, nets, bats, shuttles", bank: null },
  { name: "Clean Care Supplies", contactName: "Lakshmi Devi", phone: "9700366774", email: null, gstin: null, address: "KPHB Colony, Hyderabad", itemsSupplied: "Housekeeping and cleaning", bank: null },
  { name: "Navya Uniforms", contactName: "Navya Reddy", phone: "9959077885", email: "navyauniforms@gmail.com", gstin: "36AAPFN5520Q1Z7", address: "Dilsukhnagar, Hyderabad", itemsSupplied: "School uniforms, ties, belts", bank: null },
  { name: "Techno IT Solutions", contactName: "Suresh Kumar", phone: "9885088996", email: "support@technoit.in", gstin: "36AAHCT9087R1Z4", address: "Madhapur, Hyderabad", itemsSupplied: "Computers, projectors, printers, AMC", bank: { bankName: "ICICI Bank", accountNo: "123405001234", ifsc: "ICIC0001234" } },
];

export async function seedInventory(school: SeedSchool) {
  if (!school.full) return;
  const store = school.users.store ?? school.users.admin;
  const ctx = plainCtx(school, store);
  const teacherCtx = plainCtx(school, school.users.teacher);
  const principalCtx = plainCtx(school, school.users.principal);
  const t0 = today();

  // 1. The module is on for the demo school, with the default settings, categories and stores.
  await withSchool(ctx, async (tx) => {
    await tx.schoolModule.upsert({ where: { schoolId_moduleKey: { schoolId: school.schoolId, moduleKey: "inventory-management" } }, create: { schoolId: school.schoolId, moduleKey: "inventory-management", isOn: true }, update: { isOn: true } });
    await inventorySettings(tx, ctx);
  });

  // 2. Items with opening stock, as the store keeper added them at the start of the year.
  await withSchool(ctx, async (tx) => {
    const cats = await tx.itemCategory.findMany();
    const stores = await tx.storeLocation.findMany();
    const storeId = (name: string) => stores.find((s) => s.name === name)!.id;
    const main = storeId("Main store");
    for (const [name, cat, unit, size, reorder, price, mainQty, other, otherQty, expiry] of ITEMS) {
      const opening = [
        ...(mainQty ? [{ locationId: main, qty: mainQty, batchNo: expiry ? "B-2601" : null, expiresOn: expiry ? addDays(t0, 300) : null }] : []),
        ...(other && otherQty ? [{ locationId: storeId(other), qty: otherQty, batchNo: expiry ? "B-2601" : null, expiresOn: expiry ? addDays(t0, 300) : null }] : []),
      ];
      await addItem(tx, ctx, { code: null, name, categoryId: cats.find((c) => c.name === cat)!.id, unit, size, reorderLevel: reorder, pricePaise: R(price), tracksExpiry: expiry, note: null }, opening, addDays(t0, -120));
    }
    // A second batch of acid bought last year has now expired (shown in Lab stock, cannot be issued).
    const acid = await tx.item.findFirstOrThrow({ where: { name: "Hydrochloric acid, 500 ml" } });
    await stockIn(tx, ctx, { itemId: acid.id, locationId: storeId("Lab store"), qty: 3, date: addDays(t0, -100), source: "Left over from last year's stock", unitCostPaise: R(230), batchNo: "B-2502", expiresOn: addDays(t0, 30), today: addDays(t0, -100) });
    await tx.stockBatch.updateMany({ where: { itemId: acid.id, batchNo: "B-2502" }, data: { expiresOn: addDays(t0, -12) } });
    // Movements in the term: stock in, a transfer, a write-off and things used up.
    const item = async (name: string, size: string | null = null) => tx.item.findFirstOrThrow({ where: { name, size } });
    await stockIn(tx, ctx, { itemId: (await item("Chart paper")).id, locationId: main, qty: 100, date: addDays(t0, -45), source: "Donated by the PTA for the science fair", unitCostPaise: null, batchNo: null, expiresOn: null, today: addDays(t0, -45) });
    await transferStock(tx, ctx, { fromLocationId: main, toLocationId: storeId("Lab store"), lines: [{ itemId: (await item("Test tubes")).id, qty: 40 }], date: addDays(t0, -30), note: "For the Class 9 practicals", today: addDays(t0, -30) });
    await stockOut(tx, ctx, { itemId: (await item("Beaker, 250 ml")).id, locationId: storeId("Lab store"), qty: 3, date: addDays(t0, -18), kind: "DAMAGED", reason: "Broken during the Class 10 practical", batchId: null, today: t0 });
    await stockOut(tx, ctx, { itemId: (await item("Cricket ball")).id, locationId: storeId("Sports room"), qty: 1, date: addDays(t0, -9), kind: "LOST", reason: "Lost over the boundary wall in the inter-house match", batchId: null, today: t0 });
    await stockOut(tx, ctx, { itemId: (await item("Floor broom")).id, locationId: main, qty: 6, date: addDays(t0, -20), kind: "OUT", reason: "Given to the housekeeping staff", batchId: null, today: t0 });
  }, { timeout: 300_000 });

  // 3. Book sets for Class 1 and Class 6, issued to students and charged to their fees.
  await withSchool(ctx, async (tx) => {
    const item = async (name: string) => tx.item.findFirstOrThrow({ where: { name } });
    const classes = await tx.schoolClass.findMany({ where: { name: { in: ["Class 1", "Class 6"] } } });
    const cls = (n: string) => classes.find((c) => c.name === n)?.id;
    const main = (await tx.storeLocation.findFirstOrThrow({ where: { isMain: true } })).id;
    const one = await saveBookSet(tx, ctx, { id: null, name: "Class 1 book set 2026-27", classIds: [cls("Class 1")].filter((x): x is string => Boolean(x)), pricePaise: null, items: [
      { itemId: (await item("English Reader Class 1")).id, qty: 1 }, { itemId: (await item("Mathematics Class 1")).id, qty: 1 }, { itemId: (await item("EVS Class 1")).id, qty: 1 }, { itemId: (await item("Notebook small, 100 pages")).id, qty: 6 },
    ] });
    const six = await saveBookSet(tx, ctx, { id: null, name: "Class 6 book set 2026-27", classIds: [cls("Class 6")].filter((x): x is string => Boolean(x)), pricePaise: null, items: [
      { itemId: (await item("Science Class 6")).id, qty: 1 }, { itemId: (await item("Mathematics Class 6")).id, qty: 1 }, { itemId: (await item("Social Science Class 6")).id, qty: 1 }, { itemId: (await item("English Class 6")).id, qty: 1 }, { itemId: (await item("Notebook long, 200 pages")).id, qty: 8 },
    ] });
    const studentsOf = async (className: string, take: number) => {
      const secs = await tx.section.findMany({ where: { schoolClass: { name: className } }, select: { id: true } });
      const e = await tx.enrolment.findMany({ where: { academicYearId: school.yearId, archivedAt: null, sectionId: { in: secs.map((s) => s.id) }, status: "STUDYING" }, orderBy: [{ sectionId: "asc" }, { rollNo: "asc" }], take, select: { studentId: true } });
      return e.map((x) => x.studentId);
    };
    for (const [i, studentId] of (await studentsOf("Class 1", 18)).entries()) {
      await issueBookSet(tx, ctx, { setId: one.id, studentId, locationId: main, chargeToFees: true, allowMissing: false, note: null, date: addDays(t0, -60 + (i % 6)), today: t0 });
    }
    // Social Science Class 6 runs out after 8: the rest get the set without it, to be given later.
    for (const [i, studentId] of (await studentsOf("Class 6", 12)).entries()) {
      await issueBookSet(tx, ctx, { setId: six.id, studentId, locationId: main, chargeToFees: true, allowMissing: true, note: i >= 8 ? "Social Science book to be given when it arrives" : null, date: addDays(t0, -58 + (i % 5)), today: t0 });
    }
  }, { timeout: 300_000 });

  // 4. Issues to staff, a department and classes.
  await withSchool(ctx, async (tx) => {
    const item = async (name: string) => tx.item.findFirstOrThrow({ where: { name } });
    const stores = await tx.storeLocation.findMany();
    const main = stores.find((s) => s.isMain)!.id;
    const lab = stores.find((s) => s.name === "Lab store")!.id;
    const sports = stores.find((s) => s.name === "Sports room")!.id;
    const teachers = await tx.staff.findMany({ where: { staffType: "Teaching", archivedAt: null, status: "ACTIVE" }, orderBy: { fullName: "asc" }, take: 8 });
    const science = await tx.department.findFirst({ where: { name: "Science" } });
    const support = await tx.department.findFirst({ where: { name: "Support" } });
    const sections = await tx.section.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, take: 6, include: { schoolClass: true } });
    for (const [i, s] of teachers.entries()) {
      await issueStock(tx, ctx, { toKind: "STAFF", staffId: s.id, locationId: main, lines: [{ itemId: (await item("Whiteboard markers")).id, qty: 1 }, ...(i % 2 ? [{ itemId: (await item("Blue ball pens")).id, qty: 1 }] : [])], chargeToFees: false, returnable: false, note: null, date: addDays(t0, -60 + i * 5), today: t0 });
    }
    if (science) await issueStock(tx, ctx, { toKind: "DEPARTMENT", departmentId: science.id, locationId: lab, lines: [{ itemId: (await item("Litmus paper booklet")).id, qty: 8 }, { itemId: (await item("Test tubes")).id, qty: 30 }], chargeToFees: false, returnable: false, note: "Class 7 and 8 practicals", date: addDays(t0, -25), today: t0 });
    if (support) await issueStock(tx, ctx, { toKind: "DEPARTMENT", departmentId: support.id, locationId: main, lines: [{ itemId: (await item("Toilet cleaner")).id, qty: 10 }, { itemId: (await item("Phenyl, 5 litre")).id, qty: 2 }], chargeToFees: false, returnable: false, note: null, date: addDays(t0, -14), today: t0 });
    for (const [i, sec] of sections.entries()) {
      await issueStock(tx, ctx, { toKind: "CLASS", sectionId: sec.id, locationId: main, lines: [{ itemId: (await item("Chart paper")).id, qty: 10 }, { itemId: (await item("Glue sticks")).id, qty: 4 }], chargeToFees: false, returnable: false, note: null, date: addDays(t0, -40 + i * 3), today: t0 });
    }
    // Sports things lent to the PE teacher for the inter-house matches, to come back.
    if (teachers[2]) await issueStock(tx, ctx, { toKind: "STAFF", staffId: teachers[2].id, locationId: sports, lines: [{ itemId: (await item("Football")).id, qty: 2 }, { itemId: (await item("Skipping rope")).id, qty: 10 }], chargeToFees: false, returnable: true, note: "Inter-house matches", date: addDays(t0, -6), today: t0 });
  }, { timeout: 300_000 });

  // 5. Vendors, purchase requests, orders, goods received and bills.
  await withSchool(ctx, async (tx) => {
    const v: Record<string, string> = {};
    for (const x of VENDORS) v[x.name] = (await saveInventoryVendor(tx, ctx, x, null, { mayChangeBank: true })).id;
    const item = async (name: string) => tx.item.findFirstOrThrow({ where: { name } });
    const main = (await tx.storeLocation.findFirstOrThrow({ where: { isMain: true } })).id;
    const labStore = (await tx.storeLocation.findFirstOrThrow({ where: { name: "Lab store" } })).id;
    const sports = (await tx.storeLocation.findFirstOrThrow({ where: { name: "Sports room" } })).id;
    const paper = await item("A4 paper"); const pens = await item("Blue ball pens"); const markers = await item("Whiteboard markers");

    // Stationery: request (within the limit, approved at once) → order → part received → bill (unpaid).
    const r1 = await createRequest(tx, ctx, { lines: [{ itemId: paper.id, qty: 10, estUnitPaise: R(255) }, { itemId: pens.id, qty: 10, estUnitPaise: R(95) }, { itemId: markers.id, qty: 8, estUnitPaise: R(175) }], neededBy: addDays(t0, -20), reason: "Term 2 stock for the staff room", departmentId: null, estimatePaise: null, date: addDays(t0, -40) });
    const o1 = await createOrder(tx, ctx, { requestId: r1.request.id, vendorId: v["Sri Lakshmi Stationers"], locationId: main, expectedOn: addDays(t0, -30), note: null, date: addDays(t0, -38), lines: [{ itemId: paper.id, qty: 10, unitPricePaise: R(250) }, { itemId: pens.id, qty: 10, unitPricePaise: R(95) }, { itemId: markers.id, qty: 8, unitPricePaise: R(170) }] });
    const o1Lines = await tx.purchaseOrderLine.findMany({ where: { orderId: o1.order.id } });
    const lineOf = (itemId: string) => o1Lines.find((l) => l.itemId === itemId)!.id;
    await receiveGoods(tx, ctx, { orderId: o1.order.id, date: addDays(t0, -32), locationId: main, extraReason: null, note: "Markers to follow next week", today: addDays(t0, -32), lines: [{ orderLineId: lineOf(paper.id), qty: 10, batchNo: null, expiresOn: null }, { orderLineId: lineOf(pens.id), qty: 10, batchNo: null, expiresOn: null }] });

    // Finance asks for a bill photo above ₹2,000; the demo bills are entered without one.
    const fin = await tx.financeSetting.findUnique({ where: { schoolId: ctx.schoolId } });
    if (fin) await tx.financeSetting.update({ where: { schoolId: ctx.schoolId }, data: { billRequiredAbove: R(100000) } });
    await recordBill(tx, ctx, { orderId: o1.order.id, vendorId: null, billNo: "SLS/2627/0418", billDate: addDays(t0, -32), dueDate: addDays(t0, -2), amountPaise: R(3450), fileId: null, note: null, duplicateReason: null });

    // Lab: request → order → fully received → bill paid by bank transfer.
    const tubes = await item("Test tubes"); const beakers = await item("Beaker, 250 ml");
    const r2 = await createRequest(tx, ctx, { lines: [{ itemId: tubes.id, qty: 100, estUnitPaise: R(12) }, { itemId: beakers.id, qty: 20, estUnitPaise: R(85) }], neededBy: null, reason: "Breakage over Term 1", departmentId: null, estimatePaise: null, date: addDays(t0, -70) });
    const o2 = await createOrder(tx, ctx, { requestId: r2.request.id, vendorId: v["Hyderabad Scientific Co."], locationId: labStore, expectedOn: addDays(t0, -60), note: null, date: addDays(t0, -68), lines: [{ itemId: tubes.id, qty: 100, unitPricePaise: R(11) }, { itemId: beakers.id, qty: 20, unitPricePaise: R(82) }] });
    const o2Lines = await tx.purchaseOrderLine.findMany({ where: { orderId: o2.order.id } });
    await receiveGoods(tx, ctx, { orderId: o2.order.id, date: addDays(t0, -61), locationId: labStore, extraReason: null, note: null, today: addDays(t0, -61), lines: o2Lines.map((l) => ({ orderLineId: l.id, qty: l.qty, batchNo: null, expiresOn: null })) });
    const b2 = await recordBill(tx, ctx, { orderId: o2.order.id, vendorId: null, billNo: "HSC-7781", billDate: addDays(t0, -61), dueDate: addDays(t0, -31), amountPaise: R(2740), fileId: null, note: null, duplicateReason: null });
    if (fin) await tx.financeSetting.update({ where: { schoolId: ctx.schoolId }, data: { billRequiredAbove: fin.billRequiredAbove } });
    if (b2.expense.status === "APPROVED") {
      const bank = await mainBankAccount(tx, ctx);
      await payBill(tx, plainCtx(school, school.users.accountant ?? store), b2.invoice.id, { date: addDays(t0, -35), mode: "BANK_TRANSFER", reference: "NEFT20261145", accountId: bank?.id ?? null });
    }

    // Sports: ordered, nothing received yet, and the expected date has passed.
    const shuttles = await item("Badminton shuttles"); const balls = await item("Cricket ball");
    const r3 = await createRequest(tx, ctx, { lines: [{ itemId: shuttles.id, qty: 6, estUnitPaise: R(480) }, { itemId: balls.id, qty: 6, estUnitPaise: R(220) }], neededBy: addDays(t0, 5), reason: "Inter-house tournament", departmentId: null, estimatePaise: null, date: addDays(t0, -12) });
    await createOrder(tx, ctx, { requestId: r3.request.id, vendorId: v["Champion Sports"], locationId: sports, expectedOn: addDays(t0, -3), note: "Deliver to the sports room", date: addDays(t0, -11), lines: [{ itemId: shuttles.id, qty: 6, unitPricePaise: R(470) }, { itemId: balls.id, qty: 6, unitPricePaise: R(215) }] });
  }, { timeout: 300_000 });

  // A teacher's request above the approved amount, waiting for the Principal.
  await withSchool(teacherCtx, async (tx) => {
    const burners = await tx.item.findFirstOrThrow({ where: { name: "Bunsen burner" } });
    const science = await tx.department.findFirst({ where: { name: "Science" } });
    await createRequest(tx, teacherCtx, { lines: [{ itemId: burners.id, qty: 12, estUnitPaise: R(450) }], neededBy: addDays(t0, 20), reason: "The old burners leak; needed before the Class 10 practical exams", departmentId: science?.id ?? null, estimatePaise: null, date: addDays(t0, -2) });
  }, { timeout: 120_000 });

  // 6. The facility register (the Time Table's rooms, and the school's other places).
  await withSchool(ctx, async (tx) => {
    const staff = await tx.staff.findMany({ where: { archivedAt: null, status: "ACTIVE" }, orderBy: { fullName: "asc" } });
    const keeper = staff.find((s) => s.userLoginId === store)?.id ?? null;
    const scienceTeacher = staff.find((s) => s.designation.includes("Science"))?.id ?? null;
    for (const r of await tx.room.findMany({ where: { archivedAt: null } })) {
      await saveFacility(tx, ctx, { roomId: r.id, campusId: null, name: r.name, type: r.kind === "lab" ? "Lab" : r.name === "Library" ? "Other" : "Classroom", capacity: r.capacity, building: "Main block", floor: r.kind === "lab" ? "First" : "Ground", inChargeStaffId: r.kind === "lab" ? scienceTeacher : null, note: null });
    }
    const add = async (name: string, type: string, capacity: number | null, building: string, floor: string | null, inCharge: string | null) =>
      saveFacility(tx, ctx, { roomId: null, campusId: school.campusId, name, type, capacity, building, floor, inChargeStaffId: inCharge, note: null });
    for (let n = 101; n <= 106; n++) await add(`Room ${n}`, "Classroom", 40, "Main block", "Ground", null);
    for (let n = 201; n <= 204; n++) await add(`Room ${n}`, "Classroom", 40, "Main block", "First", null);
    await add("Assembly hall", "Hall", 400, "Main block", "Ground", null);
    await add("Main ground", "Ground", null, "Campus", null, null);
    await add("Staff room", "Office", 30, "Main block", "Ground", null);
    await add("Principal's office", "Office", 6, "Main block", "Ground", null);
    await add("Store room", "Store", null, "Main block", "Ground", keeper);
  }, { timeout: 120_000 });

  // 7. Assets: tags in sequence, places, warranties, repairs, links and disposals.
  await withSchool(ctx, async (tx) => {
    const rooms = await tx.room.findMany();
    const room = (name: string) => rooms.find((r) => r.name === name)!.id;
    const vendor = async (name: string) => (await tx.vendor.findFirstOrThrow({ where: { name } })).id;
    const techno = await vendor("Techno IT Solutions"); const sci = await vendor("Hyderabad Scientific Co.");
    const principalStaff = await tx.staff.findFirst({ where: { userLoginId: school.users.principal } });
    const admin = await tx.department.findFirst({ where: { name: "Administration" } });
    const base = { serialNo: null, vendorId: null, warrantyEnd: null, amcEnd: null, condition: "Good", note: null, departmentId: null, staffId: null, tag: null };
    for (let n = 101; n <= 106; n++) await addAssets(tx, ctx, { ...base, name: "Student desk, double seater", type: "Furniture", roomId: room(`Room ${n}`), purchaseDate: addDays(t0, -3 * 365), costPaise: R(3200) }, 5);
    const projectors = [];
    for (const [i, n] of [101, 102, 103, 104].entries()) {
      projectors.push(...await addAssets(tx, ctx, { ...base, name: "Projector, Epson EB-X51", type: "IT", roomId: room(`Room ${n}`), serialNo: `X51K${4410 + i}`, vendorId: techno, purchaseDate: addDays(t0, -700 + i * 2), costPaise: R(42000), warrantyEnd: addDays(t0, i === 0 ? 18 : 400 + i) }, 1));
    }
    const computers = await addAssets(tx, ctx, { ...base, name: "Desktop computer, Dell OptiPlex 3000", type: "IT", roomId: room("Computer lab"), vendorId: techno, purchaseDate: addDays(t0, -2 * 365), costPaise: R(38500), amcEnd: addDays(t0, 24) }, 20);
    const printer = (await addAssets(tx, ctx, { ...base, name: "Laser printer, HP LaserJet M1136", type: "IT", roomId: room("Staff room"), serialNo: "VNB3K91122", vendorId: techno, purchaseDate: addDays(t0, -500), costPaise: R(16500), warrantyEnd: addDays(t0, 230) }, 1))[0];
    await addAssets(tx, ctx, { ...base, name: "Laptop, Lenovo ThinkPad E14", type: "IT", ...(principalStaff ? { roomId: null, staffId: principalStaff.id } : { roomId: room("Principal's office") }), serialNo: "PF3QZ8K1", vendorId: techno, purchaseDate: addDays(t0, -200), costPaise: R(62000), warrantyEnd: addDays(t0, 530) }, 1);
    if (admin) await addAssets(tx, ctx, { ...base, name: "Digital camera, Canon EOS 1500D", type: "Others", roomId: null, departmentId: admin.id, purchaseDate: addDays(t0, -900), costPaise: R(34000) }, 1);
    await addAssets(tx, ctx, { ...base, name: "Compound microscope", type: "Lab", roomId: room("Science lab"), vendorId: sci, purchaseDate: addDays(t0, -4 * 365), costPaise: R(8500) }, 6);
    await addAssets(tx, ctx, { ...base, name: "Fire extinguisher, 4 kg", type: "Others", roomId: room("Science lab"), purchaseDate: addDays(t0, -330), costPaise: R(2600), warrantyEnd: addDays(t0, 35) }, 1);
    await addAssets(tx, ctx, { ...base, name: "Table tennis table", type: "Sports", roomId: room("Assembly hall"), purchaseDate: addDays(t0, -1100), costPaise: R(24000), condition: "Fair" }, 1);
    await addAssets(tx, ctx, { ...base, name: "Steel almirah", type: "Furniture", roomId: room("Store room"), purchaseDate: addDays(t0, -2000), costPaise: R(11000), condition: "Fair" }, 2);

    // A projector moved, one in repair, a computer repaired (cost in Finance).
    await assignAsset(tx, ctx, projectors[3].id, { roomId: room("Assembly hall"), departmentId: null, staffId: null }, addDays(t0, -15), "Moved for the annual day rehearsals");
    await addRepair(tx, ctx, { assetId: projectors[1].id, date: addDays(t0, -4), problem: "Lamp does not switch on; shows a red light", vendorId: techno, note: null });
    const fixed = await addRepair(tx, ctx, { assetId: computers[4].id, date: addDays(t0, -26), problem: "Power supply failed", vendorId: techno, note: null });
    await updateRepair(tx, ctx, fixed.id, { status: "DONE", doneOn: addDays(t0, -22), costPaise: R(1800), vendorId: techno, note: "Power supply unit replaced", toFinance: true, billFileId: null, billNo: "TIS-3391", duplicateReason: null });
    const toner = await tx.item.findFirstOrThrow({ where: { name: "Printer toner cartridge" } });
    await linkItem(tx, ctx, printer.id, toner.id, "Toner for this printer");

    // An old computer to scrap, waiting for the Principal; a broken desk scrapped earlier.
    await requestDisposal(tx, ctx, { assetId: computers[19].id, method: "SCRAPPED", reason: "Motherboard failed; repair costs more than a new one", date: t0, salePaise: null, buyer: null, saleMode: null, saleRef: null });
    const desks = await tx.asset.findMany({ where: { name: "Student desk, double seater" }, orderBy: { tag: "asc" } });
    const gone = await requestDisposal(tx, ctx, { assetId: desks[3].id, method: "SOLD", reason: "Broken frame, sold as scrap", date: addDays(t0, -50), salePaise: R(400), buyer: "Sri Ram Traders", saleMode: "CASH", saleRef: null });
    if (gone.disposal.approvalId) await decide(tx, principalCtx, gone.disposal.approvalId, "approve", "Sold with the old benches");
  }, { timeout: 300_000 });

  // 8. Maintenance requests raised by teachers from their phones.
  await withSchool(teacherCtx, async (tx) => {
    const room = async (name: string) => (await tx.room.findFirstOrThrow({ where: { name } })).id;
    const projector = await tx.asset.findFirst({ where: { name: { startsWith: "Projector" } }, orderBy: { tag: "asc" } });
    const raise = (roomName: string, problem: string, priority: "LOW" | "NORMAL" | "HIGH" | "URGENT", assetId: string | null = null) => room(roomName).then((roomId) => raiseMaintenance(tx, teacherCtx, { roomId, assetId, problem, photoFileId: null, priority }));
    const reqs = [
      await raise("Room 102", "Ceiling fan near the window is not working and makes a noise", "HIGH"),
      await raise("Room 104", "Two tube lights flicker all day", "NORMAL"),
      await raise("Assembly hall", "Water leaking from the roof near the stage after the rain", "URGENT"),
      await raise("Room 101", "Projector cable loose, picture keeps cutting", "NORMAL", projector?.id ?? null),
      await raise("Room 203", "Door lock broken, room cannot be locked", "HIGH"),
      await raise("Room 103", "Window glass cracked", "LOW"),
    ];
    const when = [-9, -12, -1, -20, -16, -30];
    for (const [i, r] of reqs.entries()) await tx.maintenanceRequest.update({ where: { id: r.request.id }, data: { raisedAt: new Date(addDays(t0, when[i]).getTime() + (4 + i) * 3_600_000) } });
    return reqs.map((r) => r.request.id);
  }, { timeout: 120_000 }).then(async (ids) => {
    await withSchool(ctx, async (tx) => {
      await assignMaintenance(tx, ctx, ids[0], { technicianStaffId: null, technicianName: "Raju, electrician", vendorId: null, priority: "HIGH" });
      await assignMaintenance(tx, ctx, ids[3], { technicianStaffId: null, technicianName: "Techno IT Solutions", vendorId: (await tx.vendor.findFirst({ where: { name: "Techno IT Solutions" } }))?.id ?? null, priority: "NORMAL" });
      await closeMaintenance(tx, ctx, ids[3], { status: "DONE", doneOn: addDays(t0, -18), costPaise: R(650), toFinance: true, billFileId: null, billNo: null, duplicateReason: null, closingNote: "HDMI cable replaced" });
      await assignMaintenance(tx, ctx, ids[1], { technicianStaffId: null, technicianName: "Raju, electrician", vendorId: null, priority: "NORMAL" });
      await closeMaintenance(tx, ctx, ids[1], { status: "DONE", doneOn: addDays(t0, -10), costPaise: R(380), toFinance: true, billFileId: null, billNo: null, duplicateReason: null, closingNote: "Two chokes and tubes replaced" });
      await closeMaintenance(tx, ctx, ids[5], { status: "CANCELLED", doneOn: null, costPaise: null, toFinance: false, billFileId: null, billNo: null, duplicateReason: null, closingNote: "Raised twice; the same window is in another request fixed last month" });
    }, { timeout: 120_000 });
  });

  // 9. Labs: experiments per class and safety checks.
  await withSchool(ctx, async (tx) => {
    const lab = await tx.room.findFirst({ where: { name: "Science lab" } });
    const classes = await tx.schoolClass.findMany({ where: { name: { in: ["Class 6", "Class 8", "Class 9", "Class 10"] } } });
    const cls = (n: string) => classes.find((c) => c.name === n)?.id;
    const list: [string, string, string, string][] = [
      ["Class 6", "Science", "Separation of mixtures by filtration", "Funnel, filter paper, beaker, muddy water"],
      ["Class 6", "Science", "Test for starch in food", "Iodine solution, potato, bread, dropper"],
      ["Class 8", "Science", "Conductivity of liquids", "Battery, bulb, wires, lemon juice, salt water"],
      ["Class 9", "Physics", "Verify the laws of reflection", "Plane mirror, pins, drawing board"],
      ["Class 9", "Chemistry", "Prepare a true solution, a suspension and a colloid", "Salt, sugar, chalk powder, milk, beakers"],
      ["Class 10", "Chemistry", "Find the pH of samples with pH paper", "pH paper, dilute HCl, NaOH solution, water"],
      ["Class 10", "Physics", "Verify Ohm's law", "Rheostat, ammeter, voltmeter, resistor, battery"],
      ["Class 10", "Biology", "Observe stomata in a leaf peel", "Compound microscope, slides, safranin"],
    ];
    for (const [c, subject, title, materials] of list) {
      const classId = cls(c);
      if (classId) await saveExperiment(tx, ctx, { id: null, classId, subject, title, roomId: lab?.id ?? null, materials });
    }
    if (lab) {
      await recordSafetyCheck(tx, ctx, { roomId: lab.id, date: addDays(t0, -33), passed: [...LAB_CHECKLIST], note: null, today: t0 });
      await recordSafetyCheck(tx, ctx, { roomId: lab.id, date: addDays(t0, -3), passed: LAB_CHECKLIST.filter((c) => !c.startsWith("Eye-wash")), note: "Eye-wash bottle empty; refill ordered", today: t0 });
    }
  }, { timeout: 120_000 });

  // 10. A stock audit of stationery waiting for approval, and a closed asset check.
  await withSchool(ctx, async (tx) => {
    const main = await tx.storeLocation.findFirstOrThrow({ where: { isMain: true } });
    const cat = await tx.itemCategory.findFirstOrThrow({ where: { name: "Stationery" } });
    const { audit } = await startAudit(tx, ctx, { locationId: main.id, name: "Stationery count, October", categoryId: cat.id, date: addDays(t0, -2) });
    const lines = await tx.stockAuditLine.findMany({ where: { auditId: audit.id } });
    const names = new Map((await tx.item.findMany({ where: { id: { in: lines.map((l) => l.itemId) } } })).map((i) => [i.id, i.name]));
    const counted = (l: (typeof lines)[number]) => (names.get(l.itemId) === "Glue sticks" ? l.systemQty - 6 : names.get(l.itemId) === "Chart paper" ? l.systemQty - 15 : l.systemQty);
    await saveCounts(tx, ctx, audit.id, lines.map((l) => ({ itemId: l.itemId, counted: counted(l), note: names.get(l.itemId) === "Glue sticks" ? "Some dried up, thrown away" : null })));
    await submitAudit(tx, ctx, audit.id);

    const check = await startAssetAudit(tx, ctx, { name: "Term 1 asset check", roomId: null });
    const rooms = await tx.room.findMany({ where: { name: { in: ["Room 101", "Room 102", "Computer lab"] } } });
    for (const r of rooms) {
      const here = await tx.asset.findMany({ where: { roomId: r.id, status: { not: "DISPOSED" } }, orderBy: { tag: "asc" } });
      for (const [i, a] of here.entries()) if (!(r.name === "Computer lab" && i === 7)) await scanTag(tx, ctx, { auditId: check.id, code: a.tag, roomId: r.id });
    }
    // A desk from Room 103 found in Room 102.
    const stray = await tx.asset.findFirst({ where: { roomId: (await tx.room.findFirst({ where: { name: "Room 103" } }))?.id, status: "IN_USE" }, orderBy: { tag: "desc" } });
    const r102 = rooms.find((r) => r.name === "Room 102");
    if (stray && r102) await scanTag(tx, ctx, { auditId: check.id, code: stray.tag, roomId: r102.id });
    await closeAssetAudit(tx, ctx, check.id);
    await tx.assetAudit.update({ where: { id: check.id }, data: { startedAt: addDays(t0, -40), closedAt: addDays(t0, -39) } });
  }, { timeout: 300_000 });
}
