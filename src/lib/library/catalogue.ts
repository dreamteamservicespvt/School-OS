// Books (13 §2): the catalogue of books with authors, publishers, ISBN,
// category and subject, and each copy with its accession number, barcode and
// status. Accession numbers are given in sequence (Library Settings) or
// typed, and are unique in the school. Copies are withdrawn with a reason,
// never deleted, so a book's history stays.
import "server-only";

import type { BookCopyStatus, Prisma } from "@prisma/client";
import type { SchoolContext, Tx } from "../db";
import { writeAudit } from "../audit";
import { formatRupees } from "../format";
import { nextNumber } from "../sequences";
import { cleanIsbn, isbnValid, ISBN_INVALID } from "./isbn";
import { LibraryProblem } from "./problem";
import { ACCESSION_KEY, formatAccession, librarySettings, nextAccessionPreview, type LibrarySettings } from "./settings";
import { BASE } from "./words";

export const MAX_COPIES = 200;

export type BookInput = {
  title: string;
  authors: string[];
  publisher: string | null;
  isbn: string | null;
  categoryId: string | null;
  subject: string | null;
  language: string | null;
  edition: string | null;
  pricePaise: bigint | null;
  shelf: string | null;
};

/** Finds or adds authors by name (pick or add), keeping the order typed. */
async function authorIds(tx: Tx, ctx: SchoolContext, names: string[]) {
  const ids: string[] = [];
  for (const raw of names) {
    const name = raw.trim().replace(/\s+/g, " ");
    if (!name) continue;
    const found = await tx.author.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
    const a = found ?? (await tx.author.create({ data: { schoolId: ctx.schoolId, name } }));
    if (found?.archivedAt) await tx.author.update({ where: { id: found.id }, data: { archivedAt: null } });
    if (!ids.includes(a.id)) ids.push(a.id);
  }
  return ids;
}

async function publisherId(tx: Tx, ctx: SchoolContext, raw: string | null) {
  const name = (raw ?? "").trim().replace(/\s+/g, " ");
  if (!name) return null;
  const found = await tx.publisher.findFirst({ where: { name: { equals: name, mode: "insensitive" } } });
  if (found) {
    if (found.archivedAt) await tx.publisher.update({ where: { id: found.id }, data: { archivedAt: null } });
    return found.id;
  }
  return (await tx.publisher.create({ data: { schoolId: ctx.schoolId, name } })).id;
}

/** Checks the fields of a book; returns the cleaned ISBN. */
async function checkBook(tx: Tx, input: BookInput, bookId: string | null) {
  if (input.title.trim().length < 1) throw new LibraryProblem("Title is needed.", "title");
  if (input.title.length > 300) throw new LibraryProblem("Title can be at most 300 characters.", "title");
  if (!input.authors.some((a) => a.trim())) throw new LibraryProblem("Add at least one author.", "authors");
  let isbn: string | null = null;
  if (input.isbn && input.isbn.trim()) {
    if (!isbnValid(input.isbn)) throw new LibraryProblem(ISBN_INVALID, "isbn");
    isbn = cleanIsbn(input.isbn);
    const dup = await tx.book.findFirst({ where: { isbn, archivedAt: null, ...(bookId ? { id: { not: bookId } } : {}) }, select: { id: true, title: true } });
    if (dup) throw new LibraryProblem(`This ISBN is already in the library: “${dup.title}”. Add copies to that book instead.`, "isbn", { href: `${BASE}/books/${dup.id}`, label: `Open “${dup.title}”` });
  }
  if (input.categoryId) {
    const c = await tx.libraryCategory.findFirst({ where: { id: input.categoryId, archivedAt: null } });
    if (!c) throw new LibraryProblem("Choose a category from the list.", "categoryId");
  }
  if (input.pricePaise !== null && input.pricePaise < BigInt(0)) throw new LibraryProblem("Price cannot be below ₹0.", "price");
  return isbn;
}

/**
 * Accession numbers for new copies: the typed ones (each checked to be new),
 * or the next ones in sequence, skipping any already used.
 */
export async function takeAccessions(tx: Tx, ctx: SchoolContext, s: LibrarySettings, count: number, typed: string[] = []) {
  if (typed.length) {
    if (typed.length !== count) throw new LibraryProblem(`Type ${count} accession number${count === 1 ? "" : "s"}, one for each copy, or leave the box empty to number them in sequence.`, "accessions");
    const seen = new Set<string>();
    for (const a of typed) {
      if (!/^[A-Za-z0-9/-]{1,20}$/.test(a)) throw new LibraryProblem(`“${a}” is not an accession number. Use letters, digits, - or /.`, "accessions");
      if (seen.has(a.toUpperCase())) throw new LibraryProblem(`Accession ${a} is typed twice.`, "accessions");
      seen.add(a.toUpperCase());
    }
    await assertAccessionsFree(tx, ctx, s, typed);
    return typed;
  }
  const out: string[] = [];
  let guard = 0;
  while (out.length < count) {
    if (++guard > count + 5000) throw new LibraryProblem("No free accession numbers were found. Change the next number in Library Settings.");
    const n = await nextNumber(tx, ctx, ACCESSION_KEY);
    const a = formatAccession(s, n);
    const used = await tx.bookCopy.findFirst({ where: { OR: [{ accessionNo: { equals: a, mode: "insensitive" } }, { barcode: { equals: a, mode: "insensitive" } }] }, select: { id: true } });
    if (!used) out.push(a);
  }
  return out;
}

/**
 * Refuses accession numbers already in the school (any copy, also withdrawn ones: numbers are never reused),
 * except those freed when the import that added them was undone (releasedAt).
 */
export async function assertAccessionsFree(tx: Tx, ctx: SchoolContext, s: LibrarySettings, list: string[]) {
  for (const a of list) {
    const used = await tx.bookCopy.findFirst({ where: { releasedAt: null, OR: [{ accessionNo: { equals: a, mode: "insensitive" } }, { barcode: { equals: a, mode: "insensitive" } }] }, select: { id: true } });
    if (used) {
      const next = await nextAccessionPreview(tx, ctx, s);
      throw new LibraryProblem(`Accession ${a} already exists. The next free number in sequence is ${next}; leave the box empty to use it.`, "accessions");
    }
  }
}

/** Splits typed accession numbers ("1045, 1046" or one per line). */
export const splitAccessions = (raw: string | null | undefined) => (raw ?? "").split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean);

async function makeCopies(tx: Tx, ctx: SchoolContext, bookId: string, accessions: string[], acquiredOn: Date | null) {
  await tx.bookCopy.createMany({ data: accessions.map((a) => ({ schoolId: ctx.schoolId, bookId, accessionNo: a, barcode: a, acquiredOn, createdById: ctx.userId })) });
  return tx.bookCopy.findMany({ where: { bookId, accessionNo: { in: accessions } }, orderBy: { accessionNo: "asc" } });
}

/** Add a book with its copies (13 Add book). */
export async function addBook(tx: Tx, ctx: SchoolContext, input: BookInput & { copies: number; accessions?: string[]; acquiredOn?: Date | null }) {
  const s = await librarySettings(tx, ctx);
  const isbn = await checkBook(tx, input, null);
  if (!Number.isInteger(input.copies) || input.copies < 1 || input.copies > MAX_COPIES) throw new LibraryProblem(`Number of copies must be from 1 to ${MAX_COPIES}.`, "copies");
  const accessions = await takeAccessions(tx, ctx, s, input.copies, input.accessions ?? []);
  const book = await tx.book.create({
    data: {
      schoolId: ctx.schoolId, title: input.title.trim(), authorIds: await authorIds(tx, ctx, input.authors), authorText: input.authors.map((a) => a.trim()).filter(Boolean).join(", "),
      publisherId: await publisherId(tx, ctx, input.publisher), isbn, categoryId: input.categoryId, subject: input.subject?.trim() || null, language: input.language?.trim() || null,
      edition: input.edition?.trim() || null, pricePaise: input.pricePaise, shelf: input.shelf?.trim() || null, createdById: ctx.userId, updatedById: ctx.userId,
    },
  });
  const copies = await makeCopies(tx, ctx, book.id, accessions, input.acquiredOn ?? null);
  await writeAudit(tx, ctx, { action: "created", recordType: "Book", recordId: book.id, after: { title: book.title, authors: book.authorText, isbn, copies: accessions.join(", "), price: input.pricePaise !== null ? formatRupees(input.pricePaise) : null } });
  return { book, copies };
}

export async function updateBook(tx: Tx, ctx: SchoolContext, id: string, input: BookInput) {
  const before = await tx.book.findFirst({ where: { id, archivedAt: null } });
  if (!before) throw new LibraryProblem("This book was not found.");
  const isbn = await checkBook(tx, input, id);
  const book = await tx.book.update({
    where: { id },
    data: {
      title: input.title.trim(), authorIds: await authorIds(tx, ctx, input.authors), authorText: input.authors.map((a) => a.trim()).filter(Boolean).join(", "),
      publisherId: await publisherId(tx, ctx, input.publisher), isbn, categoryId: input.categoryId, subject: input.subject?.trim() || null, language: input.language?.trim() || null,
      edition: input.edition?.trim() || null, pricePaise: input.pricePaise, shelf: input.shelf?.trim() || null, updatedById: ctx.userId,
    },
  });
  await writeAudit(tx, ctx, {
    action: "updated", recordType: "Book", recordId: id,
    before: { title: before.title, authors: before.authorText, isbn: before.isbn, price: before.pricePaise !== null ? formatRupees(before.pricePaise) : null, shelf: before.shelf, categoryId: before.categoryId },
    after: { title: book.title, authors: book.authorText, isbn: book.isbn, price: book.pricePaise !== null ? formatRupees(book.pricePaise) : null, shelf: book.shelf, categoryId: book.categoryId },
  });
  return book;
}

export async function addCopies(tx: Tx, ctx: SchoolContext, bookId: string, count: number, typed: string[] = [], acquiredOn: Date | null = null) {
  const book = await tx.book.findFirst({ where: { id: bookId, archivedAt: null } });
  if (!book) throw new LibraryProblem("This book was not found.");
  if (!Number.isInteger(count) || count < 1 || count > MAX_COPIES) throw new LibraryProblem(`Number of copies must be from 1 to ${MAX_COPIES}.`, "copies");
  const s = await librarySettings(tx, ctx);
  const accessions = await takeAccessions(tx, ctx, s, count, typed);
  const copies = await makeCopies(tx, ctx, bookId, accessions, acquiredOn);
  await writeAudit(tx, ctx, { action: "added-copies", recordType: "Book", recordId: bookId, after: { title: book.title, copies: accessions.join(", ") } });
  // A copy for a book with members waiting goes to the first of them.
  const { holdForQueue } = await import("./desk");
  for (const c of copies) await holdForQueue(tx, ctx, c.id);
  return copies;
}

/** Withdraw a copy (old or damaged) with a reason; it stays in history. */
export async function withdrawCopy(tx: Tx, ctx: SchoolContext, copyId: string, reason: string) {
  if (reason.trim().length < 5) throw new LibraryProblem("Give a reason of at least 5 characters.", "reason");
  const c = await tx.bookCopy.findFirst({ where: { id: copyId }, include: { book: { select: { title: true } } } });
  if (!c) throw new LibraryProblem("This copy was not found.");
  if (c.status === "WITHDRAWN") throw new LibraryProblem(`Copy ${c.accessionNo} is already withdrawn.`);
  if (c.status === "ISSUED") throw new LibraryProblem(`Copy ${c.accessionNo} is issued. Return it first, then withdraw it.`);
  if (c.status === "RESERVED") throw new LibraryProblem(`Copy ${c.accessionNo} is kept for a member's reservation. Issue it, or cancel the reservation first.`);
  await tx.bookCopy.update({ where: { id: c.id }, data: { status: "WITHDRAWN", statusNote: reason.trim(), statusAt: new Date() } });
  await writeAudit(tx, ctx, { action: "withdrawn", recordType: "Book Copy", recordId: c.id, before: { status: c.status }, after: { status: "WITHDRAWN", accession: c.accessionNo, book: c.book.title, reason: reason.trim() } });
}

/** A lost copy found, or a damaged one repaired: back on the shelf. */
export async function backOnShelf(tx: Tx, ctx: SchoolContext, copyId: string, reason: string) {
  if (reason.trim().length < 5) throw new LibraryProblem("Give a reason of at least 5 characters.", "reason");
  const c = await tx.bookCopy.findFirst({ where: { id: copyId }, include: { book: { select: { title: true } } } });
  if (!c) throw new LibraryProblem("This copy was not found.");
  if (!["LOST", "DAMAGED", "WITHDRAWN"].includes(c.status)) throw new LibraryProblem(`Copy ${c.accessionNo} is not lost, damaged or withdrawn.`);
  await tx.bookCopy.update({ where: { id: c.id }, data: { status: "AVAILABLE", statusNote: reason.trim(), statusAt: new Date() } });
  await writeAudit(tx, ctx, { action: "back-on-shelf", recordType: "Book Copy", recordId: c.id, before: { status: c.status }, after: { status: "AVAILABLE", accession: c.accessionNo, book: c.book.title, reason: reason.trim() } });
  const { holdForQueue } = await import("./desk");
  await holdForQueue(tx, ctx, c.id);
}

/** Labels printed: remembered on each copy. */
export async function markLabelsPrinted(tx: Tx, ctx: SchoolContext, copyIds: string[]) {
  if (!copyIds.length) return;
  await tx.bookCopy.updateMany({ where: { id: { in: copyIds } }, data: { labelPrintedAt: new Date() } });
  await writeAudit(tx, ctx, { action: "printed-labels", recordType: "Book Copy", recordId: copyIds[0], after: { copies: copyIds.length } });
}

/* ---------- Reading the catalogue ---------- */

export type CatalogueFilter = { q?: string; categoryId?: string | null; subject?: string | null; author?: string | null; availableOnly?: boolean };

export function catalogueWhere(f: CatalogueFilter): Prisma.BookWhereInput {
  const and: Prisma.BookWhereInput[] = [{ archivedAt: null }];
  const q = (f.q ?? "").trim();
  if (q) {
    const digits = cleanIsbn(q);
    and.push({ OR: [
      { title: { contains: q, mode: "insensitive" } },
      { authorText: { contains: q, mode: "insensitive" } },
      ...(/^\d{9,13}X?$/.test(digits) ? [{ isbn: { contains: digits } }] : []),
      { copies: { some: { releasedAt: null, OR: [{ accessionNo: { equals: q, mode: "insensitive" } }, { barcode: { equals: q, mode: "insensitive" } }] } } },
    ] });
  }
  if (f.categoryId === "none") and.push({ categoryId: null });
  else if (f.categoryId) and.push({ categoryId: f.categoryId });
  if (f.subject) and.push({ subject: { equals: f.subject, mode: "insensitive" } });
  if (f.author) and.push({ authorText: { contains: f.author, mode: "insensitive" } });
  if (f.availableOnly) and.push({ copies: { some: { status: "AVAILABLE" } } });
  return { AND: and };
}

export type CopyCounts = { total: number; available: number; issued: number; reserved: number; lost: number; damaged: number; withdrawn: number };

/** Copies of each book by status (withdrawn copies are not counted in the total). */
export async function copyCounts(tx: Tx, bookIds: string[]) {
  const rows = bookIds.length ? await tx.bookCopy.groupBy({ by: ["bookId", "status"], where: { bookId: { in: bookIds } }, _count: { _all: true } }) : [];
  const out = new Map<string, CopyCounts>();
  for (const id of bookIds) out.set(id, { total: 0, available: 0, issued: 0, reserved: 0, lost: 0, damaged: 0, withdrawn: 0 });
  const key: Record<BookCopyStatus, keyof CopyCounts> = { AVAILABLE: "available", ISSUED: "issued", RESERVED: "reserved", LOST: "lost", DAMAGED: "damaged", WITHDRAWN: "withdrawn" };
  for (const r of rows) {
    const c = out.get(r.bookId)!;
    c[key[r.status]] += r._count._all;
    if (r.status !== "WITHDRAWN") c.total += r._count._all;
  }
  return out;
}

/** The shelf of a book: its own, else its category's (inferred). */
export const shelfOf = (b: { shelf: string | null }, cat: { shelf: string | null } | null | undefined) => b.shelf || cat?.shelf || null;

/** A copy by its scanned barcode or typed accession number. */
export async function copyByCode(tx: Tx, raw: string) {
  const code = raw.trim();
  if (!code) return null;
  return tx.bookCopy.findFirst({ where: { releasedAt: null, OR: [{ accessionNo: { equals: code, mode: "insensitive" } }, { barcode: { equals: code, mode: "insensitive" } }] }, include: { book: true } });
}
