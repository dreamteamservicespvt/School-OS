import Link from "next/link";
import {
  Baby, CircleCheck, CirclePause, ExternalLink, Filter, Globe, HandCoins, Landmark, Lock, Printer, ReceiptIndianRupee, ReceiptText, ShieldCheck, Shirt, ShoppingCart, Undo2, Wallet, Workflow, type LucideIcon,
} from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatRupees, formatTime } from "@/lib/format";
import { featureOn } from "@/lib/fees/settings";
import { dayBookView, feeDashboardMatch, type DayRow } from "@/lib/finance/daybook-view";
import { financeModeLabel } from "@/lib/finance/words";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Banner, Band, Col, DataList, Mini, Split, Stack, Stats, TONE_SOFT, type Tone } from "@/components/money/kit";
import { UrlSelect, UrlSwitch } from "@/components/money/url-filters";
import { UrlSheet } from "@/components/ui/url-sheet";
import { ExportButton } from "@/components/ui/export-button";
import { PeriodFilter } from "@/components/list/period-filter";
import { cx } from "@/components/ui/cx";
import { MODE_ICON, PayPill } from "../../fee-management/_components/bits";
import { FinanceHead } from "../_components/finance-head";
import { Line, ModeCell, Ref, signed } from "../_components/bits";
import { BASE, financePage, financePeriod, one, qs, type SearchParams } from "../_lib/page";
import { OldSoftwareBanner, OldSoftwareEmpty, allBeforeGoLive } from "@/components/money/go-live";
import { feePageAllowedFor } from "@/lib/fees/access";

export const metadata = { title: "Day Book" };

const HREF = `${BASE}/day-book`;
const UUID = /^[0-9a-f-]{36}$/i;
const ZERO = BigInt(0);
const SRC: Record<DayRow["source"], [string, LucideIcon, Tone]> = {
  fee: ["Fee payment", ReceiptIndianRupee, "ok"], income: ["Other income", HandCoins, "ok"], expense: ["Expense", ReceiptText, "warn"], salary: ["Salary", Wallet, "warn"], reversal: ["Refund or reversal", Undo2, "bad"],
};

/** Day Book (07 §2, mod-finance.jsx DayBookPage): every rupee received and spent, filled in by the software only. */
export default async function DayBookPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await financePage();
  const sp = await searchParams;
  const per = financePeriod(sp, p.dates, "today");
  const from = per.from ?? p.today;
  const to = per.to ?? p.today;
  const classId = UUID.test(one(sp.class)) ? one(sp.class) : null;
  const acct = UUID.test(one(sp.acct)) ? one(sp.acct) : null;
  const waiting = one(sp.waiting) === "1";
  const openId = one(sp.e);
  const isToday = from.getTime() === p.today.getTime() && to.getTime() === p.today.getTime();
  const oneDay = from.getTime() === to.getTime();
  const seesPayments = feePageAllowedFor(p.current, "payments");
  const seesRefunds = feePageAllowedFor(p.current, "concessions");

  const data = await withSchool(p.current.ctx, async (tx) => {
    const [view, classes, accounts, split, match, closedYear] = await Promise.all([
      dayBookView(tx, { from, to, classId, depositAccountId: acct, waiting, hidePay: p.payHeads }),
      tx.schoolClass.findMany({ where: { archivedAt: null }, orderBy: { sortOrder: "asc" }, select: { id: true, name: true } }),
      tx.bankAccount.findMany({ where: { archivedAt: null, kind: "BANK" }, orderBy: [{ isMain: "desc" }, { name: "asc" }], select: { id: true, name: true, bankName: true, accountLast4: true } }),
      featureOn(tx, p.current.ctx, "fee-bank-accounts"),
      isToday ? feeDashboardMatch(tx, p.today) : null,
      tx.financialYear.findFirst({ where: { status: "CLOSED", startDate: { lte: to }, endDate: { gte: from } }, select: { name: true } }),
    ]);
    return { view, classes, accounts, split, match, closedYear };
  });
  const v = data.view;
  const keep = { ...per.keep, class: classId, acct, waiting: waiting ? "1" : null };
  const here = (extra: Record<string, string | null> = {}) => qs(HREF, { ...keep, ...extra });
  const dayWords = oneDay ? formatDate(from) : `${formatDate(from)} to ${formatDate(to)}`;
  const nIn = v.sections.full.length + v.sections.partial.length + v.sections.otherFees.length + v.sections.daycare.length + v.sections.income.length;
  const hidden = "Hidden while a class or bank account filter is on.";
  const opened = openId ? v.rows.find((r) => r.id === openId) ?? null : null;
  const showAcct = data.split;

  const section = (title: string, icon: LucideIcon, rows: DayRow[], tone: "ok" | "warn" | "bad", empty: string, kind: "fee" | "other" | "reversal") => {
    const counted = rows.filter((r) => !r.waiting);
    const total = counted.reduce((s, r) => s + r.total, ZERO);
    return (
      <Card className="overflow-hidden">
        <CardHeader title={title} icon={icon} description={rows.length ? `${rows.length} ${rows.length === 1 ? "entry" : "entries"} · ${signed(total)}` : "None"}
          action={rows.length ? <Pill tone={tone}>{signed(total)}</Pill> : undefined} />
        {rows.length ? (
          <DataList rows={rows.map((r, i) => ({ ...r, i: i + 1 }))} rowKey={(r) => r.id} rowHref={(r) => here({ e: r.id })} minWidth={kind === "fee" ? 1180 : 960} footer={false} caption={title}
            columns={[
              { key: "i", label: "#", render: (r) => <span className="text-ink3 tnum">{r.i}</span> },
              ...(kind === "fee" ? [
                { key: "who", label: "Student", render: (r: DayRow) => <><p className="font-semibold leading-tight">{r.who}</p><p className="text-[12px] text-ink3 font-mono">{r.number ?? "—"}</p></> },
                { key: "cls", label: "Class", nowrap: true, render: (r: DayRow) => r.classLabel || "—" },
                { key: "head", label: "Fee type", render: (r: DayRow) => <span className="text-[13px] text-ink2">{r.head}</span> },
                { key: "amt", label: "Amount", align: "right" as const, render: (r: DayRow) => formatRupees(r.amount) },
                { key: "pen", label: "Penalty", align: "right" as const, render: (r: DayRow) => (r.penalty > ZERO ? formatRupees(r.penalty) : <span className="text-ink3">—</span>) },
              ] : kind === "reversal" ? [
                { key: "who", label: "Student or payer", render: (r: DayRow) => <><p className="font-semibold leading-tight">{r.who}</p><p className="text-[12px] text-ink3">{r.classLabel}</p></> },
                { key: "head", label: "What", render: (r: DayRow) => <span className="text-[13px] text-ink2">{r.head}</span> },
              ] : [
                { key: "who", label: rows[0]?.source === "income" ? "Received from" : rows[0]?.source === "salary" ? "Payroll" : "Paid to", render: (r: DayRow) => <><p className="font-semibold leading-tight">{r.who}</p><p className="text-[12px] text-ink3 font-mono">{r.number ?? "—"}</p></> },
                { key: "head", label: rows[0]?.source === "income" ? "Income head" : "Category", render: (r: DayRow) => <span className="text-[13px] text-ink2">{r.head}</span> },
              ]),
              { key: "total", label: kind === "fee" ? "Total" : "Amount", align: "right", render: (r) => <b className={cx("font-semibold", (r.cancelled || r.waiting) && "line-through text-ink3", r.total < ZERO && "text-bad")}>{signed(r.total)}</b> },
              { key: "mode", label: "Mode", nowrap: true, render: (r) => <ModeCell mode={r.mode} /> },
              ...(kind !== "reversal" ? [{ key: "ref", label: "Reference", render: (r: DayRow) => <Ref v={r.reference} /> }] : []),
              { key: "t", label: oneDay ? "Time" : "Date", nowrap: true, render: (r) => <span className="tnum text-ink2">{oneDay ? formatTime(r.at, p.tz) : formatDate(r.date)}</span> },
              ...(kind !== "fee" || showAcct ? [{ key: "acct", label: kind === "fee" ? "Bank account" : "Paid from", nowrap: true, render: (r: DayRow) => <span className="text-[13px] text-ink2">{(kind === "fee" ? r.depositAccount ?? r.account : r.account) ?? "—"}</span> }] : []),
              { key: "note", label: "Notes", render: (r) => r.waiting ? <PayPill status="WAITING" short /> : r.cancelled ? <Pill tone="bad" className="!h-5 !text-[11px]">Cancelled</Pill> : <span className="text-[12.5px] text-ink3">{r.note ?? ""}</span> },
            ]}
            phone={(r) => ({
              title: r.who, sub: `${r.classLabel ? `${r.classLabel} · ` : ""}${r.head}`, icon: MODE_ICON[r.mode] ?? Wallet, iconTone: "neutral",
              right: <><p className={cx("font-semibold tnum text-[14.5px]", (r.cancelled || r.waiting) && "line-through text-ink3", r.total < ZERO && "text-bad")}>{signed(r.total)}</p><p className="text-[12px] text-ink3 tnum">{oneDay ? formatTime(r.at, p.tz) : formatDate(r.date)}</p></>,
              pills: r.waiting ? <PayPill status="WAITING" short /> : r.cancelled ? <Pill tone="bad" className="!h-5 !text-[11px]">Cancelled</Pill> : undefined,
            })} />
        ) : <p className="px-5 pb-4 -mt-1 text-[13.5px] text-ink3">{empty}</p>}
      </Card>
    );
  };

  const sourceLink = (r: DayRow): [string, string] | null => {
    if (r.sourceType.startsWith("payment") && seesPayments) return [r.sourceType === "payment-cancel" ? "Open the cancelled receipt in Fees" : "Open the payment in Fees", `/fee-management/payments/${r.sourceId}`];
    if (r.sourceType === "refund" && seesRefunds) return ["Open the refund in Fees", `/fee-management/concessions?tab=refunds&open=${r.sourceId}`];
    if (r.sourceType.startsWith("income")) return ["Open in Income", `${BASE}/income?open=${r.sourceId}`];
    if (r.sourceType.startsWith("expense")) return ["Open the expense and bill", `${BASE}/expenses?pay=${r.sourceId}`];
    return null;
  };

  return (
    <div>
      <FinanceHead title="Day Book" pageName="Day Book" href={HREF} sub={`Daily income and expense summary, ${dayWords}`} />
      <Stack>
        {data.closedYear && <Banner tone="warn" title={`Finance year ${data.closedYear.name} is closed.`}>Its books are read only. Put a mistake right with an adjustment in the open year.</Banner>}

        <Card>
          <CardHeader title="Show the Day Book for" description="Financial year April to March, apart from the academic year" icon={Filter}
            action={<div className="flex gap-1.5 shrink-0">
              {p.can.export && <ExportButton href={qs(`${HREF}/export`, keep)} size="sm" always />}
              {p.can.export && <a href={`${qs(`${HREF}/export`, keep)}${Object.values(keep).some(Boolean) ? "&" : "?"}format=pdf`} target="_blank" rel="noreferrer" className={cx(buttonClass("ghost", "sm"), "hidden sm:inline-flex")}><Printer size={15} aria-hidden="true" />Print</a>}
            </div>} />
          <div className="px-5 pb-4 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            <PeriodFilter {...p.dates} fallback="today" className="w-full" />
            <UrlSelect id="db-cls" param="class" label="Class" options={[{ value: "", label: "All classes" }, ...data.classes.map((c) => ({ value: c.id, label: c.name }))]} />
            {data.split && <UrlSelect id="db-acct" param="acct" label="Bank account" options={[{ value: "", label: "All accounts" }, ...data.accounts.map((a) => ({ value: a.id, label: `${a.name}${a.accountLast4 ? ` · ••${a.accountLast4}` : ""}` }))]} />}
          </div>
          <div className="px-5 pb-4 flex flex-wrap items-center gap-3 border-t border-line/70 pt-3.5">
            <div className="mr-auto"><UrlSwitch id="db-wait" param="waiting" label="Show waiting entries" sub="cheques and transfers not verified yet" /></div>
            {(classId || acct || waiting || one(sp.period) || one(sp.from)) && <Link href={HREF} scroll={false} className={buttonClass("ghost")}>Reset</Link>}
          </div>
        </Card>

        <OldSoftwareBanner goLive={p.goLive} from={from} to={to} what="Day Book entries" />
        {allBeforeGoLive(p.goLive, from, to) ? <Card><OldSoftwareEmpty goLive={p.goLive} what="Day Book entries" /></Card> : <>
        <Band items={[
          { label: "Total income", big: formatRupees(v.totals.income), foot: `${nIn} transactions · Fees ${formatRupees(v.feesFull)} + Partial ${formatRupees(v.feesPartial)}${v.reversed < ZERO ? ` · less ${formatRupees(-v.reversed)} reversed` : ""}` },
          { label: "Total expense", big: formatRupees(v.totals.expense), foot: `${v.sections.expense.length + v.sections.salary.length} transactions${p.payHeads ? " · staff pay not shown" : v.sections.salary.length ? " · includes salary" : ""}` },
          { label: "Net balance", big: signed(v.totals.net), foot: isToday ? `Live · updated ${formatTime(new Date(), p.tz)}` : per.label },
        ]} />

        <Stats items={v.groups.map((g) => ({
          label: g.label, value: formatRupees(g.amount), sub: g.count ? `${g.count} ${g.count === 1 ? "entry" : "entries"}` : g.key === "daycare" ? "No daycare payments" : "None",
          icon: ({ online: Globe, full: CircleCheck, partial: CirclePause, daycare: Baby, "other-fees": Shirt, "other-income": HandCoins } as Record<string, LucideIcon>)[g.key],
        }))} />

        <Split side={340} className="[&>*]:min-w-0">
          <Col>
            {section("Fee payments (full)", ReceiptIndianRupee, v.sections.full, "ok", `No full fee payments ${oneDay ? "on this date" : "in these dates"}.`, "fee")}
            {section("Partial payments", CirclePause, v.sections.partial, "ok", `No partial payments ${oneDay ? "on this date" : "in these dates"}.`, "fee")}
            {v.sections.otherFees.length > 0 && section("Other fee types", Shirt, v.sections.otherFees, "ok", "", "fee")}
            {section("Daycare payments", Baby, v.sections.daycare, "ok", `No daycare payments ${oneDay ? "on this date" : "in these dates"}.`, "fee")}
            {section("Other income", HandCoins, v.sections.income, "ok", v.filtered ? hidden : `No other income ${oneDay ? "on this date" : "in these dates"}.`, "other")}
            {section("Expenses", ReceiptText, v.sections.expense, "warn", v.filtered ? hidden : `No expenses paid ${oneDay ? "on this date" : "in these dates"}.`, "other")}
            {!p.payHeads && section("Salary", Wallet, v.sections.salary, "warn", v.filtered ? hidden : "No salary or salary advance paid. Salary is added on the day it is marked paid.", "other")}
            {section("Refunds and reversals", Undo2, v.sections.refunds, "bad", `No refunds or reversals ${oneDay ? "on this date" : "in these dates"}.`, "reversal")}
          </Col>
          <Col>
            {data.match && (
              <Card>
                <CardHeader title="Matches the Fee Dashboard" description="Fees collected today" icon={ShieldCheck}
                  action={<Pill tone={data.match.waiting.count === 0 || waiting ? "ok" : "info"}>{data.match.waiting.count === 0 || waiting ? "Same total" : `${formatRupees(data.match.waiting.amount)} waiting`}</Pill>} />
                <ul className="px-5 pb-4">
                  <Line k={`Fee Dashboard · ${data.match.posted.count + data.match.waiting.count} payments`} v={formatRupees(data.match.posted.amount + data.match.waiting.amount)} bold />
                  <Line k={`Posted here · ${data.match.posted.count} payments`} v={formatRupees(data.match.posted.amount)} />
                  <Line k={`Waiting for verification · ${data.match.waiting.count}`} v={formatRupees(data.match.waiting.amount)} tone={data.match.waiting.count ? "warn" : undefined} />
                </ul>
                {data.match.waiting.count > 0 && <p className="px-5 pb-4 -mt-1 text-[12.5px] text-ink3">Cheques and bank transfers count only after the accountant checks them. Turn on “Show waiting entries” to see them here.</p>}
              </Card>
            )}
            <Card>
              <CardHeader title="How the money came in" description="By payment mode" icon={Wallet} />
              {v.modes.length ? (
                <div className="px-5 pb-5 flex flex-wrap gap-2">
                  {v.modes.map((m) => {
                    const Ic = MODE_ICON[m.mode] ?? Wallet;
                    return <Pill key={m.mode} tone="neutral" className="!h-8 !px-3 !text-[13px]"><Ic size={14} aria-hidden="true" />{financeModeLabel(m.mode)} {formatRupees(m.amount)}</Pill>;
                  })}
                </div>
              ) : <p className="px-5 pb-4 text-[13.5px] text-ink3">No money came in.</p>}
            </Card>
            {data.split && (
              <Card>
                <CardHeader title="Fees by bank account" description="From Fee Settings: each fee head has its own account" icon={Landmark} />
                {v.byAccount.length ? (
                  <ul className="px-5 pb-4">
                    {v.byAccount.map((a) => <Line key={a.name} k={<><b className="font-semibold text-ink">{a.name}</b><span className="block text-[12px] text-ink3">{a.count} {a.count === 1 ? "entry" : "entries"}</span></>} v={formatRupees(a.amount)} />)}
                  </ul>
                ) : <p className="px-5 pb-4 text-[13.5px] text-ink3">No fees in these dates.</p>}
                <p className="px-5 pb-4 -mt-1 text-[12.5px] text-ink3">Online payments show the account Razorpay split them into. Counter payments show the account the cash or cheque goes into.</p>
              </Card>
            )}
            <Card>
              <CardHeader title="Where entries come from" icon={Workflow} />
              <ul className="px-5 pb-4 text-[13.5px] text-ink2 flex flex-col gap-2">
                {([[ReceiptIndianRupee, "Fees", "when a payment is posted, a reversal when it is cancelled"], [HandCoins, "Income", "when other income is posted"], [ReceiptText, "Expenses", "only when marked Paid, on the date paid"], ...(p.payHeads ? [] : [[Wallet, "Salary", "when a month’s salary or an advance is marked Paid"]]), [ShoppingCart, "Inventory", "vendor bill payments, as expenses"]] as [LucideIcon, string, string][]).map(([Ic, k, w]) => (
                  <li key={k} className="flex gap-2.5"><span className="w-7 h-7 rounded-lg bg-sunken text-ink2 grid place-items-center shrink-0"><Ic size={15} aria-hidden="true" /></span><span><b className="font-semibold text-ink">{k}</b> · {w}</span></li>
                ))}
              </ul>
            </Card>
          </Col>
        </Split>
        </>}
      </Stack>

      {opened && (() => {
        const [label, Ic, tone] = SRC[opened.source];
        const link = sourceLink(opened);
        return (
          <UrlSheet title={`${label} · ${signed(opened.total)}`} sub={`${formatDate(opened.date)} · ${formatTime(opened.at, p.tz)}`} closeHref={here()}
            footer={link ? <Link href={link[1]} className={buttonClass("primary")}><ExternalLink size={16} aria-hidden="true" />{link[0]}</Link> : undefined}>
            <div className="flex items-center gap-3 mb-4">
              <span className={cx("w-11 h-11 rounded-xl grid place-items-center shrink-0", TONE_SOFT[tone])}><Ic size={20} aria-hidden="true" /></span>
              <div className="min-w-0"><p className="font-semibold text-[15px] truncate">{opened.who}</p><p className="text-[13px] text-ink3 truncate">{opened.classLabel ? `${opened.classLabel} · ` : ""}{opened.head}</p></div>
            </div>
            <div className="grid grid-cols-2 gap-x-5 gap-y-3.5">
              <Mini k={opened.source === "fee" || opened.source === "reversal" ? "Receipt" : "Number"} v={<span className="font-mono text-[13px]">{opened.number ?? "—"}</span>} />
              <Mini k="Time" v={formatTime(opened.at, p.tz)} />
              {opened.source === "fee" && <><Mini k="Amount" v={formatRupees(opened.amount)} /><Mini k="Penalty (late fee)" v={opened.penalty > ZERO ? formatRupees(opened.penalty) : "None"} /></>}
              <Mini k="Total" v={<b className="font-semibold">{signed(opened.total)}</b>} />
              <Mini k="Mode" v={<ModeCell mode={opened.mode} />} />
              <Mini k="Reference" v={<Ref v={opened.reference} />} />
              <Mini k={opened.source === "fee" ? "Bank account" : "Cash or bank"} v={(opened.source === "fee" ? opened.depositAccount ?? opened.account : opened.account) ?? "—"} />
            </div>
            {opened.note && <p className="mt-4 text-[13.5px] text-ink2 bg-sunken rounded-xl px-3.5 py-2.5">{opened.note}</p>}
            {opened.waiting && <Banner tone="warn" className="mt-4" title="Waiting for verification.">Shown because “Show waiting entries” is on. It is not counted until the accountant verifies it in Fees.</Banner>}
            {opened.cancelled && <Banner tone="bad" className="mt-4" title="Cancelled.">The original line stays; a reversal line takes the money back out.</Banner>}
            <p className="mt-4 text-[12.5px] text-ink3 flex gap-1.5"><Lock size={14} className="shrink-0 mt-0.5" aria-hidden="true" />Day Book entries cannot be typed or changed here. A wrong entry is put right at its source, which adds a reversal.</p>
          </UrlSheet>
        );
      })()}
    </div>
  );
}
