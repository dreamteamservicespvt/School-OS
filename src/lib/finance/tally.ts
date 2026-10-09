// Tally export (optional, 07 §6): vouchers for outside accounting software.
// Each Day Book entry becomes a Receipt or Payment voucher, money moved
// becomes a Contra voucher, and journal entries become Journal vouchers.
// Heads use the Tally ledger name set in Finance Settings (or their own name);
// cash in hand is "Cash" and bank accounts use their name. Opening balances
// are left out: they are set on the ledgers in Tally itself.
import "server-only";

import type { SchoolContext, Tx } from "../db";
import { chart, headSide } from "./journals";

const ZERO = BigInt(0);

function x(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}
const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, "");
const amt = (p: bigint) => {
  const neg = p < ZERO;
  const a = neg ? -p : p;
  return `${neg ? "-" : ""}${a / BigInt(100)}.${String(a % BigInt(100)).padStart(2, "0")}`;
};

type Leg = { ledger: string; debit: bigint; credit: bigint };

function voucher(type: string, date: Date, number: string, narration: string, legs: Leg[]) {
  // Tally: debits are negative amounts marked deemed positive; credits are positive.
  const lines = legs
    .map((l) => {
      const debit = l.debit > ZERO;
      return `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${x(l.ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${debit ? "Yes" : "No"}</ISDEEMEDPOSITIVE><AMOUNT>${amt(debit ? -l.debit : l.credit)}</AMOUNT></ALLLEDGERENTRIES.LIST>`;
    })
    .join("");
  return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${type}" ACTION="Create"><DATE>${ymd(date)}</DATE><VOUCHERTYPENAME>${type}</VOUCHERTYPENAME><VOUCHERNUMBER>${x(number)}</VOUCHERNUMBER><NARRATION>${x(narration.slice(0, 500))}</NARRATION>${lines}</VOUCHER></TALLYMESSAGE>`;
}

/** The vouchers for a period as Tally import XML, and how many there are. */
export async function tallyVouchers(tx: Tx, ctx: SchoolContext, from: Date, to: Date) {
  const { bySystem } = await chart(tx, ctx);
  const [heads, banks, entries, journals] = await Promise.all([
    tx.accountHead.findMany({ where: { schoolId: ctx.schoolId } }),
    tx.bankAccount.findMany({ where: { schoolId: ctx.schoolId } }),
    tx.dayBookEntry.findMany({ where: { date: { gte: from, lte: to }, section: { not: "opening" } }, orderBy: [{ date: "asc" }, { postedAt: "asc" }] }),
    tx.journalEntry.findMany({ where: { date: { gte: from, lte: to } }, include: { lines: true }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
  ]);
  const headLedger = (key: string) => {
    if (!key.startsWith("head:")) return "Suspense";
    const h = heads.find((y) => y.id === key.slice(5));
    return h ? h.tallyLedger || h.name : "Suspense";
  };
  const bankLedger = (id: string | null) => {
    const b = banks.find((y) => y.id === id);
    return !b ? "Suspense" : b.kind === "CASH" ? "Cash" : b.name;
  };
  const out: string[] = [];
  const transfers = new Map<string, typeof entries>();
  for (const e of entries) {
    if (e.section === "transfer") {
      const list = transfers.get(e.sourceId) ?? [];
      list.push(e);
      transfers.set(e.sourceId, list);
      continue;
    }
    const money = bankLedger(e.accountId);
    const other = headLedger(headSide(e, bySystem));
    const narration = `${e.headName}, ${e.partyName}${e.reference ? `, ref ${e.reference}` : ""}${e.note ? `. ${e.note}` : ""}`;
    const legs: Leg[] = e.direction === "IN"
      ? [{ ledger: money, debit: e.amountPaise, credit: ZERO }, { ledger: other, debit: ZERO, credit: e.amountPaise }]
      : [{ ledger: other, debit: e.amountPaise, credit: ZERO }, { ledger: money, debit: ZERO, credit: e.amountPaise }];
    out.push(voucher(e.direction === "IN" ? "Receipt" : "Payment", e.date, `SOS-${e.id.slice(0, 8)}`, narration, legs));
  }
  for (const [id, list] of transfers) {
    // Each pair (out of one account, into another) is one Contra voucher; a cancelled move adds its own pair.
    const outs = list.filter((e) => e.direction === "OUT");
    const ins = list.filter((e) => e.direction === "IN");
    for (let i = 0; i < Math.min(outs.length, ins.length); i++) {
      out.push(voucher("Contra", ins[i].date, `SOS-${id.slice(0, 8)}-${i + 1}`, `${ins[i].partyName}${ins[i].reference ? `, ref ${ins[i].reference}` : ""}`, [
        { ledger: bankLedger(ins[i].accountId), debit: ins[i].amountPaise, credit: ZERO },
        { ledger: bankLedger(outs[i].accountId), debit: ZERO, credit: outs[i].amountPaise },
      ]));
    }
  }
  for (const j of journals) {
    out.push(voucher("Journal", j.date, j.number, j.narration, j.lines.map((l) => ({ ledger: l.accountHeadId ? headLedger(`head:${l.accountHeadId}`) : bankLedger(l.bankAccountId), debit: l.debitPaise, credit: l.creditPaise }))));
  }
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC><REQUESTDATA>\n${out.join("\n")}\n</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>\n`;
  return { xml, count: out.length };
}
