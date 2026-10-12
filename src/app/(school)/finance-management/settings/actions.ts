"use server";

import { formatDate } from "@/lib/format";
import { dateOf, id, needRupees, str, text } from "@/lib/fees/act";
import { MoneyProblem } from "@/lib/fees/problem";
import { closeMonth } from "@/lib/finance/accounts";
import { financeSettings, setFeature } from "@/lib/finance/settings";
import { addCostCentre, addHead, saveFinanceSettings, saveTallyLedgers, setHeadShown } from "@/lib/finance/settings-save";
import { FINANCE_FEATURES } from "@/lib/finance/words";
import { MONTH_NAMES } from "@/lib/finance/years";
import { todayIn } from "@/lib/staff/dates";
import { financeAction } from "../_lib/action";

/** The financial year and go-live (the "Financial year" card). */
export async function yearAction(_prev: unknown, fd: FormData) {
  return financeAction("edit", fd, async (tx, ctx) => {
    const s = await financeSettings(tx, ctx);
    const month = Number(str(fd, "fyStartMonth"));
    const goLive = dateOf(fd, "goLiveDate", "Go-live date");
    await saveFinanceSettings(tx, ctx, { ...s, fyStartMonth: month, goLiveDate: goLive });
    return { month, goLive, changed: month !== s.fyStartMonth };
  }, (r) => r.changed ? `The financial year starts in ${MONTH_NAMES[r.month - 1]} from the next year. This year stays as it is.` : `Saved. Records start on ${formatDate(r.goLive)}.`);
}

/** Bills and cash: the bill photo limit, the approved-at-once limit and the numbering. */
export async function billsAction(_prev: unknown, fd: FormData) {
  return financeAction("edit", fd, async (tx, ctx) => {
    const s = await financeSettings(tx, ctx);
    await saveFinanceSettings(tx, ctx, {
      ...s,
      billRequiredAbove: needRupees(fd, "billRequiredAbove", "Bill photo needed above", { allowZero: true }),
      expenseApproveUpTo: needRupees(fd, "expenseApproveUpTo", "Approved at once up to", { allowZero: true }),
      incomeReceiptPrefix: str(fd, "incomeReceiptPrefix").toUpperCase(),
      journalPrefix: str(fd, "journalPrefix").toUpperCase(),
    });
    return true;
  }, () => "Saved. Recorded in the audit log.");
}

export async function addHeadAction(_prev: unknown, fd: FormData) {
  return financeAction("edit", fd, async (tx, ctx) => {
    const kind = str(fd, "kind") === "INCOME" ? "INCOME" : "EXPENSE";
    const h = await addHead(tx, ctx, { kind, name: str(fd, "name"), code: str(fd, "code"), group: str(fd, "group") });
    return { name: h.name, code: h.code, kind };
  }, (h) => `${h.name} added · ${h.code}. Shown on the Record ${h.kind === "INCOME" ? "income" : "expense"} form from now.`);
}

export async function headShownAction(_prev: unknown, fd: FormData) {
  return financeAction("edit", fd, async (tx, ctx) => {
    const shown = str(fd, "shown") === "1";
    const h = await setHeadShown(tx, ctx, id(fd, "headId", "head"), shown);
    return { name: h.name, shown };
  }, (h) => `${h.name}: ${h.shown ? "shown on" : "hidden from"} the form. Past records stay.`);
}

export async function costCentreAction(_prev: unknown, fd: FormData) {
  return financeAction("edit", fd, async (tx, ctx) => (await addCostCentre(tx, ctx, str(fd, "name"))).name, (n) => `${n} added. It shows on the expense form and in reports.`);
}

export async function featureAction(_prev: unknown, fd: FormData) {
  return financeAction("edit", fd, async (tx, ctx) => {
    const key = str(fd, "key");
    if (!FINANCE_FEATURES.some((f) => f.key === key)) throw new MoneyProblem("This part was not found.");
    const on = str(fd, "on") === "1";
    await setFeature(tx, ctx, key, on);
    return on;
  }, (on) => (on ? "Switched on for this school." : "Switched off. Records already made stay."));
}

export async function tallyAction(_prev: unknown, fd: FormData) {
  return financeAction("edit", fd, async (tx, ctx) => {
    // Every row is sent, blank ones too (blank uses the head's own name), so read them all in order.
    const heads = fd.getAll("headId").map(String);
    const ledgers = fd.getAll("ledger").map(String);
    if (heads.length !== ledgers.length) throw new MoneyProblem("Something went wrong with the form. Open it again.");
    return saveTallyLedgers(tx, ctx, heads.map((headId, i) => ({ headId, ledger: ledgers[i] })));
  }, (n) => (n ? `${n} Tally ${n === 1 ? "ledger" : "ledgers"} saved.` : "Nothing changed."));
}

export async function closeMonthAction(_prev: unknown, fd: FormData) {
  return financeAction("edit", fd, async (tx, ctx, _v, current) => {
    const m = text(fd, "month", "Month", { min: 7, max: 7 });
    if (!/^\d{4}-\d{2}$/.test(m)) throw new MoneyProblem("Choose the month.");
    const r = await closeMonth(tx, ctx, new Date(`${m}-01T00:00:00Z`), todayIn(current.school.timeZone));
    return { label: new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(r.month), waiting: r.waiting };
  }, (r) => `${r.label} closed. Its books are now read only.${r.waiting ? ` ${r.waiting} expenses dated in it still wait for approval.` : ""}`);
}
