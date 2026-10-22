"use server";

import { dateOf, id, optionalText, rupeesOf, str, text, UUID_RE } from "@/lib/fees/act";
import { MoneyProblem } from "@/lib/fees/problem";
import { formatDate, formatRupees } from "@/lib/format";
import { components, linesFrom } from "@/lib/salary/settings";
import { reviseByPercent, saveStructure } from "@/lib/salary/structures";
import { assertStaffOnCampus } from "@/lib/salary/campus";
import { salaryAction } from "../_lib/action";

const ZERO = BigInt(0);

export async function saveStructureAction(_prev: unknown, fd: FormData) {
  return salaryAction("edit", fd, async (tx, ctx, current) => {
    const staffId = id(fd, "staffId", "staff member");
    // One campus: another campus's staff member is not found.
    await assertStaffOnCampus(tx, ctx, current, staffId);
    const comps = await components(tx, ctx);
    const amounts = new Map<string, bigint>();
    for (const c of comps) {
      if (c.calc !== "FIXED") continue;
      const v = rupeesOf(fd, `c_${c.id}`, c.name);
      if (v !== null && v > ZERO) amounts.set(c.id, v);
    }
    const basic = comps.find((c) => c.systemKey === "basic");
    if (!basic || !amounts.get(basic.id)) throw new MoneyProblem("Enter at least basic pay.", basic ? `c_${basic.id}` : undefined);
    const account = optionalText(fd, "bankAccount", "Bank account", 30)?.replace(/\s/g, "") ?? null;
    if (account && !/^\d{6,20}$/.test(account)) throw new MoneyProblem("A bank account number has 6 to 20 digits.", "bankAccount");
    const ifsc = optionalText(fd, "ifsc", "IFSC", 11)?.toUpperCase() ?? null;
    if (ifsc && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) throw new MoneyProblem("An IFSC looks like HDFC0001234.", "ifsc");
    const revising = str(fd, "mode") === "revise";
    const row = await saveStructure(tx, ctx, {
      staffId, effectiveFrom: dateOf(fd, "effectiveFrom", "Effective from"),
      lines: linesFrom(comps, amounts), pfApplies: str(fd, "pf") === "on", esiApplies: str(fd, "esi") === "on",
      tdsPaise: rupeesOf(fd, "tds", "TDS per month") ?? ZERO,
      reason: revising ? text(fd, "reason", "Reason", { min: 3, max: 200 }) : optionalText(fd, "reason", "Reason", 200),
      bank: account ? { account, ifsc, bankName: optionalText(fd, "bankName", "Bank name", 80) } : null,
    });
    const s = await tx.staff.findFirst({ where: { id: row.staffId }, select: { fullName: true } });
    return { who: s?.fullName ?? "", v: row.version, from: formatDate(row.effectiveFrom), gross: formatRupees(row.grossPaise) };
  }, (r) => r.v > 1 ? `New version for ${r.who} from ${r.from}: v${r.v}, gross ${r.gross}. Earlier slips keep the old amounts.` : `Salary structure saved for ${r.who} from ${r.from}, gross ${r.gross}. Included when the month is recalculated.`);
}

export async function reviseBulkAction(_prev: unknown, fd: FormData) {
  return salaryAction("edit", fd, async (tx, ctx, current) => {
    const ids = str(fd, "ids").split(",").filter((x) => UUID_RE.test(x));
    await assertStaffOnCampus(tx, ctx, current, ids, "ids");
    const pct = Number(str(fd, "percent").replace(/[^\d.]/g, ""));
    if (!(pct > 0 && pct <= 100)) throw new MoneyProblem("Enter the increase in percent, like 5.", "percent");
    const from = dateOf(fd, "from", "From");
    const n = await reviseByPercent(tx, ctx, ids, Math.round(pct * 100), from, text(fd, "reason", "Reason", { min: 3, max: 200 }));
    return { n, pct, from: formatDate(from) };
  }, (r) => `${r.n} structures revised by ${r.pct}% from ${r.from}. New versions saved; earlier months are not changed.`);
}
