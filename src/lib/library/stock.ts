// Stock check (13 Fines & Stock Check): start a session, scan every copy on
// the shelves (phone camera or scanner), and close. The result lists missing
// and unexpected copies; missing copies are marked lost only after review.
import "server-only";

import type { BookCopyStatus } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { LibraryProblem } from "./problem";

/** Copies that should be on the shelves (issued ones are out with members). */
export const ON_SHELF: BookCopyStatus[] = ["AVAILABLE", "RESERVED", "DAMAGED"];

export async function openSession(tx: Tx) {
  return tx.stockCheckSession.findFirst({ where: { status: "OPEN" }, orderBy: { startedAt: "desc" } });
}

export async function startSession(tx: Tx, ctx: SchoolContext, name: string) {
  const n = name.trim().replace(/\s+/g, " ");
  if (n.length < 3) throw new LibraryProblem("Give the stock check a name, such as “October 2026”.", "name");
  if (n.length > 80) throw new LibraryProblem("The name can be at most 80 characters.", "name");
  const open = await openSession(tx);
  if (open) throw new LibraryProblem(`The stock check “${open.name}” is still open. Continue it, or close it first.`);
  const s = await tx.stockCheckSession.create({ data: { schoolId: ctx.schoolId, name: n, startedById: ctx.userId } });
  await writeAudit(tx, ctx, { action: "started", recordType: "Stock Check Session", recordId: s.id, after: { name: n } });
  return s;
}

export type ScanResult = { kind: "found" | "extra" | "unknown" | "again"; code: string; title: string | null; accessionNo: string | null; status: BookCopyStatus | null };

/** Records one scanned code in an open session. */
export async function scanCode(tx: Tx, ctx: SchoolContext, sessionId: string, raw: string): Promise<ScanResult> {
  const code = raw.trim();
  if (!code) throw new LibraryProblem("Scan a barcode or type an accession number.", "code");
  if (code.length > 40) throw new LibraryProblem("That code is too long to be an accession number.", "code");
  const session = await tx.stockCheckSession.findFirst({ where: { id: sessionId } });
  if (!session) throw new LibraryProblem("This stock check was not found.");
  if (session.status !== "OPEN") throw new LibraryProblem("This stock check is closed. Start a new one to scan again.");
  const copy = await tx.bookCopy.findFirst({ where: { OR: [{ accessionNo: { equals: code, mode: "insensitive" } }, { barcode: { equals: code, mode: "insensitive" } }] }, include: { book: { select: { title: true } } } });
  const key = copy ? copy.accessionNo : code.toUpperCase();
  const again = await tx.stockCheckScan.findFirst({ where: { sessionId, code: key } });
  if (again) return { kind: "again", code: key, title: copy?.book.title ?? null, accessionNo: copy?.accessionNo ?? null, status: copy?.status ?? null };
  await tx.stockCheckScan.create({ data: { schoolId: ctx.schoolId, sessionId, code: key, copyId: copy?.id ?? null, scannedById: ctx.userId } });
  if (!copy) return { kind: "unknown", code: key, title: null, accessionNo: null, status: null };
  return { kind: ON_SHELF.includes(copy.status) ? "found" : "extra", code: key, title: copy.book.title, accessionNo: copy.accessionNo, status: copy.status };
}

/** Where a session stands: copies expected on the shelves, found, still not scanned, and extra. */
export async function sessionProgress(tx: Tx, sessionId: string) {
  const [expected, scans] = await Promise.all([
    tx.bookCopy.count({ where: { status: { in: ON_SHELF } } }),
    tx.stockCheckScan.findMany({ where: { sessionId }, select: { copyId: true, code: true } }),
  ]);
  const scannedIds = scans.map((s) => s.copyId).filter((x): x is string => Boolean(x));
  const found = scannedIds.length ? await tx.bookCopy.count({ where: { id: { in: scannedIds }, status: { in: ON_SHELF } } }) : 0;
  return { expected, found, notScanned: Math.max(0, expected - found), extra: scans.length - found, scanned: scans.length };
}

/** Closes a session: copies not scanned are listed as missing, codes not expected as extra. */
export async function closeSession(tx: Tx, ctx: SchoolContext, sessionId: string) {
  const session = await tx.stockCheckSession.findFirst({ where: { id: sessionId } });
  if (!session) throw new LibraryProblem("This stock check was not found.");
  if (session.status !== "OPEN") throw new LibraryProblem("This stock check is already closed.");
  const scans = await tx.stockCheckScan.findMany({ where: { sessionId }, select: { copyId: true } });
  const scanned = new Set(scans.map((s) => s.copyId).filter((x): x is string => Boolean(x)));
  const shelf = await tx.bookCopy.findMany({ where: { status: { in: ON_SHELF } }, select: { id: true } });
  const missing = shelf.filter((c) => !scanned.has(c.id)).map((c) => c.id);
  const found = shelf.length - missing.length;
  const extra = scans.length - found;
  const closed = await tx.stockCheckSession.update({ where: { id: sessionId }, data: { status: "CLOSED", closedAt: new Date(), closedById: ctx.userId, expected: shelf.length, found, missing: missing.length, extra, missingIds: missing } });
  await writeAudit(tx, ctx, { action: "closed", recordType: "Stock Check Session", recordId: sessionId, after: { name: session.name, expected: shelf.length, found, missing: missing.length, extra } });
  return closed;
}

/** After review: the copies still missing since a closed check are marked lost (no member is charged). */
export async function markMissingLost(tx: Tx, ctx: SchoolContext, sessionId: string) {
  const session = await tx.stockCheckSession.findFirst({ where: { id: sessionId } });
  if (!session || session.status !== "CLOSED") throw new LibraryProblem("Close the stock check first, then review what is missing.");
  if (session.lostMarkedAt) throw new LibraryProblem("The missing copies of this check are already marked lost.");
  const copies = await tx.bookCopy.findMany({ where: { id: { in: session.missingIds }, status: { in: ON_SHELF } }, select: { id: true, status: true, accessionNo: true } });
  if (!copies.length) throw new LibraryProblem("Every copy missing in this check has been found or changed since. Nothing to mark.");
  for (const c of copies) {
    if (c.status === "RESERVED") {
      // The member waiting for it goes back to the front of the queue.
      await tx.reservation.updateMany({ where: { copyId: c.id, status: "READY" }, data: { status: "WAITING", copyId: null, readyAt: null } });
    }
    await tx.bookCopy.update({ where: { id: c.id }, data: { status: "LOST", statusNote: `Missing in stock check “${session.name}”`, statusAt: new Date() } });
  }
  await tx.stockCheckSession.update({ where: { id: sessionId }, data: { lostMarkedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "marked-missing-lost", recordType: "Stock Check Session", recordId: sessionId, after: { name: session.name, copies: copies.map((c) => c.accessionNo).join(", ") } });
  return copies.length;
}

/** The missing copies of a closed check that are still not found (for review). */
export async function stillMissing(tx: Tx, sessionId: string, take = 200) {
  const session = await tx.stockCheckSession.findFirst({ where: { id: sessionId } });
  if (!session) return [];
  return tx.bookCopy.findMany({ where: { id: { in: session.missingIds }, status: { in: ON_SHELF } }, include: { book: { select: { id: true, title: true, authorText: true, shelf: true, categoryId: true } } }, orderBy: { accessionNo: "asc" }, take });
}
