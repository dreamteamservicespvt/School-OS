// Importing items with their opening stock, and assets, from a spreadsheet
// (14 Items & Stock and Assets, P10; workflow 15 "Switching to School OS").
// Each row is added as if typed on Add item or Add asset: codes and tags are
// checked for reuse and given in sequence when empty. Undo takes the opening
// stock back out (an Audit adjustment, "Import undone") and archives the
// items; assets are archived. Nothing is deleted. Imported by
// src/lib/import-registry.ts.
import "server-only";

import { defineImport } from "../importer";
import { writeAudit } from "../audit";
import { parseDateText } from "../staff/import";
import { todayIn } from "../staff/dates";
import { addItem } from "./items";
import { addAssets } from "./assets";
import { InventoryProblem } from "./problem";
import { inventorySettings, mainLocation, saveCategory } from "./settings";
import { move } from "./stock";
import { CONDITIONS, rupeesToPaise } from "./words";

export const ITEMS_IMPORT = "inventory-items";
export const ASSETS_IMPORT = "inventory-assets";

const yes = (v: string) => ["yes", "y", "true", "1", "on"].includes(v.trim().toLowerCase());

type ItemRow = {
  code: string | null; name: string; category: string; unit: string; size: string | null; reorder: number | null; pricePaise: bigint | null; tracksExpiry: boolean;
  opening: { store: string | null; qty: number }[]; batchNo: string | null; expiresOn: Date | null;
};

/** "40", or "Main store: 40; Lab store: 10" (several stores in one cell). */
function readOpening(raw: string, storeCol: string): { store: string | null; qty: number }[] | string {
  const t = raw.trim();
  if (!t) return [];
  if (/^\d[\d,]*$/.test(t)) return [{ store: storeCol.trim() || null, qty: Number(t.replace(/,/g, "")) }];
  const out: { store: string | null; qty: number }[] = [];
  for (const part of t.split(/;|\|/).map((p) => p.trim()).filter(Boolean)) {
    const m = /^(.+?)\s*[:=]\s*(\d[\d,]*)$/.exec(part);
    if (!m) return `“${part}” is not a store and a quantity. Write it as Main store: 40; Lab store: 10.`;
    out.push({ store: m[1].trim(), qty: Number(m[2].replace(/,/g, "")) });
  }
  return out;
}

defineImport<ItemRow>({
  key: ITEMS_IMPORT,
  label: "Inventory items with opening stock",
  columns: [
    { key: "code", label: "Item code", example: "ST-0001", help: "Leave empty to give codes in sequence.", aliases: ["code", "sku", "item code (sku)"] },
    { key: "name", label: "Item name", required: true, example: "A4 notebook 200 pages", aliases: ["item", "name", "description"] },
    { key: "category", label: "Category", required: true, example: "Stationery", help: "A new category is added if the school has none by this name." },
    { key: "unit", label: "Unit", example: "piece", help: "Empty means piece. Must be one of the units in Inventory Settings." },
    { key: "size", label: "Size", example: "", help: "For uniforms: 28, M, XL." },
    { key: "reorder", label: "Reorder level", example: "20", aliases: ["reorder", "minimum", "min stock"] },
    { key: "price", label: "Price per unit (₹)", example: "45", aliases: ["price", "rate", "cost", "unit price"] },
    { key: "expiry", label: "Expiry tracking", example: "No", help: "Yes for chemicals and perishables." },
    { key: "opening", label: "Opening stock", example: "120", help: "A number, or several stores: Main store: 100; Lab store: 20.", aliases: ["stock", "qty", "quantity", "opening qty"] },
    { key: "store", label: "Store", example: "Main store", help: "Empty means the main store.", aliases: ["location", "store location"] },
    { key: "batch", label: "Batch", example: "", help: "Expiry-tracked items only." },
    { key: "expiresOn", label: "Expiry date", example: "", help: "Expiry-tracked items only. DD-MM-YYYY.", aliases: ["expiry", "expires on"] },
  ],
  check: async (tx, ctx, row, seen) => {
    const s = await inventorySettings(tx, ctx);
    const problems: string[] = [];
    const name = (row.name ?? "").trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 120) problems.push("Item name needs 2 to 120 characters.");
    const size = row.size?.trim() || null;
    const key = `${name.toLowerCase()}|${(size ?? "").toLowerCase()}`;
    if (seen.has(`name:${key}`)) problems.push("This item (with this size) is twice in the file. Put the stock on one row.");
    seen.add(`name:${key}`);
    const dup = name ? await tx.item.findFirst({ where: { name: { equals: name, mode: "insensitive" }, size: size ? { equals: size, mode: "insensitive" } : null, archivedAt: null }, select: { code: true } }) : null;
    if (dup) problems.push(`${name} is already an item (${dup.code}).`);
    const code = row.code?.trim().toUpperCase() || null;
    if (code) {
      if (!/^[A-Z0-9/-]{2,24}$/.test(code)) problems.push("The item code can have 2 to 24 letters, digits, - or /.");
      else if (seen.has(`code:${code}`)) problems.push(`Code ${code} is twice in the file.`);
      else {
        seen.add(`code:${code}`);
        const used = await tx.item.findFirst({ where: { code: { equals: code, mode: "insensitive" } }, select: { name: true } });
        if (used) problems.push(`Code ${code} belongs to ${used.name}.`);
      }
    }
    const unit = (row.unit ?? "").trim().toLowerCase() || "piece";
    if (!s.units.includes(unit)) problems.push(`Unit “${row.unit}” is not in Inventory Settings. Use one of: ${s.units.join(", ")}.`);
    const reorderRaw = (row.reorder ?? "").trim();
    const reorder = reorderRaw ? Number(reorderRaw.replace(/,/g, "")) : null;
    if (reorder !== null && (!Number.isInteger(reorder) || reorder < 0)) problems.push("Reorder level must be a whole number.");
    const priceRaw = (row.price ?? "").trim();
    const pricePaise = priceRaw ? rupeesToPaise(priceRaw) : null;
    if (priceRaw && pricePaise === null) problems.push("Price must be a number of rupees, like 45.");
    const tracksExpiry = yes(row.expiry ?? "");
    const opening = readOpening(row.opening ?? "", row.store ?? "");
    if (typeof opening === "string") problems.push(opening);
    else {
      for (const o of opening) {
        if (!Number.isInteger(o.qty) || o.qty < 0 || o.qty > 1_000_000) problems.push("Opening stock must be a whole number.");
        if (o.store && !(await tx.storeLocation.findFirst({ where: { name: { equals: o.store, mode: "insensitive" }, archivedAt: null } }))) problems.push(`There is no store called “${o.store}”. Add it in Inventory Settings first.`);
      }
      const stores = opening.map((o) => (o.store ?? "").toLowerCase());
      if (new Set(stores).size !== stores.length) problems.push("The same store is named twice.");
    }
    const expiresOn = row.expiresOn?.trim() ? parseDateText(row.expiresOn) : null;
    if (row.expiresOn?.trim() && !expiresOn) problems.push("Expiry date must be a date like 31-03-2027.");
    if (tracksExpiry && typeof opening !== "string" && opening.some((o) => o.qty > 0) && !expiresOn) problems.push("Expiry-tracked stock needs its expiry date.");
    if (problems.length) return { ok: false, problems };
    return { ok: true, value: { code, name, category: (row.category ?? "").trim(), unit, size, reorder, pricePaise, tracksExpiry, opening: opening as { store: string | null; qty: number }[], batchNo: row.batch?.trim() || null, expiresOn } };
  },
  save: async (tx, ctx, v) => {
    const found = await tx.itemCategory.findFirst({ where: { name: { equals: v.category, mode: "insensitive" }, archivedAt: null } });
    const categoryId = found?.id ?? (await saveCategory(tx, ctx, { id: null, name: v.category, isLab: /lab|chemical/i.test(v.category), defaultReorderLevel: 0, expenseHeadId: null })).id;
    const main = await mainLocation(tx, ctx);
    const opening = [];
    for (const o of v.opening) {
      const loc = o.store ? await tx.storeLocation.findFirst({ where: { name: { equals: o.store, mode: "insensitive" }, archivedAt: null } }) : main;
      opening.push({ locationId: loc?.id ?? main.id, qty: o.qty, batchNo: v.batchNo, expiresOn: v.expiresOn });
    }
    const school = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { timeZone: true } });
    try {
      const { item } = await addItem(tx, ctx, { code: v.code, name: v.name, categoryId, unit: v.unit, size: v.size, reorderLevel: v.reorder, pricePaise: v.pricePaise, tracksExpiry: v.tracksExpiry, note: null }, opening, todayIn(school?.timeZone ?? "Asia/Kolkata"));
      return { id: item.id, created: true };
    } catch (err) {
      if (err instanceof InventoryProblem) throw new Error(`${v.name}: ${err.message}`);
      throw err;
    }
  },
  undo: async (tx, ctx, ids) => {
    // Only while nothing else has happened to the imported items.
    const used = await tx.stockMovement.findFirst({ where: { itemId: { in: ids }, kind: { not: "OPENING" } }, include: { item: true } });
    if (used) throw new Error(`${used.item.name} has stock movements since the import. Undo is no longer possible; correct the items one by one.`);
    const school = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { timeZone: true } });
    const today = todayIn(school?.timeZone ?? "Asia/Kolkata");
    const balances = await tx.stockBalance.findMany({ where: { itemId: { in: ids }, qty: { gt: 0 } } });
    for (const b of balances) await move(tx, ctx, { itemId: b.itemId, locationId: b.locationId, kind: "AUDIT", qty: -b.qty, date: today, reason: "Import undone", today });
    await tx.item.updateMany({ where: { id: { in: ids } }, data: { archivedAt: new Date(), updatedById: ctx.userId } });
    await writeAudit(tx, ctx, { action: "import-undone", recordType: "Item", recordId: ids[0] ?? ctx.schoolId, after: { items: ids.length } });
  },
});

type AssetRow = {
  tag: string | null; name: string; type: string; place: { roomId: string | null; departmentId: string | null; staffId: string | null }; purchaseDate: Date | null; costPaise: bigint | null;
  vendorId: string | null; warrantyEnd: Date | null; amcEnd: Date | null; serialNo: string | null; condition: string;
};

defineImport<AssetRow>({
  key: ASSETS_IMPORT,
  label: "Assets (asset register)",
  columns: [
    { key: "tag", label: "Asset tag", example: "AT-0001", help: "Leave empty to give tags in sequence.", aliases: ["tag", "asset no", "asset number"] },
    { key: "name", label: "Asset name", required: true, example: "Projector", aliases: ["name", "asset", "description"] },
    { key: "type", label: "Type", required: true, example: "IT", help: "One of the asset types in Inventory Settings." },
    { key: "location", label: "Location or person", required: true, example: "Room 12", help: "A room, a department, or a staff member's name or code.", aliases: ["location", "room", "place", "assigned to"] },
    { key: "purchaseDate", label: "Purchase date", example: "15-06-2024", aliases: ["date", "purchased on"] },
    { key: "cost", label: "Cost (₹)", example: "45000", aliases: ["cost", "price", "value"] },
    { key: "vendor", label: "Vendor", example: "", help: "Must already be in the vendor list." },
    { key: "warrantyEnd", label: "Warranty end", example: "14-06-2027", aliases: ["warranty", "warranty till"] },
    { key: "amcEnd", label: "AMC end", example: "", aliases: ["amc", "amc till"] },
    { key: "serialNo", label: "Serial number", example: "", aliases: ["serial", "serial no"] },
    { key: "condition", label: "Condition", example: "Good", help: "Good, Fair or Poor. Empty means Good." },
  ],
  check: async (tx, ctx, row, seen) => {
    const s = await inventorySettings(tx, ctx);
    const problems: string[] = [];
    const name = (row.name ?? "").trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > 120) problems.push("Asset name needs 2 to 120 characters.");
    const type = s.assetTypes.find((t) => t.toLowerCase() === (row.type ?? "").trim().toLowerCase());
    if (!type) problems.push(`Type “${row.type}” is not in Inventory Settings. Use one of: ${s.assetTypes.join(", ")}.`);
    const tag = row.tag?.trim().toUpperCase() || null;
    if (tag) {
      if (!/^[A-Z0-9/-]{2,24}$/.test(tag)) problems.push("A tag can have 2 to 24 letters, digits, - or /.");
      else if (seen.has(`tag:${tag}`)) problems.push(`Tag ${tag} is twice in the file.`);
      else {
        seen.add(`tag:${tag}`);
        const used = await tx.asset.findFirst({ where: { tag: { equals: tag, mode: "insensitive" } }, select: { name: true } });
        if (used) problems.push(`Tag ${tag} belongs to ${used.name}.`);
      }
    }
    const where = (row.location ?? "").trim();
    const room = await tx.room.findFirst({ where: { name: { equals: where, mode: "insensitive" }, archivedAt: null } });
    const dep = room ? null : await tx.department.findFirst({ where: { name: { equals: where, mode: "insensitive" }, archivedAt: null } });
    const staff = room || dep ? [] : await tx.staff.findMany({ where: { archivedAt: null, OR: [{ staffCode: { equals: where, mode: "insensitive" } }, { fullName: { equals: where, mode: "insensitive" } }] }, take: 2 });
    if (!room && !dep && staff.length === 0) problems.push(`“${where}” is not a room, department or staff member. Add the room in Rooms, Labs & Maintenance first.`);
    if (staff.length > 1) problems.push(`Two staff members are called “${where}”. Use the staff code.`);
    const date = (k: string, label: string) => {
      const raw = row[k]?.trim();
      if (!raw) return null;
      const d = parseDateText(raw);
      if (!d) problems.push(`${label} must be a date like 15-06-2024.`);
      return d;
    };
    const purchaseDate = date("purchaseDate", "Purchase date");
    const warrantyEnd = date("warrantyEnd", "Warranty end");
    const amcEnd = date("amcEnd", "AMC end");
    const costRaw = (row.cost ?? "").trim();
    const costPaise = costRaw ? rupeesToPaise(costRaw) : null;
    if (costRaw && costPaise === null) problems.push("Cost must be a number of rupees, like 45000.");
    let vendorId: string | null = null;
    if (row.vendor?.trim()) {
      const v = await tx.vendor.findFirst({ where: { name: { equals: row.vendor.trim(), mode: "insensitive" } } });
      if (!v) problems.push(`Vendor “${row.vendor}” is not in the vendor list. Add the vendor first, or leave it empty.`);
      vendorId = v?.id ?? null;
    }
    const condition = CONDITIONS.find((c) => c.toLowerCase() === (row.condition ?? "").trim().toLowerCase()) ?? (row.condition?.trim() ? null : "Good");
    if (!condition) problems.push("Condition must be Good, Fair or Poor.");
    if (problems.length) return { ok: false, problems };
    return {
      ok: true,
      value: { tag, name, type: type!, place: { roomId: room?.id ?? null, departmentId: dep?.id ?? null, staffId: staff[0]?.id ?? null }, purchaseDate, costPaise, vendorId, warrantyEnd, amcEnd, serialNo: row.serialNo?.trim() || null, condition: condition! },
    };
  },
  save: async (tx, ctx, v) => {
    try {
      const [a] = await addAssets(tx, ctx, { ...v.place, name: v.name, type: v.type, tag: v.tag, serialNo: v.serialNo, purchaseDate: v.purchaseDate, costPaise: v.costPaise, vendorId: v.vendorId, warrantyEnd: v.warrantyEnd, amcEnd: v.amcEnd, condition: v.condition, note: null });
      return { id: a.id, created: true };
    } catch (err) {
      if (err instanceof InventoryProblem) throw new Error(`${v.name}: ${err.message}`);
      throw err;
    }
  },
  undo: async (tx, ctx, ids) => {
    const busy = await tx.assetDisposal.count({ where: { assetId: { in: ids } } });
    if (busy) throw new Error("Some of these assets have been disposed of since the import. Correct them one by one.");
    await tx.asset.updateMany({ where: { id: { in: ids } }, data: { archivedAt: new Date(), updatedById: ctx.userId } });
    await writeAudit(tx, ctx, { action: "import-undone", recordType: "Asset", recordId: ids[0] ?? ctx.schoolId, after: { assets: ids.length } });
  },
});
