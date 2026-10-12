import { ArrowDownToLine, ArrowRight, ArrowUpFromLine, BookOpen, NotebookText, Plus, SearchX, Undo2, Workflow } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime, formatRupees } from "@/lib/format";
import { generalLedger, journalList, ledgerAccounts, payables, receivables } from "@/lib/finance/journals";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Banner, DataList, Empty, SimpleTable, Stack, Toolbar } from "@/components/money/kit";
import { LinkTabs } from "@/components/ui/link-tabs";
import { UrlSearch, UrlSelect } from "@/components/money/url-filters";
import { UrlSheet } from "@/components/ui/url-sheet";
import { ExportButton } from "@/components/ui/export-button";
import { PeriodFilter } from "@/components/list/period-filter";
import { cx } from "@/components/ui/cx";
import { FinanceHead } from "../_components/finance-head";
import { Ref } from "../_components/bits";
import { ReasonSheet } from "../_components/forms";
import { BASE, financeFeaturePage, financePeriod, one, qs, type SearchParams } from "../_lib/page";
import { reverseJournalAction } from "./actions";
import { JournalSheet } from "./sheets";

export const metadata = { title: "Accounts" };

const HREF = `${BASE}/accounts`;
const UUID = /^[0-9a-f-]{36}$/i;
const ZERO = BigInt(0);
const TABS = ["journals", "ledger", "payables", "receivables"] as const;
const drcr = (v: bigint, debitNature: boolean) => {
  const dr = debitNature ? v >= ZERO : v < ZERO;
  return `${formatRupees(v < ZERO ? -v : v)} ${dr ? "Dr" : "Cr"}`;
};

/** Accounts (07 §2, optional; mod-finance.jsx AccountsPage): journal entries, ledger, money to pay and to receive. */
export default async function AccountsPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await financeFeaturePage("finance-accounts");
  const sp = await searchParams;
  const ctx = p.current.ctx;
  const tab = (TABS as readonly string[]).includes(one(sp.tab)) ? (one(sp.tab) as (typeof TABS)[number]) : "journals";
  const per = financePeriod(sp, p.dates, "finyear");
  const from = per.from ?? p.fy.startDate;
  const to = per.to ?? p.today;
  const q = one(sp.q).trim().toLowerCase().slice(0, 80);
  const openId = UUID.test(one(sp.open)) ? one(sp.open) : "";
  const reverseId = p.can.archive && UUID.test(one(sp.reverse)) ? one(sp.reverse) : "";
  const adding = p.can.create && one(sp.do) === "new";

  const data = await withSchool(ctx, async (tx) => {
    const accounts = await ledgerAccounts(tx, ctx);
    const accKey = accounts.some((a) => a.key === one(sp.acc)) ? one(sp.acc) : accounts.find((a) => a.kind === "CASH")?.key ?? accounts[0]?.key ?? "";
    const [journals, ledger, pay, recv, heads, focus] = await Promise.all([
      tab === "journals" ? journalList(tx, from, to) : null,
      tab === "ledger" && accKey ? generalLedger(tx, ctx, accKey, from, to, p.fy.startDate) : null,
      tab === "payables" ? payables(tx, p.today) : null,
      tab === "receivables" ? receivables(tx) : null,
      adding ? tx.accountHead.findMany({ where: { archivedAt: null }, orderBy: [{ kind: "asc" }, { code: "asc" }], select: { id: true, name: true, code: true, kind: true } }) : [],
      openId || reverseId ? tx.journalEntry.findFirst({ where: { id: openId || reverseId }, select: { id: true, date: true } }).then(async (e) => (e ? (await journalList(tx, e.date, e.date)).find((j) => j.id === e.id) ?? null : null)) : null,
    ]);
    const numbers = focus ? await tx.journalEntry.findMany({ where: { id: { in: [focus.reversedById, focus.reversesId].filter((x): x is string => Boolean(x)) } }, select: { id: true, number: true } }) : [];
    return { accounts, accKey, journals, ledger, pay, recv, heads, focus, numbers };
  });

  const keep = { ...per.keep, tab: tab === "journals" ? null : tab, q: q || null, acc: tab === "ledger" ? data.accKey : null };
  const here = (extra: Record<string, string | null> = {}) => qs(HREF, { ...keep, ...extra });
  const tabHref = (t: string) => qs(HREF, { ...per.keep, tab: t === "journals" ? null : t });
  const journals = (data.journals ?? []).filter((j) => !q || j.number.toLowerCase().includes(q) || j.narration.toLowerCase().includes(q) || j.lines.some((l) => l.head.toLowerCase().includes(q)));
  const payTotal = (data.pay ?? []).reduce((s, r) => s + r.balance, ZERO);
  const recvTotal = (data.recv ?? []).reduce((s, r) => s + r.amount, ZERO);
  const g = data.ledger;
  const o = data.focus;
  const numberOf = (id: string | null) => data.numbers.find((n) => n.id === id)?.number ?? "";
  const groups = [...new Set(data.accounts.map((a) => a.group))];

  return (
    <div>
      <FinanceHead pageName="Accounts" href={HREF} sub="Journal entries, ledger, money to pay and money to receive · for full accounts"
        viewActions={p.can.export && (tab === "journals" || tab === "ledger") ? <ExportButton href={qs(`${HREF}/export`, keep)} /> : null}
        actions={p.can.create ? <ButtonLink href={here({ do: "new" })} scroll={false} variant="primary" icon={Plus}>Journal entry</ButtonLink> : null} />
      <Stack>
        <Card className="overflow-hidden">
          <LinkTabs className="px-3" label="Accounts" tabs={[
            { href: tabHref("journals"), label: "Journal entries", on: tab === "journals" },
            { href: tabHref("ledger"), label: "General ledger", on: tab === "ledger" },
            { href: tabHref("payables"), label: "To pay", on: tab === "payables" },
            { href: tabHref("receivables"), label: "To receive", on: tab === "receivables" },
          ]} />

          {tab === "journals" && <>
            <CardHeader title="Journal entries" description="Fees, income, expenses and salary reach the ledger by themselves. Posted entries are never edited, only reversed." icon={NotebookText} />
            <Toolbar className="border-t border-line">
              <UrlSearch id="jv-q" placeholder="Number, narration or account" label="Search journal entries" />
              <PeriodFilter {...p.dates} fallback="finyear" />
            </Toolbar>
            <DataList rows={journals} rowKey={(j) => j.id} rowHref={(j) => here({ open: j.id })} minWidth={860} caption="Journal entries"
              footer={`Showing ${journals.length} of ${data.journals?.length ?? 0}`}
              empty={(data.journals?.length ?? 0) === 0
                ? <Empty icon={NotebookText} title="No journal entries in these dates" body="Use a journal entry to move an amount between heads, for example depreciation or a head corrected." action={p.can.create ? <ButtonLink href={here({ do: "new" })} scroll={false} variant="secondary" icon={Plus}>Journal entry</ButtonLink> : undefined} />
                : <Empty icon={SearchX} title="No entries match" body="Try another number, narration or account." />}
              columns={[
                { key: "d", label: "Date", nowrap: true, render: (j) => <><p className="tnum">{formatDate(j.date)}</p><p className="font-mono text-[12px] text-ink3">{j.number}</p></> },
                { key: "dr", label: "Debited", render: (j) => <span className="text-[13px]">{j.lines.filter((l) => l.debitPaise > ZERO).map((l) => l.head).join(", ")}</span> },
                { key: "cr", label: "Credited", render: (j) => <span className="text-[13px] text-ink2">{j.lines.filter((l) => l.creditPaise > ZERO).map((l) => l.head).join(", ")}</span> },
                { key: "amt", label: "Amount", align: "right", render: (j) => <b className={cx("font-semibold", j.reversedById && "line-through text-ink3")}>{formatRupees(j.amount)}</b> },
                { key: "narr", label: "Narration", render: (j) => <span className="text-[13px] text-ink2">{j.narration}</span> },
                { key: "by", label: "Made by", render: (j) => <><span className="text-[13px]">{j.createdBy}</span>{j.reversedById && <Pill tone="bad" className="!h-5 !text-[11px] ml-1">Reversed</Pill>}</> },
              ]}
              phone={(j) => ({ title: j.narration, sub: `${j.number} · ${formatDate(j.date)}`, icon: NotebookText, right: <p className={cx("font-semibold tnum", j.reversedById && "line-through text-ink3")}>{formatRupees(j.amount)}</p> })} />
          </>}

          {tab === "ledger" && <>
            <CardHeader title="General ledger" description={`Every entry for one account, with the running balance · ${formatDate(from)} to ${formatDate(to)}`} icon={BookOpen} />
            <Toolbar className="border-t border-line">
              <UrlSelect id="gl-acc" param="acc" label="Account" className="md:w-80" options={groups.flatMap((gr) => data.accounts.filter((a) => a.group === gr).map((a) => ({ value: a.key, label: `${a.name}${a.code ? ` · ${a.code}` : ""} (${gr})` })))} />
              <PeriodFilter {...p.dates} fallback="finyear" />
            </Toolbar>
            {g ? (
              <>
                <DataList rows={g.rows.map((r, i) => ({ ...r, i }))} rowKey={(r) => String(r.i)} rowHref={(r) => r.href} minWidth={720} caption="General ledger"
                  footer={`Opening ${drcr(g.opening, g.debitNature)} · debits ${formatRupees(g.debit)} · credits ${formatRupees(g.credit)} · closing ${drcr(g.closing, g.debitNature)}`}
                  empty={<Empty icon={BookOpen} title="No entries for this account in these dates" body={`Balance ${drcr(g.opening, g.debitNature)}.`} />}
                  columns={[
                    { key: "d", label: "Date", nowrap: true, render: (r) => <span className="tnum">{formatDate(r.date)}</span> },
                    { key: "ref", label: "Entry", render: (r) => <Ref v={r.ref} /> },
                    { key: "narr", label: "Narration", render: (r) => <span className="text-[13.5px]">{r.narration}</span> },
                    { key: "dr", label: "Debit", align: "right", render: (r) => (r.debit > ZERO ? formatRupees(r.debit) : "") },
                    { key: "cr", label: "Credit", align: "right", render: (r) => (r.credit > ZERO ? formatRupees(r.credit) : "") },
                    { key: "bal", label: "Balance", align: "right", render: (r) => <b className="font-semibold">{drcr(r.balance, g.debitNature)}</b> },
                  ]}
                  phone={(r) => ({ title: r.narration, sub: `${formatDate(r.date)} · ${r.ref}`, icon: r.debit > ZERO ? ArrowDownToLine : ArrowUpFromLine, right: <><p className="font-semibold tnum">{formatRupees(r.debit > ZERO ? r.debit : r.credit)}</p><p className="text-[12px] text-ink3 tnum">{drcr(r.balance, g.debitNature)}</p></> })} />
                <p className="px-5 py-3 border-t border-line text-[12.5px] text-ink3">Opening balance on {formatDate(from)}: {drcr(g.opening, g.debitNature)}. Every account together is in Finance Reports, Trial balance.</p>
              </>
            ) : <Empty icon={BookOpen} title="Choose an account" />}
          </>}

          {tab === "payables" && <>
            <CardHeader title="Money the school has to pay" description="Vendor bills and approved expenses not fully paid, by due date" icon={ArrowUpFromLine} action={<Pill tone="warn">{formatRupees(payTotal)}</Pill>} />
            <DataList rows={data.pay ?? []} rowKey={(r) => r.id} rowHref={(r) => `${BASE}/expenses?open=${r.id}`} minWidth={760} caption="Money to pay"
              empty={<Empty icon={ArrowUpFromLine} title="Nothing to pay" body="Approved expenses and vendor bills not yet paid show here." />}
              columns={[
                { key: "to", label: "To", render: (r) => <><p className="font-semibold leading-tight">{r.vendor}</p><p className="text-[12.5px] text-ink3">{r.billNo ? `Bill ${r.billNo} · ` : ""}{r.number}{r.status === "WAITING" ? " · waiting for approval" : ""}</p></> },
                { key: "due", label: "Due", nowrap: true, render: (r) => <span className={cx("text-[13.5px]", r.overdue && "text-bad font-semibold")}>{r.dueDate ? formatDate(r.dueDate) : "On payment"}{r.overdue && <span className="block text-[12px] font-normal">Overdue</span>}</span> },
                { key: "paid", label: "Paid", align: "right", render: (r) => (r.paid > ZERO ? formatRupees(r.paid) : <span className="text-ink3">—</span>) },
                { key: "amt", label: "To pay", align: "right", render: (r) => <b className="font-semibold">{formatRupees(r.balance)}</b> },
                { key: "a", label: "", render: () => <span className={cx(buttonClass("ghost", "sm"), "pointer-events-none")}><ArrowRight size={15} aria-hidden="true" />Pay</span> },
              ]}
              phone={(r) => ({ title: r.vendor, sub: `${r.number} · due ${r.dueDate ? formatDate(r.dueDate) : "on payment"}`, icon: ArrowUpFromLine, iconTone: r.overdue ? "bad" : "neutral", right: <p className="font-semibold tnum">{formatRupees(r.balance)}</p> })} />
          </>}

          {tab === "receivables" && <>
            <CardHeader title="Money owed to the school" description="Other than student fees, which have their own ledger: income recorded as draft, not yet received" icon={ArrowDownToLine} action={<Pill tone="info">{formatRupees(recvTotal)}</Pill>} />
            <DataList rows={data.recv ?? []} rowKey={(r) => r.id} rowHref={(r) => `${BASE}/income?open=${r.id}`} minWidth={680} caption="Money to receive"
              empty={<Empty icon={ArrowDownToLine} title="Nothing to receive" body="Income saved as a draft, for example a cheque not yet cleared, shows here until it is posted." />}
              columns={[
                { key: "from", label: "From", render: (r) => <><p className="font-semibold leading-tight">{r.from}</p><p className="text-[12.5px] text-ink3">{r.head}{r.note ? ` · ${r.note}` : ""}</p></> },
                { key: "d", label: "Recorded", nowrap: true, render: (r) => <span className="text-[13.5px]">{formatDate(r.date)}</span> },
                { key: "amt", label: "Amount", align: "right", render: (r) => <b className="font-semibold">{formatRupees(r.amount)}</b> },
              ]}
              phone={(r) => ({ title: r.from, sub: `${r.head} · ${formatDate(r.date)}`, icon: ArrowDownToLine, right: <p className="font-semibold tnum">{formatRupees(r.amount)}</p> })} />
          </>}
        </Card>
      </Stack>

      {adding && <JournalSheet closeHref={here()} today={p.today.toISOString().slice(0, 10)} heads={data.heads.map((h) => ({ value: h.id, label: `${h.name} · ${h.code}` }))} />}
      {openId && o && (
        <UrlSheet wide title={`${o.number} · ${formatRupees(o.amount)}`} sub={`${formatDate(o.date)} · ${o.createdBy} · ${formatDateTime(o.createdAt, p.tz)}`} closeHref={here()}
          footer={p.can.archive && !o.reversedById && !o.reversesId ? <ButtonLink href={here({ reverse: o.id })} scroll={false} variant="danger-soft" icon={Undo2}>Reverse entry</ButtonLink> : undefined}>
          <p className="text-[14px] text-ink2 mb-3">{o.narration}</p>
          <SimpleTable minWidth={420} rowKey={(l) => l.id} caption="Lines" rows={o.lines}
            cols={[{ label: "Account", render: (l) => l.head }, { label: "Debit", right: true, render: (l) => (l.debitPaise > ZERO ? formatRupees(l.debitPaise) : "") }, { label: "Credit", right: true, render: (l) => (l.creditPaise > ZERO ? formatRupees(l.creditPaise) : "") }]}
            foot={["Total", formatRupees(o.lines.reduce((s, l) => s + l.debitPaise, ZERO)), formatRupees(o.lines.reduce((s, l) => s + l.creditPaise, ZERO))]} />
          {o.reversedById && <Banner tone="bad" className="mt-4" title={`Reversed by ${numberOf(o.reversedById)}.`}>Both entries stay in the books.</Banner>}
          {o.reversesId && <Banner tone="info" className="mt-4" title={`This reverses ${numberOf(o.reversesId)}.`}>The original is not changed.</Banner>}
          <p className="mt-4 text-[12.5px] text-ink3 flex gap-1.5"><Workflow size={14} className="shrink-0 mt-0.5" aria-hidden="true" />Fees, income, expenses and salary post to the ledger by themselves. Put their mistakes right at the source.</p>
        </UrlSheet>
      )}
      {openId && !o && <UrlSheet title="Not found" closeHref={here()}><Empty icon={SearchX} title="This journal entry was not found" /></UrlSheet>}
      {reverseId && o && !o.reversedById && !o.reversesId && (
        <ReasonSheet closeHref={here({ open: o.id })} title={`Reverse ${o.number}?`} label="Reverse entry" placeholder="Example: posted to the wrong head" action={reverseJournalAction} hidden={{ journalId: o.id }}
          sub={`A new entry with the same lines the other way round is added today. ${o.number} is not changed.`} />
      )}
    </div>
  );
}
