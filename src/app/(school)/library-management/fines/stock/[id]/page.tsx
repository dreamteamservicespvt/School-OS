// One stock check (13 Fines & Stock Check): while open, scan every copy on
// the shelves and watch the counts; when closed, the result lists the copies
// missing and the extra codes, and the librarian marks the missing copies
// lost after review. Leaders read the result.
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClipboardCheck, PackageSearch, TriangleAlert } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { Stats, Split, Col, Stack, DataList, Empty, Progress } from "@/components/money/kit";
import { sessionProgress, stillMissing, ON_SHELF } from "@/lib/library/stock";
import { shelfOf } from "@/lib/library/catalogue";
import { COPY_STATUS, plural, type CopyStatus } from "@/lib/library/words";
import { LibHead } from "../../../_components/head";
import { BASE, libGuard, UUID } from "../../../_lib/page";
import { CloseStockButton, MarkLostButton, StockScanner } from "./stock-client";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Stock check · Library Management" };

export default async function StockCheckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const p = await libGuard("fines");
  const { current, can, tz } = p;
  const d = await withSchool(current.ctx, async (tx) => {
    const session = await tx.stockCheckSession.findFirst({ where: { id } });
    if (!session) return null;
    const open = session.status === "OPEN";
    const [progress, recent, missing, cats] = await Promise.all([
      open ? sessionProgress(tx, id) : Promise.resolve(null),
      tx.stockCheckScan.findMany({ where: { sessionId: id }, orderBy: { scannedAt: "desc" }, take: open ? 15 : 500 }),
      open ? Promise.resolve([]) : stillMissing(tx, id),
      tx.libraryCategory.findMany({ select: { id: true, shelf: true } }),
    ]);
    const copies = await tx.bookCopy.findMany({ where: { id: { in: recent.map((r) => r.copyId).filter((x): x is string => Boolean(x)) } }, include: { book: { select: { title: true } } } });
    const copyOf = new Map(copies.map((c) => [c.id, c]));
    const scans = recent.map((r) => ({ ...r, copy: r.copyId ? copyOf.get(r.copyId) ?? null : null }));
    return { session, progress, scans, missing, cats: new Map(cats.map((c) => [c.id, c])) };
  });
  if (!d) notFound();
  const { session } = d;
  const base = `${BASE}/fines`;
  const open = session.status === "OPEN";
  const extras = d.scans.filter((x) => !x.copy || !ON_SHELF.includes(x.copy.status));

  return (
    <>
      <LibHead pageName={session.name} href={`${base}/stock/${id}`} mode={p.mode} sub={<Link href={`${base}?view=stock`} className="hover:underline"><Words k="Stock check" /></Link>}
        actions={can.fines && open && d.progress ? <CloseStockButton sessionId={id} notScanned={d.progress.notScanned} /> : undefined} />
      <Stack>
        {open && d.progress ? (
          <>
            <Stats items={[
              { label: "Expected on the shelves", value: d.progress.expected.toLocaleString("en-IN") },
              { label: "Found", value: d.progress.found.toLocaleString("en-IN"), tone: "ok" },
              { label: "Not scanned yet", value: d.progress.notScanned.toLocaleString("en-IN"), tone: d.progress.notScanned ? "warn" : "ok" },
              { label: "Extra", value: d.progress.extra.toLocaleString("en-IN"), sub: "issued, lost or not in the catalogue" },
            ]} />
            <Progress value={d.progress.expected ? Math.round((d.progress.found / d.progress.expected) * 100) : 100} tone="ok" />
            <Split>
              <Col>
                {can.fines ? (
                  <Card className="p-4 md:p-5 flex flex-col gap-3">
                    <h2 className="font-semibold text-[15px]"><Words k="Scan the shelves" /></h2>
                    <p className="text-[13.5px] text-ink3"><Words k="Go shelf by shelf. Each copy counts once; scanning it again does nothing. Issued books are out with members and are not expected." /></p>
                    <StockScanner sessionId={id} />
                  </Card>
                ) : (
                  <Card className="p-5 text-[14px] text-ink2"><Words k="The librarian is scanning the shelves. The result shows here when the check is closed." /></Card>
                )}
              </Col>
              <Col>
                <ScanList scans={d.scans} title="Last scanned" />
              </Col>
            </Split>
          </>
        ) : (
          <>
            <Stats items={[
              { label: "Expected", value: (session.expected ?? 0).toLocaleString("en-IN") },
              { label: "Found", value: (session.found ?? 0).toLocaleString("en-IN"), tone: "ok" },
              { label: "Missing", value: (session.missing ?? 0).toLocaleString("en-IN"), tone: session.missing ? "bad" : "ok" },
              { label: "Extra", value: (session.extra ?? 0).toLocaleString("en-IN") },
            ]} />
            <p className="text-[13px] text-ink3"><Words k="Started" /> {formatDateTime(session.startedAt, tz)}{session.closedAt ? ` · closed ${formatDateTime(session.closedAt, tz)}` : ""}{session.lostMarkedAt ? ` · missing copies marked lost ${formatDateTime(session.lostMarkedAt, tz)}` : ""}.</p>
            <Split>
              <Col>
                <Card>
                  <CardHeader title="Missing copies" icon={PackageSearch} divided
                    description={d.missing.length ? `${plural(d.missing.length, "copy", "copies")} not scanned and still not found. Look on the shelves once more before marking them lost.` : session.missing ? "Every missing copy has been found or marked since." : "Nothing was missing."}
                    action={can.fines && !session.lostMarkedAt && d.missing.length > 0 ? <MarkLostButton sessionId={id} count={d.missing.length} /> : undefined} />
                  <DataList rows={d.missing} rowKey={(c) => c.id} rowHref={(c) => `${BASE}/books/${c.book.id}`} minWidth={560}
                    empty={<Empty icon={ClipboardCheck} title="Nothing missing" />}
                    columns={[
                      { key: "acc", label: "Accession no.", nowrap: true, render: (c) => <span className="font-mono font-semibold">{c.accessionNo}</span> },
                      { key: "title", label: "Book", render: (c) => c.book.title },
                      { key: "shelf", label: "Shelf", render: (c) => shelfOf(c.book, c.book.categoryId ? d.cats.get(c.book.categoryId) : null) ?? "" },
                      { key: "status", label: "Status", render: (c) => { const st = COPY_STATUS[c.status as CopyStatus]; return <Pill tone={st.tone}>{st.label}</Pill>; } },
                    ]}
                    phone={(c) => ({ title: c.book.title, sub: `${c.accessionNo} · shelf ${shelfOf(c.book, c.book.categoryId ? d.cats.get(c.book.categoryId) : null) ?? "—"}`, icon: PackageSearch, iconTone: "warn" })}
                  />
                </Card>
              </Col>
              <Col>
                <ScanList scans={extras} title="Extra codes" empty="No extra codes." icon />
              </Col>
            </Split>
          </>
        )}
      </Stack>
    </>
  );
}

type Scan = { id: string; code: string; scannedAt: Date; copy: { status: string; book: { title: string } } | null };
function ScanList({ scans, title, empty = "Nothing scanned yet.", icon }: { scans: Scan[]; title: string; empty?: string; icon?: boolean }) {
  return (
    <Card>
      <CardHeader title={title} icon={icon ? TriangleAlert : ClipboardCheck} divided />
      {scans.length ? (
        <ul className="divide-y divide-line/70">
          {scans.map((x) => {
            const st = x.copy ? COPY_STATUS[x.copy.status as CopyStatus] : null;
            return (
              <li key={x.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="font-mono text-[13px] font-semibold shrink-0">{x.code}</span>
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-ink2">{x.copy ? x.copy.book.title : "Not in the catalogue"}</span>
                {st && !ON_SHELF.includes(x.copy!.status as CopyStatus) ? <Pill tone={st.tone}>{st.label}</Pill> : !x.copy ? <Pill tone="warn"><Words k="Unknown" /></Pill> : null}
              </li>
            );
          })}
        </ul>
      ) : <p className="px-5 py-4 text-[13.5px] text-ink3">{empty}</p>}
    </Card>
  );
}
