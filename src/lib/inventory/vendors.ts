// Vendors (14 Purchases & Vendors, Vendors tab): one shared list with Finance
// (the Vendor record its expenses use), with the store's extra details kept
// beside it in Vendor Detail: contact person, email, bank details and the
// items supplied. Same GSTIN or same phone as an existing vendor is caught
// and that vendor is shown first. The bank account number is kept encrypted
// (08 §3) and only those who pay bills see or change bank details.
import "server-only";

import type { Vendor, VendorDetail } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { encryptField } from "../crypto";
import { InventoryProblem } from "./problem";
import { BASE } from "./words";

export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** The last 10 digits of a phone number, so +91 98480 12345 and 9848012345 match. */
export const phoneKey = (p: string | null | undefined) => (p ?? "").replace(/\D/g, "").slice(-10);

export type VendorInput = {
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  address: string | null;
  itemsSupplied: string | null;
  /** Only read when the person may change bank details. */
  bank: { bankName: string | null; accountNo: string | null; ifsc: string | null } | null;
};

const vendorLink = (v: Vendor) => ({ href: `${BASE}/purchases?tab=vendors&vendor=${v.id}`, label: `Open ${v.name}` });

/** The vendor with the same GSTIN or phone, if there is one (14 §5 "Same vendor added twice"). */
export async function sameVendor(tx: Tx, input: { gstin: string | null; phone: string | null }, selfId?: string) {
  const not = selfId ? { id: { not: selfId } } : {};
  if (input.gstin) {
    const v = await tx.vendor.findFirst({ where: { gstin: { equals: input.gstin, mode: "insensitive" }, ...not } });
    if (v) return { vendor: v, by: "GSTIN" as const };
  }
  const key = phoneKey(input.phone);
  if (key.length === 10) {
    const all = await tx.vendor.findMany({ where: { phone: { not: null }, ...not }, select: { id: true, phone: true } });
    const hit = all.find((v) => phoneKey(v.phone) === key);
    if (hit) return { vendor: (await tx.vendor.findUnique({ where: { id: hit.id } }))!, by: "phone number" as const };
  }
  return null;
}

function clean(input: VendorInput) {
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 2) throw new InventoryProblem("Vendor name is needed.", "name");
  if (name.length > 120) throw new InventoryProblem("Vendor name can be at most 120 characters.", "name");
  const gstin = input.gstin?.trim().toUpperCase().replace(/\s+/g, "") || null;
  if (gstin && !GSTIN_RE.test(gstin)) throw new InventoryProblem("A GST number has 15 characters, like 36AABCS1234K1Z5. Check it.", "gstin");
  let phone = input.phone?.trim() || null;
  if (phone) {
    const d = phoneKey(phone);
    if (d.length !== 10) throw new InventoryProblem(`Phone number has ${phone.replace(/\D/g, "").length} digits. Use a 10-digit number.`, "phone");
    phone = d;
  }
  const email = input.email?.trim().toLowerCase() || null;
  if (email && !EMAIL_RE.test(email)) throw new InventoryProblem("This email address does not look right.", "email");
  return { name, gstin, phone, email };
}

function cleanBank(b: NonNullable<VendorInput["bank"]>) {
  const accountNo = b.accountNo?.replace(/\s+/g, "") || null;
  if (accountNo && !/^\d{6,18}$/.test(accountNo)) throw new InventoryProblem("A bank account number has 6 to 18 digits.", "accountNo");
  const ifsc = b.ifsc?.trim().toUpperCase() || null;
  if (ifsc && !IFSC_RE.test(ifsc)) throw new InventoryProblem("An IFSC code has 11 characters, like SBIN0001234.", "ifsc");
  return { bankName: b.bankName?.trim() || null, accountNo, ifsc };
}

/** Adds a vendor, or changes one. Same name, GSTIN or phone as another vendor is refused with a link to it. */
export async function saveInventoryVendor(tx: Tx, ctx: SchoolContext, input: VendorInput, id: string | null, opts: { mayChangeBank: boolean }) {
  const c = clean(input);
  const before = id ? await tx.vendor.findFirst({ where: { id } }) : null;
  if (id && !before) throw new InventoryProblem("This vendor was not found.");
  const dup = await sameVendor(tx, c, id ?? undefined);
  if (dup) throw new InventoryProblem(`A vendor with this ${dup.by} already exists: ${dup.vendor.name}${dup.vendor.archivedAt ? " (archived)" : ""}`, dup.by === "GSTIN" ? "gstin" : "phone", vendorLink(dup.vendor));
  const named = await tx.vendor.findFirst({ where: { name: { equals: c.name, mode: "insensitive" }, ...(id ? { id: { not: id } } : {}) } });
  if (named) throw new InventoryProblem(`There is already a vendor called ${named.name}.`, "name", vendorLink(named));
  const address = input.address?.trim() || null;
  const vendor = before
    ? await tx.vendor.update({ where: { id: before.id }, data: { name: c.name, phone: c.phone, gstin: c.gstin, address } })
    : await tx.vendor.create({ data: { schoolId: ctx.schoolId, name: c.name, phone: c.phone, gstin: c.gstin, address, createdById: ctx.userId } });
  const oldDetail = await tx.vendorDetail.findUnique({ where: { vendorId: vendor.id } });
  const detail: Partial<VendorDetail> = { contactName: input.contactName?.trim() || null, email: c.email, itemsSupplied: input.itemsSupplied?.trim() || null, updatedById: ctx.userId };
  let bankChanged = false;
  if (opts.mayChangeBank && input.bank) {
    const b = cleanBank(input.bank);
    detail.bankName = b.bankName;
    detail.ifsc = b.ifsc;
    // An empty account number keeps the one already kept (it is never sent back to the form).
    if (b.accountNo) {
      detail.accountNoEnc = encryptField(b.accountNo);
      detail.accountLast4 = b.accountNo.slice(-4);
      bankChanged = true;
    }
    if (b.bankName !== (oldDetail?.bankName ?? null) || b.ifsc !== (oldDetail?.ifsc ?? null)) bankChanged = true;
  }
  await tx.vendorDetail.upsert({ where: { vendorId: vendor.id }, create: { vendorId: vendor.id, schoolId: ctx.schoolId, ...detail }, update: detail });
  await writeAudit(tx, ctx, {
    action: before ? "changed" : "created", recordType: "Vendor", recordId: vendor.id,
    before: before ? { name: before.name, phone: before.phone, gstin: before.gstin } : undefined,
    // Bank details are never written to the log, only that they changed.
    after: { name: c.name, phone: c.phone, gstin: c.gstin, email: c.email, bankDetails: bankChanged ? "changed" : undefined },
  });
  return vendor;
}

export async function archiveVendor(tx: Tx, ctx: SchoolContext, id: string) {
  const v = await tx.vendor.findFirst({ where: { id, archivedAt: null } });
  if (!v) throw new InventoryProblem("This vendor was not found.");
  const open = await tx.purchaseOrder.count({ where: { vendorId: id, status: { in: ["WAITING", "SENT", "PART_RECEIVED"] } } });
  if (open) throw new InventoryProblem(`${v.name} has ${open} open purchase order${open === 1 ? "" : "s"}. Close ${open === 1 ? "it" : "them"} first.`);
  await tx.vendor.update({ where: { id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Vendor", recordId: id, before: { name: v.name } });
}

export async function restoreVendor(tx: Tx, ctx: SchoolContext, id: string) {
  const v = await tx.vendor.findFirst({ where: { id, archivedAt: { not: null } } });
  if (!v) throw new InventoryProblem("This vendor is not archived.");
  await tx.vendor.update({ where: { id }, data: { archivedAt: null } });
  await writeAudit(tx, ctx, { action: "restored", recordType: "Vendor", recordId: id, after: { name: v.name } });
}

/** Vendors with their store details, for lists and pickers. */
export async function vendorsWithDetail(tx: Tx, where: { archived?: boolean } = {}) {
  const vendors = await tx.vendor.findMany({ where: { archivedAt: where.archived ? { not: null } : null }, orderBy: { name: "asc" } });
  const details = await tx.vendorDetail.findMany({ where: { vendorId: { in: vendors.map((v) => v.id) } } });
  const byId = new Map(details.map((d) => [d.vendorId, d]));
  return vendors.map((v) => ({ ...v, detail: byId.get(v.id) ?? null }));
}
