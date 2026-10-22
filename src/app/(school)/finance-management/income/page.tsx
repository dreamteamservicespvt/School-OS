import Link from "next/link";
import { CalendarDays, ChartBar, CircleX, FilePen, HandCoins, Info, Lock, Plus, Printer, SearchX, Wallet } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime, formatRupees, formatRupeesShort } from "@/lib/format";
import { incomeRows } from "@/lib/finance/income-list";
import { INCOME_MODES, INCOME_STATUS_WORDS } from "@/lib/finance/words";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Banner, Col, DataList, Empty, HBars, Mini, Split, Stack, Stats, Toolbar } from "@/components/money/kit";
import { UrlSearch, UrlSelect } from "@/components/money/url-filters";
import { UrlSheet } from "@/components/ui/url-sheet";
import { ExportButton } from "@/components/ui/export-button";
import { PeriodFilter } from "@/components/list/period-filter";
import { cx } from "@/components/ui/cx";
import { MODE_ICON } from "../../fee-management/_components/bits";
import { FinanceHead } from "../_components/finance-head";
import { ModeCell, Ref } from "../_components/bits";
import { ActButton, ReasonSheet } from "../_components/forms";
import { BASE, financePage, financePeriod, one, qs, type SearchParams } from "../_lib/page";
import { cancelIncomeAction, postIncomeAction } from "./actions";
import { RecordIncomeSheet } from "./sheets";
import { OldSoftwareBanner, OldSoftwareEmpty, allBeforeGoLive } from "@/components/money/go-live";
import { Words } from "@/lib/i18n/client";

export const metadata = { title: "Income" };

const HREF = `${BASE}/income`;
const UUID = /^[0-9a-f-]{36}$/i;
const ZERO = BigInt(0);
const TONE: Record<string, "ok" | "warn" | "neutral"> = { POSTED: "ok", DRAFT: "warn", CANCELLED: "neutral" };

/** Income (07 §2, mod-finance.jsx IncomePage): money the school receives other than fees. */
export default async function IncomePage({ searchParams }: { searchParams: SearchParams }) {
  const p = await financePage();
  const sp = await searchParams;
  const per = financePeriod(sp, p.dates, null);
  const q = one(sp.q).trim().slice(0, 80);
  const status = ["DRAFT", "POSTED", "CANCELLED"].includes(one(sp.status)) ? one(sp.status) : "";
  const headId = UUID.test(one(sp.head)) ? one(sp.head) : null;
  const mode = INCOME_MODES.some((m) => m.value === one(sp.mode)) ? one(sp.mode) : null;
  const openId = UUID.test(one(sp.open)) ? one(sp.open) : "";
  const cancelId = p.can.archive && UUID.test(one(sp.cancel)) ? one(sp.cancel) : "";
  const adding = p.can.create && one(sp.do) === "new";
  const monthStart = new Date(Date.UTC(p.today.getUTCFullYear(), p.today.getUTCMonth(), 1));
  const ctx = p.current.ctx;

  const data = await withSchool(ctx, async (tx) => {
    const filter = { q: q || null, range: per.range, status: status || null, headId, mode };
    const [list, total, fySum, monthSum, drafts, cancelled, byHead, heads, accounts, payers, opened] = await Promise.all([
      incomeRows(tx, filter),
      tx.income.count(),
      tx.income.aggregate({ where: { status: "POSTED", financialYearId: p.fy.id }, _sum: { amountPaise: true } }),
      tx.income.aggregate({ where: { status: "POSTED", date: { gte: monthStart, lte: p.today } }, _sum: { amountPaise: true }, _count: { _all: true } }),
      tx.income.findMany({ where: { status: "DRAFT" }, orderBy: { date: "asc" } }),
      tx.income.count({ where: { status: "CANCELLED" } }),
      tx.income.groupBy({ by: ["accountHeadId"], where: { status: "POSTED", financialYearId: p.fy.id }, _sum: { amountPaise: true } }),
      tx.accountHead.findMany({ where: { kind: "INCOME", archivedAt: null, OR: [{ systemKey: null }, { systemKey: { not: "fees" } }] }, orderBy: [{ code: "asc" }], select: { id: true, name: true, code: true } }),
      tx.bankAccount.findMany({ where: { archivedAt: null }, orderBy: [{ kind: "asc" }, { isMain: "desc" }, { name: "asc" }], select: { id: true, name: true, kind: true, isMain: true, accountLast4: true } }),
      adding ? tx.income.groupBy({ by: ["receivedFrom"], _count: { _all: true }, orderBy: { _count: { receivedFrom: "desc" } }, take: 20 }) : [],
      openId || cancelId ? incomeRows(tx, { q: null, range: null, status: null, headId: null, mode: null, id: openId || cancelId }, 1).then((r) => r.rows[0] ?? null) : null,
    ]);
    return { list, total, fySum, monthSum, drafts, cancelled, byHead, heads, accounts, payers, opened };
  });

  const keep = { ...per.keep, q: q || null, status: status || null, head: headId, mode };
  const here = (extra: Record<string, string | null> = {}) => qs(HREF, { ...keep, ...extra });
  const headName = new Map(data.heads.map((h) => [h.id, h.name]));
  const byHead = data.byHead.map((h) => ({ id: h.accountHeadId, name: headName.get(h.accountHeadId) ?? "Income", v: h._sum.amountPaise ?? ZERO })).sort((a, b) => (b.v > a.v ? 1 : -1));
  const maxHead = byHead[0]?.v ?? ZERO;
  const filtered = Boolean(q || status || headId || mode || per.range);
  const draftSum = data.drafts.reduce((s, d) => s + d.amountPaise, ZERO);
  const o = data.opened;
  const acctLabel = (a: (typeof data.accounts)[number]) => `${a.name}${a.accountLast4 ? ` ··${a.accountLast4}` : ""}`;

  return (
    <div>
      <FinanceHead pageName="Income" href={HREF} sub="Money the school receives other than fees: rent, donations, scrap sale, interest"
        viewActions={p.can.export ? <ExportButton href={qs(`${HREF}/export`, keep)} /> : null}
        actions={p.can.create ? <ButtonLink href={here({ do: "new" })} scroll={false} variant="primary" icon={Plus}><Words k="Record income" /></ButtonLink> : null} />
      <Stack>
        <Stats items={[
          { label: "This financial year", value: formatRupees(data.fySum._sum.amountPaise ?? ZERO), sub: `${formatDate(p.fy.startDate)} to ${formatDate(p.today < p.fy.endDate ? p.today : p.fy.endDate)}`, icon: HandCoins },
          { label: "This month", value: formatRupees(data.monthSum._sum.amountPaise ?? ZERO), sub: `${data.monthSum._count._all} ${data.monthSum._count._all === 1 ? "entry" : "entries"} posted`, icon: CalendarDays, tone: "ok" },
          { label: "Drafts", value: String(data.drafts.length), sub: data.drafts.length ? `${formatRupees(draftSum)} not in the Day Book` : "Nothing waiting", icon: FilePen, tone: data.drafts.length ? "warn" : undefined, href: qs(HREF, { status: "DRAFT" }), active: status === "DRAFT" },
          { label: "Cancelled", value: String(data.cancelled), sub: "Kept with the reason", icon: CircleX, href: qs(HREF, { status: "CANCELLED" }), active: status === "CANCELLED" },
        ]} />
        <Split className="[&>*]:min-w-0">
          <Card className="overflow-hidden">
            <CardHeader title="Income entries" description="Newest first. Posted entries are in the Day Book." icon={HandCoins} />
            <Toolbar className="border-t border-line md:!flex-col">
              <UrlSearch id="inc-q" placeholder="Payer, head or number" label="Search income" />
              <div className="grid grid-cols-2 gap-2.5 md:flex md:flex-wrap">
                <PeriodFilter {...p.dates} allLabel="Any date" />
                <UrlSelect id="inc-status" param="status" label="Status" className="md:w-36" options={[{ value: "", label: "All statuses" }, { value: "POSTED", label: "Posted" }, { value: "DRAFT", label: "Draft" }, { value: "CANCELLED", label: "Cancelled" }]} />
                <UrlSelect id="inc-head" param="head" label="Income head" className="md:w-56" options={[{ value: "", label: "All income heads" }, ...data.heads.map((h) => ({ value: h.id, label: h.name }))]} />
                <UrlSelect id="inc-mode" param="mode" label="Mode" className="md:w-40" options={[{ value: "", label: "All modes" }, ...INCOME_MODES]} />
              </div>
            </Toolbar>
            <OldSoftwareBanner goLive={p.goLive} from={per.from} to={per.to} what="income entries" className="mx-4 mb-3" />
            <DataList rows={data.list.rows} rowKey={(r) => r.id} rowHref={(r) => here({ open: r.id })} minWidth={860} caption="Income entries"
              footer={`Showing ${data.list.rows.length} of ${data.list.count} · ${formatRupees(data.list.posted)} posted`}
              empty={allBeforeGoLive(p.goLive, per.from, per.to) ? <OldSoftwareEmpty goLive={p.goLive} what="income entries" /> : data.total === 0
                ? <Empty icon={HandCoins} title="No income recorded yet" body="Hall rent, donations, scrap sale or bank interest go here. Fees reach the Day Book from Fees by themselves." action={p.can.create ? <ButtonLink href={here({ do: "new" })} scroll={false} variant="secondary" icon={Plus}><Words k="Record income" /></ButtonLink> : undefined} />
                : <Empty icon={SearchX} title="No income matches" body="Try another date, head or status." action={filtered ? <Link href={HREF} scroll={false} className={buttonClass("secondary")}><Words k="Clear filters" /></Link> : undefined} />}
              columns={[
                { key: "d", label: "Date", nowrap: true, render: (r) => <><p className="tnum">{formatDate(r.date)}</p><p className="text-[12px] text-ink3 font-mono">{r.receiptNo ?? "Draft"}</p></> },
                { key: "head", label: "Income head", render: (r) => <span className="text-[13.5px]">{r.headName}</span> },
                { key: "from", label: "Received from", render: (r) => <span className="font-semibold">{r.receivedFrom}</span> },
                { key: "amt", label: "Amount", align: "right", render: (r) => <b className={cx("font-semibold", r.status === "CANCELLED" && "line-through text-ink3")}>{formatRupees(r.amountPaise)}</b> },
                { key: "mode", label: "Mode", nowrap: true, render: (r) => <ModeCell mode={r.mode} /> },
                { key: "ref", label: "Reference", render: (r) => <Ref v={r.reference} /> },
                { key: "status", label: "Status", render: (r) => <Pill tone={TONE[r.status]}>{INCOME_STATUS_WORDS[r.status]?.label ?? r.status}</Pill> },
                { key: "by", label: "Recorded by", nowrap: true, render: (r) => <span className="text-[13px] text-ink2">{r.recordedBy || "—"}</span> },
              ]}
              phone={(r) => ({
                title: r.receivedFrom, sub: `${formatDate(r.date)} · ${r.headName}`, icon: MODE_ICON[r.mode] ?? Wallet,
                right: <><p className={cx("font-semibold tnum text-[14.5px]", r.status === "CANCELLED" && "line-through text-ink3")}>{formatRupees(r.amountPaise)}</p><Pill tone={TONE[r.status]} className="!h-5 !text-[11px]">{INCOME_STATUS_WORDS[r.status]?.label ?? r.status}</Pill></>,
              })} />
          </Card>
          <Col>
            <Card>
              <CardHeader title="By income head" description={`${p.fy.name} so far`} icon={ChartBar} />
              <div className="px-5 pb-5">
                {byHead.length ? <HBars labelWidth={128} rows={byHead.map((h) => ({ key: h.id, label: h.name, value: maxHead > ZERO ? Number((h.v * BigInt(1000)) / maxHead) / 10 : 0, text: formatRupeesShort(h.v), href: qs(HREF, { head: h.id }), active: headId === h.id }))} />
                  : <p className="text-[13.5px] text-ink3"><Words k="No income posted this financial year." /></p>}
              </div>
            </Card>
            {data.drafts.length > 0 && (
              <Banner tone="warn" title={`${data.drafts.length} ${data.drafts.length === 1 ? "draft" : "drafts"} not posted.`}
                action={<Link href={here({ open: data.drafts[0].id })} scroll={false} className={buttonClass("secondary", "sm")}><Words k="Open" /></Link>}>
                {data.drafts[0].receivedFrom}, {formatRupees(data.drafts[0].amountPaise)}<Words k=". Drafts are not in the Day Book." />
              </Banner>
            )}
            <Card>
              <CardHeader title="Good to know" icon={Info} />
              <ul className="px-5 pb-4 text-[13.5px] text-ink2 flex flex-col gap-2 list-disc pl-9">
                <li><Words k="Fees are not recorded here. They reach the Day Book from Fees by themselves." /></li>
                <li><Words k="A posted entry cannot be changed. Cancel it with a reason and record it again." /></li>
                <li><Words k="Each posted entry has a receipt to print." /></li>
              </ul>
            </Card>
          </Col>
        </Split>
      </Stack>

      {adding && (
        <RecordIncomeSheet closeHref={here()} today={p.today.toISOString().slice(0, 10)} payers={data.payers.map((x) => x.receivedFrom)}
          heads={data.heads.map((h) => ({ value: h.id, label: `${h.name} · ${h.code}` }))}
          cash={data.accounts.filter((a) => a.kind === "CASH").map((a) => ({ value: a.id, label: acctLabel(a) }))}
          banks={data.accounts.filter((a) => a.kind === "BANK").map((a) => ({ value: a.id, label: acctLabel(a) }))}
          mainBank={data.accounts.find((a) => a.kind === "BANK" && a.isMain)?.id ?? data.accounts.find((a) => a.kind === "BANK")?.id ?? ""} />
      )}

      {openId && o && (
        <UrlSheet title={`${o.headName} · ${formatRupees(o.amountPaise)}`} sub={`${o.receiptNo ?? "Draft"} · ${formatDate(o.date)}`} closeHref={here()}
          footer={o.status !== "CANCELLED" ? <div className="flex flex-wrap gap-2 justify-end">
            {p.can.archive && <ButtonLink href={here({ cancel: o.id })} scroll={false} variant="danger-soft"><Words k="Cancel entry" /></ButtonLink>}
            {o.status === "DRAFT" && p.can.edit && <ActButton action={postIncomeAction} fields={{ incomeId: o.id }} label="Post to Day Book" icon="check" />}
            {o.status === "POSTED" && <a href={`${HREF}/${o.id}/receipt`} target="_blank" rel="noreferrer" className={buttonClass("secondary")}><Printer size={16} aria-hidden="true" /><Words k="Print receipt" /></a>}
          </div> : undefined}>
          <div className="flex items-center gap-2 mb-4"><Pill tone={TONE[o.status]}>{INCOME_STATUS_WORDS[o.status]?.label}</Pill>{o.status === "POSTED" && <span className="text-[13px] text-ink3"><Words k="In the Day Book for" /> {formatDate(o.date)}</span>}</div>
          <div className="grid grid-cols-2 gap-x-5 gap-y-3.5">
            <Mini k="Received from" v={o.receivedFrom} /><Mini k="Income head" v={`${o.headName}${o.headCode ? ` · ${o.headCode}` : ""}`} />
            <Mini k="Mode" v={<ModeCell mode={o.mode} />} /><Mini k="Reference" v={<Ref v={o.reference} />} />
            <Mini k="Into" v={o.accountName || "—"} /><Mini k="Recorded by" v={`${o.recordedBy || "—"} · ${formatDateTime(o.createdAt, p.tz)}`} />
          </div>
          {o.note && <p className="mt-4 text-[13.5px] text-ink2 bg-sunken rounded-xl px-3.5 py-2.5">{o.note}</p>}
          {o.status === "CANCELLED" && <Banner tone="bad" className="mt-4" title={`Cancelled${o.cancelledAt ? ` on ${formatDate(o.cancelledAt, p.tz)}` : ""}${o.cancelledBy ? ` by ${o.cancelledBy}` : ""}.`}>{o.cancelReason}</Banner>}
          {o.status === "POSTED" && <p className="mt-4 text-[12.5px] text-ink3 flex gap-1.5"><Lock size={14} className="shrink-0 mt-0.5" aria-hidden="true" /><Words k="Posted entries cannot be edited. Cancel and record again if something is wrong." /></p>}
        </UrlSheet>
      )}
      {openId && !o && (
        <UrlSheet title="Not found" closeHref={here()}><Empty icon={SearchX} title="This income entry was not found" /></UrlSheet>
      )}
      {cancelId && o && o.status !== "CANCELLED" && (
        <ReasonSheet closeHref={here()} title={`Cancel ${o.receiptNo ?? "this draft"}?`} label="Cancel entry" placeholder="Example: entered twice" action={cancelIncomeAction} hidden={{ incomeId: o.id }}
          sub={o.status === "POSTED" ? `${formatRupees(o.amountPaise)} from ${o.receivedFrom}. The entry is kept, marked Cancelled, and a reversal goes in today’s Day Book.` : `${formatRupees(o.amountPaise)} from ${o.receivedFrom}. It was a draft, so the Day Book does not change.`} />
      )}
    </div>
  );
}
