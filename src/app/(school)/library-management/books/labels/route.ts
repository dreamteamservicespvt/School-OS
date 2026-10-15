// Book labels as a PDF: chosen copies, every copy of one book, or every copy
// not labelled yet. Labels already used on a sheet can be skipped so a part
// sheet is not wasted. The copies are marked as labelled.
import { withSchool } from "@/lib/db";
import { htmlToPdf } from "@/lib/pdf";
import { labelsHtml, LABELS_PER_SHEET } from "@/lib/library/labels";
import { librarySettings } from "@/lib/library/settings";
import { markLabelsPrinted, shelfOf } from "@/lib/library/catalogue";
import { libRoute, plain } from "../../_lib/route";
import { UUID } from "../../_lib/page";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const x = await libRoute(req, "books", "print");
  if (x instanceof Response) return x;
  if (!x.can.catalogue) return plain("Only the librarian prints book labels.", 403);
  const ids = x.url.searchParams.getAll("copy").filter((v) => UUID.test(v)).slice(0, 2000);
  const bookId = UUID.test(x.get("book")) ? x.get("book") : null;
  const unprinted = x.get("unprinted") === "1";
  const skip = Math.max(0, Math.min(LABELS_PER_SHEET - 1, Number(x.get("skip")) || 0));
  if (!ids.length && !bookId && !unprinted) return plain("Choose the copies to print labels for.", 400);
  const out = await withSchool(x.current.ctx, async (tx) => {
    const s = await librarySettings(tx, x.current.ctx);
    const copies = await tx.bookCopy.findMany({
      where: { status: { not: "WITHDRAWN" }, ...(ids.length ? { id: { in: ids } } : bookId ? { bookId } : { labelPrintedAt: null }) },
      orderBy: { accessionNo: "asc" }, take: 2000, include: { book: { select: { title: true, shelf: true, categoryId: true } } },
    });
    const cats = new Map((await tx.libraryCategory.findMany({ select: { id: true, shelf: true } })).map((c) => [c.id, c]));
    if (copies.length) await markLabelsPrinted(tx, x.current.ctx, copies.map((c) => c.id));
    return { s, copies: copies.map((c) => ({ accessionNo: c.accessionNo, barcode: c.barcode, title: c.book.title, shelf: shelfOf(c.book, c.book.categoryId ? cats.get(c.book.categoryId) : null) })) };
  }, { timeout: 60_000 });
  if (!out.copies.length) return plain("There are no copies to print labels for.", 404);
  const pdf = await htmlToPdf(labelsHtml(out.copies, { schoolName: x.current.school.name, labelType: out.s.labelType, skip }), { format: "A4", margin: "10mm" });
  return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="book-labels.pdf"', "Cache-Control": "no-store" } });
}
