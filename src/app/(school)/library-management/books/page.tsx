// Books (13 §2): the catalogue with author, publisher, ISBN, category,
// subject, copies by status and the shelf. Add a book (ISBN first, checked
// as typed), import the catalogue, print labels for copies not labelled yet,
// and export what is on screen. View roles read the catalogue.
import type { Metadata } from "next";
import { BookOpen, BookPlus, FileUp, Printer, Search } from "lucide-react";
import { withSchool } from "@/lib/db";
import { readListParams, skipTake, listHref, PAGE_SIZE } from "@/lib/list";
import { Card } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Chips, SegLinks } from "@/components/ui/blocks";
import { Pager } from "@/components/ui/data-list";
import { ExportButton } from "@/components/ui/export-button";
import { MoreMenu } from "@/components/ui/more-menu";
import { UrlSearch, UrlSelect } from "@/components/ui/url-controls";
import { PeriodFilter } from "@/components/list/period-filter";
import { Stats, Stack, Toolbar, DataList, Empty } from "@/components/money/kit";
import { copyCounts, shelfOf, type CopyCounts } from "@/lib/library/catalogue";
import { nextAccessionPreview } from "@/lib/library/settings";
import { showIsbn } from "@/lib/library/isbn";
import { plural } from "@/lib/library/words";
import { LibHead } from "../_components/head";
import { BookSheet } from "../_components/sheets";
import { BASE, libGuard, libPeriod, one, qs, type SearchParams } from "../_lib/page";
import { booksWhere, readBooksFilter } from "../_lib/books";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Books · Library Management") };
}

const ZERO: CopyCounts = { total: 0, available: 0, issued: 0, reserved: 0, lost: 0, damaged: 0, withdrawn: 0 };

export default async function BooksPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const p = await libGuard("books");
  const { current, settings: s, can, tz } = p;
  const params = readListParams(sp, ["cat", "subject", "author", "avail", "period", "from", "to"]);
  const per = libPeriod(sp, p.dates, null);
  const f = readBooksFilter((k) => one(sp[k]), per.range);
  const open = one(sp.open);
  const adding = open === "add" && can.catalogue;

  const d = await withSchool(current.ctx, async (tx) => {
    const where = booksWhere(f, tz);
    const [total, rows, cats, subjects, authors, catCounts, copyTotals, unlabelled, next] = await Promise.all([
      tx.book.count({ where }),
      tx.book.findMany({ where, orderBy: [{ title: "asc" }, { id: "asc" }], ...skipTake(params) }),
      tx.libraryCategory.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      tx.book.findMany({ where: { archivedAt: null, subject: { not: null } }, distinct: ["subject"], select: { subject: true }, orderBy: { subject: "asc" }, take: 200 }),
      tx.author.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { name: true }, take: 500 }),
      tx.book.groupBy({ by: ["categoryId"], where: { archivedAt: null }, _count: { _all: true } }),
      tx.bookCopy.groupBy({ by: ["status"], _count: { _all: true } }),
      tx.bookCopy.count({ where: { labelPrintedAt: null, status: { not: "WITHDRAWN" } } }),
      nextAccessionPreview(tx, current.ctx, s),
    ]);
    const counts = await copyCounts(tx, rows.map((b) => b.id));
    const publishers = await tx.publisher.findMany({ where: { id: { in: rows.map((b) => b.publisherId).filter((x): x is string => Boolean(x)) } }, select: { id: true, name: true } });
    return { total, rows, cats, subjects: subjects.map((x) => x.subject!).filter(Boolean), authors: authors.map((a) => a.name), catCounts, copyTotals, unlabelled, next, counts, publishers: new Map(publishers.map((x) => [x.id, x.name])) };
  });

  const catOf = new Map(d.cats.map((c) => [c.id, c]));
  const by = (st: string) => d.copyTotals.find((x) => x.status === st)?._count._all ?? 0;
  const allCopies = d.copyTotals.filter((x) => x.status !== "WITHDRAWN").reduce((a, x) => a + x._count._all, 0);
  const booksTotal = d.catCounts.reduce((a, x) => a + x._count._all, 0);
  const href = (change: Record<string, string | number | null>) => listHref(`${BASE}/books`, params, { page: null, ...change });
  const exportHref = qs(`${BASE}/books/export`, { q: f.q || null, cat: f.cat || null, subject: f.subject || null, author: f.author || null, avail: f.avail ? "1" : null, ...per.keep });

  const actions = can.catalogue ? (
    <div className="flex gap-2">
      <MoreMenu items={[
        { label: "Import books", href: `${BASE}/books/import`, icon: <FileUp size={16} aria-hidden="true" /> },
        ...(d.unlabelled ? [{ label: `Print ${plural(d.unlabelled, "new label")}`, href: `${BASE}/books/labels?unprinted=1`, file: true, icon: <Printer size={16} aria-hidden="true" /> }] : []),
      ]} />
      <ButtonLink href={addQ(href({}), "open", "add")} variant="primary" icon={BookPlus} scroll={false}><Words k="Add book" /></ButtonLink>
    </div>
  ) : undefined;

  return (
    <>
      <LibHead pageName="Books" href={`${BASE}/books`} mode={p.mode} actions={actions} />
      <Stack>
        <Stats items={[
          { label: "Titles", value: booksTotal.toLocaleString("en-IN") },
          { label: "Copies", value: allCopies.toLocaleString("en-IN") },
          { label: "On the shelf", value: by("AVAILABLE").toLocaleString("en-IN"), tone: "ok" },
          { label: "Issued", value: by("ISSUED").toLocaleString("en-IN") },
          { label: "Lost or damaged", value: (by("LOST") + by("DAMAGED")).toLocaleString("en-IN"), tone: by("LOST") + by("DAMAGED") ? "warn" : undefined },
        ]} />
        {can.catalogue && d.unlabelled > 0 && (
          <div className="flex items-center gap-3 rounded-2xl bg-info/10 px-4 py-3 text-[14px] flex-wrap">
            <Printer size={18} className="text-info shrink-0" aria-hidden="true" />
            <span className="flex-1 min-w-0">{plural(d.unlabelled, "copy", "copies")} {d.unlabelled === 1 ? "has" : "have"} <Words k="no label yet." /></span>
            <ButtonLink href={`${BASE}/books/labels?unprinted=1`} size="sm" variant="secondary" target="_blank" prefetch={false}><Words k="Print labels" /></ButtonLink>
          </div>
        )}
        <Chips label="Categories" value={f.cat} options={[
          { value: "", label: "All", count: booksTotal, href: href({ cat: null }) },
          ...d.cats.map((c) => ({ value: c.id, label: c.name, count: d.catCounts.find((x) => x.categoryId === c.id)?._count._all ?? 0, href: href({ cat: c.id }) })),
          ...(d.catCounts.some((x) => x.categoryId === null) ? [{ value: "none", label: "No category", count: d.catCounts.find((x) => x.categoryId === null)?._count._all ?? 0, href: href({ cat: "none" }) }] : []),
        ]} />
        <Card>
          <Toolbar className="md:flex-wrap">
            <UrlSearch placeholder="Search title, author, ISBN or accession number" label="Search books" className="flex-1 md:min-w-[300px]" id="books-search" />
            <div className="flex gap-2 flex-wrap">
              {d.subjects.length > 0 && <UrlSelect param="subject" label="Subject" options={[{ value: "", label: "All subjects" }, ...d.subjects.map((x) => ({ value: x, label: x }))]} />}
              {d.authors.length > 0 && <UrlSelect param="author" label="Author" className="max-w-[220px]" options={[{ value: "", label: "All authors" }, ...d.authors.map((x) => ({ value: x, label: x }))]} />}
              <SegLinks label="Copies" size="md" value={f.avail ? "1" : ""} options={[{ value: "", label: "All", href: href({ avail: null }) }, { value: "1", label: "Available", href: href({ avail: "1" }) }]} />
              <PeriodFilter {...p.dates} allLabel="Added: all dates" />
              {can.export && <ExportButton href={exportHref} />}
            </div>
          </Toolbar>
          <DataList rows={d.rows} rowKey={(b) => b.id} rowHref={(b) => `${BASE}/books/${b.id}`} minWidth={900} caption="Books"
            empty={<Empty icon={params.q || f.cat || f.subject || f.author || f.avail || per.range ? Search : BookOpen} title={params.q || f.cat || f.subject || f.author || f.avail || per.range ? "No books match" : "No books yet"}
              body={params.q || f.cat || f.subject || f.author || f.avail || per.range ? "Try another search or clear the filters." : can.catalogue ? "Add the first book, or import the catalogue from a spreadsheet." : "The librarian adds the books."}
              action={!params.q && can.catalogue ? <ButtonLink href={`${BASE}/books/import`} variant="secondary" icon={FileUp}><Words k="Import books" /></ButtonLink> : undefined} />}
            columns={[
              { key: "title", label: "Title", render: (b) => <span className="block min-w-[180px]"><b className="font-semibold">{b.title}</b>{b.isbn && <span className="block text-[12px] text-ink3 font-mono">{showIsbn(b.isbn)}</span>}</span> },
              { key: "author", label: "Author", render: (b) => b.authorText },
              { key: "publisher", label: "Publisher", render: (b) => (b.publisherId ? d.publishers.get(b.publisherId) ?? "" : "") },
              { key: "cat", label: "Category", render: (b) => (b.categoryId ? catOf.get(b.categoryId)?.name ?? "" : "") },
              { key: "subject", label: "Subject", render: (b) => b.subject ?? "" },
              { key: "copies", label: "Copies", align: "right", render: (b) => (d.counts.get(b.id) ?? ZERO).total },
              { key: "avail", label: "Available", align: "right", render: (b) => { const c = d.counts.get(b.id) ?? ZERO; return <span className={c.available ? "text-ok font-semibold" : "text-ink3"}>{c.available}</span>; } },
              { key: "issued", label: "Issued", align: "right", render: (b) => (d.counts.get(b.id) ?? ZERO).issued },
              { key: "lost", label: "Lost", align: "right", render: (b) => { const c = d.counts.get(b.id) ?? ZERO; return c.lost ? <span className="text-warn">{c.lost}</span> : 0; } },
              { key: "shelf", label: "Shelf", nowrap: true, render: (b) => shelfOf(b, b.categoryId ? catOf.get(b.categoryId) : null) ?? "" },
            ]}
            phone={(b) => {
              const c = d.counts.get(b.id) ?? ZERO;
              return { title: b.title, sub: `${b.authorText}${b.categoryId && catOf.get(b.categoryId) ? ` · ${catOf.get(b.categoryId)!.name}` : ""}`, icon: BookOpen, iconTone: "brand",
                pills: <><Pill tone={c.available ? "ok" : "neutral"}>{c.available} <Words k="of" /> {c.total} <Words k="available" /></Pill>{c.lost > 0 && <Pill tone="warn">{c.lost} <Words k="lost" /></Pill>}</> };
            }}
          />
          {d.total > 0 && <Pager page={params.page} pageSize={PAGE_SIZE} total={d.total} prevHref={listHref(`${BASE}/books`, params, { page: params.page > 2 ? params.page - 1 : null })} nextHref={listHref(`${BASE}/books`, params, { page: params.page + 1 })} />}
        </Card>
      </Stack>
      {adding && (
        <BookSheet closeHref={href({ open: null })} categories={d.cats.map((c) => ({ value: c.id, label: c.forLoan ? c.name : `${c.name} (not lent)` }))} start={null} nextAccession={d.next} />
      )}
    </>
  );
}

function addQ(href: string, k: string, v: string) {
  return `${href}${href.includes("?") ? "&" : "?"}${k}=${encodeURIComponent(v)}`;
}
