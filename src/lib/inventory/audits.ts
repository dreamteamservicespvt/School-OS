// Stock audits (14 Items & Stock, "Stock audit"): count each item in one
// store; the screen shows the difference from the system (variance). The
// differences never change stock silently: sent on, they wait in Approvals
// ("12 differences waiting for approval") and post as Audit adjustments only
// when approved. One audit at a time per store.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatRupees } from "../format";
import { nextNumber, formatNumber } from "../sequences";
import { requestApproval } from "../approvals";
import { InventoryProblem } from "./problem";
import { balanceOf, move } from "./stock";

const ZERO = BigInt(0);

export async function startAudit(tx: Tx, ctx: SchoolContext, input: { locationId: string; name: string; categoryId: string | null; date: Date }) {
  const loc = await tx.storeLocation.findFirst({ where: { id: input.locationId, archivedAt: null } });
  if (!loc) throw new InventoryProblem("Choose the store to count.", "locationId");
  const name = input.name.trim().replace(/\s+/g, " ");
  if (name.length < 3) throw new InventoryProblem("Give the audit a name, for example “October count”.", "name");
  const open = await tx.stockAudit.findFirst({ where: { locationId: loc.id, status: { in: ["OPEN", "WAITING"] } } });
  if (open) throw new InventoryProblem(`${open.name} (${open.number}) is not finished for ${loc.name}. Finish it first.`, "locationId");
  // Every item the store holds or has held, and every active item of the category chosen.
  const held = await tx.stockBalance.findMany({ where: { locationId: loc.id }, select: { itemId: true } });
  const items = await tx.item.findMany({
    where: { archivedAt: null, ...(input.categoryId ? { categoryId: input.categoryId } : {}), OR: [{ id: { in: held.map((h) => h.itemId) } }, ...(input.categoryId ? [{ categoryId: input.categoryId }] : [])] },
    orderBy: { name: "asc" },
  });
  if (!items.length) throw new InventoryProblem(`${loc.name} has no items to count${input.categoryId ? " in this category" : ""}.`, "locationId");
  const n = await nextNumber(tx, ctx, "inventory-audit");
  const lines = [];
  for (const i of items) lines.push({ schoolId: ctx.schoolId, itemId: i.id, systemQty: await balanceOf(tx, i.id, loc.id) });
  const audit = await tx.stockAudit.create({ data: { schoolId: ctx.schoolId, number: formatNumber("SA-", n, 4), name, locationId: loc.id, startedOn: input.date, createdById: ctx.userId, lines: { create: lines } } });
  await writeAudit(tx, ctx, { action: "started", recordType: "Stock Audit", recordId: audit.id, after: { number: audit.number, name, store: loc.name, items: lines.length } });
  return { audit, items: lines.length };
}

/** Saves counts (one or many lines). The system figure is taken again as each line is counted. */
export async function saveCounts(tx: Tx, ctx: SchoolContext, auditId: string, counts: { itemId: string; counted: number | null; note: string | null }[]) {
  const audit = await tx.stockAudit.findFirst({ where: { id: auditId } });
  if (!audit) throw new InventoryProblem("This audit was not found.");
  if (audit.status !== "OPEN") throw new InventoryProblem("This audit is already sent on. Counts cannot change now.");
  let saved = 0;
  for (const c of counts) {
    if (c.counted !== null && (!Number.isInteger(c.counted) || c.counted < 0 || c.counted > 1_000_000)) throw new InventoryProblem("A count must be a whole number, 0 or more.", `count-${c.itemId}`);
    const line = await tx.stockAuditLine.findFirst({ where: { auditId, itemId: c.itemId } });
    if (!line) continue;
    if (line.countedQty === c.counted && (line.note ?? null) === (c.note ?? null)) continue;
    await tx.stockAuditLine.update({ where: { id: line.id }, data: { countedQty: c.counted, note: c.note, systemQty: await balanceOf(tx, c.itemId, audit.locationId) } });
    saved++;
  }
  if (saved) await writeAudit(tx, ctx, { action: "counted", recordType: "Stock Audit", recordId: audit.id, after: { lines: saved } });
  return saved;
}

/** Counted lines whose count differs from the system, with the value of each difference. */
export async function variances(tx: Tx, auditId: string) {
  const lines = await tx.stockAuditLine.findMany({ where: { auditId, countedQty: { not: null } } });
  const items = await tx.item.findMany({ where: { id: { in: lines.map((l) => l.itemId) } } });
  return lines
    .filter((l) => l.countedQty !== l.systemQty)
    .map((l) => {
      const item = items.find((i) => i.id === l.itemId)!;
      const diff = (l.countedQty ?? 0) - l.systemQty;
      return { line: l, item, diff, valuePaise: (item.pricePaise ?? ZERO) * BigInt(diff) };
    });
}

/** Sends the counts on: with no differences the audit is done; otherwise the differences wait in Approvals. */
export async function submitAudit(tx: Tx, ctx: SchoolContext, auditId: string) {
  const audit = await tx.stockAudit.findFirst({ where: { id: auditId }, include: { lines: true } });
  if (!audit) throw new InventoryProblem("This audit was not found.");
  if (audit.status !== "OPEN") throw new InventoryProblem("This audit is already sent on.");
  const counted = audit.lines.filter((l) => l.countedQty !== null).length;
  if (!counted) throw new InventoryProblem("Count at least one item first.");
  const diffs = await variances(tx, audit.id);
  if (!diffs.length) {
    await tx.stockAudit.update({ where: { id: audit.id }, data: { status: "APPROVED", submittedAt: new Date(), decidedAt: new Date(), decisionNote: "No differences" } });
    await writeAudit(tx, ctx, { action: "closed-no-difference", recordType: "Stock Audit", recordId: audit.id, after: { counted } });
    return { waiting: false, differences: 0, counted, uncounted: audit.lines.length - counted };
  }
  const loc = await tx.storeLocation.findFirst({ where: { id: audit.locationId }, select: { name: true } });
  const value = diffs.reduce((a, d) => a + d.valuePaise, ZERO);
  const short = diffs.filter((d) => d.diff < 0).length;
  const approval = await requestApproval(tx, ctx, {
    type: "stock-audit", recordType: "Stock Audit", recordId: audit.id,
    summary: `Stock audit ${audit.number} (${loc?.name ?? "store"}): ${diffs.length} difference${diffs.length === 1 ? "" : "s"}, ${short} short, value ${formatRupees(value < ZERO ? -value : value)} ${value < ZERO ? "less" : "more"} than the system`,
    amountPaise: value < ZERO ? -value : value,
    reason: diffs.slice(0, 5).map((d) => `${d.item.name}: system ${d.line.systemQty}, counted ${d.line.countedQty}`).join("; "),
  });
  await tx.stockAudit.update({ where: { id: audit.id }, data: { status: "WAITING", submittedAt: new Date(), approvalId: approval.id } });
  await writeAudit(tx, ctx, { action: "sent-for-approval", recordType: "Stock Audit", recordId: audit.id, after: { differences: diffs.length, value: formatRupees(value) } });
  return { waiting: true, differences: diffs.length, counted, uncounted: audit.lines.length - counted };
}

/** Approvals decided an audit: approved, each difference posts as an Audit adjustment; otherwise stock is unchanged. */
export async function decideAudit(tx: Tx, ctx: SchoolContext, auditId: string, decision: string, note: string | null, today: Date) {
  const audit = await tx.stockAudit.findFirst({ where: { id: auditId } });
  if (!audit || audit.status !== "WAITING") return;
  if (decision === "approve") {
    for (const d of await variances(tx, audit.id)) {
      await move(tx, ctx, { itemId: d.item.id, locationId: audit.locationId, kind: "AUDIT", qty: d.diff, date: today, reference: `${audit.number} ${audit.name}`, reason: d.line.note ?? `Counted ${d.line.countedQty}, system ${d.line.systemQty}`, auditId: audit.id, today });
    }
    await tx.stockAudit.update({ where: { id: audit.id }, data: { status: "APPROVED", decidedAt: new Date(), decisionNote: note } });
  } else if (decision === "ask-change") {
    // Back to counting with the approver's note.
    await tx.stockAudit.update({ where: { id: audit.id }, data: { status: "OPEN", approvalId: null, decisionNote: note } });
  } else {
    await tx.stockAudit.update({ where: { id: audit.id }, data: { status: "REJECTED", decidedAt: new Date(), decisionNote: note ?? (decision === "withdraw" ? "Withdrawn" : null) } });
  }
  await writeAudit(tx, ctx, { action: `audit-${decision}`, recordType: "Stock Audit", recordId: audit.id, before: { status: "WAITING" }, after: { decision, note } });
}
