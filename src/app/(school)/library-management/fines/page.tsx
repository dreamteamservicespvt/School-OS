// Fines & Stock Check (13 §2). Fines: late fines worked out on return, lost
// and damaged charges (large ones wait for approval), where each is paid
// (students' fines are in their fees; staff fines are collected here), and
// waivers with a reason. Stock check: the sessions with copies expected,
// found, missing and extra; start one and scan the shelves.
import Link from "next/link";
import type { Metadata } from "next";
import { ClipboardCheck, Receipt, ScanLine, Search } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime, formatRupees } from "@/lib/format";
import { readListParams, skipTake, listHref, PAGE_SIZE } from "@/lib/list";
import { momentWhere } from "@/lib/periods";
import { canDecide } from "@/lib/approvals";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Chips, SegLinks } from "@/components/ui/blocks";
import { Pager } from "@/components/ui/data-list";
import { ExportButton } from "@/components/ui/export-button";
import { UrlSearch, UrlSelect } from "@/components/ui/url-controls";
import { PeriodFilter } from "@/components/list/period-filter";
import { Stats, Stack, Toolbar, DataList, Empty } from "@/components/money/kit";
import { cx } from "@/components/ui/cx";
import { issueMembers } from "@/lib/library/desk";
import { fineWhere, syncFeeFines } from "@/lib/library/fines";
import { salaryModuleOn, salaryWords } from "@/lib/library/salary";
import { openSession } from "@/lib/library/stock";
import { FINE_REASON, FINE_STATUS, paiseToRupees, plural, type FineReason, type FineStatus } from "@/lib/library/words";
import { LibHead } from "../_components/head";
import { ActButton } from "../_components/client";
import { CollectSheet, CorrectSheet, RejectChargeSheet, StartStockSheet, StopSalarySheet, ToSalarySheet, WaiveSheet } from "../_components/sheets";
import { BASE, libGuard, libPeriod, one, qs, UUID, type SearchParams } from "../_lib/page";
import { finesWhere, readFinesFilter, FINE_TABS } from "../_lib/fines";
import { decideChargeAction, remindLibrarianAction } from "../actions";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: await pageTitle("Fines & Stock Check · Library Management") };
}
const ZERO = BigInt(0);

export default async function FinesPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const p = await libGuard("fines");
  return one(sp.view) === "stock" ? <StockView p={p} sp={sp} /> : <FinesView p={p} sp={sp} />;
}

type P = Awaited<ReturnType<typeof libGuard>>;
type Raw = Record<string, string | string[] | undefined>;

function Tabs({ view }: { view: "fines" | "stock" }) {
  return <SegLinks label="Fines or stock check" value={view} options={[{ value: "fines", label: "Fines", href: `${BASE}/fines` }, { value: "stock", label: "Stock check", href: `${BASE}/fines?view=stock` }]} />;
}

async function FinesView({ p, sp }: { p: P; sp: Raw }) {
  const { current, settings: s, can, tz } = p;
  const params = readListParams(sp, ["status", "reason", "period", "from", "to"]);
  const per = libPeriod(sp, p.dates, null);
  const f = readFinesFilter((k) => one(sp[k]), per.range);
  const pick = (k: string) => (UUID.test(one(sp[k])) ? one(sp[k]) : null);
  const highlight = pick("fine");

  const d = await withSchool(current.ctx, async (tx) => {
    // Fines added to fees are paid in Fee Management: bring their status up to date first.
    await syncFeeFines(tx, current.ctx);
    const where = await finesWhere(tx, f, tz);
    const periodWhere = per.range ? { createdAt: momentWhere(per.range, tz) } : {};
    const [total, rows, due, waiting, paid, waived, byStatus] = await Promise.all([
      tx.libraryFine.count({ where }),
      tx.libraryFine.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "asc" }], ...skipTake(params) }),
      tx.libraryFine.aggregate({ where: { status: "DUE", ...periodWhere }, _sum: { amountPaise: true }, _count: { _all: true } }),
      tx.libraryFine.aggregate({ where: { status: "WAITING", ...periodWhere }, _sum: { amountPaise: true }, _count: { _all: true } }),
      tx.libraryFine.aggregate({ where: { status: "PAID", ...periodWhere }, _sum: { amountPaise: true } }),
      tx.libraryFine.aggregate({ where: { status: "WAIVED", ...periodWhere }, _sum: { amountPaise: true } }),
      tx.libraryFine.groupBy({ by: ["status"], where: { ...periodWhere }, _count: { _all: true } }),
    ]);
    const shown = highlight && !rows.some((r) => r.id === highlight) ? await tx.libraryFine.findFirst({ where: { id: highlight } }) : null;
    const all = shown ? [shown, ...rows] : rows;
    const [members, books, copies, approvals, runs] = await Promise.all([
      issueMembers(tx, current.ctx, s, all),
      tx.book.findMany({ where: { id: { in: [...new Set(all.map((r) => r.bookId))] } }, select: { id: true, title: true } }),
      tx.bookCopy.findMany({ where: { id: { in: [...new Set(all.map((r) => r.copyId))] } }, select: { id: true, accessionNo: true } }),
      tx.approval.findMany({ where: { id: { in: all.map((r) => r.approvalId).filter((x): x is string => Boolean(x)) } } }),
      tx.payrollRun.findMany({ where: { id: { in: all.map((r) => r.runId).filter((x): x is string => Boolean(x)) } }, select: { id: true, month: true, status: true } }),
    ]);
    const deciders = new Set<string>();
    for (const a of approvals) if (await canDecide(tx, current.ctx, a)) deciders.add(a.id);
    return { total, rows: all, due, waiting, paid, waived, byStatus, members, books: new Map(books.map((b) => [b.id, b.title])), copies: new Map(copies.map((c) => [c.id, c.accessionNo])), deciders, runs: new Map(runs.map((r) => [r.id, r])), extra: Boolean(shown) };
  });

  type Row = (typeof d.rows)[number];
  const who = (r: Row) => d.members.get(r.studentId ? `S:${r.studentId}` : `T:${r.staffId}`) ?? null;
  const words = (r: Row) => `${formatRupees(r.amountPaise)} · ${FINE_REASON[r.reason as FineReason]} · “${d.books.get(r.bookId) ?? "Book"}”${who(r) ? ` · ${who(r)!.name}` : ""}`;
  const base = `${BASE}/fines`;
  const href = (change: Record<string, string | number | null>) => listHref(base, params, { page: null, ...change });
  const sheetFine = (k: string) => { const id = pick(k); return id ? d.rows.find((r) => r.id === id) ?? null : null; };
  const waive = can.fines ? sheetFine("waive") : null;
  const collect = can.fines ? sheetFine("collect") : null;
  const correct = can.fines ? sheetFine("correct") : null;
  const reject = sheetFine("reject");
  // A staff member's fine can go to their next salary (Salary Management) instead of the desk.
  const salaryOn = salaryModuleOn(current.modulesOn);
  const mayGoToSalary = (r: Row) => can.fines && salaryOn && r.status === "DUE" && Boolean(r.staffId) && !r.feeDueId && !r.salaryAt;
  const salaryWhere = (r: Row) => salaryWords(r.runId ? d.runs.get(r.runId) ?? null : null);
  const toSalary = (() => { const r = sheetFine("salary"); return r && mayGoToSalary(r) ? r : null; })();
  const stopSalary = (() => { const r = can.fines ? sheetFine("desk") : null; return r && r.status === "DUE" && r.salaryAt ? r : null; })();
  const count = (st: string) => d.byStatus.find((x) => x.status === st)?._count._all ?? 0;
  const exportHref = qs(`${base}/export`, { status: f.status || null, reason: f.reason || null, q: f.q || null, ...per.keep });

  const acts = (r: Row) => {
    const bits: React.ReactNode[] = [];
    if (r.status === "WAITING" && r.approvalId && d.deciders.has(r.approvalId)) {
      bits.push(<ActButton key="ok" action={decideChargeAction} fields={{ fineId: r.id, decision: "approve" }} label="Approve" icon="check" variant="primary" />);
      bits.push(<Link key="no" href={href({ reject: r.id })} scroll={false} className="text-[13px] font-semibold text-bad hover:underline"><Words k="Do not approve" /></Link>);
    }
    if (can.fines && r.status === "DUE" && !r.feeDueId && !r.salaryAt) bits.push(<Link key="c" href={href({ collect: r.id })} scroll={false} className="text-[13px] font-semibold text-brand hover:underline"><Words k="Collect" /></Link>);
    if (mayGoToSalary(r)) bits.push(<Link key="s" href={href({ salary: r.id })} scroll={false} className="text-[13px] font-semibold text-brand hover:underline"><Words k="From salary" /></Link>);
    if (can.fines && r.status === "DUE" && r.salaryAt) bits.push(<Link key="d" href={href({ desk: r.id })} scroll={false} className="text-[13px] font-semibold text-brand hover:underline"><Words k="Collect here instead" /></Link>);
    if (can.fines && r.status === "DUE") bits.push(<Link key="w" href={href({ waive: r.id })} scroll={false} className="text-[13px] font-semibold text-ink2 hover:underline"><Words k="Waive" /></Link>);
    if (can.fines && r.status === "NOT_APPROVED") bits.push(<Link key="f" href={href({ correct: r.id })} scroll={false} className="text-[13px] font-semibold text-brand hover:underline"><Words k="Correct the amount" /></Link>);
    return bits.length ? <span className="flex items-center gap-3 justify-end flex-wrap">{bits}</span> : null;
  };

  const leaderActions = can.remind && d.due._count._all > 0 ? <ActButton action={remindLibrarianAction} fields={{ what: "fines" }} label="Remind the librarian" icon="bell" /> : undefined;

  return (
    <>
      <LibHead pageName="Fines & Stock Check" href={base} mode={p.mode} actions={leaderActions} />
      <Stack>
        <Tabs view="fines" />
        <Stats items={[
          { label: "Due", value: formatRupees(d.due._sum.amountPaise ?? ZERO), sub: plural(d.due._count._all, "fine"), tone: d.due._count._all ? "warn" : undefined, href: href({ status: null }), active: f.status === "" },
          { label: "Waiting approval", value: formatRupees(d.waiting._sum.amountPaise ?? ZERO), sub: plural(d.waiting._count._all, "charge"), href: href({ status: "WAITING" }), active: f.status === "WAITING" },
          { label: "Collected", value: formatRupees(d.paid._sum.amountPaise ?? ZERO), sub: per.label, tone: "ok", href: href({ status: "PAID" }), active: f.status === "PAID" },
          { label: "Waived", value: formatRupees(d.waived._sum.amountPaise ?? ZERO), sub: per.label, href: href({ status: "WAIVED" }), active: f.status === "WAIVED" },
        ]} />
        <Chips label="Fine status" value={f.status} options={FINE_TABS.map((t) => ({ value: t.value, label: t.label, count: t.value === "" ? count("DUE") : t.value === "all" ? null : count(t.value), href: href({ status: t.value || null }) }))} />
        <Card>
          <Toolbar className="md:flex-wrap">
            <UrlSearch placeholder="Search member, book or fine number" label="Search fines" className="flex-1 md:min-w-[260px]" id="fines-search" />
            <div className="flex gap-2 flex-wrap">
              <UrlSelect param="reason" label="Reason" options={[{ value: "", label: "All reasons" }, { value: "LATE", label: "Late" }, { value: "LOST", label: "Lost" }, { value: "DAMAGED", label: "Damaged" }]} />
              <PeriodFilter {...p.dates} />
              {can.export && <ExportButton href={exportHref} />}
            </div>
          </Toolbar>
          <DataList rows={d.rows} rowKey={(r) => r.id} minWidth={980} caption="Library fines"
            rowClass={(r) => r.id === highlight && "bg-brand/5"}
            empty={<Empty icon={f.q ? Search : Receipt} title={f.status === "" ? "No fines due" : "No fines match"} body={f.q || per.range ? "Try other dates, or clear the search." : undefined} />}
            columns={[
              { key: "no", label: "Fine", nowrap: true, render: (r) => <span className="font-mono text-[13px]">{r.fineNo}</span> },
              { key: "member", label: "Member", render: (r) => (who(r) ? <span><b className="font-semibold">{who(r)!.name}</b><span className="block text-[12.5px] text-ink3">{who(r)!.group}</span></span> : "—") },
              { key: "book", label: "Book", render: (r) => <span>{d.books.get(r.bookId) ?? "Book"}<span className="block text-[12.5px] text-ink3 font-mono">{d.copies.get(r.copyId) ?? ""}</span></span> },
              { key: "reason", label: "Reason", render: (r) => <span>{FINE_REASON[r.reason as FineReason]}{r.lateDays ? <span className="text-ink3"> · {r.lateDays}d</span> : ""}</span> },
              { key: "amount", label: "Amount", align: "right", nowrap: true, render: (r) => <b className="font-semibold">{formatRupees(r.amountPaise)}</b> },
              { key: "status", label: "Status", render: (r) => { const st = FINE_STATUS[r.status as FineStatus]; return <span><Pill tone={st.tone}>{st.label}</Pill><span className="block text-[12px] text-ink3 mt-0.5">{r.status === "WAIVED" ? r.waiveReason : r.status === "DUE" && r.salaryAt ? salaryWhere(r) : fineWhere(r, tz)}</span></span>; } },
              { key: "date", label: "Date", nowrap: true, render: (r) => formatDate(r.createdAt, tz) },
              { key: "act", label: "", render: acts },
            ]}
            phone={(r) => {
              const st = FINE_STATUS[r.status as FineStatus];
              return { title: who(r)?.name ?? "Member", sub: `${FINE_REASON[r.reason as FineReason]} · ${d.books.get(r.bookId) ?? "Book"} · ${formatDate(r.createdAt, tz)}`, icon: Receipt, iconTone: st.tone,
                right: <span className="flex flex-col items-end gap-1"><b className="font-semibold tnum">{formatRupees(r.amountPaise)}</b><Pill tone={st.tone}>{st.label}</Pill></span>,
                pills: acts(r) ?? undefined };
            }}
          />
          {d.total > 0 && <Pager page={params.page} pageSize={PAGE_SIZE} total={d.total} prevHref={listHref(base, params, { page: params.page > 2 ? params.page - 1 : null })} nextHref={listHref(base, params, { page: params.page + 1 })} />}
        </Card>
        <p className="text-[12.5px] text-ink3"><Words k="Fine rate:" /> {formatRupees(s.finePerDayPaise)} <Words k="a day after" /> {plural(s.graceDays, "day")} <Words k="of grace, at most" /> {formatRupees(s.maxFinePaise)} <Words k="a book. Charges above" /> {formatRupees(s.approvalAbovePaise)} <Words k="need approval." /> {s.finesToFees ? "Students' fines are added to their fees." : "Fines are collected at the library desk."}</p>
      </Stack>
      {waive && <WaiveSheet closeHref={href({ waive: null })} fineId={waive.id} words={words(waive)} inFees={Boolean(waive.feeDueId)} inSalary={Boolean(waive.salaryAt)} />}
      {collect && !collect.salaryAt && <CollectSheet closeHref={href({ collect: null })} fineId={collect.id} words={words(collect)} />}
      {toSalary && <ToSalarySheet closeHref={href({ salary: null })} fineId={toSalary.id} words={words(toSalary)} name={who(toSalary)?.name ?? "The staff member"} />}
      {stopSalary && <StopSalarySheet closeHref={href({ desk: null })} fineId={stopSalary.id} words={words(stopSalary)} where={salaryWhere(stopSalary)} />}
      {correct && <CorrectSheet closeHref={href({ correct: null })} fineId={correct.id} words={words(correct)} amount={String(paiseToRupees(correct.amountPaise))} />}
      {reject && reject.approvalId && d.deciders.has(reject.approvalId) && <RejectChargeSheet closeHref={href({ reject: null })} fineId={reject.id} words={words(reject)} />}
    </>
  );
}

async function StockView({ p, sp }: { p: P; sp: Raw }) {
  const { current, can, tz } = p;
  const per = libPeriod(sp, p.dates, null);
  const d = await withSchool(current.ctx, async (tx) => {
    const [sessions, open] = await Promise.all([
      tx.stockCheckSession.findMany({ where: per.range ? { startedAt: momentWhere(per.range, tz) } : {}, orderBy: { startedAt: "desc" }, take: 50, include: { _count: { select: { scans: true } } } }),
      openSession(tx),
    ]);
    return { sessions, open };
  });
  const base = `${BASE}/fines`;
  const starting = one(sp.open) === "stock" && can.fines && !d.open;
  const exportHref = qs(`${base}/export`, { view: "stock", ...per.keep });
  const year = new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: tz }).format(new Date());
  return (
    <>
      <LibHead pageName="Fines & Stock Check" href={base} mode={p.mode}
        actions={can.fines ? (d.open ? <ButtonLink href={`${base}/stock/${d.open.id}`} variant="primary" icon={ScanLine}><Words k="Continue scanning" /></ButtonLink> : <ButtonLink href={`${base}?view=stock&open=stock`} variant="primary" icon={ClipboardCheck} scroll={false}><Words k="Start stock check" /></ButtonLink>) : undefined} />
      <Stack>
        <Tabs view="stock" />
        {d.open && (
          <div className="flex items-center gap-3 rounded-2xl bg-brand/10 px-4 py-3 text-[14px] flex-wrap">
            <ScanLine size={18} className="text-brand shrink-0" aria-hidden="true" />
            <span className="flex-1 min-w-0"><b className="font-semibold">{d.open.name}</b> <Words k="is open since" /> {formatDateTime(d.open.startedAt, tz)}.</span>
            <ButtonLink href={`${base}/stock/${d.open.id}`} size="sm" variant="secondary">{can.fines ? "Continue" : "Open"}</ButtonLink>
          </div>
        )}
        <Card>
          <CardHeader title="Stock check sessions" icon={ClipboardCheck} description="Copies expected on the shelves, found, missing and extra." divided
            action={<div className="flex gap-2"><PeriodFilter {...p.dates} size="sm" />{can.export && <ExportButton href={exportHref} size="sm" />}</div>} />
          <DataList rows={d.sessions} rowKey={(x) => x.id} rowHref={(x) => `${base}/stock/${x.id}`} minWidth={720}
            empty={<Empty icon={ClipboardCheck} title="No stock checks" body={can.fines ? "Start one to scan every copy on the shelves." : "The librarian runs the stock check."} />}
            columns={[
              { key: "name", label: "Stock check", render: (x) => <b className="font-semibold">{x.name}</b> },
              { key: "date", label: "Date", nowrap: true, render: (x) => formatDate(x.startedAt, tz) },
              { key: "exp", label: "Expected", align: "right", render: (x) => x.expected ?? "—" },
              { key: "found", label: "Found", align: "right", render: (x) => (x.found ?? (x.status === "OPEN" ? `${x._count.scans} scanned` : "—")) },
              { key: "missing", label: "Missing", align: "right", render: (x) => (x.missing != null ? <span className={cx(x.missing ? "text-bad font-semibold" : "")}>{x.missing}</span> : "—") },
              { key: "extra", label: "Extra", align: "right", render: (x) => x.extra ?? "—" },
              { key: "status", label: "Status", render: (x) => (x.status === "OPEN" ? <Pill tone="info"><Words k="Open" /></Pill> : x.lostMarkedAt ? <Pill tone="ok"><Words k="Closed, missing marked lost" /></Pill> : <Pill><Words k="Closed" /></Pill>) },
            ]}
            phone={(x) => ({ title: x.name, sub: `${formatDate(x.startedAt, tz)}${x.status === "OPEN" ? ` · ${x._count.scans} scanned` : ` · ${x.found ?? 0} found, ${x.missing ?? 0} missing`}`, icon: ClipboardCheck, right: x.status === "OPEN" ? <Pill tone="info"><Words k="Open" /></Pill> : <Pill><Words k="Closed" /></Pill> })}
          />
        </Card>
      </Stack>
      {starting && <StartStockSheet closeHref={`${base}?view=stock`} suggested={`Stock check ${year}`} />}
    </>
  );
}
