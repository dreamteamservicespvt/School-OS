import Link from "next/link";
import { ArrowRight, Building2, CalendarRange, ExternalLink, FileSpreadsheet, Landmark, ListTree, Lock, Plus, ReceiptText, ShieldCheck, SlidersHorizontal, Tags } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatRupees } from "@/lib/format";
import { defaultSteps, type RuleStep } from "@/lib/approvals";
import { ruleNamer } from "@/lib/settings/approval-rules";
import { FINANCE_FEATURES } from "@/lib/finance/words";
import { fySpanWords } from "@/lib/finance/years";
import { yearClosePlan } from "@/lib/finance/year-close";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Col, SettingRow } from "@/components/money/kit";
import { UrlSegmented } from "@/components/money/url-filters";
import { cx } from "@/components/ui/cx";
import { FinanceHead } from "../_components/finance-head";
import { Line } from "../_components/bits";
import { BASE, financeManagerPage, one, qs, type SearchParams } from "../_lib/page";
import { AddHeadSheet, BillsSheet, CloseMonthSheet, CloseYearSheet, CostCentreSheet, FeatureSwitch, HeadChip, TallySheet, YearSheet } from "./sheets";
import { Words } from "@/lib/i18n/client";

export const metadata = { title: "Finance Settings" };

const HREF = `${BASE}/settings`;
const ZERO = BigInt(0);
const rupees = (p: bigint) => (Number(p) / 100).toString();
const iso = (d: Date) => d.toISOString().slice(0, 10);
const monthWord = (d: Date) => new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
const OPTIONAL = ["finance-budget", "finance-accounts", "finance-vendor-bills", "finance-brought-in"] as const;

/** Finance Settings (07 §6, mod-finance.jsx SettingsPage): financial year, heads, approval limits, cost centres and Tally. Every change is logged. */
export default async function FinanceSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await financeManagerPage();
  const sp = await searchParams;
  const ctx = p.current.ctx;
  const edit = one(sp.edit);
  const doing = one(sp.do);
  const closing = /^\d{4}-\d{2}$/.test(one(sp.close)) ? one(sp.close) : "";
  const closingYear = /^[0-9a-f-]{36}$/i.test(one(sp.closeyear)) ? one(sp.closeyear) : "";
  const group = ["INCOME", "EXPENSE"].includes(one(sp.g)) ? one(sp.g) : "all";

  const data = await withSchool(ctx, async (tx) => {
    const [years, closes, heads, centres, accounts, rule, namer, used] = await Promise.all([
      tx.financialYear.findMany({ where: { archivedAt: null }, orderBy: { startDate: "desc" }, take: 6 }),
      tx.periodClose.findMany({ where: { financialYearId: p.fy.id }, orderBy: { month: "asc" } }),
      tx.accountHead.findMany({ orderBy: { code: "asc" } }),
      tx.costCentre.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } }),
      tx.bankAccount.findMany({ where: { archivedAt: null }, orderBy: [{ kind: "asc" }, { isMain: "desc" }, { name: "asc" }] }),
      tx.approvalRule.findFirst({ where: { requestType: "expense", archivedAt: null } }),
      ruleNamer(tx, ctx.schoolId),
      // This year's money by head, for the chart of accounts.
      tx.dayBookEntry.groupBy({ by: ["accountHeadId"], where: { financialYearId: p.fy.id, accountHeadId: { not: null }, section: { notIn: ["opening", "transfer"] } }, _sum: { amountPaise: true } }),
    ]);
    const closers = await tx.userLogin.findMany({ where: { id: { in: closes.map((c) => c.closedById).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } });
    // Close a year: its check list, worked out only when the sheet is open.
    const yearPlan = closingYear && years.some((y) => y.id === closingYear && y.status === "OPEN") ? await yearClosePlan(tx, ctx, closingYear, p.today, p.payHeads) : null;
    return { yearPlan, years, closes, heads, centres, accounts, steps: (rule?.steps as RuleStep[] | undefined) ?? defaultSteps("expense"), namer, used, closers };
  });

  const s = p.settings;
  const here = (extra: Record<string, string | null> = {}) => qs(HREF, { g: group === "all" ? null : group, ...extra });
  const change = (key: string) => <Link href={here({ edit: key })} scroll={false} className={cx(buttonClass("ghost", "sm"), "shrink-0")}><Words k="Change" /></Link>;

  // Month close: every month of this financial year that has ended.
  const months: { key: string; label: string; closed: { on: Date; by: string } | null; ended: boolean }[] = [];
  for (let d = new Date(p.fy.startDate); d <= p.fy.endDate && d <= p.today; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
    const c = data.closes.find((x) => x.month.getTime() === d.getTime());
    const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
    months.push({ key: iso(d).slice(0, 7), label: monthWord(d), closed: c ? { on: c.closedAt, by: data.closers.find((u) => u.id === c.closedById)?.displayName ?? "" } : null, ended: end < p.today });
  }
  const closingMonth = months.find((m) => m.key === closing && !m.closed && m.ended) ?? null;
  const openBefore = closingMonth ? months.filter((m) => m.key < closingMonth.key && !m.closed && m.ended).map((m) => m.label) : [];

  // Approval ladder, as on Expenses.
  const atOnce = s.expenseApproveUpTo;
  const who = (st: RuleStep) => (st.approverUserId ? data.namer.person(st.approverUserId) : st.approverRole ? data.namer.role(st.approverRole) : "the approver");
  const ladder: { k: string; who: string | null }[] = [{ k: `Expenses up to ${formatRupees(atOnce)}`, who: null }];
  let from = atOnce;
  for (const st of data.steps) {
    const upTo = st.upToPaise ? BigInt(st.upToPaise) : null;
    if (upTo !== null && upTo <= from) continue;
    ladder.push({ k: upTo === null ? `Expenses above ${formatRupees(from)}` : `Expenses up to ${formatRupees(upTo)}`, who: who(st) });
    if (upTo === null) break;
    from = upTo;
  }

  const live = data.heads.filter((h) => !h.archivedAt);
  const shownHeads = live.filter((h) => group === "all" || h.kind === group);
  const groups = [...new Set(shownHeads.map((h) => `${h.kind}|${h.groupName}`))];
  const usedBy = new Map(data.used.map((u) => [u.accountHeadId!, u._sum.amountPaise ?? ZERO]));
  const groupsOf = { INCOME: [...new Set(live.filter((h) => h.kind === "INCOME").map((h) => h.groupName))], EXPENSE: [...new Set(live.filter((h) => h.kind === "EXPENSE").map((h) => h.groupName))] };
  const expenseHeads = data.heads.filter((h) => h.kind === "EXPENSE");
  const tallyHeads = live.slice(0, 200);
  const matched = tallyHeads.filter((h) => h.tallyLedger).length;
  const featureOn = (k: string) => p.has(k as never);

  return (
    <div>
      <FinanceHead pageName="Finance Settings" href={HREF} sub="Financial year, heads, approval limits, cost centres and Tally. Every change is logged." />
      <div className="grid xl:grid-cols-2 gap-5 lg:gap-6 items-start">
        <Col>
          <Card>
            <CardHeader title="Financial year" description="Kept apart from the academic year" icon={CalendarRange} action={change("year")} />
            <ul className="px-5 pb-4">
              <Line k="The year runs" v={fySpanWords(s.fyStartMonth)} />
              <Line k="Go-live (records start)" v={formatDate(s.goLiveDate)} />
              {data.years.map((y) => {
                return (
                  <Line key={y.id} k={<>{`${y.name} · ${formatDate(y.startDate)} to ${formatDate(y.endDate)}`}{y.status === "CLOSED" && y.closedAt && <span className="block text-[12px] text-ink3"><Words k="Closed" /> {formatDate(y.closedAt, p.tz)}</span>}</>}
                    v={y.status === "CLOSED" ? <Pill tone="neutral"><Lock size={12} aria-hidden="true" /><Words k="Closed" /></Pill>
                      : y.endDate < p.today ? <Link href={here({ closeyear: y.id })} scroll={false} className={buttonClass("secondary", "sm")}><Words k="Close year" /></Link>
                      : <Pill tone="ok"><Words k="Open" /></Pill>} />
                );
              })}
              {data.years.at(-1) && s.goLiveDate >= data.years.at(-1)!.startDate && <Line k={`Before ${formatDate(s.goLiveDate)} · before School OS`} v={<Pill tone="neutral"><Words k="Old software" /></Pill>} />}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Month close" description="A closed month cannot change. Mistakes go in as adjustments in an open month." icon={Lock} />
            <ul className="px-5 pb-4">
              {months.length === 0 && <li className="py-2.5 text-[13.5px] text-ink3"><Words k="No month of" /> {p.fy.name} <Words k="has ended yet." /></li>}
              {months.map((m) => (
                <li key={m.key} className="flex items-center justify-between gap-3 py-2.5 border-t border-line/70 first:border-0 text-[14px]">
                  <span>{m.label}{m.closed && <span className="block text-[12px] text-ink3"><Words k="Closed" /> {formatDate(m.closed.on, p.tz)}{m.closed.by ? ` by ${m.closed.by}` : ""}</span>}</span>
                  {m.closed ? <Pill tone="neutral"><Lock size={12} aria-hidden="true" /><Words k="Closed" /></Pill>
                    : m.ended ? <Link href={here({ close: m.key })} scroll={false} className={buttonClass("secondary", "sm")}><Words k="Close month" /></Link>
                    : <Pill tone="info"><Words k="Open" /></Pill>}
                </li>
              ))}
            </ul>
          </Card>

          <Card className="overflow-hidden">
            <CardHeader title="Chart of accounts" description={`${live.length} heads with codes · used on income, expenses and reports`} icon={ListTree}
              action={<Link href={here({ do: "head" })} scroll={false} className={buttonClass("soft", "sm")}><Plus size={15} aria-hidden="true" /><Words k="Add head" /></Link>} />
            <div className="px-3 pb-3 overflow-x-auto no-scrollbar">
              <UrlSegmented param="g" fallback="all" label="Heads" size="sm" className="w-max" options={[{ value: "all", label: "All" }, { value: "INCOME", label: "Income" }, { value: "EXPENSE", label: "Expense" }]} />
            </div>
            <div className="border-t border-line/70">
              {groups.map((g) => {
                const [kind, name] = g.split("|");
                return (
                  <div key={g}>
                    <p className="eyebrow text-ink3 px-5 pt-3 pb-1">{name}</p>
                    <ul className="px-5 pb-1">
                      {shownHeads.filter((h) => h.kind === kind && h.groupName === name).map((h) => (
                        <li key={h.id} className="flex items-center gap-3 py-2 text-[14px]">
                          <span className="font-mono text-[12.5px] text-ink3 w-10 shrink-0">{h.code}</span>
                          <span className="flex-1 min-w-0 truncate">{h.name}</span>
                          {h.systemKey ? <Pill tone="info" className="!h-5 !text-[11px]"><Words k="From" /> {h.systemKey === "fees" ? "Fees" : h.systemKey === "salary" ? "Salary" : "Refunds"}</Pill>
                            : <span className="text-[12px] text-ink3 tnum">{usedBy.get(h.id) ? formatRupees(usedBy.get(h.id)!) : "—"}</span>}
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </Card>
        </Col>

        <Col>
          <Card>
            <CardHeader title="Expense categories" description="The heads shown on the Record expense form. Tap to show or hide." icon={Tags} />
            <div className="px-5 pb-5 flex flex-wrap gap-2">
              {expenseHeads.map((h) => <HeadChip key={h.id} id={h.id} name={h.name} shown={!h.archivedAt} locked={Boolean(h.systemKey)} />)}
            </div>
          </Card>

          <Card>
            <CardHeader title="Approval limits" description="Who approves is stored in Settings, Forms & Approvals" icon={ShieldCheck}
              action={<Link href="/settings/forms-approvals" className={cx(buttonClass("ghost", "sm"), "shrink-0")}><ExternalLink size={15} aria-hidden="true" /><Words k="Change" /></Link>} />
            <ul className="px-5 pb-4">
              {ladder.map((l) => <Line key={l.k} k={l.k} v={l.who ? <Pill tone="info">{l.who}</Pill> : <Pill tone="ok"><Words k="Approved at once" /></Pill>} />)}
              <Line k="Change to an opening balance" v={<Pill tone="info"><Words k="Principal" /></Pill>} />
            </ul>
          </Card>

          <Card>
            <CardHeader title="Bills and cash" icon={ReceiptText} action={change("bills")} />
            <ul className="px-5 pb-4">
              <Line k={<><Words k="Bill photo needed above" /><span className="block text-[12px] text-ink3"><Words k="Expenses cannot be paid without it" /></span></>} v={formatRupees(s.billRequiredAbove)} />
              <Line k="Approved at once up to" v={formatRupees(s.expenseApproveUpTo)} />
              <Line k="Warn before cash in hand goes below zero" v={<Pill tone="ok"><Words k="On" /></Pill>} />
              <Line k="Income receipt numbers" v={<span className="font-mono text-[13px]">{s.incomeReceiptPrefix}…</span>} />
              <Line k="Journal entry numbers" v={<span className="font-mono text-[13px]">{s.journalPrefix}…</span>} />
            </ul>
          </Card>

          <Card>
            <CardHeader title="Cost centres" description="Departments that expenses and budgets are tagged to" icon={Building2}
              action={<FeatureSwitch featureKey="finance-cost-centres" on={featureOn("finance-cost-centres")} label="Cost centres" />} />
            {featureOn("finance-cost-centres") ? (
              <div className="px-5 pb-5 flex flex-wrap gap-2 items-center">
                {data.centres.map((c) => <span key={c.id} className="inline-flex items-center h-8 px-3 rounded-full bg-sunken text-[13px] font-semibold">{c.name}</span>)}
                {data.centres.length === 0 && <span className="text-[13.5px] text-ink3"><Words k="No departments yet." /></span>}
                <Link href={here({ do: "centre" })} scroll={false} className={buttonClass("ghost", "sm")}><Plus size={15} aria-hidden="true" /><Words k="Add" /></Link>
              </div>
            ) : <p className="px-5 pb-4 text-[13.5px] text-ink3"><Words k="Off. Expenses are not tagged to a department." /></p>}
          </Card>

          <Card>
            <CardHeader title="Cash and bank accounts" icon={Landmark} action={<Link href={`${BASE}/cash-bank`} className={cx(buttonClass("ghost", "sm"), "shrink-0")}><ArrowRight size={15} aria-hidden="true" /><Words k={"Cash & Bank"} /></Link>} />
            <ul className="px-5 pb-4">
              {data.accounts.map((a) => <Line key={a.id} k={<><b className="font-semibold text-ink">{a.name}</b><span className="block text-[12px] text-ink3">{a.kind === "CASH" ? "Cash kept at school" : [a.bankName, a.accountLast4 && `··${a.accountLast4}`].filter(Boolean).join(" · ")}</span></>} v={a.isMain ? <Pill tone="brand"><Words k="Main" /></Pill> : ""} />)}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Optional pages" description="Also in Settings, Modules On/Off" icon={SlidersHorizontal} />
            <div className="pb-1">
              {OPTIONAL.map((k) => {
                const f = FINANCE_FEATURES.find((x) => x.key === k)!;
                return <div key={k} className="border-t border-line/70 first:border-0"><SettingRow title={f.label} sub={f.about}><FeatureSwitch featureKey={k} on={featureOn(k)} label={f.label} /></SettingRow></div>;
              })}
            </div>
          </Card>

          <Card>
            <CardHeader title="Tally export" description="For the auditor. Vouchers download from Finance Reports." icon={FileSpreadsheet}
              action={<FeatureSwitch featureKey="finance-tally" on={featureOn("finance-tally")} label="Tally export" />} />
            {featureOn("finance-tally") ? (
              <div className="px-5 pb-5 flex flex-col gap-3">
                <ul>{tallyHeads.filter((h) => h.tallyLedger).slice(0, 6).map((h) => <Line key={h.id} k={h.name} v={<span className="font-mono text-[12.5px]">{h.tallyLedger}</span>} />)}</ul>
                <p className="text-[12.5px] text-ink3">{matched} <Words k="of" /> {tallyHeads.length} <Words k="heads have a Tally ledger name · the others use their own name" /></p>
                <div className="flex gap-2 flex-wrap">
                  <Link href={here({ edit: "tally" })} scroll={false} className={buttonClass("secondary", "sm")}><Words k="Ledger names" /></Link>
                  <Link href={`${BASE}/reports`} className={buttonClass("ghost", "sm")}><ArrowRight size={15} aria-hidden="true" /><Words k="Download vouchers" /></Link>
                </div>
              </div>
            ) : <p className="px-5 pb-4 text-[13.5px] text-ink3"><Words k="Off. The school does not use outside accounting software." /></p>}
          </Card>
        </Col>
      </div>

      {edit === "year" && <YearSheet closeHref={here()} start={String(s.fyStartMonth)} goLive={iso(s.goLiveDate)} />}
      {edit === "bills" && <BillsSheet closeHref={here()} billAbove={rupees(s.billRequiredAbove)} atOnce={rupees(s.expenseApproveUpTo)} incomePrefix={s.incomeReceiptPrefix} journalPrefix={s.journalPrefix} />}
      {edit === "tally" && <TallySheet closeHref={here()} heads={tallyHeads.map((h) => ({ id: h.id, name: h.name, ledger: h.tallyLedger ?? "" }))} />}
      {doing === "head" && <AddHeadSheet closeHref={here()} groups={groupsOf} />}
      {doing === "centre" && <CostCentreSheet closeHref={here()} />}
      {data.yearPlan && (
        <CloseYearSheet closeHref={here()} yearId={data.yearPlan.fy.id} name={data.yearPlan.fy.name} canClose={data.yearPlan.canClose}
          checks={data.yearPlan.checks} nextName={data.yearPlan.nextName} nextStart={formatDate(data.yearPlan.nextStart)}
          carried={data.yearPlan.carried.map((a) => ({ name: a.name, amount: formatRupees(a.closing) }))}
          result={`The year's ${data.yearPlan.result.word.toLowerCase()} of ${formatRupees(data.yearPlan.result.amount)} moves to Opening balances.`} />
      )}
      {closingMonth && <CloseMonthSheet closeHref={here()} month={closingMonth.key} label={closingMonth.label} open={openBefore} />}
    </div>
  );
}
