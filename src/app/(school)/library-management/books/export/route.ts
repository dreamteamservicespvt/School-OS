// The catalogue for the search, filters and dates on screen: one row per book
// with its copies by status and their accession numbers.
import { withSchool } from "@/lib/db";
import { buildExport, exportResponse, logExport, type ExportColumn } from "@/lib/exports";
import { formatRupees } from "@/lib/format";
import { showIsbn } from "@/lib/library/isbn";
import { shelfOf } from "@/lib/library/catalogue";
import { libRoute, rangeWords } from "../../_lib/route";
import { booksWhere, readBooksFilter } from "../../_lib/books";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const x = await libRoute(req, "books");
  if (x instanceof Response) return x;
  const range = await x.range(null);
  const f = readBooksFilter(x.get, range);
  const title = "Library catalogue";
  const r = await withSchool(x.current.ctx, async (tx) => {
    const cats = await tx.libraryCategory.findMany({ select: { id: true, name: true, shelf: true } });
    const books = await tx.book.findMany({ where: booksWhere(f, x.tz), orderBy: [{ title: "asc" }, { id: "asc" }], take: 20000, include: { copies: { select: { accessionNo: true, status: true }, orderBy: { accessionNo: "asc" } } } });
    const pubs = await tx.publisher.findMany({ where: { id: { in: books.map((b) => b.publisherId).filter((v): v is string => Boolean(v)) } }, select: { id: true, name: true } });
    const catName = cats.find((c) => c.id === f.cat)?.name;
    const filters = [range ? `Added: ${rangeWords(range)}` : "", catName ? `Category: ${catName}` : f.cat === "none" ? "No category" : "", f.subject ? `Subject: ${f.subject}` : "", f.author ? `Author: ${f.author}` : "", f.avail ? "Available only" : "", f.q ? `Search: ${f.q}` : ""].filter(Boolean).join(" · ");
    await logExport(tx, x.current.ctx, { title, format: x.format, filters, rows: books.length });
    return { books, cats: new Map(cats.map((c) => [c.id, c])), pubs: new Map(pubs.map((p) => [p.id, p.name])), filters };
  }, { timeout: 60_000 });
  type Row = (typeof r.books)[number];
  const n = (b: Row, st: string) => b.copies.filter((c) => c.status === st).length;
  const columns: ExportColumn<Row>[] = [
    { label: "Title", value: (b) => b.title },
    { label: "Author(s)", value: (b) => b.authorText },
    { label: "Publisher", value: (b) => (b.publisherId ? r.pubs.get(b.publisherId) ?? "" : "") },
    { label: "ISBN", value: (b) => (b.isbn ? showIsbn(b.isbn) : "") },
    { label: "Category", value: (b) => (b.categoryId ? r.cats.get(b.categoryId)?.name ?? "" : "") },
    { label: "Subject", value: (b) => b.subject ?? "" },
    { label: "Language", value: (b) => b.language ?? "" },
    { label: "Price", value: (b) => (b.pricePaise != null ? formatRupees(b.pricePaise) : "") },
    { label: "Shelf", value: (b) => shelfOf(b, b.categoryId ? r.cats.get(b.categoryId) : null) ?? "" },
    { label: "Copies", value: (b) => b.copies.filter((c) => c.status !== "WITHDRAWN").length },
    { label: "Available", value: (b) => n(b, "AVAILABLE") },
    { label: "Issued", value: (b) => n(b, "ISSUED") },
    { label: "Lost", value: (b) => n(b, "LOST") },
    { label: "Accession numbers", value: (b) => b.copies.filter((c) => c.status !== "WITHDRAWN").map((c) => c.accessionNo).join(", ") },
  ];
  return exportResponse(await buildExport(x.format, columns, r.books, { title, schoolName: x.current.school.name, exportedBy: x.current.user.displayName, timeZone: x.tz, filters: r.filters }));
}
