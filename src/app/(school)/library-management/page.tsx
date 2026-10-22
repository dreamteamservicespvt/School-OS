// Issue & Return (13 §2): the librarian's desk. Scan or search the member,
// then scan or search the copy; the due date fills from Library Settings.
// Returns show the fine before it is added, and the next member in the queue.
// Leaders who read this page (Principal, School Admin) get the overdue watch
// instead of the desk: what is late, for how long, and Remind the librarian.
import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, ArrowRightLeft, BookOpen, BookmarkCheck, CalendarClock, CornerDownLeft, History, Search, UserRound } from "lucide-react";
import { withSchool, type Tx, type SchoolContext } from "@/lib/db";
import { formatDate, formatRupees } from "@/lib/format";
import { fileLink } from "@/lib/files";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { Avatar } from "@/components/ui/avatar";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { SegLinks } from "@/components/ui/blocks";
import { Pager } from "@/components/ui/data-list";
import { ExportButton } from "@/components/ui/export-button";
import { UrlSearch, UrlSelect } from "@/components/ui/url-controls";
import { PeriodFilter } from "@/components/list/period-filter";
import { Stats, Split, Col, Stack, Toolbar, DataList, Empty, ListRow, HBars, type StatItem } from "@/components/money/kit";
import { cx } from "@/components/ui/cx";
import { LibraryProblem } from "@/lib/library/problem";
import { memberByCode, memberByKey, memberLoad, searchMembers, type Member } from "@/lib/library/members";
import { copyByCode, catalogueWhere } from "@/lib/library/catalogue";
import { checkIssue, defaultDue, lateFine, openIssueOf, overdueWhere, queueOf, issueMembers, daysBetween, holderWords, addDays, isoDay } from "@/lib/library/desk";
import { lostDefaultCharge } from "@/lib/library/fines";
import { overdueBuckets } from "@/lib/library/reports";
import { books as bookWords, paiseToRupees, plural, type CopyStatus, COPY_STATUS } from "@/lib/library/words";
import type { LibrarySettings } from "@/lib/library/settings";
import { LibHead } from "./_components/head";
import { ScanBox, ActButton } from "./_components/client";
import { IssueForm, ReturnForm } from "./_components/desk-forms";
import { CancelReservationSheet } from "./_components/sheets";
import { BASE, libGuard, libPeriod, one, qs, addQ, UUID, type SearchParams, type LibPageData } from "./_lib/page";
import { historyWhere, HISTORY_STATUS } from "./_lib/history";
import { issueAction, returnAction, renewAction, reserveAction, remindAction, remindAllAction, remindLibrarianAction } from "./actions";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Issue & Return · Library Management" };

const LISTS = [
  { value: "issued", label: "Issued today" },
  { value: "returned", label: "Returned today" },
  { value: "due", label: "Due today" },
  { value: "overdue", label: "Overdue" },
] as const;
type ListKey = (typeof LISTS)[number]["value"];
const HISTORY_SIZE = 20;
const day = (d: Date) => formatDate(d, "UTC");

type Raw = Record<string, string | string[] | undefined>;

export default async function IssueReturnPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const p = await libGuard("issue");
  if (p.mode !== "full") return <OverdueWatch p={p} sp={sp} />;
  return <Desk p={p} sp={sp} />;
}

/* ---------- Numbers shared by the desk and the watch ---------- */

async function deskCounts(tx: Tx, today: Date) {
  const [issued, returned, due, overdue, ready, waiting] = await Promise.all([
    tx.bookIssue.count({ where: { issuedOn: today } }),
    tx.bookIssue.count({ where: { returnedOn: today } }),
    tx.bookIssue.count({ where: { returnedAt: null, dueOn: today } }),
    tx.bookIssue.count({ where: overdueWhere(today) }),
    tx.reservation.count({ where: { status: "READY" } }),
    tx.reservation.count({ where: { status: "WAITING" } }),
  ]);
  return { issued, returned, due, overdue, ready, waiting };
}

function listWhere(list: ListKey, today: Date) {
  if (list === "issued") return { issuedOn: today };
  if (list === "returned") return { returnedOn: today };
  if (list === "due") return { returnedAt: null, dueOn: today };
  return overdueWhere(today);
}

async function listRows(tx: Tx, ctx: SchoolContext, s: LibrarySettings, list: ListKey, today: Date, take = 60) {
  const rows = await tx.bookIssue.findMany({
    where: listWhere(list, today),
    orderBy: list === "overdue" ? [{ dueOn: "asc" }] : list === "returned" ? [{ returnedAt: "desc" }] : [{ issuedAt: "desc" }],
    take,
    include: { copy: { select: { accessionNo: true, book: { select: { title: true } } } } },
  });
  const members = await issueMembers(tx, ctx, s, rows);
  return rows.map((r) => ({ ...r, member: members.get(r.studentId ? `S:${r.studentId}` : `T:${r.staffId}`) ?? null }));
}
type TodayRow = Awaited<ReturnType<typeof listRows>>[number];

async function historyRows(tx: Tx, ctx: SchoolContext, s: LibrarySettings, sp: Raw, p: LibPageData) {
  const h = libPeriod(sp, p.dates, "month", "h");
  const q = one(sp.hq).trim().slice(0, 80);
  const status = one(sp.hstatus);
  const page = Math.max(1, Math.min(500, Number(one(sp.hpage)) || 1));
  const where = await historyWhere(tx, { range: h.range, q, status, today: p.today });
  const [total, rows] = await Promise.all([
    tx.bookIssue.count({ where }),
    tx.bookIssue.findMany({ where, orderBy: [{ issuedOn: "desc" }, { issuedAt: "desc" }], skip: (page - 1) * HISTORY_SIZE, take: HISTORY_SIZE, include: { copy: { select: { accessionNo: true, book: { select: { title: true } } } } } }),
  ]);
  const members = await issueMembers(tx, ctx, s, rows);
  return { h, q, status, page, total, rows: rows.map((r) => ({ ...r, member: members.get(r.studentId ? `S:${r.studentId}` : `T:${r.staffId}`) ?? null })) };
}
type HistoryData = Awaited<ReturnType<typeof historyRows>>;

/** Adds each reservation's book title (reservations keep only the book's id). */
async function withBookTitles<R extends { bookId: string }>(tx: Tx, rows: R[]) {
  const books = rows.length ? await tx.book.findMany({ where: { id: { in: [...new Set(rows.map((r) => r.bookId))] } }, select: { id: true, title: true } }) : [];
  const t = new Map(books.map((b) => [b.id, b.title]));
  return rows.map((r) => ({ ...r, book: { title: t.get(r.bookId) ?? "Book" } }));
}

/* ---------- The desk ---------- */

async function Desk({ p, sp }: { p: LibPageData & { mode: string }; sp: Raw }) {
  const { current, settings: s, today } = p;
  const ctx = current.ctx;
  const mode = one(sp.mode) === "return" ? "return" : "issue";
  const card = one(sp.card).trim().slice(0, 80);
  const copyCode = one(sp.copy).trim().slice(0, 80);
  const reserveId = UUID.test(one(sp.reserve)) ? one(sp.reserve) : null;
  const cancelId = UUID.test(one(sp.cancel)) ? one(sp.cancel) : null;
  const list = (LISTS.find((l) => l.value === one(sp.list))?.value ?? "issued") as ListKey;

  const d = await withSchool(ctx, async (tx) => {
    // The member: a scanned card, a chosen search result, or a name to search.
    let member: Member | null = null;
    let matches: Member[] = [];
    let memberProblem: string | null = null;
    if (one(sp.member)) member = await memberByKey(tx, ctx, s, one(sp.member));
    else if (card) {
      member = await memberByCode(tx, ctx, s, card);
      if (!member) {
        matches = await searchMembers(tx, ctx, s, card, 8, current);
        if (matches.length === 1) [member] = matches;
        else if (!matches.length) memberProblem = `No student or staff member found for “${card}”. Check the card, or search by name.`;
      }
    }
    const load = member ? await memberLoad(tx, member) : null;

    // The copy: a scanned barcode or typed accession number; otherwise a title to search.
    const copy = copyCode ? await copyByCode(tx, copyCode) : null;
    const bookMatches = copyCode && !copy && copyCode.length >= 2
      ? await tx.book.findMany({ where: catalogueWhere({ q: copyCode }), orderBy: { title: "asc" }, take: 6, include: { copies: { where: { status: { in: ["AVAILABLE", "RESERVED", "ISSUED"] } }, select: { id: true, accessionNo: true, status: true }, orderBy: { accessionNo: "asc" } } } })
      : [];

    let issueCheck: { ok: true; due: string; days: number; moved: boolean } | { ok: false; message: string; link?: { href: string; label: string } } | null = null;
    let returnInfo: null | { holder: Member | null; issuedOn: Date; dueOn: Date; late: ReturnType<typeof lateFine>; next: string | null; renewals: number } = null;
    let copyProblem: string | null = null;
    let copyDone: string | null = null;
    if (copyCode && !copy && !bookMatches.length) copyProblem = `No copy or book found for “${copyCode}”. Check the accession number on the label.`;
    if (mode === "issue" && member && copy) {
      try {
        await checkIssue(tx, ctx, s, member, copy);
        const def = await defaultDue(tx, ctx, s, member, copy.book, today);
        issueCheck = { ok: true, due: isoDay(def.due), days: def.days, moved: def.moved };
      } catch (e) {
        if (!(e instanceof LibraryProblem)) throw e;
        // Just issued to this member (the page shows again after Issue with the same copy):
        // say so calmly instead of "already issued, renew it instead" in red.
        const open = await openIssueOf(tx, copy.id);
        const mine = open && open.issuedOn.getTime() === today.getTime() && (member.kind === "STUDENT" ? open.studentId === member.studentId : open.staffId === member.staffId);
        if (mine) copyDone = `“${copy.book.title}” (copy ${copy.accessionNo}) is issued to ${member.name}. Due ${formatDate(open.dueOn, "UTC")}.`;
        else issueCheck = { ok: false, message: e.message, link: e.link };
      }
    }
    if (mode === "return" && copy) {
      const open = await openIssueOf(tx, copy.id);
      // Just returned (the page shows again after Return with the same copy): say so calmly,
      // and who it is kept for, instead of "nothing to return" in red.
      const back = !open ? await tx.bookIssue.findFirst({ where: { copyId: copy.id, returnedOn: today }, select: { id: true } }) : null;
      if (!open && back) {
        const kept = await tx.reservation.findFirst({ where: { copyId: copy.id, status: "READY" }, select: { studentId: true, staffId: true } });
        const keptFor = kept ? await memberByKey(tx, ctx, s, kept.studentId ? `S:${kept.studentId}` : `T:${kept.staffId}`) : null;
        copyDone = `Copy ${copy.accessionNo} (“${copy.book.title}”) was returned today.${keptFor ? ` Keep it at the desk for ${holderWords(keptFor)}.` : ""}`;
      } else if (!open) copyProblem = `Copy ${copy.accessionNo} (“${copy.book.title}”) is not issued to anyone, so there is nothing to return.`;
      else {
        const holder = await memberByKey(tx, ctx, s, open.studentId ? `S:${open.studentId}` : `T:${open.staffId}`);
        const queue = await queueOf(tx, s, copy.bookId);
        const first = queue[0] ? await memberByKey(tx, ctx, s, queue[0].studentId ? `S:${queue[0].studentId}` : `T:${queue[0].staffId}`) : null;
        returnInfo = { holder, issuedOn: open.issuedOn, dueOn: open.dueOn, late: lateFine(s, open.dueOn, today), next: first ? holderWords(first) : null, renewals: open.renewals };
      }
    }
    const reserveBook = reserveId ? await tx.book.findFirst({ where: { id: reserveId, archivedAt: null }, select: { id: true, title: true, authorText: true } }) : null;
    const reserveQueue = reserveBook ? (await queueOf(tx, s, reserveBook.id)).length : 0;

    const counts = await deskCounts(tx, today);
    const rows = await listRows(tx, ctx, s, list, today);
    const resv = await tx.reservation.findMany({ where: { status: { in: ["READY", "WAITING"] } }, orderBy: [{ status: "asc" }, { reservedAt: "asc" }], take: 200 }); // every reservation, as the Reservations number counts them
    const resvMembers = await issueMembers(tx, ctx, s, resv);
    const cancel = cancelId ? resv.find((r) => r.id === cancelId) ?? (await tx.reservation.findFirst({ where: { id: cancelId, status: { in: ["READY", "WAITING"] } } })) : null;
    const history = await historyRows(tx, ctx, s, sp, p);
    return { member, matches, memberProblem, load, copy, bookMatches, issueCheck, returnInfo, copyProblem, copyDone, reserveBook, reserveQueue, counts, rows, resv: await withBookTitles(tx, resv.map((r) => ({ ...r, member: resvMembers.get(r.studentId ? `S:${r.studentId}` : `T:${r.staffId}`) ?? null }))), cancel: cancel ? (await withBookTitles(tx, [cancel]))[0] : null, history };
  });

  const memberKey = d.member?.key ?? null;
  const here = (change: Record<string, string | null>) => addQ(qs(BASE, { mode: mode === "return" ? "return" : null, member: memberKey, list: list === "issued" ? null : list }), change);
  const deskHref = here({});
  const memberStep = qs(BASE, { mode: mode === "return" ? "return" : null, list: list === "issued" ? null : list });

  const stats: StatItem[] = [
    { label: "Issued today", value: d.counts.issued.toLocaleString("en-IN"), href: here({ list: null }), active: list === "issued" },
    { label: "Returned today", value: d.counts.returned.toLocaleString("en-IN"), href: here({ list: "returned" }), active: list === "returned" },
    { label: "Due today", value: d.counts.due.toLocaleString("en-IN"), tone: d.counts.due ? "warn" : undefined, href: here({ list: "due" }), active: list === "due" },
    { label: "Overdue", value: d.counts.overdue.toLocaleString("en-IN"), tone: d.counts.overdue ? "bad" : undefined, href: here({ list: "overdue" }), active: list === "overdue" },
    { label: "Reservations", value: (d.counts.ready + d.counts.waiting).toLocaleString("en-IN"), sub: d.counts.ready ? `${d.counts.ready} ready at the desk` : "waiting for a copy", href: "#reservations" },
  ];

  return (
    <>
      <LibHead pageName="Issue & Return" href={BASE} mode="full" sub="Scan the library card, then the book." />
      <Stack>
        <Stats items={stats} />
        <Split side={380}>
          <Col>
            <Card className="p-4 md:p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <SegLinks label="Desk" value={mode} size="md" options={[
                  { value: "issue", label: "Issue", href: qs(BASE, { member: memberKey, list: list === "issued" ? null : list }) },
                  { value: "return", label: "Return", href: qs(BASE, { mode: "return", member: memberKey, list: list === "issued" ? null : list }) },
                ]} />
                {(d.member || copyCode || card) && <Link href={memberStep} replace scroll={false} className="text-[13.5px] font-semibold text-brand hover:underline"><Words k="Start again" /></Link>}
              </div>

              {mode === "issue" ? (
                <>
                  {/* Step 1: the member */}
                  <Step n={1} title="Member" done={Boolean(d.member)}>
                    {d.member && d.load ? (
                      <MemberPanel m={d.member} load={d.load} today={today} schoolId={ctx.schoolId} changeHref={memberStep} />
                    ) : (
                      <>
                        <ScanBox id="scan-member" href={memberStep} param="card" label="Library card or name" placeholder="Scan the library card, or type a name or number" start={card} autoFocus hint="The library card number is the admission number (students) or the staff code." />
                        {d.memberProblem && <Alert tone="danger">{d.memberProblem}</Alert>}
                        {d.matches.length > 1 && <MemberMatches matches={d.matches} hrefFor={(m) => qs(BASE, { member: m.key, list: list === "issued" ? null : list })} />}
                      </>
                    )}
                  </Step>

                  {/* Step 2: the copy */}
                  <Step n={2} title="Book" done={Boolean(d.issueCheck?.ok)} muted={!d.member}>
                    {d.member ? (
                      <>
                        {!d.copy && (
                          <ScanBox key="copy-issue" id="scan-copy" href={deskHref} param="copy" label="Book barcode or title" placeholder="Scan the book barcode, or type the accession number or title" start={copyCode} autoFocus hint="Only copies on the shelf can be issued." />
                        )}
                        {d.copyProblem && <Alert tone="danger">{d.copyProblem}</Alert>}
                        {d.copyDone && <Alert tone="info">{d.copyDone}</Alert>}
                        {d.bookMatches.length > 0 && !d.copy && <BookMatches rows={d.bookMatches} pickHref={(acc) => here({ copy: acc })} reserveHref={(id) => here({ reserve: id, copy: null })} />}
                        {d.copy && (
                          <div className="flex flex-col gap-3">
                            <CopyLine title={d.copy.book.title} author={d.copy.book.authorText} accession={d.copy.accessionNo} status={d.copy.status} changeHref={here({ copy: null })} />
                            {d.issueCheck && !d.issueCheck.ok && (
                              <Alert tone="danger" action={d.issueCheck.link ? <ButtonLink href={d.issueCheck.link.href} size="sm" variant="secondary" scroll={false}>{d.issueCheck.link.label}</ButtonLink> : undefined}>{d.issueCheck.message}</Alert>
                            )}
                            {d.issueCheck?.ok && d.member && (
                              <IssueForm key={`${d.member.key}-${d.copy.id}`} action={issueAction} memberKey={d.member.key} copyId={d.copy.id} title={d.copy.book.title} defaultDue={d.issueCheck.due} minDue={isoDay(addDays(today, 1))}
                                dueHint={`${plural(d.issueCheck.days, "day")} from Library Settings${d.issueCheck.moved ? ", moved off a holiday" : ""}. A different date needs a reason.`} nextHref={qs(BASE, { member: d.member.key, list: list === "issued" ? null : list })} />
                            )}
                          </div>
                        )}
                      </>
                    ) : <p className="text-[13.5px] text-ink3"><Words k="Choose the member first." /></p>}
                  </Step>

                  {d.reserveBook && d.member && (
                    <div className="rounded-2xl border border-line p-4 flex flex-col gap-3">
                      <p className="text-[14px]"><b className="font-semibold"><Words k="Reserve “" />{d.reserveBook.title}<Words k="” for" /> {d.member.firstName}.</b> <span className="text-ink2">{d.reserveQueue ? `${plural(d.reserveQueue, "member")} already waiting.` : "Nobody is waiting yet."} <Words k="They are told when a copy is back." /></span></p>
                      <div className="flex gap-2 flex-wrap">
                        <ActButton action={reserveAction} fields={{ member: d.member.key, bookId: d.reserveBook.id }} label="Reserve" icon="reserve" variant="primary" size="md" />
                        <ButtonLink href={here({ reserve: null })} variant="ghost" scroll={false} replace><Words k="Not now" /></ButtonLink>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <ScanBox key="copy-return" id="scan-return" href={qs(BASE, { mode: "return", list: list === "issued" ? null : list })} param="copy" label="Book barcode" placeholder="Scan the book barcode, or type the accession number" start={copyCode} autoFocus />
                  {d.copyProblem && <Alert tone="danger">{d.copyProblem}</Alert>}
                  {d.copyDone && <Alert tone="info">{d.copyDone}</Alert>}
                  {d.bookMatches.length > 0 && !d.copy && <Alert tone="info"><Words k="Scan the copy's own barcode or type its accession number to return it. A title is not enough, because each copy is returned on its own." /></Alert>}
                  {d.copy && d.returnInfo && (
                    <div className="flex flex-col gap-3">
                      <CopyLine title={d.copy.book.title} author={d.copy.book.authorText} accession={d.copy.accessionNo} status={d.copy.status} changeHref={qs(BASE, { mode: "return" })} />
                      <div className="rounded-xl bg-sunken/60 px-4 py-3 text-[13.5px] grid grid-cols-2 gap-x-4 gap-y-1">
                        <span className="text-ink3"><Words k="With" /></span><b className="font-semibold text-right truncate">{d.returnInfo.holder ? holderWords(d.returnInfo.holder) : "Unknown"}</b>
                        <span className="text-ink3"><Words k="Issued" /></span><span className="text-right tnum">{day(d.returnInfo.issuedOn)}</span>
                        <span className="text-ink3"><Words k="Due" /></span><span className={cx("text-right tnum", d.returnInfo.late.lateDays > 0 && "text-bad font-semibold")}>{day(d.returnInfo.dueOn)}{d.returnInfo.late.lateDays > 0 ? ` · ${plural(d.returnInfo.late.lateDays, "day")} late` : ""}</span>
                      </div>
                      <ReturnForm key={d.copy.id} action={returnAction} copyId={d.copy.id} title={d.copy.book.title}
                        lateWords={d.returnInfo.late.lateDays > 0 ? `${plural(d.returnInfo.late.lateDays, "day")} late × ${formatRupees(s.finePerDayPaise)}${s.graceDays ? ` (after ${plural(s.graceDays, "day")} of grace)` : ""}` : null}
                        fineWords={d.returnInfo.late.amountPaise > BigInt(0) ? formatRupees(d.returnInfo.late.amountPaise) : null}
                        fineToFees={Boolean(s.finesToFees && d.returnInfo.holder?.kind === "STUDENT")}
                        defaultCharge={String(paiseToRupees(lostDefaultCharge(s, d.copy.book, "DAMAGED")))} approvalAbove={Number(paiseToRupees(s.approvalAbovePaise))}
                        nextInQueue={d.returnInfo.next} againHref={qs(BASE, { mode: "return" })} />
                    </div>
                  )}
                  {!d.copy && d.member && d.load && (
                    <>
                      <MemberPanel m={d.member} load={d.load} today={today} schoolId={ctx.schoolId} changeHref={qs(BASE, { mode: "return" })} returnHref={(acc) => qs(BASE, { mode: "return", member: d.member!.key, copy: acc })} />
                    </>
                  )}
                </>
              )}
            </Card>
          </Col>
          <Col>
            <Reservations rows={d.resv} desk cancelHref={(id) => here({ cancel: id })} today={today} />
          </Col>
        </Split>

        <TodayList list={list} rows={d.rows} counts={d.counts} hrefFor={(l) => here({ list: l === "issued" ? null : l })} today={today} desk />
        <HistoryCard h={d.history} sp={sp} p={p} />
      </Stack>
      {d.cancel && (
        <CancelReservationSheet closeHref={here({ cancel: null })} reservationId={d.cancel.id} words={`“${d.cancel.book.title}”${d.cancel.status === "READY" ? ". The copy kept at the desk goes to the next member in the queue." : "."}`} />
      )}
    </>
  );
}

/* ---------- The leaders' overdue watch ---------- */

async function OverdueWatch({ p, sp }: { p: LibPageData & { mode: string }; sp: Raw }) {
  const { current, settings: s, today, can } = p;
  const ctx = current.ctx;
  const d = await withSchool(ctx, async (tx) => {
    const counts = await deskCounts(tx, today);
    const buckets = await overdueBuckets(tx, today);
    const rows = await listRows(tx, ctx, s, "overdue", today, 40);
    const out = await tx.bookIssue.count({ where: { returnedAt: null } });
    const waitingCharges = await tx.libraryFine.count({ where: { status: "WAITING" } });
    const resv = await tx.reservation.findMany({ where: { status: { in: ["READY", "WAITING"] } }, orderBy: [{ status: "asc" }, { reservedAt: "asc" }], take: 8});
    const resvMembers = await issueMembers(tx, ctx, s, resv);
    const history = await historyRows(tx, ctx, s, sp, p);
    return { counts, buckets, rows, out, waitingCharges, resv: await withBookTitles(tx, resv.map((r) => ({ ...r, member: resvMembers.get(r.studentId ? `S:${r.studentId}` : `T:${r.staffId}`) ?? null }))), history };
  });
  const stats: StatItem[] = [
    { label: "Books out", value: d.out.toLocaleString("en-IN") },
    { label: "Overdue", value: d.counts.overdue.toLocaleString("en-IN"), tone: d.counts.overdue ? "bad" : undefined },
    { label: "Due today", value: d.counts.due.toLocaleString("en-IN") },
    { label: "Issued today", value: d.counts.issued.toLocaleString("en-IN"), sub: `${d.counts.returned.toLocaleString("en-IN")} returned` },
  ];
  return (
    <>
      <LibHead pageName="Issue & Return" href={BASE} mode="view" sub="Overdue books and today's desk work. The librarian issues and returns books." />
      <Stack>
        <Stats items={stats} />
        {d.waitingCharges > 0 && (
          <Alert tone="warning" title={`${plural(d.waitingCharges, "library charge")} waiting for approval`} action={<ButtonLink href="/approvals" size="sm" variant="secondary"><Words k="Open Approvals" /></ButtonLink>}><Words k="Lost or damaged book charges above the set amount wait for approval before they are added." /></Alert>
        )}
        <Split>
          <Col>
            <Card>
              <CardHeader title="Overdue books" icon={AlertTriangle} description={d.counts.overdue ? `${bookWords(d.counts.overdue)} not returned by the due date.` : "Every book out is within its due date."}
                action={can.remind && d.counts.overdue > 0 ? <ActButton action={remindLibrarianAction} fields={{ what: "overdue" }} label="Remind the librarian" icon="bell" /> : undefined} divided />
              <IssueRows rows={d.rows} today={today} empty="No overdue books." />
              {d.counts.overdue > d.rows.length && <p className="px-5 py-3 border-t border-line text-[13px] text-ink3"><Words k="Showing the" /> {d.rows.length} <Words k="longest overdue of" /> {d.counts.overdue.toLocaleString("en-IN")}. <Link className="font-semibold text-brand hover:underline" href={`${BASE}/reports?r=lib-overdue`}><Words k="Open the overdue report" /></Link></p>}
            </Card>
          </Col>
          <Col>
            <Card className="p-5">
              <h2 className="font-semibold text-[15px] mb-3"><Words k="How late" /></h2>
              <HBars labelWidth={92} valueWidth={48} rows={d.buckets.map((b) => ({ key: b.key, label: b.label, value: b.value, text: b.value.toLocaleString("en-IN"), tone: b.key === "30+" ? "bad" as const : "warn" as const }))} />
            </Card>
            <Reservations rows={d.resv} desk={false} cancelHref={() => ""} today={today} />
          </Col>
        </Split>
        <HistoryCard h={d.history} sp={sp} p={p} />
      </Stack>
    </>
  );
}

/* ---------- Pieces ---------- */

function Step({ n, title, done, muted, children }: { n: number; title: string; done?: boolean; muted?: boolean; children: React.ReactNode }) {
  return (
    <section className={cx("flex flex-col gap-2.5", muted && "opacity-70")} aria-label={`Step ${n}: ${title}`}>
      <h2 className="flex items-center gap-2 text-[13px] font-semibold text-ink2">
        <span className={cx("grid place-items-center size-6 rounded-full text-[12px] tnum", done ? "bg-ok text-white" : "bg-brand/10 text-brand")} aria-hidden="true">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function MemberMatches({ matches, hrefFor }: { matches: Member[]; hrefFor: (m: Member) => string }) {
  return (
    <div className="rounded-xl border border-line divide-y divide-line/70" role="list" aria-label="Members found">
      {matches.map((m) => (
        <div key={m.key} role="listitem">
          <ListRow avatar={m.name} title={m.name} sub={`${m.group} · card ${m.cardNo}`} href={hrefFor(m)} right={m.blocked ? <Pill tone="bad"><Words k="Blocked" /></Pill> : !m.active ? <Pill><Words k="Not active" /></Pill> : undefined} />
        </div>
      ))}
    </div>
  );
}

function MemberPanel({ m, load, today, schoolId, changeHref, returnHref }: { m: Member; load: Awaited<ReturnType<typeof memberLoad>>; today: Date; schoolId: string; changeHref: string; returnHref?: (accession: string) => string }) {
  const full = load.out.length >= m.limit;
  const overdue = load.out.filter((i) => i.dueOn.getTime() < today.getTime()).length;
  return (
    <div className="rounded-2xl border border-line p-4 flex flex-col gap-3">
      <div className="flex items-start gap-3">
        <Avatar name={m.name} src={m.photoFileId ? fileLink(m.photoFileId, schoolId) : null} size={52} />
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-[15.5px] truncate">{m.name}</p>
          <p className="text-[13px] text-ink3 truncate">{m.group} <Words k="· card" /> <span className="font-mono">{m.cardNo}</span></p>
          <div className="flex gap-1.5 flex-wrap mt-1.5">
            <Pill tone={full ? "warn" : "neutral"}>{load.out.length} <Words k="of" /> {bookWords(m.limit)}</Pill>
            {overdue > 0 && <Pill tone="bad">{overdue} <Words k="overdue" /></Pill>}
            {load.finesDuePaise > BigInt(0) && <Pill tone="warn">{formatRupees(load.finesDuePaise)} <Words k="fines due" /></Pill>}
            {m.blocked && <Pill tone="bad"><Words k="Blocked" /></Pill>}
            {!m.active && <Pill><Words k="Not active" /></Pill>}
          </div>
        </div>
        <Link href={changeHref} replace scroll={false} className="text-[13px] font-semibold text-brand hover:underline shrink-0"><Words k="Change" /></Link>
      </div>
      {m.blocked && <p className="text-[13px] text-bad"><Words k="Blocked:" /> {m.blocked.reason}</p>}
      {load.out.length > 0 ? (
        <ul className="flex flex-col divide-y divide-line/70 border-t border-line/70" aria-label="Books out">
          {load.out.map((i) => {
            const late = daysBetween(i.dueOn, today);
            return (
              <li key={i.id} className="flex items-center gap-3 py-2.5 flex-wrap">
                <BookOpen size={17} className="text-ink3 shrink-0" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold truncate">{i.copy.book.title}</p>
                  <p className={cx("text-[12.5px] tnum", late > 0 ? "text-bad" : "text-ink3")}><Words k="Copy" /> <span className="font-mono">{i.copy.accessionNo}</span> <Words k="· due" /> {day(i.dueOn)}{late > 0 ? ` · ${plural(late, "day")} late` : late === 0 ? " · today" : ""}{i.renewals ? ` · renewed ${i.renewals}×` : ""}</p>
                </div>
                <div className="flex gap-1.5">
                  {late <= 0 && <ActButton action={renewAction} fields={{ issueId: i.id }} label="Renew" icon="renew" />}
                  {returnHref ? <ButtonLink href={returnHref(i.copy.accessionNo)} size="sm" variant="secondary" icon={CornerDownLeft} replace scroll={false}><Words k="Return" /></ButtonLink>
                    : <ButtonLink href={qs(BASE, { mode: "return", copy: i.copy.accessionNo })} size="sm" variant="ghost" icon={CornerDownLeft} scroll={false}><Words k="Return" /></ButtonLink>}
                </div>
              </li>
            );
          })}
        </ul>
      ) : <p className="text-[13px] text-ink3 border-t border-line/70 pt-2.5"><Words k="No books out." /></p>}
    </div>
  );
}

function CopyLine({ title, author, accession, status, changeHref }: { title: string; author: string | null; accession: string; status: string; changeHref: string }) {
  const st = COPY_STATUS[status as CopyStatus];
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-line p-3.5">
      <span className="grid place-items-center size-11 rounded-xl bg-brand/10 text-brand shrink-0" aria-hidden="true"><BookOpen size={20} /></span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-[15px] leading-snug">{title}</p>
        <p className="text-[13px] text-ink3 truncate">{author ? `${author} · ` : ""}<Words k="copy" /> <span className="font-mono">{accession}</span></p>
        <Pill tone={st.tone} className="mt-1.5">{st.label}</Pill>
      </div>
      <Link href={changeHref} replace scroll={false} className="text-[13px] font-semibold text-brand hover:underline shrink-0"><Words k="Change" /></Link>
    </div>
  );
}

type BookMatch = { id: string; title: string; authorText: string | null; copies: { id: string; accessionNo: string; status: string }[] };
function BookMatches({ rows, pickHref, reserveHref }: { rows: BookMatch[]; pickHref: (accession: string) => string; reserveHref: (bookId: string) => string }) {
  return (
    <div className="rounded-xl border border-line divide-y divide-line/70" role="list" aria-label="Books found">
      {rows.map((b) => {
        const free = b.copies.filter((c) => c.status === "AVAILABLE");
        return (
          <div key={b.id} role="listitem" className="flex items-center gap-3 px-3.5 py-3 flex-wrap">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-[14px] truncate">{b.title}</p>
              <p className="text-[12.5px] text-ink3 truncate">{b.authorText ?? "No author"} · {free.length ? `${plural(free.length, "copy", "copies")} on the shelf` : "no copy on the shelf"}</p>
            </div>
            {free.length ? (
              <ButtonLink href={pickHref(free[0].accessionNo)} size="sm" variant="secondary" replace scroll={false}><Words k="Issue copy" /> {free[0].accessionNo}</ButtonLink>
            ) : b.copies.length ? (
              <ButtonLink href={reserveHref(b.id)} size="sm" variant="ghost" replace scroll={false}><Words k="Reserve" /></ButtonLink>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

type ResvRow = { id: string; status: string; reservedAt: Date; readyAt: Date | null; book: { title: string }; member: Member | null; bookId: string };
function Reservations({ rows, desk, cancelHref, today }: { rows: ResvRow[]; desk: boolean; cancelHref: (id: string) => string; today: Date }) {
  return (
    <Card id="reservations">
      <CardHeader title="Reservations" icon={BookmarkCheck} description={rows.length ? "Ready at the desk first, then the queue." : undefined} divided />
      {rows.length ? (
        <ul className="divide-y divide-line/70">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-[14px] truncate">{r.book.title}</p>
                <p className="text-[12.5px] text-ink3 truncate">{r.member ? holderWords(r.member) : "Member"} · {r.status === "READY" ? `kept since ${day(r.readyAt ?? today)}` : `since ${formatDate(r.reservedAt, "UTC")}`}</p>
              </div>
              {r.status === "READY" ? <Pill tone="ok"><Words k="Ready" /></Pill> : <Pill tone="info"><Words k="Waiting" /></Pill>}
              {desk && r.member && r.status === "READY" && <ButtonLink href={qs(BASE, { member: r.member.key })} size="sm" variant="secondary" scroll={false} aria-label={`Issue to ${r.member.name}`}><Words k="Issue" /></ButtonLink>}
              {desk && <Link href={cancelHref(r.id)} scroll={false} className="text-[12.5px] font-semibold text-ink3 hover:text-bad" aria-label={`Cancel the reservation of ${r.book.title}`}><Words k="Cancel" /></Link>}
            </li>
          ))}
        </ul>
      ) : <Empty icon={BookmarkCheck} title="No reservations" body="Members reserve a book when no copy is on the shelf." />}
    </Card>
  );
}

function IssueRows({ rows, today, empty, desk }: { rows: TodayRow[]; today: Date; empty: string; desk?: boolean }) {
  return (
    <DataList rows={rows} rowKey={(r) => r.id} minWidth={600}
      empty={<Empty icon={CalendarClock} title={empty} />}
      columns={[
        { key: "book", label: "Book", render: (r) => <span className="font-semibold">{r.copy.book.title}</span> },
        { key: "copy", label: "Copy", nowrap: true, render: (r) => <span className="font-mono text-[13px]">{r.copy.accessionNo}</span> },
        { key: "member", label: "Member", render: (r) => (r.member ? holderWords(r.member) : "—") },
        { key: "issued", label: "Issued", nowrap: true, render: (r) => <span className="tnum">{day(r.issuedOn)}</span> },
        { key: "due", label: "Due", nowrap: true, render: (r) => <DueWords dueOn={r.dueOn} returnedOn={r.returnedOn} today={today} /> },
        ...(desk ? [{ key: "act", label: "", render: (r: TodayRow) => (!r.returnedAt && r.dueOn.getTime() < today.getTime() ? <ActButton action={remindAction} fields={{ issueId: r.id }} label="Remind" icon="bell" variant="ghost" /> : null) }] : []),
      ]}
      phone={(r) => ({ title: r.copy.book.title, sub: `${r.member ? holderWords(r.member) : "—"} · ${r.copy.accessionNo}`, right: <DueWords dueOn={r.dueOn} returnedOn={r.returnedOn} today={today} />, icon: BookOpen })}
    />
  );
}

function DueWords({ dueOn, returnedOn, today }: { dueOn: Date; returnedOn: Date | null; today: Date }) {
  if (returnedOn) {
    const late = daysBetween(dueOn, returnedOn);
    return <span className="tnum text-[13px]"><Words k="Returned" /> {day(returnedOn)}{late > 0 ? <span className="text-warn"> · {late}<Words k="d late" /></span> : ""}</span>;
  }
  const late = daysBetween(dueOn, today);
  if (late > 0) return <Pill tone="bad">{plural(late, "day")} <Words k="late" /></Pill>;
  if (late === 0) return <Pill tone="warn"><Words k="Due today" /></Pill>;
  return <span className="tnum text-[13px]">{day(dueOn)}</span>;
}

function TodayList({ list, rows, counts, hrefFor, today, desk }: { list: ListKey; rows: TodayRow[]; counts: Awaited<ReturnType<typeof deskCounts>>; hrefFor: (l: ListKey) => string; today: Date; desk: boolean }) {
  const n: Record<ListKey, number> = { issued: counts.issued, returned: counts.returned, due: counts.due, overdue: counts.overdue };
  return (
    <Card>
      <CardHeader title="Today" icon={ArrowRightLeft} divided
        action={desk && list === "overdue" && counts.overdue > 0 ? <ActButton action={remindAllAction} fields={{}} label="Remind all" icon="bell" pendingText="Sending…" /> : undefined} />
      <div className="px-3 pt-3 overflow-x-auto scroll-thin">
        <SegLinks label="Today's list" value={list} size="sm" options={LISTS.map((l) => ({ value: l.value, label: <>{l.label} <span className="tnum text-ink3">{n[l.value]}</span></>, href: hrefFor(l.value) }))} />
      </div>
      <IssueRows rows={rows} today={today} desk={desk} empty={list === "issued" ? "No books issued yet today." : list === "returned" ? "No books returned yet today." : list === "due" ? "No books due today." : "No overdue books."} />
      {n[list] > rows.length && <p className="px-5 py-3 border-t border-line text-[13px] text-ink3"><Words k="Showing" /> {rows.length} <Words k="of" /> {n[list].toLocaleString("en-IN")}<Words k=". The history below has them all." /></p>}
    </Card>
  );
}

function HistoryCard({ h, sp, p }: { h: HistoryData; sp: Raw; p: LibPageData }) {
  const keep = (change: Record<string, string | null>) => {
    const u = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) { const s = one(v); if (s) u.set(k, s); }
    for (const [k, v] of Object.entries(change)) { if (v) u.set(k, v); else u.delete(k); }
    const s = u.toString();
    return s ? `${BASE}?${s}#history` : `${BASE}#history`;
  };
  const exportHref = qs(`${BASE}/history/export`, { ...h.h.keep, hq: h.q || null, hstatus: h.status || null });
  return (
    <Card id="history">
      <CardHeader title="Issue history" icon={History} description={`${h.total.toLocaleString("en-IN")} issue${h.total === 1 ? "" : "s"} · ${h.h.label}`} divided
        action={p.can.export ? <ExportButton href={exportHref} size="sm" /> : undefined} />
      <Toolbar className="md:flex-wrap">
        <UrlSearch param="hq" placeholder="Search book, copy or member" label="Search the history" className="flex-1 md:min-w-[260px]" id="history-search" />
        <div className="flex gap-2 flex-wrap">
          <UrlSelect param="hstatus" label="Status" options={HISTORY_STATUS.map((s) => ({ value: s.value, label: s.label }))} value={h.status} />
          <PeriodFilter {...p.dates} fallback="month" prefix="h" />
        </div>
      </Toolbar>
      <DataList rows={h.rows} rowKey={(r) => r.id} minWidth={760}
        empty={<Empty icon={Search} title="No issues found" body="Try other dates, or clear the search." />}
        columns={[
          { key: "book", label: "Book", render: (r) => <span className="font-semibold">{r.copy.book.title}</span> },
          { key: "copy", label: "Copy", nowrap: true, render: (r) => <span className="font-mono text-[13px]">{r.copy.accessionNo}</span> },
          { key: "member", label: "Member", render: (r) => (r.member ? <span className="inline-flex items-center gap-1.5"><UserRound size={14} className="text-ink3" aria-hidden="true" />{holderWords(r.member)}</span> : "—") },
          { key: "issued", label: "Issued", nowrap: true, render: (r) => <span className="tnum">{day(r.issuedOn)}</span> },
          { key: "due", label: "Due / returned", nowrap: true, render: (r) => <DueWords dueOn={r.dueOn} returnedOn={r.returnedOn} today={p.today} /> },
          { key: "renew", label: "Renewed", align: "right", render: (r) => (r.renewals ? `${r.renewals}×` : "") },
        ]}
        phone={(r) => ({ title: r.copy.book.title, sub: `${r.member ? holderWords(r.member) : "—"} · issued ${day(r.issuedOn)}`, right: <DueWords dueOn={r.dueOn} returnedOn={r.returnedOn} today={p.today} />, icon: BookOpen })}
      />
      {h.total > 0 && <Pager page={h.page} pageSize={HISTORY_SIZE} total={h.total} prevHref={keep({ hpage: h.page > 2 ? String(h.page - 1) : null })} nextHref={keep({ hpage: String(h.page + 1) })} scroll={false} />}
    </Card>
  );
}
