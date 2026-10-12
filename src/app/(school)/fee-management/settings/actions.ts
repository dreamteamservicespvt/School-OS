"use server";

import { MoneyProblem } from "@/lib/fees/problem";
import { optionalText, parseRupees, str, strs } from "@/lib/fees/act";
import { COUNTER_PERMISSIONS } from "@/lib/fees/words";
import {
  saveAgeing, saveCounter, saveHeadAccounts, saveLateFee, saveNumbering, savePayments, saveReceipts, saveReminders, saveRouting, saveScholarshipTypes, setFeeFeature,
} from "@/lib/fees/settings-save";
import { feeAction } from "../_lib/action";

const UUID = /^[0-9a-f-]{36}$/i;
const int = (fd: FormData, k: string, label: string) => {
  const v = str(fd, k).trim();
  if (!/^\d+$/.test(v)) throw new MoneyProblem(`${label} must be a whole number.`, k);
  return Number(v);
};
const money = (fd: FormData, k: string, label: string) => {
  const v = str(fd, k).trim();
  return v ? parseRupees(v, label) ?? BigInt(0) : BigInt(0);
};

export async function lateFeeAction(_prev: unknown, fd: FormData) {
  return feeAction("edit", fd, async (tx, ctx) => {
    const type = str(fd, "type") as "flat" | "per-day" | "percent";
    const pct = Number(str(fd, "percent") || "0");
    if (type === "percent" && !Number.isFinite(pct)) throw new MoneyProblem("Percent must be a number.", "percent");
    const max = str(fd, "max").trim();
    await saveLateFee(tx, ctx, {
      on: str(fd, "on") === "on", type, amountPaise: type === "percent" ? BigInt(0) : money(fd, "amount", "Late fee"), percentBp: Math.round(pct * 100),
      graceDays: int(fd, "graceDays", "Grace period"), maxPaise: max ? money(fd, "max", "Most per installment") : null,
      headIds: strs(fd, "headId").filter((x) => UUID.test(x)),
    });
    return true;
  }, () => "Late fee rules saved. They apply to late fees added from now; late fees already added stay.", { staffOnly: "change Fee Settings" });
}

export async function remindersAction(_prev: unknown, fd: FormData) {
  return feeAction("edit", fd, async (tx, ctx) => {
    await saveReminders(tx, ctx, { on: str(fd, "on") === "on", days: strs(fd, "day").map(Number).filter(Number.isFinite), channel: str(fd, "channel"), template: str(fd, "template") });
    return true;
  }, () => "Reminder schedule saved. Opted-out parents are always skipped.", { staffOnly: "change Fee Settings" });
}

export async function receiptsAction(_prev: unknown, fd: FormData) {
  return feeAction("edit", fd, async (tx, ctx) => {
    await saveReceipts(tx, ctx, {
      prefix: str(fd, "prefix"), digits: int(fd, "digits", "Digits"), restartEachYear: str(fd, "restart") === "on", partialSeries: str(fd, "partialSeries") === "on",
      partialPrefix: str(fd, "partialPrefix"), printCopies: str(fd, "printCopies"), terms: optionalText(fd, "terms", "Terms", 600),
    });
    return true;
  }, () => "Receipt settings saved. Receipts already given keep their numbers.", { staffOnly: "change Fee Settings" });
}

export async function numberingAction(_prev: unknown, fd: FormData) {
  return feeAction("edit", fd, async (tx, ctx) => {
    await saveNumbering(tx, ctx, { taxInvoicePrefix: str(fd, "taxInvoicePrefix"), invoicePrefix: str(fd, "invoicePrefix"), certificatePrefix: str(fd, "certificatePrefix") });
    return true;
  }, () => "Numbering saved. It applies to new tax invoices, invoices and certificates.", { staffOnly: "change Fee Settings" });
}

export async function ageingAction(_prev: unknown, fd: FormData) {
  return feeAction("edit", fd, async (tx, ctx) => {
    const ends = str(fd, "ends").split(/[,\s]+/).filter(Boolean).map((x) => {
      if (!/^\d+$/.test(x)) throw new MoneyProblem("Type whole numbers of days, like 30, 60, 90.", "ends");
      return Number(x);
    });
    await saveAgeing(tx, ctx, ends);
    return ends.length + 1;
  }, (n) => `Ageing groups saved: ${n} groups. Defaulters and the outstanding report use them now.`, { staffOnly: "change Fee Settings" });
}

export async function routingAction(_prev: unknown, fd: FormData) {
  return feeAction("edit", fd, async (tx, ctx) => {
    const byClass: Record<string, string> = {};
    for (const [k, v] of fd.entries()) {
      if (typeof v !== "string" || !k.startsWith("class:")) continue;
      const classId = k.slice(6);
      if (UUID.test(classId) && UUID.test(v)) byClass[classId] = v;
    }
    const d = str(fd, "default");
    await saveRouting(tx, ctx, { default: UUID.test(d) ? d : null, byClass });
    return true;
  }, () => "Gateways for each class saved. New payment links use them.", { staffOnly: "change Fee Settings" });
}

export async function paymentsAction(_prev: unknown, fd: FormData) {
  return feeAction("edit", fd, async (tx, ctx) => {
    await savePayments(tx, ctx, { verifyModes: strs(fd, "verifyMode"), concessionLimitPaise: money(fd, "limit", "Limit"), cancelPastApproval: str(fd, "cancelPast") === "on" });
    return true;
  }, () => "Payment settings saved.", { staffOnly: "change Fee Settings" });
}

export async function counterAction(_prev: unknown, fd: FormData) {
  return feeAction("edit", fd, async (tx, ctx) => {
    const map: Record<string, string[]> = {};
    for (const p of COUNTER_PERMISSIONS) map[p.key] = strs(fd, p.key);
    await saveCounter(tx, ctx, map);
    return true;
  }, () => "Counter permissions saved. They apply from the next action.", { staffOnly: "change Fee Settings" });
}

export async function headAccountsAction(_prev: unknown, fd: FormData) {
  return feeAction("edit", fd, async (tx, ctx) => {
    const map: Record<string, string | null> = {};
    for (const [k, v] of fd.entries()) {
      if (typeof v !== "string" || !k.startsWith("head:")) continue;
      const headId = k.slice(5);
      if (UUID.test(headId)) map[headId] = UUID.test(v) ? v : null;
    }
    await saveHeadAccounts(tx, ctx, map);
    return true;
  }, () => "Bank account for each fee head saved. New receipts and the Day Book show it.", { staffOnly: "change Fee Settings" });
}

export async function scholarshipTypesAction(_prev: unknown, fd: FormData) {
  return feeAction("edit", fd, async (tx, ctx) => {
    await saveScholarshipTypes(tx, ctx, str(fd, "types").split("\n"));
    return true;
  }, () => "Scholarship types saved.", { staffOnly: "change Fee Settings" });
}

export async function featureAction(_prev: unknown, fd: FormData) {
  return feeAction("edit", fd, async (tx, ctx) => {
    const on = str(fd, "on") === "1";
    await setFeeFeature(tx, ctx, str(fd, "key"), on);
    return on;
  }, (on) => (on ? "Switched on for this school." : "Switched off. Records already made stay."), { staffOnly: "change Fee Settings" });
}
