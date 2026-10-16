// Staff documents with expiry dates, their status, and the expiry reminders
// of automation A15 (09 Documents & ID Cards).
import "server-only";

import type { StaffDocument } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { notify } from "../notifications";
import { formatDate } from "../format";
import { maskLast4 } from "../crypto";
import { hrPeople } from "./access";
import { StaffProblem } from "./staff";
import { hrSettings } from "./settings";
import { DAY_MS, isoDay } from "./dates";

export type DocStatus = "Valid" | "Expiring soon" | "Expired" | "Missing";

/** Valid, Expiring soon (within the first reminder window), Expired, or Missing (no file yet). */
export function docStatus(doc: Pick<StaffDocument, "fileId" | "expiresOn">, today: Date, soonDays = 30): DocStatus {
  if (!doc.fileId) return "Missing";
  if (!doc.expiresOn) return "Valid";
  if (doc.expiresOn < today) return "Expired";
  if (doc.expiresOn.getTime() - today.getTime() <= soonDays * DAY_MS) return "Expiring soon";
  return "Valid";
}

export const DOC_TONE: Record<DocStatus, "success" | "warning" | "danger" | "neutral"> = {
  Valid: "success",
  "Expiring soon": "warning",
  Expired: "danger",
  Missing: "neutral",
};

/** ID proof numbers are restricted: shown with only the last 4 characters. */
export function isIdProof(kind: string) {
  return /id proof|aadhaar|pan|passport|voter|driving/i.test(kind);
}

export function showDocNumber(kind: string, number: string | null, full: boolean) {
  if (!number) return null;
  return isIdProof(kind) && !full ? maskLast4(number) : number;
}

export type NewDocument = { staffId: string; kind: string; fileId: string; number: string | null; issuedOn: Date | null; expiresOn: Date | null };

export async function addDocument(tx: Tx, ctx: SchoolContext, input: NewDocument, replaceId?: string | null) {
  const staff = await tx.staff.findFirst({ where: { id: input.staffId, archivedAt: null } });
  if (!staff) throw new StaffProblem("This staff member was not found.");
  if (input.issuedOn && input.expiresOn && input.expiresOn < input.issuedOn) throw new StaffProblem("Expiry date is before the issue date. Check the dates.", "expiresOn");
  let doc: StaffDocument;
  if (replaceId) {
    // A missing document gets its file, or an expired one is renewed: the old file stays in the history.
    const old = await tx.staffDocument.findFirstOrThrow({ where: { id: replaceId, staffId: staff.id, archivedAt: null } });
    doc = await tx.staffDocument.update({
      where: { id: old.id },
      data: { fileId: input.fileId, number: input.number ?? old.number, issuedOn: input.issuedOn, expiresOn: input.expiresOn, remindersSent: [], verified: false },
    });
    await writeAudit(tx, ctx, {
      action: "document-renewed", recordType: "Staff Document", recordId: doc.id,
      before: { fileId: old.fileId, expiresOn: old.expiresOn ? isoDay(old.expiresOn) : null },
      after: { fileId: input.fileId, expiresOn: input.expiresOn ? isoDay(input.expiresOn) : null },
    });
  } else {
    doc = await tx.staffDocument.create({
      data: { schoolId: ctx.schoolId, staffId: staff.id, kind: input.kind, fileId: input.fileId, number: input.number, issuedOn: input.issuedOn, expiresOn: input.expiresOn, createdById: ctx.userId },
    });
    await writeAudit(tx, ctx, {
      action: "created", recordType: "Staff Document", recordId: doc.id,
      after: { staff: staff.fullName, kind: input.kind, number: input.number ? showDocNumber(input.kind, input.number, false) : null, expiresOn: input.expiresOn ? isoDay(input.expiresOn) : null },
    });
  }
  return doc;
}

/** Takes a document off a staff member's record (added by mistake, or no longer needed). The file is kept. */
export async function removeDocument(tx: Tx, ctx: SchoolContext, id: string) {
  const doc = await tx.staffDocument.findFirst({ where: { id, archivedAt: null } });
  if (!doc) throw new StaffProblem("This document was not found. It may already be removed.");
  await tx.staffDocument.update({ where: { id: doc.id }, data: { archivedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "archived", recordType: "Staff Document", recordId: doc.id, before: { kind: doc.kind, fileId: doc.fileId } });
  return doc;
}

/**
 * A15 for staff documents: a reminder to HR and the staff member when a
 * document is within each reminder window (default 30 and 7 days). Each
 * window sends once per expiry date, so running it twice sends nothing new.
 */
export async function sendExpiryReminders(tx: Tx, ctx: SchoolContext, today: Date) {
  const settings = await hrSettings(tx, ctx);
  const windows = [...new Set(settings.reminderDays.filter((d) => d >= 0))].sort((a, b) => b - a);
  if (windows.length === 0) return 0;
  const docs = await tx.staffDocument.findMany({
    where: { schoolId: ctx.schoolId, archivedAt: null, expiresOn: { gte: today, lte: new Date(today.getTime() + windows[0] * DAY_MS) }, staff: { archivedAt: null, status: { notIn: ["RESIGNED", "RETIRED", "TERMINATED"] } } },
    include: { staff: { select: { fullName: true, userLoginId: true } } },
  });
  const hr = await hrPeople(tx, ctx);
  let sent = 0;
  for (const doc of docs) {
    const left = Math.round((doc.expiresOn!.getTime() - today.getTime()) / DAY_MS);
    const due = windows.filter((w) => left <= w).map((w) => `${isoDay(doc.expiresOn!)}:${w}`);
    const fresh = due.filter((k) => !doc.remindersSent.includes(k));
    if (fresh.length === 0) continue;
    const when = left === 0 ? "today" : `in ${left} day${left === 1 ? "" : "s"}`;
    const text = `${doc.kind} of ${doc.staff.fullName} expires on ${formatDate(doc.expiresOn!)} (${when}). Upload the renewed document.`;
    for (const to of new Set([...hr, ...(doc.staff.userLoginId ? [doc.staff.userLoginId] : [])])) {
      await notify(tx, ctx, {
        to, type: "document-expiry",
        text: to === doc.staff.userLoginId ? `Your ${doc.kind} expires on ${formatDate(doc.expiresOn!)} (${when}). Please give HR the renewed document.` : text,
        link: to === doc.staff.userLoginId ? `/staff-hr-management/${doc.staffId}?tab=documents` : "/staff-hr-management/documents?status=expiring",
        groupKey: "document-expiry", mergedText: (n) => `${n} staff documents are about to expire`,
      });
    }
    await tx.staffDocument.update({ where: { id: doc.id }, data: { remindersSent: [...doc.remindersSent, ...fresh] } });
    sent++;
  }
  if (sent) await writeAudit(tx, { ...ctx, userId: null }, { action: "expiry-reminders-sent", recordType: "Staff Document", recordId: null, after: { documents: sent } });
  return sent;
}
