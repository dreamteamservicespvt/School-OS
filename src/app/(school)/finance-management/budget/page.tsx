import Link from "next/link";
import { BadgeCheck, Calculator, CircleCheck, CopyPlus, Flag, Gauge, Pencil, Plus, ReceiptText, Wallet } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime, formatRupees, formatRupeesShort } from "@/lib/format";
import { budgetsWithUse } from "@/lib/finance/budgets";
import { chosenFinancialYear } from "@/lib/finance/years";
import { Card, CardHeader } from "@/components/ui/card";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Banner, DataList, Empty, Legend, Mini, Progress, Stack, Stats, Suggestion, Timeline, type Tone } from "@/components/money/kit";
import { Bars } from "@/components/money/bars";
import { UrlSelect } from "@/components/money/url-filters";
import { UrlSheet } from "@/components/ui/url-sheet";
import { ExportButton } from "@/components/ui/export-button";
import { cx } from "@/components/ui/cx";
import { FinanceHead } from "../_components/finance-head";
import { signed } from "../_components/bits";
import { BASE, financeFeaturePage, one, qs, type SearchParams } from "../_lib/page";
import { BudgetSheet, CopySheet, ReviseSheet } from "./sheets";
import { Words } from "@/lib/i18n/client";

export const metadata = { title: "Budget" };

const HREF = `${BASE}/budget`;
const UUID = /^[0-9a-f-]{36}$/i;
const ZERO = BigInt(0);
const rupees = (p: bigint) => Number(p / BigInt(100));
const pct = (a: bigint, b: bigint) => (b > ZERO ? Math.round((Number(a) * 100) / Number(b)) : 0);
const toneOf = (p: number): "bad" | "warn" | "brand" => (p > 100 ? "bad" : p >= 80 ? "warn" : "brand");
const yearWord = (n: string) => n.replace("-", "–");
const PERIOD_WORD: Record<string, string> = { month: "equal by month", term: "equal by term", year: "whole year" };

/** Budget (07 §2, optional; mod-finance.jsx BudgetPage): yearly budget by head and department, and how much is used. */
export default async function BudgetPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await financeFeaturePage("finance-budget");
  const sp = await searchParams;
  const ctx = p.current.ctx;
  const centresOn = p.has("finance-cost-centres");
  const by = centresOn && one(sp.by) === "dept" ? "dept" : "head";
  const show = ["near", "over"].includes(one(sp.show)) ? one(sp.show) : "all";
  const openId = UUID.test(one(sp.open)) ? one(sp.open) : "";
  const reviseId = p.can.edit && UUID.test(one(sp.revise)) ? one(sp.revise) : "";
  const adding = p.can.create && one(sp.do) === "new";
  const copying = p.can.create && one(sp.do) === "copy";

  const data = await withSchool(ctx, async (tx) => {
    const fy = await chosenFinancialYear(tx, ctx, one(sp.fy), p.today);
    const [budgets, heads, centres, years, waiting] = await Promise.all([
      budgetsWithUse(tx, fy.id, p.payHeads),
      tx.accountHead.findMany({ where: { kind: "EXPENSE" }, orderBy: { code: "asc" }, select: { id: true, name: true, code: true, archivedAt: true, groupName: true } }),
      tx.costCentre.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
      tx.financialYear.findMany({ where: { archivedAt: null }, orderBy: { startDate: "desc" }, take: 6 }),
      tx.expense.findMany({ where: { status: "WAITING", financialYearId: fy.id }, orderBy: { amountPaise: "desc" }, take: 20 }),
    ]);
    const focusId = openId || reviseId;
    const focus = focusId ? budgets.find((b) => b.id === focusId) ?? null : null;
    const monthly = focus ? await tx.expensePayment.findMany({
      where: { cancelledAt: null, date: { gte: fy.startDate, lte: fy.endDate }, expense: { accountHeadId: focus.accountHeadId, status: { not: "CANCELLED" }, ...(focus.costCentreId ? { costCentreId: focus.costCentreId } : {}) } },
      select: { date: true, amountPaise: true },
    }) : [];
    const people = focus ? await tx.userLogin.findMany({ where: { id: { in: [focus.createdById, ...focus.revisions.map((r) => r.createdById)].filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } }) : [];
    return { fy, budgets, heads, centres, years, waiting, focus, monthly, people };
  });

  const fy = data.fy;
  const keep = { fy: one(sp.fy) && data.fy.id !== p.fy.id ? data.fy.id : null, by: by === "dept" ? "dept" : null, show: show === "all" ? null : show };
  const here = (extra: Record<string, string | null> = {}) => qs(HREF, { ...keep, ...extra });
  const head = new Map(data.heads.map((h) => [h.id, h]));
  const centre = new Map(data.centres.map((c) => [c.id, c.name]));
  const budgets = data.budgets.map((b) => ({ ...b, headName: head.get(b.accountHeadId)?.name ?? "Expense head", dept: b.costCentreId ? centre.get(b.costCentreId) ?? "Department" : head.get(b.accountHeadId)?.groupName ?? "All departments" }));
  const total = budgets.reduce((t, b) => ({ budget: t.budget + b.amountPaise, spent: t.spent + b.spent, committed: t.committed + b.committed }), { budget: ZERO, spent: ZERO, committed: ZERO });
  const over = budgets.filter((b) => b.pct > 100);
  const near = budgets.filter((b) => b.pct >= 80 && b.pct <= 100);
  const shown = budgets.filter((b) => show === "all" || (show === "over" ? b.pct > 100 : b.pct >= 80));
  const yearDays = Math.round((fy.endDate.getTime() - fy.startDate.getTime()) / 86400000) + 1;
  const goneDays = Math.max(0, Math.min(yearDays, Math.round((p.today.getTime() - fy.startDate.getTime()) / 86400000) + 1));
  const gone = Math.round((goneDays / yearDays) * 100);
  const closed = fy.status === "CLOSED";
  const current = fy.id === p.fy.id;

  type Row = { id: string; name: string; sub: string; budget: bigint; spent: bigint; committed: bigint; pct: number };
  const headRows: Row[] = shown.map((b) => ({ id: b.id, name: b.headName, sub: b.dept, budget: b.amountPaise, spent: b.spent, committed: b.committed, pct: b.pct }));
  const deptRows: Row[] = [...budgets.reduce((m, b) => {
    const k = b.costCentreId ?? "none";
    const r = m.get(k) ?? { id: k, name: b.costCentreId ? b.dept : "All departments", sub: "", budget: ZERO, spent: ZERO, committed: ZERO, pct: 0, n: 0 };
    r.budget += b.amountPaise; r.spent += b.spent; r.committed += b.committed; r.n += 1;
    return m.set(k, r);
  }, new Map<string, Row & { n: number }>()).values()].map((r) => ({ ...r, sub: `${r.n} ${r.n === 1 ? "head" : "heads"}`, pct: pct(r.spent + r.committed, r.budget) }));
  const rows = by === "head" ? headRows : deptRows;

  // A waiting expense that would take its head to 80% or more: approvers see the warning.
  const waitWarn = data.waiting.map((e) => {
    const b = budgets.find((x) => x.accountHeadId === e.accountHeadId && (x.costCentreId === null || x.costCentreId === e.costCentreId));
    if (!b) return null;
    const after = pct(b.spent + b.committed + e.amountPaise, b.amountPaise);
    return after >= 80 ? { e, b, after } : null;
  }).filter((x): x is NonNullable<typeof x> => Boolean(x))[0];

  // Where the year is heading: spending so far at the same pace for the rest of the year.
  const heading = current && goneDays > 30 ? budgets.map((b) => ({ b, end: (b.spent * BigInt(yearDays)) / BigInt(goneDays) + b.committed })).filter((x) => x.end > x.b.amountPaise).sort((a, b) => (b.end - b.b.amountPaise > a.end - a.b.amountPaise ? 1 : -1)).slice(0, 3) : [];

  const o = data.focus ? budgets.find((b) => b.id === data.focus!.id) ?? null : null;
  const who = (id: string | null) => data.people.find((u) => u.id === id)?.displayName ?? "—";
  const months = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(fy.startDate.getUTCFullYear(), fy.startDate.getUTCMonth() + i, 1)));
  const monthWord = (d: Date) => new Intl.DateTimeFormat("en-IN", { month: "short", timeZone: "UTC" }).format(d);
  const spentBy = months.map((m) => data.monthly.filter((x) => x.date.getUTCFullYear() === m.getUTCFullYear() && x.date.getUTCMonth() === m.getUTCMonth()).reduce((s, x) => s + x.amountPaise, ZERO));
  const nextYearName = (() => { const [a] = fy.name.split("-"); const y = Number(a) + 1; return `${y}–${String(y + 1).slice(2)}`; })();
  const taken = budgets.map((b) => `${b.accountHeadId}:${b.costCentreId ?? ""}`);

  return (
    <div>
      <FinanceHead pageName="Budget" href={HREF} sub={`Financial year ${yearWord(fy.name)}${current ? ` · ${gone}% of the year has gone (${formatDate(fy.startDate)} to ${formatDate(p.today)})` : closed ? " · closed" : ""}`}
        viewActions={<>
          {data.years.length > 1 && <UrlSelect id="bu-fy" param="fy" label="Financial year" className="w-44" options={data.years.map((y) => ({ value: y.id === p.fy.id ? "" : y.id, label: `${yearWord(y.name)}${y.status === "CLOSED" ? " · closed" : ""}` }))} />}
          {p.can.export && <ExportButton href={qs(`${HREF}/export`, { fy: data.fy.id })} />}
        </>}
        actions={p.can.create && !closed ? <>
          {budgets.length > 0 && <ButtonLink href={here({ do: "copy" })} scroll={false} variant="secondary" icon={CopyPlus}><Words k="Plan" /> {nextYearName}</ButtonLink>}
          <ButtonLink href={here({ do: "new" })} scroll={false} variant="primary" icon={Plus}><Words k="Set a budget" /></ButtonLink>
        </> : null} />
      <Stack>
        <Stats items={[
          { label: "Budget for the year", value: formatRupeesShort(total.budget), sub: `${budgets.length} expense ${budgets.length === 1 ? "head" : "heads"}`, icon: Calculator },
          { label: "Spent", value: formatRupeesShort(total.spent), sub: `${pct(total.spent, total.budget)}% used`, icon: ReceiptText },
          { label: "Committed", value: formatRupees(total.committed), sub: "Approved, not paid yet", icon: BadgeCheck, tone: "info" },
          { label: "Left", value: formatRupeesShort(total.budget - total.spent - total.committed), sub: `${over.length} over · ${near.length} above 80%`, icon: Wallet, tone: over.length ? "bad" : "ok" },
        ]} />
        {over.slice(0, 3).map((b) => (
          <Banner key={b.id} tone="bad" title={`${b.headName} is over budget: ${b.pct}% used.`} action={<Link href={here({ open: b.id })} scroll={false} className={buttonClass("secondary", "sm")}><Words k="Open" /></Link>}>
            {formatRupees(b.spent + b.committed - b.amountPaise)} <Words k="more than the" /> {formatRupees(b.amountPaise)} <Words k="budget. Approvers see a warning on every new expense here." />
          </Banner>
        ))}
        {waitWarn && (
          <Banner tone="warn" title={`Waiting for approval: ${waitWarn.e.note || waitWarn.e.number}, ${formatRupees(waitWarn.e.amountPaise)}.`}
            action={<Link href={`${BASE}/expenses?open=${waitWarn.e.id}`} className={buttonClass("secondary", "sm")}><Words k="Open" /></Link>}>
            <Words k="It would take" /> {waitWarn.b.headName} <Words k="to" /> {waitWarn.after}<Words k="% used. The approver sees this warning when deciding." />
          </Banner>
        )}
        <Card className="overflow-hidden">
          <CardHeader title="Budget against spending" description="Committed means approved but not paid yet" icon={Gauge} />
          <div className="px-3 pb-3 flex flex-col md:flex-row gap-2.5">
            {centresOn && <SegLinks items={[{ href: qs(HREF, { ...keep, by: null }), label: "By expense head", on: by === "head" }, { href: qs(HREF, { ...keep, by: "dept", show: null }), label: "By department", on: by === "dept" }]} />}
            {by === "head" && <div className="md:ml-auto"><SegLinks items={[
              { href: qs(HREF, { ...keep, show: null }), label: "All", on: show === "all" },
              { href: qs(HREF, { ...keep, show: "near" }), label: `80% or more · ${near.length + over.length}`, on: show === "near" },
              { href: qs(HREF, { ...keep, show: "over" }), label: `Over · ${over.length}`, on: show === "over" },
            ]} /></div>}
          </div>
          <DataList rows={rows} rowKey={(b) => b.id} rowHref={by === "head" ? (b) => here({ open: b.id }) : undefined} minWidth={880} caption="Budget against spending"
            footer={`Totals: budget ${formatRupees(total.budget)} · spent ${formatRupees(total.spent)} · committed ${formatRupees(total.committed)}`}
            columns={[
              { key: "head", label: by === "head" ? "Expense head" : "Department", render: (b) => <><p className="font-semibold leading-tight">{b.name}</p><p className="text-[12px] text-ink3">{b.sub}</p></> },
              { key: "budget", label: "Budget", align: "right", render: (b) => formatRupees(b.budget) },
              { key: "spent", label: "Spent", align: "right", render: (b) => formatRupees(b.spent) },
              { key: "committed", label: "Committed", align: "right", render: (b) => (b.committed ? formatRupees(b.committed) : <span className="text-ink3">—</span>) },
              { key: "left", label: "Left", align: "right", render: (b) => <b className={cx("font-semibold", b.budget - b.spent - b.committed < ZERO && "text-bad")}>{signed(b.budget - b.spent - b.committed)}</b> },
              { key: "pct", label: "Used", render: (b) => <div className="flex items-center gap-2 min-w-[150px]"><Progress value={Math.min(b.pct, 100)} tone={toneOf(b.pct)} className="flex-1" /><span className={cx("text-[13px] font-semibold tnum w-11 text-right", b.pct > 100 ? "text-bad" : b.pct >= 80 && "text-warn")}>{b.pct}%</span></div> },
            ]}
            phone={(b) => ({ title: b.name, sub: `${formatRupees(b.spent + b.committed)} of ${formatRupees(b.budget)}`, icon: Gauge, iconTone: (toneOf(b.pct) === "brand" ? "neutral" : toneOf(b.pct)) as Tone, right: <span className={cx("font-semibold tnum", b.pct > 100 ? "text-bad" : b.pct >= 80 && "text-warn")}>{b.pct}%</span> })}
            empty={budgets.length === 0
              ? <Empty icon={Calculator} title={`No budgets for ${yearWord(fy.name)} yet`} body="Set a budget for each expense head. Spending is counted from paid expenses by itself." action={p.can.create && !closed ? <ButtonLink href={here({ do: "new" })} scroll={false} variant="secondary" icon={Plus}><Words k="Set a budget" /></ButtonLink> : undefined} />
              : <Empty icon={CircleCheck} title="No heads here" body="Nothing is over its budget." />} />
        </Card>
        {heading.length > 0 && (
          <Suggestion title="Where the year is heading" source={`Spending ${formatDate(fy.startDate)} to ${formatDate(p.today)} at the same pace, and approved expenses`}
            actions={p.can.edit ? <ButtonLink href={here({ revise: heading[0].b.id })} scroll={false} size="sm" variant="secondary" icon={Pencil}><Words k="Revise" /> {heading[0].b.headName} <Words k="budget" /></ButtonLink> : undefined}>
            <Words k="At this pace" /> {heading.map((h, i) => <span key={h.b.id}>{i > 0 ? (i === heading.length - 1 ? " and " : ", ") : ""}<b className="text-ink">{h.b.headName}</b> <Words k="ends the year near" /> {formatRupees(h.end)}</span>)}<Words k=", more than budgeted. The other heads look on track." />
          </Suggestion>
        )}
      </Stack>

      {adding && (
        <BudgetSheet closeHref={here()} year={fy.id} yearLabel={yearWord(fy.name)} taken={taken}
          heads={data.heads.filter((h) => !h.archivedAt).map((h) => ({ value: h.id, label: `${h.name} · ${h.code}` }))}
          centres={centresOn ? data.centres.map((c) => ({ value: c.id, label: c.name })) : null} />
      )}
      {copying && <CopySheet closeHref={here()} fromYear={fy.id} nextLabel={nextYearName} total={rupees(total.budget)} />}
      {reviseId && o && (
        <ReviseSheet closeHref={here()} budgetId={o.id} title={`Revise: ${o.headName}`} now={rupees(o.amountPaise)} used={rupees(o.spent + o.committed)}
          sub={`Now ${formatRupees(o.amountPaise)} · ${o.pct}% used. The original stays on record.`} />
      )}
      {openId && o && (
        <UrlSheet wide title={o.headName} sub={`${o.dept} · budget ${formatRupees(o.amountPaise)} for ${yearWord(fy.name)}`} closeHref={here()}
          footer={p.can.edit && !closed ? <ButtonLink href={here({ revise: o.id })} scroll={false} variant="primary" icon={Pencil}><Words k="Revise budget" /></ButtonLink> : undefined}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
            <Mini k="Budget" v={formatRupees(o.amountPaise)} /><Mini k="Spent" v={formatRupees(o.spent)} /><Mini k="Committed" v={formatRupees(o.committed)} />
            <Mini k="Used" v={<b className={cx("font-semibold", o.pct > 100 ? "text-bad" : o.pct >= 80 && "text-warn")}>{o.pct}%</b>} />
          </div>
          <p className="text-[13px] font-semibold text-ink2 mb-2"><Words k="Month by month (" />{PERIOD_WORD[o.period] ?? o.period})</p>
          <Bars data={months.map((m, i) => ({ k: monthWord(m), v: Math.round(rupees(spentBy[i]) / 1000), v2: Math.round(rupees(o.amountPaise) / 12 / 1000), tone: spentBy[i] * BigInt(12) > o.amountPaise ? "warn" : "brand" }))}
            tickLabel={(v) => `₹${v}k`} ariaLabel="Spent each month against the monthly budget" />
          <div className="mt-2 mb-5"><Legend items={[["bg-brand", "Spent"], ["bg-ink3/25", "Monthly budget"]]} /></div>
          <p className="text-[13px] font-semibold text-ink2 mb-2"><Words k="Revisions · the original is always kept" /></p>
          <Timeline items={[
            ...[...o.revisions].reverse().map((r) => ({ what: <>{r.toPaise > r.fromPaise ? "Raised" : "Lowered"} <Words k="from" /> {formatRupees(r.fromPaise)} <Words k="to" /> {formatRupees(r.toPaise)}: {r.reason}</>, when: `${formatDateTime(r.createdAt, p.tz)} · ${who(r.createdById)}`, icon: Pencil, tone: "info" as Tone })),
            { what: <><Words k="Set at" /> {formatRupees(o.originalPaise)} · {PERIOD_WORD[o.period] ?? o.period}</>, when: `${formatDateTime(o.createdAt, p.tz)} · ${who(o.createdById)}`, icon: Flag, tone: "brand" as Tone },
          ]} />
        </UrlSheet>
      )}
    </div>
  );
}

function SegLinks({ items }: { items: { href: string; label: string; on: boolean }[] }) {
  return (
    <nav className="overflow-x-auto no-scrollbar">
      <div className="inline-flex w-max rounded-xl bg-sunken p-1 gap-1">
        {items.map((i) => (
          <Link key={i.label} href={i.href} scroll={false} aria-current={i.on ? "page" : undefined}
            className={cx("h-8 px-3 rounded-lg text-[13px] font-semibold inline-flex items-center whitespace-nowrap transition", i.on ? "bg-surface text-ink shadow-sm" : "text-ink2 hover:text-ink")}>{i.label}</Link>
        ))}
      </div>
    </nav>
  );
}
