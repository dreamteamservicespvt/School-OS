"use server";

import { id, needRupees, parseRupees, str } from "@/lib/fees/act";
import { MoneyProblem } from "@/lib/fees/problem";
import { formatRupees } from "@/lib/format";
import { todayIn } from "@/lib/staff/dates";
import type { Tx } from "@/lib/db";
import { addComponent, archiveComponent, asStatutory, lastFrozenMonth, saveSlabs, savePreferences, saveStatutory, setSlipOption, SLIP_OPTIONS, statutoryFor, type SlipOption } from "@/lib/salary/settings";
import { addMonths, firstOfMonth, monthName, parseMonthKey } from "@/lib/salary/words";
import { salaryAction } from "../_lib/action";

const pctBp = (fd: FormData, key: string, label: string) => {
  const raw = str(fd, key).replace(/[^\d.]/g, "");
  const n = Number(raw);
  if (raw === "" || !Number.isFinite(n) || n < 0 || n > 100) throw new MoneyProblem(`Enter ${label} in percent, like 12.`, key);
  return Math.round(n * 100);
};

/** The first month new rules may start: next month after the last approved one, and never before this month. */
async function firstOpenMonth(tx: Tx, today: Date) {
  const frozen = await lastFrozenMonth(tx);
  const now = firstOfMonth(today);
  const next = frozen ? addMonths(frozen, 1) : now;
  return next > now ? next : now;
}

/** PF, ESI or Professional Tax on or off from the first month not yet approved. */
export async function statutorySwitchAction(_prev: unknown, fd: FormData) {
  return salaryAction("edit", fd, async (tx, ctx, current) => {
    const field = str(fd, "field");
    if (!["pfOn", "esiOn", "ptOn"].includes(field)) throw new MoneyProblem("This switch was not found.");
    const on = str(fd, "on") === "1";
    const from = await firstOpenMonth(tx, todayIn(current.school.timeZone));
    const now = await statutoryFor(tx, ctx, from);
    await saveStatutory(tx, ctx, { ...asStatutory(now), ptState: now.ptState, [field]: on }, from);
    return { what: { pfOn: "PF", esiOn: "ESI", ptOn: "Professional Tax" }[field]!, on, from: monthName(from) };
  }, (r) => `${r.what} ${r.on ? "on" : "off"} from ${r.from}. Approved salaries stay as they are.`);
}

export async function ratesAction(_prev: unknown, fd: FormData) {
  return salaryAction("edit", fd, async (tx, ctx) => {
    const from = parseMonthKey(str(fd, "from"));
    if (!from) throw new MoneyProblem("Choose the month the rates start.", "from");
    const now = await statutoryFor(tx, ctx, from);
    await saveStatutory(tx, ctx, {
      ...asStatutory(now), ptState: now.ptState,
      pfEmployeeBp: pctBp(fd, "pfEmployee", "the PF employee rate"), pfEmployerBp: pctBp(fd, "pfEmployer", "the PF employer rate"), pfCeilingPaise: needRupees(fd, "pfCeiling", "PF wage ceiling"),
      esiEmployeeBp: pctBp(fd, "esiEmployee", "the ESI employee rate"), esiEmployerBp: pctBp(fd, "esiEmployer", "the ESI employer rate"), esiLimitPaise: needRupees(fd, "esiLimit", "ESI wage limit"),
    }, from);
    return monthName(from);
  }, (m) => `New PF and ESI rates from ${m}. Approved salaries never change.`);
}

export async function preferencesAction(_prev: unknown, fd: FormData) {
  return salaryAction("edit", fd, async (tx, ctx) => {
    const overtimeOn = str(fd, "overtimeOn") === "on";
    await savePreferences(tx, ctx, {
      payDay: str(fd, "payDay"), lopDays: str(fd, "lopDays"), lateMarksPerHalfDay: Number(str(fd, "lateMarks")) || 0,
      overtimeOn, overtimeHourPaise: overtimeOn ? needRupees(fd, "overtimeHour", "Overtime pay an hour") : BigInt(0),
      tdsReminderAbovePaise: needRupees(fd, "tdsReminder", "TDS reminder above", { allowZero: true }),
    });
    return null;
  }, () => "Payroll preferences saved. They apply to months not approved yet.");
}

export async function slipOptionAction(_prev: unknown, fd: FormData) {
  return salaryAction("edit", fd, async (tx, ctx) => {
    const key = str(fd, "key") as SlipOption;
    const on = str(fd, "on") === "1";
    await setSlipOption(tx, ctx, key, on);
    return { title: SLIP_OPTIONS.find((o) => o.key === key)?.title ?? key, on };
  }, (r) => `${r.title}: ${r.on ? "on" : "off"}.`);
}

export async function addComponentAction(_prev: unknown, fd: FormData) {
  return salaryAction("create", fd, async (tx, ctx) => {
    const calc = str(fd, "calc") === "PERCENT" ? "PERCENT" : "FIXED";
    const c = await addComponent(tx, ctx, {
      name: str(fd, "name"), kind: str(fd, "kind") === "DEDUCTION" ? "DEDUCTION" : "EARNING", calc,
      percentBp: calc === "PERCENT" ? pctBp(fd, "percent", "the percentage of basic pay") : null, taxable: str(fd, "taxable") === "on",
    });
    return c.name;
  }, (n) => `Component added: ${n}. Use it in structures from now on.`);
}

export async function archiveComponentAction(_prev: unknown, fd: FormData) {
  return salaryAction("archive", fd, async (tx, ctx) => (await archiveComponent(tx, ctx, id(fd, "componentId", "component"))).name,
    (n) => `${n} archived. Structures that already use it keep it.`);
}

/** The Professional Tax table: up to six rows of from, to (blank for "and above") and tax a month. */
export async function slabsAction(_prev: unknown, fd: FormData) {
  return salaryAction("edit", fd, async (tx, ctx) => {
    const state = str(fd, "state") || "Telangana";
    const rows = [];
    for (let i = 0; i < 6; i++) {
      const from = str(fd, `from_${i}`), to = str(fd, `to_${i}`), tax = str(fd, `tax_${i}`);
      if (!from && !to && !tax) continue;
      rows.push({ fromPaise: parseRupees(from, `Row ${i + 1} from`, "slabs") ?? BigInt(0), toPaise: to ? parseRupees(to, `Row ${i + 1} to`, "slabs") : null, taxPaise: parseRupees(tax, `Row ${i + 1} tax`, "slabs") ?? BigInt(0) });
    }
    await saveSlabs(tx, ctx, state, rows);
    return { state, rows: rows.length, top: rows.length ? formatRupees(rows[rows.length - 1].taxPaise) : "" };
  }, (r) => `Professional Tax table for ${r.state} saved · ${r.rows} rows. Months not approved yet use it.`);
}
