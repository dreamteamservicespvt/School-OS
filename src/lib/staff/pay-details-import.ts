// Staff pay details (workflow 15, gap list G19): each staff member's bank,
// PAN, UAN (PF) and ESI numbers from the old software, so salary is paid to
// the right account and the PF and ESI statements carry the right numbers from
// the first month. These are the restricted fields of the Staff record
// (09 §1): PAN and the bank account are kept encrypted, shown in full only to
// HR, the Principal and the School Admin, and only the last 4 characters ever
// go into the Audit Log, as when they are typed on the staff profile.
//
// Brought in from Staff & HR Management, Import staff, or Switching to School
// OS, by those three roles with full Staff & HR. A person limited to one
// campus brings in that campus's staff only. Empty cells keep what is on
// record. Undo puts the old values back where nobody has changed them since.
// Imported by src/lib/import-registry.ts.
import "server-only";

import type { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { defineImport, type ImportKind, type UpdatedRow } from "../importer";
import { writeAudit } from "../audit";
import { decryptField, encryptField, maskLast4 } from "../crypto";
import { campusLimitOf } from "./campus-logins";
import { checkBankAccount, checkIfsc, checkPan } from "./staff";

export const PAY_DETAILS_IMPORT = "staff-pay-details";

/** The Staff fields this import may change. */
const FIELDS = ["bankName", "bankAccountEnc", "bankIfsc", "panEnc", "uan", "esiNo"] as const;
type Field = (typeof FIELDS)[number];
type Details = Partial<Record<Field, string>>;
type Row = { staffId: string; staffName: string; set: Details; changed: string[] };

/** What each change is called in the Audit Log: masked for the encrypted ones. */
const WORDS: Record<Field, (v: string) => string> = {
  bankName: () => "Bank name",
  bankAccountEnc: (v) => `Bank account ${maskLast4(v)}`,
  bankIfsc: () => "IFSC",
  panEnc: (v) => `PAN ${maskLast4(v)}`,
  uan: () => "UAN",
  esiNo: () => "ESI number",
};

const NAMES: Record<Field, string> = { bankName: "Bank name", bankAccountEnc: "Bank account", bankIfsc: "IFSC", panEnc: "PAN", uan: "UAN", esiNo: "ESI number" };

const plainOf = (enc: string | null) => {
  if (!enc) return null;
  try {
    return decryptField(enc);
  } catch {
    return null;
  }
};

export function checkUan(v: string): string | null {
  return /^\d{12}$/.test(v) ? null : `UAN has ${v.replace(/\D/g, "").length} digits. It must have 12 digits.`;
}
export function checkEsi(v: string): string | null {
  return /^(\d{10}|\d{17})$/.test(v) ? null : "ESI number should have 10 digits (17 for the old numbers).";
}

function makeKind(): ImportKind<Row> {
  const memo = new WeakMap<Set<string>, Promise<string | null>>();
  return {
    key: PAY_DETAILS_IMPORT,
    label: "Staff pay details",
    columns: [
      { key: "staffId", label: "Staff ID", required: true, example: "SPS-ST-001", help: "The staff ID in Staff & HR.", aliases: ["staff_id", "staff code", "employee id", "emp id", "emp code", "staff no"] },
      { key: "bankName", label: "Bank name", example: "State Bank of India", aliases: ["bank", "name of bank", "salary bank"] },
      { key: "bankAccount", label: "Bank account number", example: "30012345678", help: "9 to 18 digits. Keep the column as text in Excel so long numbers stay whole.", aliases: ["account no", "account number", "a/c no", "ac no", "bank account", "bank a/c no", "bank account no", "salary account"] },
      { key: "bankIfsc", label: "IFSC", example: "SBIN0001234", aliases: ["ifsc code", "ifsc no", "bank ifsc"] },
      { key: "pan", label: "PAN", example: "ABCDE1234F", aliases: ["pan no", "pan number", "pan card", "pan card no"] },
      { key: "uan", label: "UAN (PF)", example: "100987654321", help: "The 12-digit Universal Account Number for PF.", aliases: ["uan", "uan no", "uan number", "pf uan", "pf no", "pf number", "epf uan"] },
      { key: "esiNo", label: "ESI number", example: "3112345678", help: "The ESI insurance number (IP number).", aliases: ["esi no", "esic no", "esi ip no", "ip number", "esic number", "esi"] },
    ],
    leaveOut: (row) => (["bankName", "bankAccount", "bankIfsc", "pan", "uan", "esiNo"].every((k) => !(row[k] ?? "").trim()) ? "No pay details" : null),
    withOptions: () => makeKind(),
    async check(tx, ctx, row, seen) {
      const problems: string[] = [];
      let limit = memo.get(seen);
      if (!limit) { limit = campusLimitOf(tx, ctx); memo.set(seen, limit); }
      const campusId = await limit;
      const code = (row.staffId ?? "").trim();
      // One campus: a staff ID of another campus reads as "no staff with ID", like one that does not exist.
      const staff = code ? await tx.staff.findFirst({ where: { staffCode: { equals: code, mode: "insensitive" }, archivedAt: null, ...(campusId ? { campusId } : {}) } }) : null;
      if (code && !staff) problems.push(`No staff member has the staff ID ${code}.`);
      if (staff) {
        if (seen.has(`staff:${staff.id}`)) problems.push(`${staff.fullName} is twice in the file. Keep one row for each staff member.`);
        seen.add(`staff:${staff.id}`);
      }
      const v = (k: string) => (row[k] ?? "").trim();
      const bankName = v("bankName").replace(/\s+/g, " ").slice(0, 100);
      const account = v("bankAccount").replace(/[\s-]/g, "");
      const ifsc = v("bankIfsc").toUpperCase();
      const pan = v("pan").toUpperCase();
      const uan = v("uan").replace(/[\s-]/g, "");
      const esi = v("esiNo").replace(/[\s-]/g, "");
      if (account) { const p = checkBankAccount(account); if (p) problems.push(p); }
      if (ifsc) { const p = checkIfsc(ifsc); if (p) problems.push(p); }
      if (pan) { const p = checkPan(pan); if (p) problems.push(p); }
      if (uan) { const p = checkUan(uan); if (p) problems.push(p); }
      if (esi) { const p = checkEsi(esi); if (p) problems.push(p); }
      if (account && !ifsc && staff && !staff.bankIfsc) problems.push("IFSC is needed with the bank account, so salary reaches the right branch.");
      if (problems.length || !staff) return { ok: false, problems };
      // Only what is new: a value already on record is left as it is.
      const set: Details = {};
      const changed: string[] = [];
      const put = (field: Field, value: string, same: boolean, words: string) => { if (value && !same) { set[field] = value; changed.push(words); } };
      put("bankName", bankName, bankName === (staff.bankName ?? ""), WORDS.bankName(bankName));
      put("bankAccountEnc", account, account === plainOf(staff.bankAccountEnc), WORDS.bankAccountEnc(account));
      put("bankIfsc", ifsc, ifsc === (staff.bankIfsc ?? ""), WORDS.bankIfsc(ifsc));
      put("panEnc", pan, pan === plainOf(staff.panEnc), WORDS.panEnc(pan));
      put("uan", uan, uan === (staff.uan ?? ""), WORDS.uan(uan));
      put("esiNo", esi, esi === (staff.esiNo ?? ""), WORDS.esiNo(esi));
      if (!changed.length) return { ok: false, problems: [`These details are already on ${staff.fullName}'s record. Nothing to change; leave the row out.`] };
      return { ok: true, value: { staffId: staff.id, staffName: staff.fullName, set, changed } };
    },
    async save(tx, ctx, v) {
      const before = await tx.staff.findFirstOrThrow({ where: { id: v.staffId, archivedAt: null } });
      const data: Prisma.StaffUpdateInput = { updatedById: ctx.userId };
      const was: Record<string, unknown> = {};
      const now: Record<string, unknown> = {};
      for (const f of FIELDS) {
        const value = v.set[f];
        if (value === undefined) continue;
        // The bank account and PAN are kept encrypted; Undo keeps only what is stored, never the plain number.
        const stored = f === "bankAccountEnc" || f === "panEnc" ? encryptField(value) : value;
        (data as Record<string, unknown>)[f] = stored;
        was[f] = before[f];
        now[f] = stored;
      }
      await tx.staff.update({ where: { id: v.staffId }, data });
      // Only masked values reach the Audit Log, as on the staff profile.
      await writeAudit(tx, ctx, { action: "changed-restricted", recordType: "Staff", recordId: v.staffId, after: { changed: v.changed, from: "Import of staff pay details" } });
      return { id: v.staffId, created: false, before: was, after: now };
    },
    async undo() {
      // Nothing is created: each row changes a Staff record, put back by revert below.
    },
    async revert(tx, ctx, rows: UpdatedRow[]) {
      let back = 0;
      for (const r of rows) {
        const staff = await tx.staff.findUnique({ where: { id: r.id } });
        if (!staff) continue;
        const data: Record<string, unknown> = {};
        const names: string[] = [];
        for (const f of FIELDS) {
          if (!(f in r.after)) continue;
          // A value changed by hand since the import stays.
          if (staff[f] !== r.after[f]) continue;
          data[f] = r.before[f] ?? null;
          names.push(NAMES[f]);
        }
        if (!names.length) continue;
        await tx.staff.update({ where: { id: r.id }, data: { ...data, updatedById: ctx.userId } as Prisma.StaffUpdateInput });
        await writeAudit(tx, ctx, { action: "changed-restricted", recordType: "Staff", recordId: r.id, after: { changed: names, from: "Import of staff pay details undone" } });
        back++;
      }
      return back;
    },
  };
}

defineImport(makeKind());
