import Link from "next/link";
import { BadgeCheck, ChartBar, CircleCheck, CircleX, FilePen, FileText, FileWarning, Hourglass, IndianRupee, Paperclip, Plus, ReceiptText, SearchX, Send, ShieldCheck, Undo2 } from "lucide-react";
import { withSchool, type SchoolContext, type Tx } from "@/lib/db";
import { canDecide, defaultSteps, stepForAmount, type RuleStep } from "@/lib/approvals";
import { ruleNamer } from "@/lib/settings/approval-rules";
import { fileLink } from "@/lib/files";
import { formatDate, formatDateTime, formatRupees, formatRupeesShort } from "@/lib/format";
import { expenseRows, NO_FILTER, type ExpenseRow } from "@/lib/finance/expense-list";
import { accountBalances } from "@/lib/finance/daybook";
import { lastHeadUsed } from "@/lib/finance/expenses";
import { EXPENSE_STATUS_WORDS } from "@/lib/finance/words";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill, type BadgeTone } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Banner, DataList, Empty, HBars, Mini, Stack, Stats, Timeline, Toolbar, type Tone } from "@/components/money/kit";
import { LinkTabs } from "@/components/ui/link-tabs";
import { UrlSearch, UrlSelect } from "@/components/money/url-filters";
import { UrlSheet } from "@/components/ui/url-sheet";
import { ExportButton } from "@/components/ui/export-button";
import { PeriodFilter } from "@/components/list/period-filter";
import { cx } from "@/components/ui/cx";
import { FinanceHead } from "../_components/finance-head";
import { Line, ModeCell } from "../_components/bits";
import { ActButton, ReasonSheet } from "../_components/forms";
import { BASE, financePage, financePeriod, one, qs, type SearchParams } from "../_lib/page";
import { cancelExpenseAction, decideExpenseAction, submitExpenseAction } from "./actions";
import { AttachBillSheet, PaySheet, RecordExpenseSheet, VendorBillSheet, type ApproverStep } from "./sheets";
import { OldSoftwareBanner, OldSoftwareEmpty, allBeforeGoLive } from "@/components/money/go-live";

export const metadata = { title: "Expenses" };

const HREF = `${BASE}/expenses`;
const UUID = /^[0-9a-f-]{36}$/i;
const ZERO = BigInt(0);
const TABS = ["all", "waiting", "bills"] as const;
const STATUS_OPTIONS = [{ value: "", label: "All statuses" }, { value: "DRAFT", label: "Draft" }, { value: "WAITING", label: "Waiting for approval" }, { value: "APPROVED", label: "Approved" }, { value: "PAID", label: "Paid" }, { value: "CANCELLED", label: "Cancelled" }];
const ABOVE = [{ value: "", label: "Any amount" }, { value: "2000", label: "Above ₹2,000" }, { value: "10000", label: "Above ₹10,000" }, { value: "50000", label: "Above ₹50,000" }, { value: "100000", label: "Above ₹1,00,000" }];
const PILL: Record<string, BadgeTone> = { DRAFT: "neutral", WAITING: "warn", APPROVED: "info", PAID: "ok", CANCELLED: "neutral" };
const ICON_TONE: Record<string, Tone> = { DRAFT: "neutral", WAITING: "warn", APPROVED: "info", PAID: "ok", CANCELLED: "neutral" };
const rupees = (p: bigint) => Number(p / BigInt(100));

function ExpPill({ s, small }: { s: string; small?: boolean }) {
  return <Pill tone={PILL[s] ?? "neutral"} className={small ? "!h-5 !text-[11px]" : undefined}>{EXPENSE_STATUS_WORDS[s]?.label ?? s}</Pill>;
}

type Decision = { can: boolean; waitingFor: string };
async function decisions(tx: Tx, ctx: SchoolContext, approvalIds: string[]) {
  const out = new Map<string, Decision>();
  if (!approvalIds.length) return out;
  const approvals = await tx.approval.findMany({ where: { id: { in: approvalIds } } });
  const users = await tx.userLogin.findMany({ where: { id: { in: approvals.map((a) => a.currentApproverId).filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } });
  const roles = await tx.role.findMany({ where: { key: { in: approvals.map((a) => a.currentApproverRole).filter((x): x is string => Boolean(x)) } }, select: { key: true, name: true } });
  for (const a of approvals) {
    const who = (a.currentApproverId && users.find((u) => u.id === a.currentApproverId)?.displayName) || (a.currentApproverRole && roles.find((r) => r.key === a.currentApproverRole)?.name) || "the approver";
    out.set(a.id, { can: await canDecide(tx, ctx, a), waitingFor: who });
  }
  return out;
}

/** Expenses (07 §2, mod-finance.jsx ExpensesPage): bills and expenses with a photo of the bill; bigger amounts wait for approval. */
export default async function ExpensesPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await financePage();
  const sp = await searchParams;
  const ctx = p.current.ctx;
  const billsOn = p.has("finance-vendor-bills");
  const centresOn = p.has("finance-cost-centres");
  const tabRaw = one(sp.tab);
  const tab = (TABS as readonly string[]).includes(tabRaw) && (tabRaw !== "bills" || billsOn) ? (tabRaw as (typeof TABS)[number]) : "all";
  const per = financePeriod(sp, p.dates, "finyear");
  const q = one(sp.q).trim().slice(0, 80);
  const status = STATUS_OPTIONS.some((o) => o.value && o.value === one(sp.status)) ? one(sp.status) : "";
  const headId = UUID.test(one(sp.head)) ? one(sp.head) : null;
  const deptId = centresOn && UUID.test(one(sp.dept)) ? one(sp.dept) : null;
  const above = ABOVE.some((o) => o.value && o.value === one(sp.above)) ? one(sp.above) : "";
  const pick = (k: string, allowed: boolean) => (allowed && UUID.test(one(sp[k])) ? one(sp[k]) : "");
  const openId = pick("open", true);
  const payId = pick("pay", p.can.edit);
  const billId = pick("bill", p.can.edit);
  const cancelId = pick("cancel", p.can.archive);
  const backId = pick("back", p.can.approve);
  const adding = p.can.create && one(sp.do) === "new";
  const addingBill = p.can.create && billsOn && one(sp.do) === "bill";
  const focusId = openId || payId || billId || cancelId || backId;
  const monthStart = new Date(Date.UTC(p.today.getUTCFullYear(), p.today.getUTCMonth(), 1));
  const billAbove = p.settings.billRequiredAbove;
  const needsForm = adding || addingBill || Boolean(payId);

  const data = await withSchool(ctx, async (tx) => {
    const filter = { q: q || null, range: per.range, status: status || null, headId, costCentreId: deptId, abovePaise: above ? BigInt(above) * BigInt(100) : null };
    const [list, total, waiting, approved, bills, noBill, paidMonth, heads, centres, rule, namer, focus] = await Promise.all([
      tab === "all" ? expenseRows(tx, { ...filter, hidePay: p.payHeads }) : null,
      tx.expense.count(),
      expenseRows(tx, { ...NO_FILTER, hidePay: p.payHeads, status: "WAITING" }, 100),
      tx.expense.aggregate({ where: { status: "APPROVED" }, _sum: { amountPaise: true, paidPaise: true }, _count: { _all: true } }),
      billsOn ? expenseRows(tx, { ...NO_FILTER, hidePay: p.payHeads, vendorBills: true }, tab === "bills" ? 300 : 1) : null,
      tx.expense.findMany({ where: { billFileId: null, broughtIn: false, amountPaise: { gt: billAbove }, status: { in: ["WAITING", "APPROVED", "PAID"] } }, orderBy: { date: "asc" }, take: 50 }),
      tx.expensePayment.findMany({ where: { cancelledAt: null, date: { gte: monthStart, lte: p.today } }, select: { amountPaise: true, expense: { select: { accountHeadId: true } } } }),
      tx.accountHead.findMany({ where: { kind: "EXPENSE", archivedAt: null }, orderBy: { code: "asc" }, select: { id: true, name: true, code: true, systemKey: true } }),
      centresOn ? tx.costCentre.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }) : [],
      tx.approvalRule.findFirst({ where: { requestType: "expense", archivedAt: null } }),
      ruleNamer(tx, ctx.schoolId),
      focusId ? expenseRows(tx, { ...NO_FILTER, hidePay: p.payHeads, id: focusId }, 1).then((r) => r.rows[0] ?? null) : null,
    ]);
    const steps = (rule?.steps as RuleStep[] | undefined) ?? defaultSteps("expense");
    const waitIds = [...waiting.rows.map((r) => r.approvalId), focus?.status === "WAITING" ? focus.approvalId : null].filter((x): x is string => Boolean(x));
    const decided = await decisions(tx, ctx, waitIds);
    const form = needsForm ? await (async () => {
      const [accounts, balances, vendors, lastHead] = await Promise.all([
        tx.bankAccount.findMany({ where: { archivedAt: null }, orderBy: [{ isMain: "desc" }, { name: "asc" }], select: { id: true, name: true, kind: true, isMain: true, accountLast4: true } }),
        accountBalances(tx, ctx),
        tx.vendor.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true }, take: 500 }),
        lastHeadUsed(tx, ctx),
      ]);
      return { accounts, balances, vendors, lastHead };
    })() : null;
    return { list, total, waiting, approved, bills, noBill, paidMonth, heads, centres, steps, namer, focus, decided, form };
  });

  const keep = { ...per.keep, tab: tab === "all" ? null : tab, q: q || null, status: status || null, head: headId, dept: deptId, above: above || null };
  const here = (extra: Record<string, string | null> = {}) => qs(HREF, { ...keep, ...extra });
  const tabHref = (t: string) => qs(HREF, { ...per.keep, tab: t === "all" ? null : t });
  const headName = new Map(data.heads.map((h) => [h.id, h.name]));
  const paidMonthSum = data.paidMonth.reduce((s, x) => s + x.amountPaise, ZERO);
  const byHead = [...data.paidMonth.reduce((m, x) => m.set(x.expense.accountHeadId, (m.get(x.expense.accountHeadId) ?? ZERO) + x.amountPaise), new Map<string, bigint>())]
    .sort((a, b) => (b[1] > a[1] ? 1 : -1)).slice(0, 6);
  const maxHead = byHead[0]?.[1] ?? ZERO;
  const waitSum = data.waiting.rows.reduce((s, r) => s + r.amountPaise, ZERO);
  const approvedLeft = (data.approved._sum.amountPaise ?? ZERO) - (data.approved._sum.paidPaise ?? ZERO);
  const unpaidBills = data.bills?.rows.filter((b) => b.status !== "CANCELLED" && b.paidPaise < b.amountPaise) ?? [];
  const toPayBills = unpaidBills.reduce((s, b) => s + (b.amountPaise - b.paidPaise), ZERO);
  const filtered = Boolean(q || status || headId || deptId || above || one(sp.period));
  const monthWord = new Intl.DateTimeFormat("en-IN", { month: "long", timeZone: "UTC" }).format(p.today);
  const atOnce = p.settings.expenseApproveUpTo;

  // Who approves: up to the at-once limit, then each step of the expense rule (Settings, Forms & Approvals).
  const stepWho = (s: RuleStep) => (s.approverUserId ? data.namer.person(s.approverUserId) : s.approverRole ? data.namer.role(s.approverRole) : "the approver");
  const approverSteps: ApproverStep[] = data.steps.map((s) => ({ upTo: s.upToPaise ? rupees(BigInt(s.upToPaise)) : null, who: stepWho(s) }));
  const ladder: { k: string; who: string | null }[] = [{ k: `Up to ${formatRupees(atOnce)}`, who: null }];
  let from = atOnce;
  for (const s of data.steps) {
    const upTo = s.upToPaise ? BigInt(s.upToPaise) : null;
    if (upTo !== null && upTo <= from) continue;
    ladder.push({ k: upTo === null ? `Above ${formatRupees(from)}` : `${formatRupees(from + BigInt(100))} to ${formatRupees(upTo)}`, who: stepWho(s) });
    if (upTo === null) break;
    from = upTo;
  }
  const whoFor = (amount: bigint) => (amount <= atOnce ? null : stepWho(data.steps[stepForAmount(data.steps, amount)] ?? {}));

  const decisionOf = (r: ExpenseRow) => (r.approvalId ? data.decided.get(r.approvalId) : undefined);
  const ApproveButtons = ({ r }: { r: ExpenseRow }) => {
    const d = decisionOf(r);
    if (p.can.approve && d?.can) return (
      <div className="relative z-10 flex gap-1.5">
        <ButtonLink href={here({ back: r.id })} scroll={false} size="sm" variant="ghost">Reject</ButtonLink>
        <ActButton action={decideExpenseAction} fields={{ expenseId: r.id, decision: "approve" }} label="Approve" icon="check" size="sm" />
      </div>
    );
    return <span className="text-[12.5px] text-ink3">Waiting for {d?.waitingFor ?? "approval"}</span>;
  };

  const f = data.form;
  const acctLabel = (a: { name: string; accountLast4: string | null }) => `${a.name}${a.accountLast4 ? ` ··${a.accountLast4}` : ""}`;
  const cash = f?.accounts.filter((a) => a.kind === "CASH").map((a) => ({ value: a.id, label: acctLabel(a) })) ?? [];
  const banks = f?.accounts.filter((a) => a.kind === "BANK").map((a) => ({ value: a.id, label: acctLabel(a) })) ?? [];
  const mainBank = f?.accounts.find((a) => a.kind === "BANK" && a.isMain)?.id ?? banks[0]?.value ?? "";
  const cashId = cash[0]?.value;
  const cashInHand = f && cashId ? rupees(f.balances.get(cashId) ?? ZERO) : 0;
  const userHeads = data.heads.filter((h) => !h.systemKey).map((h) => ({ value: h.id, label: `${h.name} · ${h.code}` }));
  const centreOptions = centresOn ? data.centres.map((c) => ({ value: c.id, label: c.name })) : null;
  const today = p.today.toISOString().slice(0, 10);
  const o = data.focus;
  const firstNoBill = data.noBill[0];

  return (
    <div>
      <FinanceHead pageName="Expenses" href={HREF} sub="Bills and expenses with a photo of the bill. Bigger amounts wait for approval."
        viewActions={p.can.export ? <ExportButton href={qs(`${HREF}/export`, keep)} /> : null}
        actions={p.can.create ? <>
          {billsOn && <ButtonLink href={here({ do: "bill" })} scroll={false} variant="secondary" icon={FileText}>Record vendor bill</ButtonLink>}
          <ButtonLink href={here({ do: "new" })} scroll={false} variant="primary" icon={Plus}>Record expense</ButtonLink>
        </> : null} />
      <Stack>
        <Stats items={[
          { label: "Paid this month", value: formatRupees(paidMonthSum), sub: `${monthWord} so far, in the Day Book`, icon: ReceiptText },
          { label: "Waiting for approval", value: String(data.waiting.count), sub: formatRupees(waitSum), tone: data.waiting.count ? "warn" : "ok", icon: Hourglass, href: tabHref("waiting"), active: tab === "waiting" },
          { label: "Approved, not paid", value: String(data.approved._count._all), sub: `${formatRupees(approvedLeft)} · not in the Day Book yet`, tone: "info", icon: BadgeCheck, href: qs(HREF, { status: "APPROVED" }), active: status === "APPROVED" },
          { label: "Bills missing", value: String(data.noBill.length), sub: `Needed above ${formatRupees(billAbove)}`, tone: data.noBill.length ? "bad" : "ok", icon: FileWarning, href: firstNoBill ? here({ open: firstNoBill.id }) : undefined },
        ]} />

        {firstNoBill && (
          <Banner tone="warn" title={`Bill missing: ${firstNoBill.note || firstNoBill.number}, ${formatRupees(firstNoBill.amountPaise)}.`}
            action={p.can.edit && firstNoBill.status !== "CANCELLED" ? <Link href={here({ bill: firstNoBill.id })} scroll={false} className={buttonClass("secondary", "sm")}>Add bill</Link> : undefined}>
            {firstNoBill.status === "PAID" ? "It was paid without the bill. Attach it for the records." : "It cannot be marked paid until the bill is attached."}
          </Banner>
        )}

        <Card className="overflow-hidden">
          <LinkTabs className="px-3" label="Expenses" tabs={[
            { href: tabHref("all"), label: "All expenses", count: data.total, on: tab === "all" },
            { href: tabHref("waiting"), label: "Waiting for approval", count: data.waiting.count, on: tab === "waiting" },
            ...(billsOn ? [{ href: tabHref("bills"), label: "Vendor bills", count: unpaidBills.length, on: tab === "bills" }] : []),
          ]} />

          {tab === "all" && data.list && <>
            <Toolbar className="md:!flex-col">
              <UrlSearch id="ex-q" placeholder="What, vendor or number" label="Search expenses" />
              <div className="grid grid-cols-2 gap-2.5 md:flex md:flex-wrap">
                <PeriodFilter {...p.dates} fallback="finyear" />
                <UrlSelect id="ex-status" param="status" label="Status" className="md:w-48" options={STATUS_OPTIONS} />
                <UrlSelect id="ex-head" param="head" label="Expense head" className="md:w-60" options={[{ value: "", label: "All expense heads" }, ...data.heads.map((h) => ({ value: h.id, label: h.name }))]} />
                {centresOn && <UrlSelect id="ex-dept" param="dept" label="Department" className="md:w-48" options={[{ value: "", label: "All departments" }, ...data.centres.map((c) => ({ value: c.id, label: c.name }))]} />}
                <UrlSelect id="ex-above" param="above" label="Amount" className={cx("md:w-40", !centresOn && "col-span-2 md:col-span-1")} options={ABOVE} />
              </div>
            </Toolbar>
            <OldSoftwareBanner goLive={p.goLive} from={per.from} to={per.to} what="expenses" className="mx-4 mb-3" />
            <DataList rows={data.list.rows} rowKey={(r) => r.id} rowHref={(r) => here({ open: r.id })} minWidth={980} caption="Expenses"
              footer={`Showing ${data.list.rows.length} of ${data.list.count} · ${formatRupees(data.list.paid)} paid`}
              empty={allBeforeGoLive(p.goLive, per.from, per.to) ? <OldSoftwareEmpty goLive={p.goLive} what="expenses" /> : data.total === 0
                ? <Empty icon={ReceiptText} title="No expenses recorded yet" body="Take a photo of the bill, enter the amount and the head. Small ones are approved at once." action={p.can.create ? <ButtonLink href={here({ do: "new" })} scroll={false} variant="secondary" icon={Plus}>Record expense</ButtonLink> : undefined} />
                : <Empty icon={SearchX} title="No expenses match" body="Try another status, head or amount." action={filtered ? <Link href={HREF} scroll={false} className={buttonClass("secondary")}>Clear filters</Link> : undefined} />}
              columns={[
                { key: "d", label: "Date", nowrap: true, render: (r) => <><p className="tnum">{formatDate(r.date)}</p><p className="text-[12px] text-ink3 font-mono">{r.number}</p></> },
                { key: "what", label: "Expense", render: (r) => <><p className="font-semibold leading-tight">{r.what}</p><p className="text-[12.5px] text-ink3">{r.headName}{r.costCentreName ? ` · ${r.costCentreName}` : ""}</p></> },
                { key: "vendor", label: "Vendor", render: (r) => <span className="text-[13.5px]">{r.vendorName || "—"}</span> },
                { key: "amt", label: "Amount", align: "right", render: (r) => <b className={cx("font-semibold", r.status === "CANCELLED" && "line-through text-ink3")}>{formatRupees(r.amountPaise)}</b> },
                { key: "mode", label: "Mode", nowrap: true, render: (r) => <ModeCell mode={r.lastPaid?.mode ?? null} /> },
                { key: "bill", label: "Bill", render: (r) => (r.hasBill ? <span className="inline-flex items-center gap-1 text-[13px] text-ok"><Paperclip size={14} aria-hidden="true" />Yes</span> : <span className={cx("text-[13px]", r.amountPaise > billAbove && r.status !== "CANCELLED" ? "text-bad font-semibold" : "text-ink3")}>No</span>) },
                { key: "status", label: "Status", render: (r) => <ExpPill s={r.status} /> },
                { key: "by", label: "Requested by", nowrap: true, render: (r) => <span className="text-[13px] text-ink2">{r.broughtIn ? "Brought in" : r.requestedBy || "—"}</span> },
              ]}
              phone={(r) => ({
                title: r.what, sub: `${formatDate(r.date)} · ${r.vendorName || r.headName}`, icon: ReceiptText, iconTone: ICON_TONE[r.status],
                right: <><p className={cx("font-semibold tnum text-[14.5px]", r.status === "CANCELLED" && "line-through text-ink3")}>{formatRupees(r.amountPaise)}</p><ExpPill s={r.status} small /></>,
              })} />
          </>}

          {tab === "waiting" && (data.waiting.rows.length ? (
            <ul className="divide-y divide-line/70">
              {data.waiting.rows.map((r) => {
                const d = decisionOf(r);
                const mine = p.can.approve && d?.can;
                return (
                  <li key={r.id} className="relative px-4 md:px-5 py-4 flex flex-col md:flex-row md:items-center gap-3">
                    <Link href={here({ open: r.id })} scroll={false} className="min-w-0 flex-1 text-left flex items-start gap-3">
                      <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-warn/12 text-warn"><Hourglass size={19} aria-hidden="true" /></span>
                      <span className="min-w-0">
                        <span className="block font-semibold text-[15px] leading-snug">{r.what} · <span className="tnum">{formatRupees(r.amountPaise)}</span></span>
                        <span className="block text-[13px] text-ink3">{[r.vendorName, r.headName, `asked by ${r.requestedBy || "—"} on ${formatDate(r.date)}`].filter(Boolean).join(" · ")}</span>
                        <span className="flex gap-1.5 mt-1.5 flex-wrap">
                          <Pill tone={mine ? "brand" : "neutral"} className="!h-[22px] !text-[11.5px]">{mine ? "Waiting for you" : `Waiting for ${d?.waitingFor ?? "approval"}`}</Pill>
                          {r.hasBill ? <Pill tone="ok" className="!h-[22px] !text-[11.5px]"><Paperclip size={12} aria-hidden="true" />Bill attached</Pill> : <Pill tone="bad" className="!h-[22px] !text-[11.5px]">No bill</Pill>}
                        </span>
                      </span>
                    </Link>
                    {p.change && <ApproveButtons r={r} />}
                  </li>
                );
              })}
            </ul>
          ) : <Empty icon={CircleCheck} title="Nothing waiting for approval" body={`Expenses above ${formatRupees(atOnce)} come here first. They cannot be paid until approved.`} />)}

          {tab === "bills" && data.bills && (
            <DataList rows={data.bills.rows} rowKey={(b) => b.id} rowHref={(b) => here({ open: b.id })} minWidth={900} caption="Vendor bills"
              footer={`${formatRupees(toPayBills)} still to pay on ${unpaidBills.length} ${unpaidBills.length === 1 ? "bill" : "bills"}`}
              empty={<Empty icon={FileText} title="No vendor bills yet" body="Record a vendor’s bill with its number and due date, and pay it later in parts." action={p.can.create ? <ButtonLink href={here({ do: "bill" })} scroll={false} variant="secondary" icon={Plus}>Record vendor bill</ButtonLink> : undefined} />}
              columns={[
                { key: "no", label: "Bill number", render: (b) => <><p className="font-mono text-[12.5px]">{b.billNo}</p><p className="text-[12px] text-ink3">{formatDate(b.date)}</p></> },
                { key: "vendor", label: "Vendor", render: (b) => <><p className="font-semibold leading-tight">{b.vendorName}</p><p className="text-[12px] text-ink3">{b.headName}</p></> },
                { key: "amt", label: "Bill amount", align: "right", render: (b) => formatRupees(b.amountPaise) },
                { key: "paid", label: "Paid", align: "right", render: (b) => formatRupees(b.paidPaise) },
                { key: "bal", label: "To pay", align: "right", render: (b) => <b className={cx("font-semibold", b.status !== "CANCELLED" && b.amountPaise > b.paidPaise && "text-warn")}>{formatRupees(b.status === "CANCELLED" ? ZERO : b.amountPaise - b.paidPaise)}</b> },
                { key: "due", label: "Due", nowrap: true, render: (b) => <span className={cx("text-[13px]", b.billDueDate && b.billDueDate < p.today && b.paidPaise < b.amountPaise && b.status !== "CANCELLED" ? "text-bad font-semibold" : "text-ink2")}>{b.paidPaise >= b.amountPaise || !b.billDueDate || b.status === "CANCELLED" ? "—" : formatDate(b.billDueDate)}</span> },
                { key: "st", label: "Status", render: (b) => <BillPill b={b} /> },
              ]}
              phone={(b) => ({ title: b.vendorName, sub: `${b.billNo} · due ${b.billDueDate ? formatDate(b.billDueDate) : "—"}`, icon: FileText, right: <><p className="font-semibold tnum text-[14.5px]">{formatRupees(b.status === "CANCELLED" ? ZERO : b.amountPaise - b.paidPaise)}</p><BillPill b={b} small /></> })} />
          )}
        </Card>

        <div className="grid lg:grid-cols-2 gap-5 lg:gap-6 items-start">
          <Card>
            <CardHeader title="Who approves" description="From Settings, Forms & Approvals" icon={ShieldCheck} />
            <ul className="px-5 pb-4">
              {ladder.map((l) => <Line key={l.k} k={l.k} v={l.who ? <Pill tone="info">{l.who}</Pill> : <Pill tone="ok">Approved at once</Pill>} />)}
            </ul>
            <p className="px-5 pb-4 -mt-1 text-[12.5px] text-ink3">An expense reaches the Day Book only when it is marked Paid, on the date paid.</p>
          </Card>
          <Card>
            <CardHeader title="This month by head" description={`Paid in ${monthWord} so far`} icon={ChartBar} />
            <div className="px-5 pb-5">
              {byHead.length ? <HBars labelWidth={150} rows={byHead.map(([id, v]) => ({ key: id, label: headName.get(id) ?? "Expense", value: maxHead > ZERO ? Number((v * BigInt(1000)) / maxHead) / 10 : 0, text: formatRupeesShort(v) }))} />
                : <p className="text-[13.5px] text-ink3">Nothing paid this month yet.</p>}
            </div>
          </Card>
        </div>
      </Stack>

      {adding && (
        <RecordExpenseSheet closeHref={here()} today={today} heads={userHeads} lastHead={f?.lastHead ?? null} centres={centreOptions} vendors={f?.vendors.map((v) => v.name) ?? []}
          cash={cash} banks={banks} mainBank={mainBank} cashInHand={cashInHand} atOnce={rupees(atOnce)} billAbove={rupees(billAbove)} steps={approverSteps} />
      )}
      {addingBill && (
        <VendorBillSheet closeHref={here()} today={today} heads={userHeads} lastHead={f?.lastHead ?? null} centres={centreOptions} billAbove={rupees(billAbove)}
          vendors={f?.vendors.map((v) => ({ value: v.id, label: v.name })) ?? []} />
      )}

      {openId && o && <ExpenseSheet o={o} />}
      {openId && !o && <UrlSheet title="Not found" closeHref={here()}><Empty icon={SearchX} title="This expense was not found" /></UrlSheet>}
      {payId && o && o.status === "APPROVED" && (
        <PaySheet closeHref={here({ open: o.id })} expenseId={o.id} partial={o.isVendorBill} today={today} cash={cash} banks={banks} mainBank={mainBank} cashInHand={cashInHand}
          left={rupees(o.amountPaise - o.paidPaise)}
          title={o.isVendorBill ? `Pay bill ${o.billNo}` : `Mark ${o.number} paid`}
          sub={o.isVendorBill ? `${o.vendorName} · ${formatRupees(o.amountPaise - o.paidPaise)} to pay of ${formatRupees(o.amountPaise)}` : `${o.what} · ${formatRupees(o.amountPaise)}${o.vendorName ? ` to ${o.vendorName}` : ""}. It goes into the Day Book on the date paid.`} />
      )}
      {billId && o && !o.hasBill && <AttachBillSheet closeHref={here({ open: o.id })} expenseId={o.id} sub={`${o.number} · ${o.what} · ${formatRupees(o.amountPaise)}`} />}
      {backId && o && o.status === "WAITING" && (
        <ReasonSheet closeHref={here()} title={`Send back ${o.number}?`} label="Send back" placeholder="Example: get two quotes first" action={decideExpenseAction} hidden={{ expenseId: o.id, decision: "reject" }} danger={false}
          sub={`${o.what}, ${formatRupees(o.amountPaise)}. It goes back to ${o.requestedBy || "the person who asked"} as a draft with your reason.`} />
      )}
      {cancelId && o && o.status !== "CANCELLED" && (
        <ReasonSheet closeHref={here()} title={`Cancel ${o.number}?`} label="Cancel expense" placeholder="Example: entered twice" action={cancelExpenseAction} hidden={{ expenseId: o.id }}
          sub={o.paidPaise > ZERO ? `${formatRupees(o.paidPaise)} paid${o.vendorName ? ` to ${o.vendorName}` : ""}. The expense is kept, marked Cancelled, and a reversal goes in today’s Day Book.` : `${formatRupees(o.amountPaise)} · ${o.what}. Nothing was paid, so the Day Book does not change.`} />
      )}
    </div>
  );

  function ExpenseSheet({ o }: { o: ExpenseRow }) {
    const d = decisionOf(o);
    const mine = p.can.approve && d?.can;
    const who = d?.waitingFor ?? whoFor(o.amountPaise) ?? "the approver";
    const needsBill = !o.hasBill && o.amountPaise > billAbove;
    const steps = [
      { what: <>{o.broughtIn ? "Brought in from old software" : <>Asked by <b className="font-semibold">{o.requestedBy || "—"}</b>{o.costCentreName ? ` · ${o.costCentreName}` : ""}</>}</>, when: formatDateTime(o.createdAt, p.tz), icon: FilePen, tone: "neutral" as Tone },
      ...(o.rejectReason && o.status === "DRAFT" ? [{ what: <>Sent back: “{o.rejectReason}”</>, when: "", icon: Undo2, tone: "bad" as Tone }] : []),
      ...(o.status === "WAITING" ? [{ what: <>Waiting for <b className="font-semibold">{who}</b></>, when: "Cannot be paid until approved", icon: Hourglass, tone: "warn" as Tone }] : []),
      ...(o.approvedAt && o.status !== "DRAFT" && o.status !== "WAITING" ? [{ what: <>Approved · {o.approvedBy || "—"}{o.amountPaise <= atOnce ? ` (up to ${formatRupees(atOnce)}, at once)` : ""}</>, when: o.status === "APPROVED" && o.paidPaise === ZERO ? "Not in the Day Book until paid" : formatDateTime(o.approvedAt, p.tz), icon: BadgeCheck, tone: "brand" as Tone }] : []),
      ...o.payments.map((x) => ({ what: <>{x.cancelledAt ? "Reversed: " : "Paid "}{formatRupees(x.amountPaise)} by {ModeWord(x.mode)}{x.reference ? ` · ${x.reference}` : ""}{x.account ? ` from ${x.account}` : ""}</>, when: `${formatDate(x.date)} · in the Day Book`, icon: x.cancelledAt ? CircleX : CircleCheck, tone: (x.cancelledAt ? "bad" : "ok") as Tone })),
      ...(o.status === "CANCELLED" ? [{ what: <>Cancelled by {o.cancelledBy || "—"}: “{o.cancelReason}”</>, when: o.cancelledAt ? formatDateTime(o.cancelledAt, p.tz) : "", icon: CircleX, tone: "bad" as Tone }] : []),
    ];
    let actions: React.ReactNode = null;
    if (!o.broughtIn) {
      if (o.status === "DRAFT" && p.can.create) actions = <>
        {p.can.archive && <ButtonLink href={here({ cancel: o.id })} scroll={false} variant="danger-soft">Cancel</ButtonLink>}
        <ActButton action={submitExpenseAction} fields={{ expenseId: o.id }} label={o.rejectReason ? "Send again" : "Send for approval"} icon="send" />
      </>;
      if (o.status === "WAITING") actions = mine
        ? <><ButtonLink href={here({ back: o.id })} scroll={false} variant="ghost">Reject</ButtonLink><ActButton action={decideExpenseAction} fields={{ expenseId: o.id, decision: "approve" }} label={`Approve ${formatRupees(o.amountPaise)}`} icon="check" /></>
        : p.can.archive ? <ButtonLink href={here({ cancel: o.id })} scroll={false} variant="danger-soft">Cancel</ButtonLink> : null;
      if (o.status === "APPROVED" && p.can.edit) actions = <>
        {p.can.archive && o.paidPaise === ZERO && <ButtonLink href={here({ cancel: o.id })} scroll={false} variant="danger-soft">Cancel</ButtonLink>}
        {!o.hasBill && <ButtonLink href={here({ bill: o.id })} scroll={false} variant="secondary" icon={Paperclip}>Add bill</ButtonLink>}
        {!needsBill && <ButtonLink href={here({ pay: o.id })} scroll={false} variant="primary" icon={IndianRupee}>{o.isVendorBill ? "Pay bill" : "Mark paid"}</ButtonLink>}
      </>;
      if (o.status === "PAID" && p.can.archive) actions = <>
        {!o.hasBill && p.can.edit && <ButtonLink href={here({ bill: o.id })} scroll={false} variant="secondary" icon={Paperclip}>Add bill</ButtonLink>}
        <ButtonLink href={here({ cancel: o.id })} scroll={false} variant="danger-soft">Cancel payment</ButtonLink>
      </>;
    }
    return (
      <UrlSheet title={o.what} sub={`${o.number} · ${formatRupees(o.amountPaise)}`} closeHref={here()} footer={actions ? <div className="flex flex-wrap gap-2 justify-end">{actions}</div> : undefined}>
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <ExpPill s={o.status} />
          {o.status === "APPROVED" && o.paidPaise === ZERO && <span className="text-[13px] text-ink3">Approved, not paid · not in the Day Book</span>}
          {o.isVendorBill && o.billDueDate && o.status === "APPROVED" && <Pill tone={o.billDueDate < p.today ? "bad" : "neutral"}>Due {formatDate(o.billDueDate)}</Pill>}
          {o.broughtIn && <Pill tone="neutral">Brought in</Pill>}
        </div>
        {o.rejectReason && o.status === "DRAFT" && <Banner tone="bad" className="mb-4" title="Sent back:">{o.rejectReason}</Banner>}
        {o.status === "WAITING" && !mine && <Banner tone="warn" className="mb-4" title={`Above ${formatRupees(atOnce)}: waiting for ${who}.`}>It cannot be marked paid until approved.</Banner>}
        {o.status === "APPROVED" && needsBill && <Banner tone="warn" className="mb-4" title={`Attach the bill first.`}>Amounts over {formatRupees(billAbove)} need the bill before they are paid.</Banner>}
        <div className="grid grid-cols-2 gap-x-5 gap-y-3.5">
          <Mini k="Expense head" v={`${o.headName}${o.headCode ? ` · ${o.headCode}` : ""}`} /><Mini k="Vendor" v={o.vendorName || "—"} />
          {centresOn && <Mini k="Department" v={o.costCentreName || "—"} />}<Mini k="Requested by" v={o.requestedBy || "—"} />
          <Mini k="Bill" v={o.billFileId
            ? <a href={fileLink(o.billFileId, ctx.schoolId)} target="_blank" rel="noreferrer" className="text-brand font-semibold hover:underline inline-flex items-center gap-1"><Paperclip size={14} aria-hidden="true" />View bill</a>
            : <span className={needsBill ? "text-bad font-semibold" : "text-ink3"}>Not attached{needsBill ? " · needed" : ""}</span>} />
          <Mini k="Amount" v={<b className="font-semibold">{formatRupees(o.amountPaise)}</b>} />
          {o.isVendorBill && <><Mini k="Bill number" v={o.billNo ?? "—"} /><Mini k="Paid so far" v={`${formatRupees(o.paidPaise)} of ${formatRupees(o.amountPaise)}`} /></>}
        </div>
        {o.duplicateReason && <p className="mt-4 text-[13px] text-ink2 bg-sunken rounded-xl px-3.5 py-2.5">Saved despite a possible duplicate: {o.duplicateReason}</p>}
        <div className="mt-5"><Timeline items={steps} /></div>
        {o.status === "WAITING" && !mine && p.change && <p className="mt-3 text-[12.5px] text-ink3 flex gap-1.5"><Send size={14} className="mt-0.5 shrink-0" aria-hidden="true" />{who} sees it in Approvals.</p>}
      </UrlSheet>
    );
  }
}

function ModeWord(m: string) {
  return ({ CASH: "cash", UPI: "UPI", BANK_TRANSFER: "bank transfer", CHEQUE: "cheque", CARD: "card" } as Record<string, string>)[m] ?? m;
}

function BillPill({ b, small }: { b: ExpenseRow; small?: boolean }) {
  const [label, tone]: [string, BadgeTone] = b.status === "CANCELLED" ? ["Cancelled", "neutral"]
    : b.status === "WAITING" ? ["Waiting for approval", "warn"]
    : b.status === "DRAFT" ? ["Draft", "neutral"]
    : b.paidPaise >= b.amountPaise ? ["Paid", "ok"]
    : b.paidPaise > ZERO ? ["Part paid", "info"] : ["Not paid", "warn"];
  return <Pill tone={tone} className={small ? "!h-5 !text-[11px]" : undefined}>{label}</Pill>;
}
