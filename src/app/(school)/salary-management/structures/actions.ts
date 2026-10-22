"use server";

import { dateOf, file, id, optionalText, parseRupees, rupeesOf, str, text, UUID_RE } from "@/lib/fees/act";
import { MoneyProblem } from "@/lib/fees/problem";
import { formatDate, formatRupees } from "@/lib/format";
import { writeAudit } from "@/lib/audit";
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

/** Import from a CSV (staff ID, basic, conveyance, special allowance, TDS, effective from): every row is checked before anything is saved. */
export async function importStructuresAction(_prev: unknown, fd: FormData) {
  return salaryAction("create", fd, async (tx, ctx, current) => {
    const f = file(fd, "file");
    if (!f) throw new MoneyProblem("Choose the CSV file.", "file");
    if (f.size > 2_000_000) throw new MoneyProblem("The file is bigger than 2 MB. Split it into smaller files.", "file");
    const lines = (await f.text()).split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const head = lines.shift()?.toLowerCase() ?? "";
    if (!head.includes("staff")) throw new MoneyProblem("The first row must be the headings from the template: staff_id, basic, conveyance, special_allowance, tds, effective_from.", "file");
    const comps = await components(tx, ctx);
    const byName = (n: string) => comps.find((c) => c.name.toLowerCase() === n || c.systemKey === n);
    const basic = byName("basic"), conv = byName("conveyance"), special = byName("special allowance");
    const problems: string[] = [];
    const rows: { staffId: string; amounts: Map<string, bigint>; tds: bigint; from: Date; esi: boolean }[] = [];
    for (const [i, raw] of lines.entries()) {
      const [code, b, c, s, t, d] = raw.split(",").map((x) => x.trim().replace(/^"|"$/g, ""));
      const at = `Row ${i + 2}`;
      try {
        // One campus: a staff ID of another campus is "no staff with ID", like one that does not exist.
        const staff = await tx.staff.findFirst({ where: { staffCode: code, archivedAt: null, ...(current.campusId ? { campusId: current.campusId } : {}) }, select: { id: true } });
        if (!staff) throw new MoneyProblem(`no staff with ID ${code || "(empty)"}`);
        const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(d ?? "") ?? /^(\d{4})-(\d{2})-(\d{2})$/.exec(d ?? "");
        if (!m) throw new MoneyProblem("effective_from must be a date like 01-11-2026");
        const iso = m[1].length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2]}-${m[1]}`;
        const amounts = new Map<string, bigint>();
        const bp = parseRupees(b ?? "", "basic");
        if (!bp) throw new MoneyProblem("basic is needed");
        if (basic) amounts.set(basic.id, bp);
        const cv = parseRupees(c ?? "", "conveyance"); if (conv && cv) amounts.set(conv.id, cv);
        const sv = parseRupees(s ?? "", "special_allowance"); if (special && sv) amounts.set(special.id, sv);
        const gross = bp * BigInt(3) / BigInt(2) + (cv ?? ZERO) + (sv ?? ZERO);
        rows.push({ staffId: staff.id, amounts, tds: parseRupees(t ?? "", "tds") ?? ZERO, from: new Date(`${iso}T00:00:00Z`), esi: gross <= BigInt(2100000) });
      } catch (e) {
        problems.push(`${at}: ${e instanceof Error ? e.message : "could not be read"}`);
      }
    }
    if (!rows.length && !problems.length) throw new MoneyProblem("The file has no rows under the headings.", "file");
    if (problems.length) throw new MoneyProblem(`Nothing was saved. Put these right and choose the file again: ${problems.slice(0, 6).join("; ")}${problems.length > 6 ? `; and ${problems.length - 6} more` : ""}.`, "file");
    for (const r of rows) {
      await saveStructure(tx, ctx, { staffId: r.staffId, effectiveFrom: r.from, lines: linesFrom(comps, r.amounts), pfApplies: true, esiApplies: r.esi, tdsPaise: r.tds, reason: `Imported from ${f.name}` });
    }
    await writeAudit(tx, ctx, { action: "salary-structures-imported", recordType: "Salary Structure", recordId: null, after: { file: f.name, rows: rows.length } });
    return rows.length;
  }, (n) => `${n} salary structures imported. Each is a new version; old versions stay.`);
}
