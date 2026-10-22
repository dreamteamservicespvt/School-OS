// Settings, Data Backup & Security (20-settings.md): the shared importer end
// to end, the full data export job, the audit log filters, deletion requests
// through Approvals, consent text versions and retention periods.
import { inflateRawSync } from "node:zlib";
import { beforeAll, describe, expect, it } from "vitest";
import { withSchool } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { accessIn } from "@/lib/auth/access";
import { reachFor } from "@/lib/permissions";
import { decide } from "@/lib/approvals";
import { saveFile } from "@/lib/files";
import { errorCsv, importKind, previewImport, undoImport } from "@/lib/importer";
import { runImportJob, startImport } from "@/lib/data-security/imports";
import { exportableModels, exportExpired, requestDataExport, runDataExport } from "@/lib/data-security/data-export";
import { auditWhere, diff } from "@/lib/data-security/audit-view";
import { requestDeletion, setRetention, retentionRules, PrivacyProblem } from "@/lib/data-security/privacy";
import { ConsentProblem, consentTexts, saveConsentText } from "@/lib/data-security/consent";
import { fileStore } from "@/lib/storage";
import { makeSchool, makeUser, byHeadings } from "../helpers";
import { readTable } from "@/lib/move-in/read";

let school: Awaited<ReturnType<typeof makeSchool>>;
let other: Awaited<ReturnType<typeof makeSchool>>;
let admin: { id: string };
let principal: { id: string };
let teacher: { id: string };
let secondAdmin: { id: string };
const ctxOf = (u: { id: string }) => ({ schoolId: school.id, userId: u.id });

beforeAll(async () => {
  school = await makeSchool("Data School");
  other = await makeSchool("Other Data School");
  admin = await makeUser({ schools: [{ id: school.id, roleKeys: ["school-admin"] }], name: "Office Admin" });
  principal = await makeUser({ schools: [{ id: school.id, roleKeys: ["principal"] }], name: "Head Principal" });
  teacher = await makeUser({ schools: [{ id: school.id, roleKeys: ["teacher"] }], name: "Class Teacher" });
  secondAdmin = await makeUser({ schools: [{ id: school.id, roleKeys: ["school-admin"] }], name: "Second Admin" });
});

/** Reads the files out of a ZIP made by src/lib/zip.ts. */
function unzip(buf: Buffer) {
  const files = new Map<string, string>();
  let at = 0;
  while (buf.readUInt32LE(at) === 0x04034b50) {
    const method = buf.readUInt16LE(at + 8);
    const size = buf.readUInt32LE(at + 18);
    const nameLen = buf.readUInt16LE(at + 26);
    const extra = buf.readUInt16LE(at + 28);
    const name = buf.subarray(at + 30, at + 30 + nameLen).toString("utf8");
    const data = buf.subarray(at + 30 + nameLen + extra, at + 30 + nameLen + extra + size);
    files.set(name, (method === 8 ? inflateRawSync(data) : data).toString("utf8"));
    at += 30 + nameLen + extra + size;
  }
  return files;
}

describe("importer, end to end (departments)", () => {
  it("matches columns, previews problems, imports the good rows in the background, and undoes", async () => {
    const ctx = ctxOf(admin);
    const csv = "Department name,HOD\r\nMathematics,\r\nScience,\r\n,SPS-T-1\r\nmathematics,\r\nArts,NO-SUCH-STAFF\r\n";
    const file = new File([csv], "departments.csv", { type: "text/csv" });
    const saved = await withSchool(ctx, (tx) => saveFile(tx, ctx, { file, purpose: "import", allowed: ["text/csv", "text/plain", "application/vnd.ms-excel"] }));
    const kind = importKind("departments")!;
    const sheet = await readTable(Buffer.from(csv), "departments.csv");
    const match = byHeadings(kind, sheet.headers);
    expect(match).toEqual({ name: 0, head: 1 });

    const preview = await withSchool(ctx, (tx) => previewImport(tx, ctx, kind, sheet.rows, match));
    expect(preview.good.map((g) => g.row.name)).toEqual(["Mathematics", "Science"]);
    expect(preview.bad.map((b) => b.line)).toEqual([4, 5, 6]);
    // Every problem of a row at once: the empty column and the unknown HOD.
    expect(preview.bad[0].problems).toEqual(["Department is empty.", "No staff member has the staff ID SPS-T-1."]);
    expect(preview.bad[1].problems[0]).toMatch(/appears twice/);
    expect(preview.bad[2].problems[0]).toMatch(/No staff member has the staff ID NO-SUCH-STAFF/);
    expect(errorCsv(kind, preview.bad)).toContain("Problems");

    const job = await withSchool(ctx, (tx) => startImport(tx, ctx, { kind: "departments", fileId: saved.id, match }));
    const again = await withSchool(ctx, (tx) => startImport(tx, ctx, { kind: "departments", fileId: saved.id, match }));
    expect(again.id).toBe(job.id);

    const result = await withSchool(ctx, (tx) => runImportJob(tx, ctx, { kind: "departments", fileId: saved.id, match }));
    expect(result).toMatchObject({ added: 2, updated: 0, skipped: 3 });
    // Safe to run twice.
    expect(await withSchool(ctx, (tx) => runImportJob(tx, ctx, { kind: "departments", fileId: saved.id, match }))).toMatchObject({ repeated: true });

    const names = await withSchool(ctx, (tx) => tx.department.findMany({ where: { archivedAt: null }, select: { name: true } }));
    expect(names.map((n) => n.name).sort()).toEqual(["Mathematics", "Science"]);
    const note = await withSchool(ctx, (tx) => tx.notification.findFirst({ where: { userLoginId: admin.id, type: "import" } }));
    expect(note?.text).toMatch(/2 added/);

    await withSchool(ctx, (tx) => undoImport(tx, ctx, result.batchId));
    const left = await withSchool(ctx, (tx) => tx.department.count({ where: { archivedAt: null } }));
    expect(left).toBe(0);
    const archived = await withSchool(ctx, (tx) => tx.department.count({ where: { archivedAt: { not: null } } }));
    expect(archived).toBe(2);
    await expect(withSchool(ctx, (tx) => undoImport(tx, ctx, result.batchId))).rejects.toThrow(/already undone/);
  });
});

describe("full data export", () => {
  it("runs in the background, makes a ZIP of CSVs without secrets, and tells the person", async () => {
    const ctx = ctxOf(admin);
    const access = await accessIn(admin.id, school.id);
    const models = exportableModels(access!.permissions).map((m) => m.model);
    expect(models).toContain("Department");
    expect(models).not.toContain("BackgroundJob");

    const { row, already } = await withSchool(ctx, (tx) => requestDataExport(tx, ctx, access!.permissions));
    expect(already).toBe(false);
    const second = await withSchool(ctx, (tx) => requestDataExport(tx, ctx, access!.permissions));
    expect(second.already).toBe(true);

    const job = await withSchool(ctx, (tx) => tx.backgroundJob.findFirstOrThrow({ where: { idempotencyKey: `data-export:${row.id}` } }));
    const result = await withSchool(ctx, (tx) => runDataExport(tx, ctx, job.payload as { exportId: string; models: string[] }));
    expect(result).toMatchObject({ files: expect.any(Number) });

    const ready = await withSchool(ctx, (tx) => tx.dataExport.findUniqueOrThrow({ where: { id: row.id } }));
    expect(ready.status).toBe("ready");
    expect(exportExpired(ready.readyAt)).toBe(false);
    expect(exportExpired(ready.readyAt, new Date(Date.now() + 25 * 3_600_000))).toBe(true);

    const file = await withSchool(ctx, (tx) => tx.storedFile.findUniqueOrThrow({ where: { id: ready.fileId! } }));
    const zip = unzip((await fileStore().get(file.storageKey))!);
    expect(zip.get("READ-ME.txt")).toMatch(/Data School: full data export/);
    expect(zip.get("department.csv")).toMatch(/^﻿id,name,headStaffId/);
    const gateways = zip.get("payment-gateway-account.csv");
    if (gateways) expect(gateways.split("\r\n")[0]).not.toMatch(/secretsEnc|webhookSecretEnc/);
    // Another school's records are never in it.
    for (const text of zip.values()) expect(text).not.toContain(other.id);

    const note = await withSchool(ctx, (tx) => tx.notification.findFirst({ where: { userLoginId: admin.id, type: "data-export" } }));
    expect(note?.text).toMatch(/ready to download/);
  });

  it("leaves out records a role may not see", async () => {
    const access = await accessIn(teacher.id, school.id);
    const models = exportableModels(access!.permissions).map((m) => m.model);
    expect(models).not.toContain("PaymentGatewayAccount");
    expect(models).not.toContain("AuditLogEntry");
  });
});

describe("audit log viewer", () => {
  it("filters by person, record and date, and a role with own reach sees only its own lines", async () => {
    const tz = "Asia/Kolkata";
    await withSchool(ctxOf(admin), (tx) => writeAudit(tx, ctxOf(admin), { action: "changed", recordType: "Fee Head", recordId: "fee-1", before: { amount: 100 }, after: { amount: 200 } }));
    await withSchool(ctxOf(teacher), (tx) => writeAudit(tx, ctxOf(teacher), { action: "changed", recordType: "Homework", recordId: "hw-1", after: { title: "Read" } }));

    const all = await withSchool(ctxOf(admin), (tx) => tx.auditLogEntry.findMany({ where: auditWhere({}, "all", admin.id, tz) }));
    expect(all.some((r) => r.recordId === "hw-1") && all.some((r) => r.recordId === "fee-1")).toBe(true);

    const own = await withSchool(ctxOf(teacher), (tx) => tx.auditLogEntry.findMany({ where: auditWhere({}, "own", teacher.id, tz) }));
    expect(own.length).toBeGreaterThan(0);
    expect(own.every((r) => r.userLoginId === teacher.id)).toBe(true);

    const none = await withSchool(ctxOf(teacher), (tx) => tx.auditLogEntry.count({ where: auditWhere({}, "none", teacher.id, tz) }));
    expect(none).toBe(0);

    const byPerson = await withSchool(ctxOf(admin), (tx) => tx.auditLogEntry.findMany({ where: auditWhere({ person: teacher.id, recordType: "Homework" }, "all", admin.id, tz) }));
    expect(byPerson.map((r) => r.recordId)).toEqual(["hw-1"]);
    const future = await withSchool(ctxOf(admin), (tx) => tx.auditLogEntry.count({ where: auditWhere({ from: "2999-01-01" }, "all", admin.id, tz) }));
    expect(future).toBe(0);

    const fee = all.find((r) => r.recordId === "fee-1")!;
    expect(diff(fee.before, fee.after)[0]).toEqual({ field: "amount", before: "100", after: "200", changed: true });
  });

  it("is closed to roles without Settings, such as Teacher", async () => {
    const access = await accessIn(teacher.id, school.id);
    expect(reachFor(access!.permissions, "settings", "view")).toBe("none");
    const adminAccess = await accessIn(admin.id, school.id);
    expect(reachFor(adminAccess!.permissions, "settings", "view")).toBe("all");
  });
});

describe("deletion requests", () => {
  it("change nothing until approved, then anonymise without deleting", async () => {
    const ctx = ctxOf(admin);
    const guardian = await withSchool(ctx, (tx) => tx.guardian.create({ data: { schoolId: school.id, name: "Ramesh Kumar", relationship: "Father", phone: "9876543210", email: "ramesh@example.com", occupation: "Farmer" } }));
    await expect(withSchool(ctx, (tx) => requestDeletion(tx, ctx, { personType: "guardian", personId: guardian.id, scope: "all", reason: "x", askedBy: "Father", proofFileId: null }))).rejects.toBeInstanceOf(PrivacyProblem);

    const req = await withSchool(ctx, (tx) => requestDeletion(tx, ctx, { personType: "guardian", personId: guardian.id, scope: ["contact", "name"], reason: "Family moved abroad", askedBy: "Father, by letter", proofFileId: null }));
    expect(req.status).toBe("waiting");
    const still = await withSchool(ctx, (tx) => tx.guardian.findUniqueOrThrow({ where: { id: guardian.id } }));
    expect(still.name).toBe("Ramesh Kumar");
    await expect(withSchool(ctx, (tx) => requestDeletion(tx, ctx, { personType: "guardian", personId: guardian.id, scope: "all", reason: "Asked again", askedBy: "Father", proofFileId: null }))).rejects.toThrow(/already waiting/);

    const { approvalId } = await withSchool(ctx, (tx) => tx.deletionRequest.findUniqueOrThrow({ where: { id: req.id } }));
    // The person who asked cannot approve it.
    await expect(withSchool(ctx, (tx) => decide(tx, ctx, approvalId!, "approve", null))).rejects.toThrow(/own request/);

    const approver = await withSchool(ctxOf(principal), async (tx) => {
      const a = await tx.approval.findUniqueOrThrow({ where: { id: approvalId! } });
      return a;
    });
    expect(approver.type).toBe("data-deletion");
    await withSchool(ctxOf(secondAdmin), (tx) => decide(tx, ctxOf(secondAdmin), approvalId!, "approve", null));

    const after = await withSchool(ctx, (tx) => tx.guardian.findUniqueOrThrow({ where: { id: guardian.id } }));
    expect(after.name).toBe("Removed person");
    expect(after.email).toBeNull();
    expect(after.occupation).toBe("Farmer");
    const done = await withSchool(ctx, (tx) => tx.deletionRequest.findUniqueOrThrow({ where: { id: req.id } }));
    expect(done.status).toBe("completed");
    const log = await withSchool(ctx, (tx) => tx.auditLogEntry.findFirstOrThrow({ where: { action: "deletion-completed", recordId: req.id } }));
    expect(JSON.stringify(log.after)).not.toContain("ramesh@example.com");
  });
});

describe("consent texts", () => {
  it("each change is a new version; earlier versions stay as they were", async () => {
    const ctx = ctxOf(admin);
    const text = "I agree that the school may keep and use my child's details to run the school.";
    const v1 = await withSchool(ctx, (tx) => saveConsentText(tx, ctx, { consentType: "photo", title: "Photos", text: { en: text }, askedOnAdmission: true }, ["en", "hi"]));
    expect(v1.version).toBe(1);
    await expect(withSchool(ctx, (tx) => saveConsentText(tx, ctx, { consentType: "photo", title: "Photos", text: { en: text }, askedOnAdmission: true }, ["en", "hi"]))).rejects.toThrow(/Nothing changed/);
    const v2 = await withSchool(ctx, (tx) => saveConsentText(tx, ctx, { consentType: "photo", title: "Photos", text: { en: `${text} Updated.`, hi: "हिंदी पाठ" }, askedOnAdmission: true }, ["en", "hi"]));
    expect(v2.version).toBe(2);

    const types = await withSchool(ctx, (tx) => consentTexts(tx));
    const photo = types.find((t) => t.key === "photo")!;
    expect(photo.current?.version).toBe(2);
    expect(photo.versions.map((v) => [v.version, v.isCurrent])).toEqual([[2, true], [1, false]]);
    expect((photo.versions[1].text as Record<string, string>).en).toBe(text);

    await expect(withSchool(ctx, (tx) => saveConsentText(tx, ctx, { consentType: "photo", title: "Photos", text: { en: "Too short" }, askedOnAdmission: true }, ["en"]))).rejects.toBeInstanceOf(ConsentProblem);
    const custom = await withSchool(ctx, (tx) => saveConsentText(tx, ctx, { consentType: "new:Field trips", title: "Field trips", text: { en: "I agree that my child may go on school field trips with teachers." }, askedOnAdmission: false }, ["en"]));
    expect(custom.consentType).toBe("custom-field-trips");
  });
});

describe("retention periods", () => {
  it("cannot go below what the law needs, and every change is logged", async () => {
    const ctx = ctxOf(admin);
    await expect(withSchool(ctx, (tx) => setRetention(tx, ctx, "finance-records", 24))).rejects.toThrow(/at least 8 years/);
    expect(await withSchool(ctx, (tx) => setRetention(tx, ctx, "enquiries", 12))).toBe(true);
    expect(await withSchool(ctx, (tx) => setRetention(tx, ctx, "enquiries", 12))).toBe(false);
    const rules = await withSchool(ctx, (tx) => retentionRules(tx));
    expect(rules.find((r) => r.recordType === "enquiries")?.keepMonths).toBe(12);
    const otherRules = await withSchool({ schoolId: other.id, userId: null }, (tx) => retentionRules(tx));
    expect(otherRules.find((r) => r.recordType === "enquiries")?.keepMonths).toBe(24);
  });
});
