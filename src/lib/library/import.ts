// Importing the catalogue from a spreadsheet (13 Books, P10): one row per
// book with its number of copies. Each book is added as if typed on Add book:
// the ISBN is checked, authors and publishers are picked or added, and
// accession numbers are given in sequence unless the row types them. Undo
// archives the books and withdraws their copies (never deletes). Imported by
// src/lib/import-registry.ts.
import "server-only";

import { defineImport, RowProblem } from "../importer";
import { addBook, splitAccessions, MAX_COPIES } from "./catalogue";
import { cleanIsbn, isbnValid, ISBN_INVALID } from "./isbn";
import { LibraryProblem } from "./problem";
import { saveCategory, librarySettings } from "./settings";
import { rupeesToPaise } from "./words";

type Row = { title: string; authors: string[]; publisher: string | null; isbn: string | null; category: string | null; subject: string | null; language: string | null; copies: number; accessions: string[]; pricePaise: bigint | null; shelf: string | null };

export const CATALOGUE_IMPORT = "library-catalogue";

defineImport<Row>({
  key: CATALOGUE_IMPORT,
  label: "Library catalogue (books and copies)",
  columns: [
    { key: "title", label: "Title", required: true, example: "Wings of Fire", aliases: ["book", "book title", "name"] },
    { key: "authors", label: "Author(s)", required: true, example: "A. P. J. Abdul Kalam", help: "Several authors: separate them with ; (semicolon).", aliases: ["author", "authors", "writer"] },
    { key: "publisher", label: "Publisher", example: "Universities Press", aliases: ["publication"] },
    { key: "isbn", label: "ISBN", example: "978-81-7371-146-6", help: "10 or 13 digits. Hyphens and spaces are fine." },
    { key: "category", label: "Category", example: "Biography", help: "A new category is added if the school has none by this name." },
    { key: "subject", label: "Subject", example: "Science" },
    { key: "language", label: "Language", example: "English" },
    { key: "copies", label: "Copies", example: "2", help: "Empty means 1.", aliases: ["number of copies", "qty", "quantity"] },
    { key: "accessions", label: "Accession numbers", example: "", help: "Leave empty to number copies in sequence. Or type one number per copy, separated by commas.", aliases: ["accession", "accession no", "accession number"] },
    { key: "price", label: "Price (₹)", example: "275", help: "Used for lost-book charges.", aliases: ["price", "cost", "mrp"] },
    { key: "shelf", label: "Shelf", example: "B-2", aliases: ["shelf location", "location", "rack"] },
  ],
  check: async (tx, _ctx, row, seen) => {
    const problems: string[] = [];
    const title = (row.title ?? "").trim().replace(/\s+/g, " ");
    if (!title) problems.push("Title is needed.");
    if (title.length > 300) problems.push("Title can be at most 300 characters.");
    const authors = (row.authors ?? "").split(/;|\|/).map((a) => a.trim()).filter(Boolean);
    if (!authors.length) problems.push("Author is needed.");
    let isbn: string | null = null;
    if ((row.isbn ?? "").trim()) {
      if (!isbnValid(row.isbn)) problems.push(ISBN_INVALID);
      else {
        isbn = cleanIsbn(row.isbn);
        if (seen.has(`isbn:${isbn}`)) problems.push("This ISBN is twice in the file. Put the copies on one row.");
        seen.add(`isbn:${isbn}`);
        const dup = await tx.book.findFirst({ where: { isbn, archivedAt: null }, select: { title: true } });
        if (dup) problems.push(`This ISBN is already in the library: “${dup.title}”. Add copies on that book's page.`);
      }
    }
    const copiesRaw = (row.copies ?? "").trim();
    const copies = copiesRaw ? Number(copiesRaw) : 1;
    if (!Number.isInteger(copies) || copies < 1 || copies > MAX_COPIES) problems.push(`Copies must be a whole number from 1 to ${MAX_COPIES}.`);
    const accessions = splitAccessions(row.accessions);
    if (accessions.length && accessions.length !== copies) problems.push(`${accessions.length} accession number${accessions.length === 1 ? "" : "s"} for ${copies} cop${copies === 1 ? "y" : "ies"}. Type one per copy, or leave the box empty.`);
    for (const a of accessions) {
      if (!/^[A-Za-z0-9/-]{1,20}$/.test(a)) problems.push(`“${a}” is not an accession number.`);
      else if (seen.has(`acc:${a.toUpperCase()}`)) problems.push(`Accession ${a} is twice in the file.`);
      else {
        seen.add(`acc:${a.toUpperCase()}`);
        const used = await tx.bookCopy.findFirst({ where: { releasedAt: null, OR: [{ accessionNo: { equals: a, mode: "insensitive" } }, { barcode: { equals: a, mode: "insensitive" } }] }, select: { id: true } });
        if (used) problems.push(`Accession ${a} already exists.`);
      }
    }
    const priceRaw = (row.price ?? "").trim();
    const pricePaise = priceRaw ? rupeesToPaise(priceRaw) : null;
    if (priceRaw && pricePaise === null) problems.push("Price must be a number of rupees, like 275.");
    if (problems.length) return { ok: false, problems };
    return {
      ok: true,
      value: {
        title, authors, publisher: row.publisher?.trim() || null, isbn, category: row.category?.trim() || null, subject: row.subject?.trim() || null,
        language: row.language?.trim() || null, copies, accessions, pricePaise, shelf: row.shelf?.trim() || null,
      },
    };
  },
  save: async (tx, ctx, v) => {
    await librarySettings(tx, ctx);
    let categoryId: string | null = null;
    if (v.category) {
      const found = await tx.libraryCategory.findFirst({ where: { name: { equals: v.category, mode: "insensitive" }, archivedAt: null } });
      categoryId = found?.id ?? (await saveCategory(tx, ctx, { id: null, name: v.category, shelf: null, loanDays: null, forLoan: true })).id;
    }
    try {
      const { book } = await addBook(tx, ctx, { title: v.title, authors: v.authors, publisher: v.publisher, isbn: v.isbn, categoryId, subject: v.subject, language: v.language, edition: null, pricePaise: v.pricePaise, shelf: v.shelf, copies: v.copies, accessions: v.accessions });
      return { id: book.id, created: true };
    } catch (err) {
      if (err instanceof LibraryProblem) throw new RowProblem(`${v.title}: ${err.message}`);
      throw err;
    }
  },
  undo: async (tx, ctx, ids) => {
    const issued = await tx.bookCopy.count({ where: { bookId: { in: ids }, status: { in: ["ISSUED", "RESERVED"] } } });
    if (issued) throw new Error(`${issued} cop${issued === 1 ? "y of these books is" : "ies of these books are"} out with members. Return them first, then undo the import.`);
    const now = new Date();
    await tx.bookCopy.updateMany({ where: { bookId: { in: ids }, status: { not: "WITHDRAWN" } }, data: { status: "WITHDRAWN", statusNote: "Import undone", statusAt: now } });
    // Accession numbers of copies never issued are free again, so the corrected file can bring them in.
    await tx.bookCopy.updateMany({ where: { bookId: { in: ids }, releasedAt: null, issues: { none: {} } }, data: { releasedAt: now } });
    await tx.book.updateMany({ where: { id: { in: ids } }, data: { archivedAt: new Date(), updatedById: ctx.userId } });
  },
});
