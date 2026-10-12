import Link from "next/link";
import { ArrowDownToLine, ArrowRightLeft, ArrowUpFromLine, Banknote, CalendarRange, Flag, Hourglass, Inbox, Landmark, Plus, Printer, ShieldCheck } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime, formatRupees, formatTime } from "@/lib/format";
import { accountBalances, accountBook } from "@/lib/finance/daybook";
import { sectionLabel } from "@/lib/finance/words";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Banner, Col, DataList, Empty, Mini, Split, Stack, Stats } from "@/components/ui/kit";
import { UrlSheet } from "@/components/ui/url-sheet";
import { ExportButton } from "@/components/ui/export-button";
import { PeriodFilter } from "@/components/list/period-filter";
import { cx } from "@/components/ui/cx";
import { FinanceHead } from "../_components/finance-head";
import { Line, Ref } from "../_components/bits";
import { ReasonSheet } from "../_components/forms";
import { BASE, financePage, financePeriod, one, qs, type SearchParams } from "../_lib/page";
import { cancelTransferAction } from "./actions";
import { AddAccountSheet, MoveMoneySheet, OpeningSheet } from "./sheets";

export const metadata = { title: "Cash & Bank" };

const HREF = `${BASE}/cash-bank`;
const UUID = /^[0-9a-f-]{36}$/i;
const ZERO = BigInt(0);
const rupees = (p: bigint) => Number(p / BigInt(100));
const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Cash & Bank (07 §2, mod-finance.jsx CashBankPage): cash book and bank books with opening and closing balance. */
export default async function CashBankPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await financePage();
  const sp = await searchParams;
  const ctx = p.current.ctx;
  const per = financePeriod(sp, p.dates, "today");
  const from = per.from ?? p.today;
  const to = per.to ?? p.today;
  const oneDay = from.getTime() === to.getTime();
  const doing = one(sp.do);
  const moving = p.can.create && doing === "move";
  const adding = p.can.create && doing === "account";
  const opening = p.can.edit && doing === "opening";
  const transferId = UUID.test(one(sp.t)) ? one(sp.t) : "";
  const cancelling = p.can.archive && one(sp.cancel) === "1";

  const data = await withSchool(ctx, async (tx) => {
    const accounts = await tx.bankAccount.findMany({ where: { archivedAt: null }, orderBy: [{ kind: "asc" }, { isMain: "desc" }, { name: "asc" }] });
    const cash = accounts.find((a) => a.kind === "CASH") ?? accounts[0];
    const bookId = accounts.some((a) => a.id === one(sp.book)) ? one(sp.book) : cash?.id;
    const [balances, book, cashToday, depositedToday, onWay, waiting, openings, years, transfer] = await Promise.all([
      accountBalances(tx, ctx),
      bookId ? accountBook(tx, bookId, from, to) : null,
      cash ? accountBook(tx, cash.id, p.today, p.today) : null,
      cash ? tx.cashTransfer.count({ where: { fromAccountId: cash.id, date: p.today, cancelledAt: null } }) : 0,
      tx.payment.groupBy({ by: ["mode"], where: { status: "POSTED", paymentDate: p.today, mode: { in: ["GATEWAY", "CARD"] } }, _sum: { amountPaise: true }, _count: { _all: true } }),
      tx.payment.aggregate({ where: { status: "WAITING" }, _sum: { amountPaise: true }, _count: { _all: true } }),
      tx.openingBalance.findMany({ where: { kind: { in: ["CASH", "BANK"] }, archivedAt: null }, orderBy: { date: "asc" } }),
      tx.financialYear.findMany({ where: { archivedAt: null }, orderBy: { startDate: "desc" }, take: 3 }),
      transferId ? tx.cashTransfer.findFirst({ where: { id: transferId } }) : null,
    ]);
    const approvers = openings.some((o) => o.approvalId) ? await tx.approval.findMany({ where: { id: { in: openings.map((o) => o.approvalId).filter((x): x is string => Boolean(x)) } }, select: { id: true, status: true } }) : [];
    return { accounts, cash, bookId, balances, book, cashToday, depositedToday, onWay, waiting, openings, years, transfer, approvers };
  });

  const keep = { ...per.keep, book: data.bookId && data.bookId !== data.cash?.id ? data.bookId : null };
  const here = (extra: Record<string, string | null> = {}) => qs(HREF, { ...keep, ...extra });
  const acct = data.accounts.find((a) => a.id === data.bookId);
  const isCash = acct?.kind === "CASH";
  const name = (id: string) => data.accounts.find((a) => a.id === id)?.name ?? "Account";
  const sub4 = (a: (typeof data.accounts)[number]) => (a.kind === "CASH" ? "Office cash box" : [a.bankName, a.accountLast4 ? `••${a.accountLast4}` : null].filter(Boolean).join(" · ") || "Bank account");
  const online = data.onWay.find((x) => x.mode === "GATEWAY");
  const card = data.onWay.find((x) => x.mode === "CARD");
  const wayTotal = (online?._sum.amountPaise ?? ZERO) + (card?._sum.amountPaise ?? ZERO);
  const wayCount = (online?._count._all ?? 0) + (card?._count._all ?? 0);
  const cashBefore = data.cashToday?.opening ?? ZERO;
  const goLive = data.openings[0]?.date ?? null;
  const pending = new Set(data.approvers.filter((a) => a.status === "WAITING" || a.status === "ESCALATED").map((a) => a.id));
  const lines = data.book?.lines ?? [];
  const today = iso(p.today);
  const dayLabel = oneDay ? (from.getTime() === p.today.getTime() ? `Today · ${formatDate(from)}` : formatDate(from)) : `${formatDate(from)} to ${formatDate(to)}`;
  const accountChoices = data.accounts.map((a) => ({ value: a.id, label: a.name, balance: rupees(data.balances.get(a.id) ?? ZERO) }));
  const firstBank = data.accounts.find((a) => a.kind === "BANK" && a.isMain) ?? data.accounts.find((a) => a.kind === "BANK");
  const dayBookHref = (id: string, d: Date) => qs(`${BASE}/day-book`, { period: "custom", from: iso(d), to: iso(d), e: id });
  const t = data.transfer;

  return (
    <div>
      <FinanceHead pageName="Cash & Bank" href={HREF} sub={`Cash book and bank book, with opening and closing balance · financial year ${p.fy.name}`}
        actions={p.can.create ? <>
          <ButtonLink href={here({ do: "account" })} scroll={false} variant="secondary" icon={Plus}>Add bank account</ButtonLink>
          <ButtonLink href={here({ do: "move" })} scroll={false} variant="primary" icon={ArrowRightLeft}>Move money</ButtonLink>
        </> : null} />
      <Stack>
        <Stats items={[
          ...data.accounts.slice(0, 5).map((a) => ({ label: a.name, value: formatRupees(data.balances.get(a.id) ?? ZERO), sub: sub4(a), icon: a.kind === "CASH" ? Banknote : Landmark, href: qs(HREF, { ...per.keep, book: a.kind === "CASH" ? null : a.id }), active: a.id === data.bookId })),
          { label: "On the way", value: formatRupees(wayTotal), sub: wayCount ? `${wayCount} online and card ${wayCount === 1 ? "payment" : "payments"} today` : "No online or card payments today", icon: Hourglass, tone: "info" as const },
        ].slice(0, 6)} />

        {cashBefore > ZERO && data.depositedToday === 0 && p.can.create && data.cash && (
          <Banner tone="info" title={`Cash in the box from before today: ${formatRupees(cashBefore)}.`}
            action={<Link href={here({ do: "move" })} scroll={false} className={buttonClass("secondary", "sm")}><ArrowRightLeft size={15} aria-hidden="true" />Record deposit</Link>}>
            When the money is in the bank, record it here so both books stay right.
          </Banner>
        )}

        <Split>
          <Card className="overflow-hidden">
            <CardHeader title={isCash ? "Cash book" : `Bank book · ${acct?.name ?? ""}`} description={dayLabel} icon={isCash ? Banknote : Landmark}
              action={<div className="flex gap-1.5">
                {p.can.export && <ExportButton href={qs(`${HREF}/export`, { ...keep, book: data.bookId ?? null })} size="sm" />}
                {p.can.export && <a href={qs(`${HREF}/export`, { ...keep, book: data.bookId ?? null, format: "pdf" })} target="_blank" rel="noreferrer" className={cx(buttonClass("ghost", "sm"), "hidden sm:inline-flex")}><Printer size={15} aria-hidden="true" />Print</a>}
              </div>} />
            <div className="px-3 pb-3 flex flex-col md:flex-row gap-2.5">
              <nav aria-label="Books" className="overflow-x-auto no-scrollbar">
                <div className="inline-flex w-max rounded-xl bg-sunken p-1 gap-1">
                  {data.accounts.map((a) => (
                    <Link key={a.id} href={qs(HREF, { ...per.keep, book: a.kind === "CASH" ? null : a.id })} scroll={false} aria-current={a.id === data.bookId ? "page" : undefined}
                      className={cx("h-8 px-3 rounded-lg text-[13px] font-semibold inline-flex items-center whitespace-nowrap transition", a.id === data.bookId ? "bg-surface text-ink shadow-sm" : "text-ink2 hover:text-ink")}>
                      {a.kind === "CASH" ? "Cash book" : a.name}
                    </Link>
                  ))}
                </div>
              </nav>
              <div className="md:ml-auto"><PeriodFilter {...p.dates} fallback="today" /></div>
            </div>
            <div className="grid grid-cols-2 xl:grid-cols-4 gap-px bg-line/70 border-y border-line/70">
              {([["Opening balance", data.book?.opening ?? ZERO, ""], ["Receipts", data.book?.receipts ?? ZERO, "text-ok"], ["Payments", data.book?.payments ?? ZERO, "text-bad"], ["Closing balance", data.book?.closing ?? ZERO, "text-brand"]] as const).map(([k, v, c]) => (
                <div key={k} className="bg-surface px-4 md:px-5 py-3"><p className="text-[12px] text-ink3 font-semibold">{k}</p><p className={cx("font-display font-semibold text-[19px] tnum", c)}>{v < ZERO ? `−${formatRupees(-v)}` : formatRupees(v)}</p></div>
              ))}
            </div>
            <DataList rows={lines} rowKey={(r) => r.id} minWidth={760} caption={isCash ? "Cash book" : "Bank book"}
              rowHref={(r) => (r.sourceType === "transfer" ? here({ t: r.sourceId }) : dayBookHref(r.id, r.date))}
              footer={to.getTime() < p.today.getTime() ? `Closing ${formatRupees(data.book?.closing ?? ZERO)} is the opening balance of the next day` : `${lines.length} ${lines.length === 1 ? "entry" : "entries"} · closing is live`}
              columns={[
                { key: "t", label: oneDay ? "Time" : "Date", nowrap: true, render: (r) => <span className="tnum text-ink2">{oneDay ? formatTime(r.postedAt, p.tz) : formatDate(r.date)}</span> },
                { key: "what", label: "Details", render: (r) => <><p className="text-[13.5px] leading-snug">{r.partyName}{r.headName && r.headName !== r.partyName ? ` · ${r.headName}` : ""}</p><p className="text-[12px] text-ink3">{sectionLabel(r.section)}</p></> },
                { key: "ref", label: "Reference", render: (r) => <Ref v={r.reference} /> },
                { key: "inn", label: "Receipts", align: "right", render: (r) => (r.direction === "IN" ? <span className="text-ok font-semibold">{formatRupees(r.amountPaise)}</span> : "") },
                { key: "out", label: "Payments", align: "right", render: (r) => (r.direction === "OUT" ? <span className="text-bad font-semibold">{formatRupees(r.amountPaise)}</span> : "") },
                { key: "bal", label: "Balance", align: "right", render: (r) => <b className="font-semibold">{r.balance < ZERO ? `−${formatRupees(-r.balance)}` : formatRupees(r.balance)}</b> },
              ]}
              phone={(r) => ({
                title: r.partyName, sub: `${oneDay ? formatTime(r.postedAt, p.tz) : formatDate(r.date)} · ${sectionLabel(r.section)}`, icon: r.direction === "IN" ? ArrowDownToLine : ArrowUpFromLine, iconTone: r.direction === "IN" ? "ok" : "bad",
                right: <><p className={cx("font-semibold tnum text-[14.5px]", r.direction === "IN" ? "text-ok" : "text-bad")}>{r.direction === "IN" ? "+" : "−"}{formatRupees(r.amountPaise)}</p><p className="text-[12px] text-ink3 tnum">{formatRupees(r.balance < ZERO ? -r.balance : r.balance)}</p></>,
              })}
              empty={<Empty icon={Inbox} title={`No entries in this book ${oneDay ? "on this day" : "in these dates"}`} body={`Opening and closing are both ${formatRupees(data.book?.opening ?? ZERO)}.`} />} />
          </Card>
          <Col>
            <Card>
              <CardHeader title="Money on the way" description="Counted in the Day Book, not yet in the bank" icon={Hourglass} />
              <ul className="px-5 pb-4">
                <Line k={`Online (Razorpay) · ${online?._count._all ?? 0} ${online?._count._all === 1 ? "payment" : "payments"}`} v={formatRupees(online?._sum.amountPaise ?? ZERO)} />
                <Line k={`Card · ${card?._count._all ?? 0} ${card?._count._all === 1 ? "payment" : "payments"}`} v={formatRupees(card?._sum.amountPaise ?? ZERO)} />
                <Line k={`Waiting for verification · ${data.waiting._count._all}`} v={formatRupees(data.waiting._sum.amountPaise ?? ZERO)} tone={data.waiting._count._all ? "warn" : undefined} />
              </ul>
              <p className="px-5 pb-4 -mt-1 text-[12.5px] text-ink3">Razorpay settles into the bank the next working day, less its charges. Payments waiting for verification are not counted until a person checks them.</p>
            </Card>
            <Card>
              <CardHeader title="Opening balances" description={goLive ? `Set at go-live, ${formatDate(goLive)}` : "Not set yet"} icon={Flag}
                action={p.can.edit ? <ButtonLink href={here({ do: "opening" })} scroll={false} size="sm" variant="ghost">{data.openings.length ? "Change" : "Set"}</ButtonLink> : undefined} />
              <ul className="px-5 pb-3">
                {data.accounts.map((a) => {
                  const ob = data.openings.find((o) => o.accountId === a.id);
                  return <Line key={a.id} k={a.name} v={ob ? <>{formatRupees(ob.amountPaise)}{ob.approvalId && pending.has(ob.approvalId) && ob.pendingPaise !== null && <span className="block text-[12px] text-warn font-semibold">→ {formatRupees(ob.pendingPaise)} waiting</span>}</> : <span className="text-ink3 font-normal">Not set</span>} />;
                })}
              </ul>
              <p className="px-5 pb-4 text-[12.5px] text-ink3 flex gap-1.5"><ShieldCheck size={14} className="shrink-0 mt-0.5" aria-hidden="true" />Set once. A change later needs approval, and every book from the opening date follows it.</p>
            </Card>
            <Card>
              <CardHeader title="Financial year" icon={CalendarRange} />
              <ul className="px-5 pb-4">
                {data.years.map((y) => <Line key={y.id} k={y.name.replace("-", "–")} v={y.status === "CLOSED" ? <Pill tone="neutral">Closed{y.closedAt ? ` ${formatDate(y.closedAt, p.tz)}` : ""}</Pill> : <Pill tone="ok">Open · {formatDate(y.startDate)} to {formatDate(y.endDate)}</Pill>} />)}
              </ul>
              <p className="px-5 pb-4 -mt-1 text-[12.5px] text-ink3">The opening balance of a new year is the closing balance of the last one, carried over by itself.</p>
            </Card>
          </Col>
        </Split>
      </Stack>

      {moving && data.cash && (
        <MoveMoneySheet closeHref={here()} accounts={accountChoices} today={today}
          from={data.cash.id} to={firstBank?.id ?? data.cash.id} amount={cashBefore > ZERO ? rupees(cashBefore) : 0}
          hint={cashBefore > ZERO ? `${formatRupees(cashBefore)} from before today` : undefined} />
      )}
      {adding && <AddAccountSheet closeHref={here()} today={today} hasMain={data.accounts.some((a) => a.kind === "BANK" && a.isMain)} />}
      {opening && (
        <OpeningSheet closeHref={here()} today={iso(p.fy.startDate)} goLive={goLive ? formatDate(goLive) : null}
          accounts={data.accounts.map((a) => {
            const ob = data.openings.find((o) => o.accountId === a.id);
            return { value: a.id, label: a.name, set: Boolean(ob), amount: ob ? rupees(ob.amountPaise) : 0, pending: Boolean(ob?.approvalId && pending.has(ob.approvalId)) };
          })} />
      )}
      {t && !cancelling && (
        <UrlSheet title={`Money moved · ${formatRupees(t.amountPaise)}`} sub={`${name(t.fromAccountId)} to ${name(t.toAccountId)} · ${formatDate(t.date)}`} closeHref={here()}
          footer={!t.cancelledAt && p.can.archive ? <ButtonLink href={here({ t: t.id, cancel: "1" })} scroll={false} variant="danger-soft">Cancel move</ButtonLink> : undefined}>
          <div className="grid grid-cols-2 gap-x-5 gap-y-3.5">
            <Mini k="From" v={name(t.fromAccountId)} /><Mini k="To" v={name(t.toAccountId)} />
            <Mini k="Amount" v={<b className="font-semibold">{formatRupees(t.amountPaise)}</b>} /><Mini k="Reference" v={<Ref v={t.reference} />} />
            <Mini k="Date" v={formatDate(t.date)} /><Mini k="Recorded" v={formatDateTime(t.createdAt, p.tz)} />
          </div>
          {t.cancelledAt && <Banner tone="bad" className="mt-4" title={`Cancelled on ${formatDate(t.cancelledAt, p.tz)}.`}>{t.cancelReason}</Banner>}
          <p className="mt-4 text-[12.5px] text-ink3">Not income or expense: the money only changed place. Both books show it.</p>
        </UrlSheet>
      )}
      {t && cancelling && !t.cancelledAt && (
        <ReasonSheet closeHref={here({ t: t.id })} title="Cancel this money move?" label="Cancel move" placeholder="Example: deposit slip was for another day" action={cancelTransferAction} hidden={{ transferId: t.id }}
          sub={`${formatRupees(t.amountPaise)} from ${name(t.fromAccountId)} to ${name(t.toAccountId)}. Reversing lines go in today’s books; the move stays, marked Cancelled.`} />
      )}
    </div>
  );
}
