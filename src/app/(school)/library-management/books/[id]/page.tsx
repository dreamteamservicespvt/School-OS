// One book (13 §2): its details and each copy with its accession number,
// barcode, status and who has it; the waiting list; the issue history for
// the dates chosen. The librarian adds copies, prints labels for chosen
// copies, withdraws a copy (it stays in the history), marks one lost or
// damaged (a large charge goes to Approvals) and puts one back on the shelf.
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookOpen, BookmarkCheck, History, PencilLine, Plus, Printer } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatRupees } from "@/lib/format";
import { dateWhere } from "@/lib/periods";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { Button, ButtonLink } from "@/components/ui/button";
import { inputCls } from "@/components/ui/field";
import { PeriodFilter } from "@/components/list/period-filter";
import { Stats, Split, Col, Stack, DataList, Empty, DL } from "@/components/money/kit";
import { cx } from "@/components/ui/cx";
import { copyCounts, shelfOf } from "@/lib/library/catalogue";
import { holderWords, issueMembers, queueWithMembers, daysBetween } from "@/lib/library/desk";
import { lostDefaultCharge } from "@/lib/library/fines";
import { nextAccessionPreview } from "@/lib/library/settings";
import { showIsbn } from "@/lib/library/isbn";
import { COPY_STATUS, paiseToRupees, plural, type CopyStatus } from "@/lib/library/words";
import { LibHead } from "../../_components/head";
import { AddCopiesSheet, BackOnShelfSheet, BookSheet, LostSheet, WithdrawSheet } from "../../_components/sheets";
import { BASE, libGuard, libPeriod, one, qs, UUID, type SearchParams } from "../../_lib/page";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Book · Library Management") };
}
const day = (d: Date) => formatDate(d, "UTC");

export default async function BookPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const sp = await searchParams;
  const p = await libGuard("books");
  const { current, settings: s, can, today } = p;
  const per = libPeriod(sp, p.dates, null);
  const open = one(sp.open);
  const copyParam = (k: string) => (UUID.test(one(sp[k])) ? one(sp[k]) : null);

  const d = await withSchool(current.ctx, async (tx) => {
    const book = await tx.book.findFirst({ where: { id, archivedAt: null }, include: { copies: { orderBy: { accessionNo: "asc" } } } });
    if (!book) return null;
    const [cat, cats, publisher, counts, openIssues, queue, history, next, authors] = await Promise.all([
      book.categoryId ? tx.libraryCategory.findFirst({ where: { id: book.categoryId } }) : null,
      tx.libraryCategory.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
      book.publisherId ? tx.publisher.findFirst({ where: { id: book.publisherId } }) : null,
      copyCounts(tx, [book.id]),
      tx.bookIssue.findMany({ where: { bookId: book.id, returnedAt: null } }),
      queueWithMembers(tx, current.ctx, s, book.id),
      tx.bookIssue.findMany({ where: { bookId: book.id, ...(per.range ? { issuedOn: dateWhere(per.range) } : {}) }, orderBy: [{ issuedOn: "desc" }, { issuedAt: "desc" }], take: 50, include: { copy: { select: { accessionNo: true } } } }),
      nextAccessionPreview(tx, current.ctx, s),
      book.authorIds.length ? tx.author.findMany({ where: { id: { in: book.authorIds } }, select: { id: true, name: true } }) : [],
    ]);
    const members = await issueMembers(tx, current.ctx, s, [...openIssues, ...history]);
    const who = (r: { studentId: string | null; staffId: string | null }) => members.get(r.studentId ? `S:${r.studentId}` : `T:${r.staffId}`) ?? null;
    const holders = new Map(openIssues.map((i) => [i.copyId, { member: who(i), dueOn: i.dueOn }]));
    return { book, cat, cats, publisher, counts: counts.get(book.id)!, holders, queue, history: history.map((h) => ({ ...h, member: who(h) })), next, authors };
  });
  if (!d) notFound();
  const { book } = d;
  const self = `${BASE}/books/${book.id}`;
  const keep = per.keep;
  const href = (change: Record<string, string | null>) => qs(self, { ...keep, ...change });
  const shelf = shelfOf(book, d.cat);
  const findCopy = (cid: string | null) => (cid ? book.copies.find((c) => c.id === cid) ?? null : null);
  const withdraw = can.catalogue ? findCopy(copyParam("withdraw")) : null;
  const lost = can.catalogue ? findCopy(copyParam("lost")) : null;
  const back = can.catalogue ? findCopy(copyParam("shelf")) : null;
  const liveCopies = book.copies.filter((c) => c.status !== "WITHDRAWN");

  const actions = can.catalogue ? (
    <div className="flex gap-2 flex-wrap">
      <ButtonLink href={href({ open: "edit" })} icon={PencilLine} scroll={false}><Words k="Change details" /></ButtonLink>
      <ButtonLink href={href({ open: "copies" })} variant="primary" icon={Plus} scroll={false}><Words k="Add copies" /></ButtonLink>
    </div>
  ) : undefined;

  return (
    <>
      <LibHead pageName={book.title} href={self} mode={p.mode} actions={actions} sub={<Link href={`${BASE}/books`} className="hover:underline"><Words k="Books" /></Link>} />
      <Stack>
        <Stats items={[
          { label: "Copies", value: d.counts.total },
          { label: "On the shelf", value: d.counts.available, tone: d.counts.available ? "ok" : undefined },
          { label: "Issued", value: d.counts.issued },
          { label: "Kept for the queue", value: d.counts.reserved },
          { label: "Lost or damaged", value: d.counts.lost + d.counts.damaged, tone: d.counts.lost + d.counts.damaged ? "warn" : undefined },
        ]} />
        <Split>
          <Col>
            <Card>
              <CardHeader title="Copies" icon={BookOpen} description={`${plural(liveCopies.length, "copy", "copies")}${d.counts.withdrawn ? `, ${d.counts.withdrawn} withdrawn` : ""}. Accession numbers are never given again.`} divided
                action={can.catalogue && liveCopies.length > 0 ? <ButtonLink href={`${BASE}/books/labels?book=${book.id}`} size="sm" icon={Printer} target="_blank" prefetch={false}><Words k="All labels" /></ButtonLink> : undefined} />
              {can.catalogue && liveCopies.length > 0 ? (
                <form method="get" action={`${BASE}/books/labels`} target="_blank" className="contents">
                  <CopyTable copies={book.copies} holders={d.holders} today={today} href={href} withPick canChange />
                  <div className="hidden lg:flex items-center gap-2.5 flex-wrap px-4 py-3 border-t border-line">
                    <label htmlFor="label-skip" className="text-[13px] text-ink2"><Words k="Labels already used on the sheet" /></label>
                    <select id="label-skip" name="skip" defaultValue="0" className={cx(inputCls(false), "h-10 w-20")}>
                      {Array.from({ length: 24 }, (_, i) => <option key={i} value={i}>{i}</option>)}
                    </select>
                    <Button type="submit" variant="secondary" size="sm" icon={Printer} className="ml-auto"><Words k="Print labels for ticked copies" /></Button>
                  </div>
                </form>
              ) : (
                <CopyTable copies={book.copies} holders={d.holders} today={today} href={href} canChange={false} />
              )}
            </Card>
            <Card>
              <CardHeader title="Issue history" icon={History} description={`${plural(d.history.length, "issue")} · ${per.label}`} action={<PeriodFilter {...p.dates} size="sm" />} divided />
              <DataList rows={d.history} rowKey={(h) => h.id} minWidth={620}
                empty={<Empty icon={History} title="Not issued in these dates" />}
                columns={[
                  { key: "member", label: "Member", render: (h) => (h.member ? holderWords(h.member) : "—") },
                  { key: "copy", label: "Copy", render: (h) => <span className="font-mono text-[13px]">{h.copy.accessionNo}</span> },
                  { key: "issued", label: "Issued", nowrap: true, render: (h) => day(h.issuedOn) },
                  { key: "due", label: "Due", nowrap: true, render: (h) => day(h.dueOn) },
                  { key: "ret", label: "Returned", nowrap: true, render: (h) => (h.returnedOn ? `${day(h.returnedOn)}${h.lateDays ? ` · ${h.lateDays}d late` : ""}` : <Pill tone={h.dueOn.getTime() < today.getTime() ? "bad" : "info"}>{h.dueOn.getTime() < today.getTime() ? "Overdue" : "Out"}</Pill>) },
                ]}
                phone={(h) => ({ title: h.member ? holderWords(h.member) : "—", sub: `Copy ${h.copy.accessionNo} · issued ${day(h.issuedOn)}`, right: h.returnedOn ? <span className="text-[12.5px] text-ink3"><Words k="Returned" /></span> : <Pill tone="info"><Words k="Out" /></Pill> })}
              />
            </Card>
          </Col>
          <Col>
            <Card className="p-5">
              <h2 className="font-semibold text-[15px] mb-3"><Words k="Details" /></h2>
              <DL cols={2} rows={[
                ["Author(s)", d.authors.length ? d.authors.map((a) => a.name).join(", ") : book.authorText],
                ["Publisher", d.publisher?.name ?? "—"],
                ["ISBN", book.isbn ? <span className="font-mono">{showIsbn(book.isbn)}</span> : "—"],
                ["Category", d.cat ? `${d.cat.name}${d.cat.forLoan ? "" : " (not lent)"}` : "—"],
                ["Subject", book.subject ?? "—"],
                ["Language", book.language ?? "—"],
                ["Edition", book.edition ?? "—"],
                ["Price", book.pricePaise != null ? formatRupees(book.pricePaise) : "—"],
                ["Shelf", shelf ?? "—"],
                ["Added", formatDate(book.createdAt, p.tz)],
              ]} />
            </Card>
            <Card>
              <CardHeader title="Waiting list" icon={BookmarkCheck} description={d.queue.length ? `In the school's queue order (${s.queueOrder === "staff-first" ? "staff first" : "first come, first served"}).` : undefined} divided />
              {d.queue.length ? (
                <ol className="divide-y divide-line/70">
                  {d.queue.map((r, i) => (
                    <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="grid place-items-center size-7 rounded-full bg-sunken text-[12.5px] font-semibold tnum shrink-0">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-[14px] truncate">{r.member ? holderWords(r.member) : "Member"}</p>
                        <p className="text-[12.5px] text-ink3"><Words k="Since" /> {formatDate(r.reservedAt, p.tz)}</p>
                      </div>
                      {r.status === "READY" ? <Pill tone="ok"><Words k="Ready at the desk" /></Pill> : <Pill tone="info"><Words k="Waiting" /></Pill>}
                    </li>
                  ))}
                </ol>
              ) : <p className="px-5 py-4 text-[13.5px] text-ink3"><Words k="Nobody is waiting for this book." /></p>}
            </Card>
          </Col>
        </Split>
      </Stack>
      {can.catalogue && open === "edit" && (
        <BookSheet closeHref={href({})} categories={d.cats.map((c) => ({ value: c.id, label: c.forLoan ? c.name : `${c.name} (not lent)` }))} nextAccession={d.next}
          start={{ id: book.id, title: book.title, authors: d.authors.length ? d.authors.map((a) => a.name).join("; ") : book.authorText, publisher: d.publisher?.name ?? "", isbn: book.isbn ? showIsbn(book.isbn) : "", categoryId: book.categoryId ?? "", subject: book.subject ?? "", language: book.language ?? "", edition: book.edition ?? "", price: book.pricePaise != null ? String(paiseToRupees(book.pricePaise)) : "", shelf: book.shelf ?? "" }} />
      )}
      {can.catalogue && open === "copies" && <AddCopiesSheet closeHref={href({})} bookId={book.id} title={book.title} nextAccession={d.next} />}
      {withdraw && <WithdrawSheet closeHref={href({})} copyId={withdraw.id} accession={withdraw.accessionNo} title={book.title} />}
      {back && <BackOnShelfSheet closeHref={href({})} copyId={back.id} accession={back.accessionNo} status={back.status} />}
      {lost && (
        <LostSheet closeHref={href({})} approvalAbove={Number(paiseToRupees(s.approvalAbovePaise))} finesToFees={s.finesToFees}
          copy={{ id: lost.id, accession: lost.accessionNo, title: book.title, holder: d.holders.get(lost.id)?.member ? holderWords(d.holders.get(lost.id)!.member!) : null, price: Number(paiseToRupees(book.pricePaise ?? BigInt(0))), defaultLost: Number(paiseToRupees(lostDefaultCharge(s, book, "LOST"))), defaultDamaged: Number(paiseToRupees(lostDefaultCharge(s, book, "DAMAGED"))) }} />
      )}
    </>
  );
}

type CopyRow = { id: string; accessionNo: string; barcode: string; status: string; statusNote: string | null; acquiredOn: Date | null; labelPrintedAt: Date | null };
type Holder = { member: Parameters<typeof holderWords>[0] | null; dueOn: Date };

function CopyTable({ copies, holders, today, href, withPick, canChange }: { copies: CopyRow[]; holders: Map<string, Holder>; today: Date; href: (c: Record<string, string | null>) => string; withPick?: boolean; canChange: boolean }) {
  const holderText = (c: CopyRow) => {
    const h = holders.get(c.id);
    if (!h) return c.statusNote ?? "";
    const late = daysBetween(h.dueOn, today);
    return `${h.member ? holderWords(h.member) : "Member"} · due ${day(h.dueOn)}${late > 0 ? ` (${late}d late)` : ""}`;
  };
  const acts = (c: CopyRow) => {
    if (!canChange || c.status === "WITHDRAWN") return null;
    return (
      <div className="flex gap-3 justify-end text-[13px] font-semibold">
        {(c.status === "LOST" || c.status === "DAMAGED") && <Link href={href({ shelf: c.id })} scroll={false} className="text-brand hover:underline"><Words k="Back on shelf" /></Link>}
        {c.status !== "LOST" && <Link href={href({ lost: c.id })} scroll={false} className="text-ink2 hover:underline"><Words k="Lost or damaged" /></Link>}
        {c.status !== "ISSUED" && c.status !== "RESERVED" && <Link href={href({ withdraw: c.id })} scroll={false} className="text-bad hover:underline"><Words k="Withdraw" /></Link>}
      </div>
    );
  };
  return (
    <DataList rows={copies} rowKey={(c) => c.id} minWidth={760}
      empty={<Empty icon={BookOpen} title="No copies yet" body="Add copies to give them accession numbers." />}
      rowClass={(c) => c.status === "WITHDRAWN" && "opacity-60"}
      columns={[
        ...(withPick ? [{ key: "pick", label: "", render: (c: CopyRow) => (c.status !== "WITHDRAWN" ? <input type="checkbox" name="copy" value={c.id} defaultChecked={!c.labelPrintedAt} aria-label={`Print a label for copy ${c.accessionNo}`} className="size-[18px] accent-[var(--color-brand)]" /> : null) }] : []),
        { key: "acc", label: "Accession no.", nowrap: true, render: (c) => <span className="font-mono font-semibold">{c.accessionNo}</span> },
        { key: "bar", label: "Barcode", nowrap: true, render: (c) => <span className="font-mono text-[13px] text-ink3">{c.barcode}</span> },
        { key: "status", label: "Status", render: (c) => { const st = COPY_STATUS[c.status as CopyStatus]; return <Pill tone={st.tone}>{st.label}</Pill>; } },
        { key: "who", label: "Who has it", render: (c) => <span className="text-[13.5px]">{holderText(c)}</span> },
        { key: "label", label: "Label", nowrap: true, render: (c) => (c.labelPrintedAt ? <span className="text-[12.5px] text-ink3"><Words k="Printed" /></span> : c.status === "WITHDRAWN" ? "" : <Pill tone="warn"><Words k="Not printed" /></Pill>) },
        ...(canChange ? [{ key: "act", label: "", render: acts }] : []),
      ]}
      phone={(c) => {
        const st = COPY_STATUS[c.status as CopyStatus];
        return { title: <span className="font-mono">{c.accessionNo}</span>, sub: holderText(c) || (c.labelPrintedAt ? "Label printed" : "Label not printed"), right: <Pill tone={st.tone}>{st.label}</Pill>,
          pills: canChange && c.status !== "WITHDRAWN" ? <span className="flex gap-3 text-[12.5px] font-semibold">{acts(c)}</span> : undefined };
      }}
    />
  );
}
