// The Student Fee Ledger (06 Fee Management): one student's whole fee story in
// date order — every fee raised, payment, cancelled receipt, concession, late
// fee, adjustment, refund and removed row — with the running balance. Nothing
// is ever deleted, so a cancelled receipt stays here, struck through, with its
// reason. The last running balance equals the open balance of the rows shown.
import "server-only";

import type { Tx } from "../db";
import { formatDate, formatRupees } from "../format";
import { todayIn } from "../staff/dates";
import { dueStatus, netAmount } from "./dues";
import { cancelReasonLabel, concessionTypeLabel, modeLabel } from "./words";

const ZERO = BigInt(0);

export type LedgerKind = "opening" | "charge" | "concession" | "receipt" | "reversal" | "late" | "adjust" | "refund";

export type LedgerEntry = {
  key: string;
  kind: LedgerKind;
  date: Date;
  title: string;
  sub: string;
  ref: string | null;
  debit: bigint;
  credit: bigint;
  balance: bigint;
  paymentId: string | null;
  cancelled: { reason: string; when: Date } | null;
  waiting: boolean;
  broughtIn: boolean;
  /** Sorts entries of one day: fees first, then reductions, then payments. */
  order: number;
};

export type LedgerInstallment = {
  id: string;
  head: string;
  label: string;
  dueDate: Date;
  amount: bigint;
  paid: bigint;
  late: bigint;
  balance: bigint;
  status: "Paid" | "Part paid" | "Due" | "Overdue" | "Not due" | "Removed";
  kind: string;
  broughtIn: boolean;
};

export type LedgerPayment = {
  id: string;
  date: Date;
  receiptNo: string | null;
  oldReceiptNo: string | null;
  heads: string;
  mode: string;
  amount: bigint;
  status: string;
  partial: boolean;
  broughtIn: boolean;
  cancelReason: string | null;
  leftOnRows: bigint;
};

const dayOf = (instant: Date, tz: string) => todayIn(tz, instant);

/** Builds the statement, installments, payments, invoices and adjustments for one student. */
export async function studentLedger(tx: Tx, studentId: string, today: Date, tz: string) {
  const [dues, payments, conLines, adjustments, refunds, invoices, certificates] = await Promise.all([
    tx.studentFeeDue.findMany({ where: { studentId }, orderBy: [{ dueDate: "asc" }, { createdAt: "asc" }] }),
    tx.payment.findMany({ where: { studentId, status: { in: ["POSTED", "WAITING", "CANCELLED"] } }, include: { allocations: true }, orderBy: { paidAt: "asc" } }),
    tx.concessionLine.findMany({ where: { concession: { studentId } }, include: { concession: true }, orderBy: { createdAt: "asc" } }),
    tx.feeAdjustment.findMany({ where: { studentId }, orderBy: { createdAt: "asc" } }),
    tx.refund.findMany({ where: { studentId }, orderBy: { createdAt: "asc" } }),
    tx.feeDocument.findMany({ where: { studentId, kind: "invoice" }, orderBy: { createdAt: "desc" } }),
    tx.feeDocument.findMany({ where: { studentId, kind: "certificate" }, orderBy: { createdAt: "desc" } }),
  ]);
  const headIds = [...new Set([...dues.map((d) => d.feeHeadId), ...payments.flatMap((p) => p.allocations.map((a) => a.feeHeadId))])];
  const userIds = [...new Set([...adjustments.map((a) => a.createdById), ...conLines.map((l) => l.concession.decidedById ?? l.concession.requestedById), ...dues.map((d) => d.removedById)].filter((x): x is string => Boolean(x)))];
  const [heads, receipts, users] = await Promise.all([
    tx.feeHead.findMany({ where: { id: { in: headIds } }, select: { id: true, name: true } }),
    tx.receipt.findMany({ where: { paymentId: { in: payments.map((p) => p.id) } }, select: { paymentId: true, number: true } }),
    tx.userLogin.findMany({ where: { id: { in: userIds } }, select: { id: true, displayName: true } }),
  ]);
  const headName = (id: string) => heads.find((h) => h.id === id)?.name ?? "Fees";
  const who = (id: string | null | undefined) => (id ? users.find((u) => u.id === id)?.displayName ?? null : null);
  const receiptOf = (paymentId: string) => receipts.find((r) => r.paymentId === paymentId)?.number ?? null;
  const dueById = new Map(dues.map((d) => [d.id, d]));
  const rowName = (dueId: string) => {
    const d = dueById.get(dueId);
    if (!d) return "Fees";
    if (d.kind === "LATE_FEE" || d.kind === "OLD_DUES") return d.label;
    return `${headName(d.feeHeadId)} · ${d.label}`;
  };

  // Which rows belong in the balance now: fallen due, or already paid towards (paid ahead).
  // A concession or adjustment on a later installment does not bring it forward: it stays
  // under Coming up at its reduced amount, so next term's fee never looks owed today.
  const touched = new Set<string>(payments.filter((p) => p.status === "POSTED").flatMap((p) => p.allocations.filter((a) => a.amountPaise > ZERO).map((a) => a.dueId)));
  const shown = dues.filter((d) => d.dueDate <= today || touched.has(d.id) || d.kind !== "FEE");
  const shownIds = new Set(shown.map((d) => d.id));
  const comingUp = dues.filter((d) => !shownIds.has(d.id) && d.state === "OPEN");

  const entries: LedgerEntry[] = [];
  const base = { paymentId: null, cancelled: null, waiting: false, broughtIn: false };

  for (const d of shown) {
    const kind: LedgerKind = d.kind === "OLD_DUES" ? "opening" : d.kind === "LATE_FEE" ? "late" : "charge";
    const title = d.kind === "OLD_DUES" ? d.label : d.kind === "LATE_FEE" ? d.label : `${headName(d.feeHeadId)} · ${d.label}`;
    const sub = d.kind === "OLD_DUES"
      ? `Brought in from before School OS${d.note ? ` · ${d.note}` : ""}`
      : d.kind === "LATE_FEE"
        ? d.parentDueId ? `Added for ${rowName(d.parentDueId)}` : "Late fee"
        : d.kind === "CHARGE"
          ? `Added for this student${d.exceptionReason ? ` · ${d.exceptionReason}` : ""}`
          : d.exceptionReason ? `Different from the class plan · ${d.exceptionReason}` : `Due ${formatDate(d.dueDate)}`;
    entries.push({ ...base, key: `due:${d.id}`, kind, date: d.dueDate, title, sub, ref: null, debit: d.amountPaise, credit: ZERO, balance: ZERO, broughtIn: d.broughtIn, order: 0 });
    if (d.state === "REMOVED") {
      const left = netAmount(d) - d.paidPaise;
      if (left !== ZERO) {
        const by = who(d.removedById);
        entries.push({
          ...base, key: `removed:${d.id}`, kind: "reversal", date: d.removedAt ? dayOf(d.removedAt, tz) : d.dueDate,
          title: `Removed · ${title}`, sub: `${d.removedReason ?? "Removed"}${by ? ` · by ${by}` : ""}`, ref: null,
          debit: left < ZERO ? -left : ZERO, credit: left > ZERO ? left : ZERO, balance: ZERO, order: 3,
        });
      }
    }
  }

  for (const l of conLines) {
    if (!shownIds.has(l.dueId)) continue;
    const c = l.concession;
    const by = who(c.decidedById ?? c.requestedById);
    const title = `${concessionTypeLabel(c.type)} · ${rowName(l.dueId)}`;
    entries.push({ ...base, key: `con:${l.id}`, kind: "concession", date: dayOf(l.createdAt, tz), title, sub: `${c.reason}${by ? ` · ${by}` : ""}`, ref: null, debit: ZERO, credit: l.amountPaise, balance: ZERO, order: 1 });
    if (c.status === "REJECTED") {
      entries.push({ ...base, key: `con-off:${l.id}`, kind: "reversal", date: dayOf(c.updatedAt, tz), title: `Concession taken off · ${rowName(l.dueId)}`, sub: c.decisionNote ?? "Taken off", ref: null, debit: l.amountPaise, credit: ZERO, balance: ZERO, order: 2 });
    }
  }

  const refundTakes = new Set<string>();
  for (const r of refunds.filter((x) => x.status === "REFUNDED")) {
    entries.push({
      ...base, key: `refund:${r.id}`, kind: "refund", date: r.refundedOn ?? dayOf(r.updatedAt, tz),
      title: `Refund · ${formatRupees(r.amountPaise)} by ${modeLabel(r.mode).toLowerCase()}`,
      sub: `${r.reason}${r.reference ? ` · ${r.reference}` : ""} · the fee and the payment both come down, so the balance stays the same`,
      ref: receiptOf(r.paymentId), debit: ZERO, credit: ZERO, balance: ZERO, paymentId: r.paymentId, order: 5,
    });
    refundTakes.add(r.reason);
  }

  for (const a of adjustments) {
    if (!shownIds.has(a.dueId)) continue;
    if (a.reason.startsWith("Refunded: ") && refundTakes.has(a.reason.slice("Refunded: ".length))) continue;
    const by = who(a.createdById);
    entries.push({
      ...base, key: `adj:${a.id}`, kind: "adjust", date: dayOf(a.createdAt, tz), title: `Adjustment · ${rowName(a.dueId)}`,
      sub: `${a.reason}${by ? ` · ${by}` : ""}`, ref: null, debit: a.amountPaise > ZERO ? a.amountPaise : ZERO, credit: a.amountPaise < ZERO ? -a.amountPaise : ZERO, balance: ZERO, order: 1,
    });
  }

  for (const p of payments) {
    const counted = p.allocations.filter((a) => !a.fromAdvance && shownIds.has(a.dueId));
    const paid = counted.reduce((s, a) => s + a.amountPaise, ZERO);
    const rows = [...new Set(p.allocations.filter((a) => !a.fromAdvance).map((a) => rowName(a.dueId)))];
    const rcpt = receiptOf(p.id) ?? p.oldReceiptNo;
    const modeText = p.mode === "CHEQUE" ? `Cheque ${p.chequeNo ?? ""}`.trim() : modeLabel(p.mode);
    const waiting = p.status === "WAITING";
    const cancelled = p.status === "CANCELLED" ? { reason: cancelReasonLabel(p.cancelReason) || "Cancelled", when: p.cancelledAt ?? p.updatedAt } : null;
    const counts = p.status === "POSTED";
    entries.push({
      key: `pay:${p.id}`, kind: "receipt", date: p.paymentDate,
      title: `${p.isPartial ? "Part payment" : "Payment"} · ${rows.join(", ") || "Advance"}`,
      sub: [modeText, p.reference, p.broughtIn ? "Brought in from old software" : null, waiting ? "Waiting for verification" : null, p.advancePaise > ZERO ? `${formatRupees(p.advancePaise)} held as advance` : null].filter(Boolean).join(" · "),
      ref: rcpt, debit: ZERO, credit: paid || (counts ? ZERO : p.amountPaise), balance: ZERO, paymentId: p.id, cancelled, waiting, broughtIn: p.broughtIn, order: 4,
    });
    const fromAdvance = p.allocations.filter((a) => a.fromAdvance && shownIds.has(a.dueId));
    for (const a of fromAdvance) {
      entries.push({
        ...base, key: `adv:${a.id}`, kind: "receipt", date: dayOf(a.createdAt, tz), title: `Advance used · ${rowName(a.dueId)}`,
        sub: `From the advance held on ${rcpt ?? "an earlier payment"}`, ref: rcpt, debit: ZERO, credit: counts ? a.amountPaise : ZERO, balance: ZERO, paymentId: p.id, order: 4,
        cancelled, waiting: false, broughtIn: false,
      });
    }
  }

  entries.sort((a, b) => a.date.getTime() - b.date.getTime() || a.order - b.order);
  let bal = ZERO;
  for (const e of entries) {
    const struck = e.cancelled || e.waiting;
    if (!struck) bal += e.debit - e.credit;
    e.balance = bal;
  }

  const lateByParent = new Map<string, bigint>();
  for (const d of dues) if (d.kind === "LATE_FEE" && d.parentDueId && d.state === "OPEN") lateByParent.set(d.parentDueId, (lateByParent.get(d.parentDueId) ?? ZERO) + d.balancePaise);
  const installments: LedgerInstallment[] = dues
    .filter((d) => !(d.kind === "LATE_FEE" && d.parentDueId && dueById.get(d.parentDueId)))
    .map((d) => {
      const s = dueStatus(d, today);
      const late = lateByParent.get(d.id) ?? ZERO;
      const status: LedgerInstallment["status"] = d.state === "REMOVED" ? "Removed" : s === "PAID" ? "Paid" : s === "NOT_DUE" ? "Not due" : d.paidPaise > ZERO ? "Part paid" : s === "OVERDUE" ? "Overdue" : "Due";
      return {
        id: d.id,
        head: d.kind === "LATE_FEE" ? "Late fee" : d.kind === "OLD_DUES" ? "Old dues" : headName(d.feeHeadId),
        label: d.label,
        dueDate: d.dueDate,
        amount: netAmount(d),
        paid: d.paidPaise,
        late,
        balance: d.state === "REMOVED" ? ZERO : d.balancePaise + late,
        status,
        kind: d.kind,
        broughtIn: d.broughtIn,
      };
    });

  const paymentRows: LedgerPayment[] = [...payments].reverse().map((p) => {
    const rows = [...new Set(p.allocations.filter((a) => !a.fromAdvance).map((a) => rowName(a.dueId)))];
    const left = p.allocations.filter((a) => !a.fromAdvance).reduce((s, a) => s + (dueById.get(a.dueId)?.state === "OPEN" ? dueById.get(a.dueId)!.balancePaise : ZERO), ZERO);
    return {
      id: p.id, date: p.paymentDate, receiptNo: receiptOf(p.id), oldReceiptNo: p.oldReceiptNo, heads: rows.join(", ") || "Advance",
      mode: p.mode, amount: p.amountPaise, status: p.status, partial: p.isPartial, broughtIn: p.broughtIn, cancelReason: p.cancelReason ? cancelReasonLabel(p.cancelReason) : null, leftOnRows: left,
    };
  });

  const open = shown.filter((d) => d.state === "OPEN");
  const yearTotal = dues.filter((d) => d.state === "OPEN").reduce((s, d) => s + netAmount(d), ZERO);
  const paidTotal = dues.filter((d) => d.state === "OPEN").reduce((s, d) => s + d.paidPaise, ZERO);
  const balanceNow = open.reduce((s, d) => s + d.balancePaise, ZERO);
  const overdue = open.filter((d) => dueStatus(d, today) === "OVERDUE").reduce((s, d) => s + d.balancePaise, ZERO);

  const byHead = new Map<string, { head: string; total: bigint; paid: bigint }>();
  for (const d of dues) {
    if (d.state !== "OPEN") continue;
    const k = d.kind === "LATE_FEE" ? "Late fee" : d.kind === "OLD_DUES" ? "Old dues" : headName(d.feeHeadId);
    const h = byHead.get(k) ?? { head: k, total: ZERO, paid: ZERO };
    h.total += netAmount(d);
    h.paid += d.paidPaise;
    byHead.set(k, h);
  }

  const invoiceRows = invoices.map((doc) => {
    const ids = ((doc.details as { dueIds?: string[] }).dueIds ?? []);
    const ds = ids.map((i) => dueById.get(i)).filter((x): x is NonNullable<typeof x> => Boolean(x) && x!.state === "OPEN");
    const left = ds.reduce((s, d) => s + d.balancePaise, ZERO);
    const anyPaid = ds.some((d) => d.paidPaise > ZERO);
    return {
      id: doc.id, number: doc.number, date: dayOf(doc.createdAt, tz), total: doc.totalPaise, left,
      rows: ids.map((i) => rowName(i)).join(", "),
      openDueIds: ds.filter((d) => d.balancePaise > ZERO).map((d) => d.id),
      status: left <= ZERO ? "Paid" : anyPaid ? "Part paid" : "Open",
    };
  });

  const adjustList = entries.filter((e) => ["concession", "late", "reversal", "adjust", "refund", "opening"].includes(e.kind));

  return {
    entries,
    installments,
    payments: paymentRows,
    invoices: invoiceRows,
    certificates: certificates.map((c) => ({ id: c.id, number: c.number, total: c.totalPaise, date: dayOf(c.createdAt, tz), year: (c.details as { financialYear?: string }).financialYear ?? "" })),
    adjustments: adjustList,
    comingUp: comingUp.map((d) => ({ id: d.id, head: headName(d.feeHeadId), label: d.label, dueDate: d.dueDate, amount: netAmount(d) })),
    heads: [...byHead.values()],
    yearTotal,
    paidTotal,
    balanceNow,
    overdue,
    totalDebit: entries.filter((e) => !e.cancelled && !e.waiting).reduce((s, e) => s + e.debit, ZERO),
    totalCredit: entries.filter((e) => !e.cancelled && !e.waiting).reduce((s, e) => s + e.credit, ZERO),
    openDueIds: open.filter((d) => d.balancePaise > ZERO).map((d) => d.id),
  };
}

export type StudentLedger = Awaited<ReturnType<typeof studentLedger>>;

