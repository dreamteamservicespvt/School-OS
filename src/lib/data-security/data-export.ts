// "Export all school data" (Settings, Data Backup & Security): a ZIP with one
// CSV per record type the person may see, prepared in the background, with
// the download link sent by notification. The link works for 24 hours.
import "server-only";

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { enqueue } from "../jobs";
import { notify } from "../notifications";
import { fileStore } from "../storage";
import { makeZip } from "../zip";
import type { PermissionMap } from "../permissions";
import type { ModuleKey } from "../modules";

/** How long the download link works (inferred: 24 hours). */
export const EXPORT_LINK_HOURS = 24;

/** Which module's permission lets a person see each kind of record. Anything not listed needs Settings. */
const MODULE_OF: Record<string, ModuleKey> = {
  Student: "student-management", Enrolment: "student-management", Guardian: "student-management", StudentGuardian: "student-management",
  AcademicYear: "academic-management", Term: "academic-management", SchoolClass: "academic-management", Section: "academic-management",
  Subject: "academic-management", SubjectClass: "academic-management", TeacherAllocation: "academic-management", PeriodSlot: "academic-management",
  TimetableVersion: "academic-management", TimetablePeriod: "academic-management", Substitution: "academic-management", CalendarEntry: "academic-management",
  FinancialYear: "finance-management",
  Department: "staff-hr-management", Staff: "staff-hr-management", StaffDocument: "staff-hr-management",
  LeaveType: "attendance-management", LeaveRequest: "attendance-management", LeaveBalance: "attendance-management",
  Approval: "settings", Notification: "settings",
};

/** Kinds of records never put in an export: internal work, not the school's data. */
const SKIP = new Set(["BackgroundJob", "NumberSequence"]);

/** Columns never exported: encrypted values, hashes and secrets. */
const SECRET_COLUMN = /(Enc|Hash|Secret|secrets|Last4)$/;

function moduleFor(model: string): ModuleKey {
  if (MODULE_OF[model]) return MODULE_OF[model];
  // Modules built later name their records after the module (FeeHead, LibraryBook...); others need Settings.
  if (/^(Fee|Payment|Receipt|Concession|Refund)/.test(model) && model !== "PaymentGatewayAccount") return "fee-management";
  if (/^(Expense|Income|Ledger|DayBook|Cash|Bank)/.test(model)) return "finance-management";
  if (/^(Attendance)/.test(model)) return "attendance-management";
  if (/^(Exam|Mark|Grade|Report|Result|Datesheet)/.test(model)) return "examination-results";
  if (/^(Enquiry|Application|Admission)/.test(model)) return "admission-management";
  if (/^(Salary|Payslip|Payroll)/.test(model)) return "salary-management";
  if (/^(Message|Notice|Template|ParentLink|Consent(Record))/.test(model)) return "communication";
  if (/^(Library|Book)/.test(model)) return "library-management";
  if (/^(Inventory|Stock|Asset|Purchase|Item)/.test(model)) return "inventory-management";
  if (/^(Hostel|Room|Bed|Mess)/.test(model)) return "hostel-management";
  if (/^(Visitor|GatePass|Pickup|Appointment)/.test(model)) return "front-office";
  if (/^(Homework|Study|OnlineClass)/.test(model)) return "homework-learning";
  if (/^(Event|Gallery|Album|Media|Ptm)/.test(model)) return "events-calendar";
  return "settings";
}

/** Every record type with a school_id that this person may see, with its columns. */
export function exportableModels(permissions: PermissionMap) {
  return Prisma.dmmf.datamodel.models
    .filter((m) => !SKIP.has(m.name) && m.fields.some((f) => f.name === "schoolId"))
    .filter((m) => permissions[moduleFor(m.name)]?.see === "all")
    .map((m) => ({
      model: m.name,
      fields: m.fields.filter((f) => f.kind === "scalar" || f.kind === "enum").map((f) => f.name).filter((n) => !SECRET_COLUMN.test(n) && n !== "schoolId"),
    }));
}

function csvCell(v: unknown): string {
  let s: string;
  if (v === null || v === undefined) s = "";
  else if (v instanceof Date) s = v.toISOString();
  else if (typeof v === "bigint") s = v.toString();
  else if (typeof v === "object") s = JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? x.toString() : x));
  else s = String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const fileNameFor = (model: string) => model.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

/** Asks for a full export. It is prepared in the background; the same person gets one at a time. */
export async function requestDataExport(tx: Tx, ctx: SchoolContext, permissions: PermissionMap) {
  if (!ctx.userId) throw new Error("A data export needs a person");
  const running = await tx.dataExport.findFirst({ where: { requestedById: ctx.userId, status: "preparing" }, orderBy: { createdAt: "desc" } });
  if (running) {
    const job = await tx.backgroundJob.findUnique({ where: { schoolId_idempotencyKey: { schoolId: ctx.schoolId, idempotencyKey: `data-export:${running.id}` } } });
    if (job && job.status !== "failed") return { row: running, already: true };
    await tx.dataExport.update({ where: { id: running.id }, data: { status: "failed" } });
  }
  const models = exportableModels(permissions).map((m) => m.model);
  const row = await tx.dataExport.create({ data: { schoolId: ctx.schoolId, requestedById: ctx.userId } });
  await enqueue(tx, ctx, "data-export", `data-export:${row.id}`, { exportId: row.id, models });
  await writeAudit(tx, ctx, { action: "data-export-requested", recordType: "Data Export", recordId: row.id, after: { recordTypes: models.length } });
  return { row, already: false };
}

/** The background job: reads each record type page by page and writes the ZIP. Safe to run twice. */
export async function runDataExport(tx: Tx, ctx: SchoolContext, payload: { exportId: string; models: string[] }) {
  const row = await tx.dataExport.findUnique({ where: { id: payload.exportId } });
  if (!row || row.status === "ready") return { skipped: true };
  const allowed = new Set(payload.models);
  const models = Prisma.dmmf.datamodel.models.filter((m) => allowed.has(m.name));
  const entries: { name: string; data: Buffer }[] = [];
  const counts: Record<string, number> = {};
  for (const m of models) {
    const fields = m.fields.filter((f) => f.kind === "scalar" || f.kind === "enum").map((f) => f.name).filter((n) => !SECRET_COLUMN.test(n) && n !== "schoolId");
    const delegate = (tx as unknown as Record<string, { findMany: (a: object) => Promise<Record<string, unknown>[]> }>)[m.name.charAt(0).toLowerCase() + m.name.slice(1)];
    if (!delegate) continue;
    const select = Object.fromEntries(fields.map((f) => [f, true]));
    const orderField = fields.includes("id") ? "id" : fields[0];
    const lines = [fields.map(csvCell).join(",")];
    for (let skip = 0; ; skip += 2000) {
      const rows = await delegate.findMany({ select, orderBy: { [orderField]: "asc" }, skip, take: 2000 });
      for (const r of rows) lines.push(fields.map((f) => csvCell(r[f])).join(","));
      if (rows.length < 2000) break;
    }
    counts[m.name] = lines.length - 1;
    entries.push({ name: `${fileNameFor(m.name)}.csv`, data: Buffer.from("﻿" + lines.join("\r\n") + "\r\n", "utf8") });
  }
  const school = await tx.school.findUnique({ where: { id: ctx.schoolId }, select: { name: true, code: true } });
  const readme = [
    `${school?.name ?? "School"}: full data export`,
    `Prepared ${new Date().toISOString()} by School OS.`,
    "",
    "One CSV file per kind of record. Dates are in UTC. Money is in paise (100 paise = 1 rupee).",
    "Encrypted fields (Aadhaar, PAN, bank account numbers, gateway keys) and password hashes are not included.",
    "",
    ...Object.entries(counts).map(([k, n]) => `${fileNameFor(k)}.csv: ${n} rows`),
  ].join("\r\n");
  entries.unshift({ name: "READ-ME.txt", data: Buffer.from(readme, "utf8") });
  const zip = makeZip(entries);
  const id = randomUUID();
  const key = `${ctx.schoolId}/data-export/${id}`;
  await fileStore().put(key, zip, "application/zip");
  const file = await tx.storedFile.create({
    data: { id, schoolId: ctx.schoolId, storageKey: key, fileName: `${(school?.code ?? "school").toLowerCase()}-data-${new Date().toISOString().slice(0, 10)}.zip`, contentType: "application/zip", sizeBytes: zip.length, purpose: "data-export", uploadedById: row.requestedById },
  });
  await tx.dataExport.update({ where: { id: row.id }, data: { status: "ready", fileId: file.id, readyAt: new Date() } });
  await writeAudit(tx, ctx, { action: "data-export-ready", recordType: "Data Export", recordId: row.id, after: { files: entries.length, rows: Object.values(counts).reduce((a, b) => a + b, 0), sizeBytes: zip.length } });
  if (row.requestedById) {
    // The school's own system sends it, so the person is told even though they asked.
    await notify(tx, { schoolId: ctx.schoolId, userId: null }, {
      to: row.requestedById,
      type: "data-export",
      text: `Your full data export is ready to download. The link works for ${EXPORT_LINK_HOURS} hours.`,
      link: "/settings/data-security#export",
    });
  }
  return { files: entries.length, counts };
}

export function exportExpired(readyAt: Date | null, now = new Date()) {
  return !readyAt || now.getTime() - readyAt.getTime() > EXPORT_LINK_HOURS * 3_600_000;
}
