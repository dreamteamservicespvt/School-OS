import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowRightLeft, Award, BadgePercent, CalendarDays, CircleCheck, FileInput, FileSpreadsheet, FileText, History, IndianRupee, Plus,
  ReceiptIndianRupee, RotateCcw, Scale, SearchX, Split, Timer, Undo2, Wallet, type LucideIcon,
} from "lucide-react";
import { withSchool } from "@/lib/db";
import { fileLink } from "@/lib/files";
import { formatDate, formatRupees } from "@/lib/format";
import { canSeeStudent } from "@/lib/fees/access";
import { studentCard } from "@/lib/fees/dues";
import { studentLedger, type LedgerEntry, type LedgerKind } from "@/lib/fees/ledger";
import { paymentView } from "@/lib/fees/payment-view";
import { findStudents, mostOverdue } from "@/lib/fees/find";
import { gatewayFor } from "@/lib/fees/settings";
import { structureForStudent } from "@/lib/fees/structure";
import { promisesOf, promiseWords } from "@/lib/fees/promises";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Ring } from "@/components/ui/display";
import { DataList, Empty, Progress, Stack, TONE_SOFT, type Tone } from "@/components/money/kit";
import { LinkTabs } from "@/components/ui/link-tabs";
import { MoreMenu } from "@/components/ui/more-menu";
import { ExportButton } from "@/components/ui/export-button";
import { UrlSheet } from "@/components/ui/url-sheet";
import { UrlSearch } from "@/components/money/url-filters";
import { cx } from "@/components/ui/cx";
import { FeeHead } from "../../_components/fee-head";
import { ModeIcon, PayPill, modeWord, pct } from "../../_components/bits";
import { CancelSheet, PaymentSheet } from "../../_components/payment-sheet";
import { toSheet } from "../../_lib/pay-sheet";
import { BASE, feeGuard, feePeriod, one, qs, type SearchParams } from "../../_lib/page";
import { PeriodFilter } from "@/components/list/period-filter";
import { AdjustSheet, AssignSheet, CertificateSheet, ChargeSheet, InvoiceSheet, OldDuesSheet, ResendInvoice } from "./sheets";

export const metadata = { title: "Student Fee Ledger" };

const ZERO = BigInt(0);
const KIND: Record<LedgerKind, [string, Tone, LucideIcon]> = {
  opening: ["Opening balance", "neutral", History],
  charge: ["Fee raised", "info", FileText],
  concession: ["Concession", "brand", BadgePercent],
  receipt: ["Receipt", "ok", ReceiptIndianRupee],
  reversal: ["Reversal", "bad", Undo2],
  late: ["Late fee", "warn", Timer],
  adjust: ["Adjustment", "neutral", Scale],
  refund: ["Refund", "info", RotateCcw],
};
const TABS = [
  ["statement", "Statement"], ["fees", "Fees"], ["payments", "Payments"], ["partial", "Partial payments"], ["invoices", "Invoices"], ["adjust", "Adjustments"],
] as const;
const DO = ["opening", "adjust", "charge", "assign", "certificate", "invoice", "pick"] as const;
const feeTone = (s: string): Tone => (s === "Paid" ? "ok" : s === "Overdue" ? "bad" : s === "Part paid" ? "info" : s === "Due" ? "warn" : "neutral");
const dshort = (d: Date) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(d);

/** Student Fee Ledger (06 §4, mod-fees.jsx LedgerPage): one student's fees, payments, balance and receipts. */
export default async function LedgerPage({ params, searchParams }: { params: Promise<{ studentId: string }>; searchParams: SearchParams }) {
  const { studentId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(studentId)) notFound();
  const p = await feeGuard("ledger");
  const sp = await searchParams;
  const tab = TABS.some(([k]) => k === one(sp.tab)) ? one(sp.tab) : "statement";
  const doing = (DO as readonly string[]).includes(one(sp.do)) ? one(sp.do) : "";
  const payId = one(sp.pay);
  const cancelId = one(sp.cancel);
  const pq = one(sp.pq).trim().slice(0, 80);
  const canEdit = p.does("ledger");

  const data = await withSchool(p.current.ctx, async (tx) => {
    if (!(await canSeeStudent(tx, p.viewer, studentId))) return null;
    const card = await studentCard(tx, p.current.ctx, studentId, p.year?.id);
    if (!card) return null;
    const ledger = await studentLedger(tx, studentId, p.today, p.tz);
    const sheet = payId ? await paymentView(tx, p.current.ctx, p.viewer, payId, p.tz) : null;
    const cancel = cancelId && canEdit ? await paymentView(tx, p.current.ctx, p.viewer, cancelId, p.tz) : null;
    const extra = canEdit && doing ? await sheetData(tx, doing, card, studentId) : null;
    const pick = doing === "pick" ? (pq ? await findStudents(tx, p.viewer, pq, p.today, 12) : await mostOverdue(tx, p.viewer, p.today, 8)) : null;
    const gateway = canEdit && doing === "invoice" ? Boolean(await gatewayFor(tx, p.current.ctx, card.classId)) : false;
    // Promise to Pay (when on): an open promise, or a broken one still waiting for a new call.
    const promise = (await promisesOf(tx, p.current.ctx, [studentId], p.today)).get(studentId) ?? null;
    return { promise: promise && (promise.state === "OPEN" || promise.state === "BROKEN") ? promise : null, card, ledger, sheet: sheet?.studentId === studentId ? sheet : null, cancel: cancel?.studentId === studentId ? cancel : null, extra, pick, gateway };
  });
  if (!data) notFound();

  async function sheetData(tx: Parameters<Parameters<typeof withSchool>[1]>[0], what: string, card: NonNullable<Awaited<ReturnType<typeof studentCard>>>, sid: string) {
    if (what === "opening" || what === "charge") {
      const heads = await tx.feeHead.findMany({ where: { archivedAt: null }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }], select: { id: true, name: true, systemKey: true } });
      const sorted = what === "opening" ? [...heads.filter((h) => h.systemKey === "old-dues"), ...heads.filter((h) => h.systemKey !== "old-dues" && h.systemKey !== "late-fee")] : heads.filter((h) => h.systemKey !== "old-dues");
      return { kind: "heads" as const, heads: sorted.map((h) => ({ value: h.id, label: h.name })) };
    }
    if (what === "assign") {
      const plans = p.year ? await tx.feeStructure.findMany({ where: { academicYearId: p.year.id, status: "PUBLISHED", archivedAt: null }, orderBy: { createdAt: "asc" } }) : [];
      const classes = await tx.schoolClass.findMany({ where: { id: { in: plans.map((s) => s.classId) } }, select: { id: true, name: true, sortOrder: true } });
      const own = p.year && card.classId ? await structureForStudent(tx, p.year.id, card.classId, null, p.features.has("fee-category-fees")) : null;
      const opts = plans
        .map((s) => { const c = classes.find((x) => x.id === s.classId); return { value: s.id, label: `${c?.name ?? "Class"}${s.category ? ` · ${s.category}` : ""}${s.id === own?.id ? " (own class)" : ""}`, order: c?.sortOrder ?? 0 }; })
        .sort((a, b) => (a.value === own?.id ? -1 : b.value === own?.id ? 1 : a.order - b.order));
      return { kind: "plans" as const, plans: opts.map(({ value, label }) => ({ value, label })), own: own?.id ?? null };
    }
    if (what === "certificate") {
      const years = await tx.financialYear.findMany({ where: { archivedAt: null }, orderBy: { startDate: "desc" }, take: 8 });
      const cur = years.find((y) => y.startDate <= p.today && y.endDate >= p.today);
      return { kind: "years" as const, years: years.map((y) => ({ value: y.id, label: y.name })), start: cur?.id ?? years[0]?.id ?? "" };
    }
    void sid;
    return null;
  }

  const { card, ledger: L } = data;
  const per = feePeriod(sp, p.dates, null);
  const here = (extra: Record<string, string | null> = {}) => qs(`${BASE}/ledger/${studentId}`, { tab: tab === "statement" ? null : tab, ...per.keep, ...extra });
  const close = here();
  const first = card.name.split(" ")[0];
  const balance = L.balanceNow;
  const inRange = (d: Date) => !per.from || !per.to || (d >= per.from && d <= per.to);
  const entries = L.entries.filter((e) => inRange(e.date));
  const forward = per.from ? L.entries.filter((e) => e.date < per.from!).at(-1)?.balance ?? ZERO : null;
  const endBalance = entries.at(-1)?.balance ?? forward ?? ZERO;
  const counted = entries.filter((e) => !e.cancelled && !e.waiting);
  const sumDebit = counted.reduce((a, e) => a + e.debit, ZERO);
  const sumCredit = counted.reduce((a, e) => a + e.credit, ZERO);
  const endDay = per.to && per.to < p.today ? per.to : p.today;
  const installments = L.installments.filter((r) => inRange(r.dueDate));
  const receipts = L.payments.filter((r) => inRange(r.date));
  const partial = receipts.filter((r) => r.partial && r.status === "POSTED");
  const invoices = L.invoices.filter((r) => inRange(r.date));
  const certificates = L.certificates.filter((r) => inRange(r.date));
  const adjustments = L.adjustments.filter((r) => inRange(r.date));
  const father = card.fatherName ?? card.primaryGuardian?.name ?? "the parent";
  const heads = [...L.heads].sort((a, b) => Number(b.total - a.total));
  const today = p.today;
  const payHref = (id: string) => here({ pay: id });
  const yearName = p.year?.name?.replace("-", "–") ?? "";

  const menu = canEdit ? [
    { icon: <Award size={17} aria-hidden="true" />, label: "Fee certificate", href: here({ do: "certificate" }) },
    { icon: <History size={17} aria-hidden="true" />, label: "Add opening balance (old dues)", href: here({ do: "opening" }) },
    { icon: <Scale size={17} aria-hidden="true" />, label: "Adjust an amount", href: here({ do: "adjust" }) },
    { icon: <Plus size={17} aria-hidden="true" />, label: "Add a charge", href: here({ do: "charge" }) },
    { icon: <FileInput size={17} aria-hidden="true" />, label: "Import old dues", href: `${BASE}/ledger/import?kind=fee-old-dues` },
    { icon: <FileSpreadsheet size={17} aria-hidden="true" />, label: "Import past receipts", href: `${BASE}/ledger/import?kind=fee-past-receipts` },
  ] : [];

  return (
    <div>
      <FeeHead pageName="Student Fee Ledger" href={`${BASE}/ledger`} sub="Each student’s fees, payments, balance and receipts. Nothing here is ever deleted."
        actions={<>
          {canEdit && <ButtonLink href={here({ do: "invoice" })} scroll={false} variant="secondary" icon={FileText} className="hidden md:inline-flex">Fee invoice</ButtonLink>}
          {p.desk && <ButtonLink href={`${BASE}/collect/${studentId}`} variant="primary" icon={IndianRupee}>Collect fee</ButtonLink>}
        </>} />

      <Stack>
        <Card className="overflow-hidden">
          <div className="p-4 md:p-5 flex items-center gap-4">
            <Avatar name={card.name} size={56} src={card.photoFileId ? fileLink(card.photoFileId, p.current.ctx.schoolId) : null} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <Link href={`/student-management/${card.id}`} className="font-display font-semibold text-[19px] leading-tight hover:underline text-left">{card.name}</Link>
                {L.overdue > ZERO ? <Pill tone="bad">{formatRupees(L.overdue)} overdue</Pill> : balance > ZERO ? <Pill tone="warn">{formatRupees(balance)} due</Pill> : <Pill tone="ok">No dues</Pill>}
                {data.promise && (p.may("defaulters")
                  ? <Link href={`${BASE}/defaulters?who=${studentId}`}><Pill tone={data.promise.state === "BROKEN" ? "bad" : "info"}>{promiseWords(data.promise)}</Pill></Link>
                  : <Pill tone={data.promise.state === "BROKEN" ? "bad" : "info"}>{promiseWords(data.promise)}</Pill>)}
              </div>
              <p className="text-[13px] text-ink3 truncate">
                {card.classSection}{card.rollNo != null ? ` · Roll ${card.rollNo}` : ""} · <span className="font-mono text-[12.5px]">{card.admissionNo}</span>
                <span className="hidden md:inline">{card.fatherName ? ` · ${card.fatherName}` : ""}{card.primaryGuardian?.phone ? <> · <span className="tnum">{card.primaryGuardian.phone}</span></> : null}</span>
              </p>
            </div>
            <div className="hidden sm:block"><Ring value={pct(L.paidTotal, L.yearTotal)} size={60} stroke={7}><span className="text-[12.5px] font-bold tnum">{pct(L.paidTotal, L.yearTotal)}%</span></Ring></div>
            <ButtonLink href={here({ do: "pick" })} scroll={false} variant="secondary" icon={ArrowRightLeft}><span className="hidden md:inline">Change student</span><span className="md:hidden">Change</span></ButtonLink>
          </div>
          <div className="grid grid-cols-3 lg:grid-cols-4 gap-px bg-line/70 border-t border-line/70">
            {[...heads.slice(0, 3), ...Array.from({ length: Math.max(0, 3 - heads.length) }, () => null)].map((h, i) => h ? (
              <div key={h.head} className="bg-surface px-3 md:px-5 py-3 min-w-0">
                <p className="text-[12px] text-ink3 font-semibold truncate">{h.head}</p>
                <p className="text-[14px] md:text-[15px] font-semibold tnum mt-0.5 truncate">{formatRupees(h.paid)}</p>
                <p className="text-[12px] text-ink3 tnum truncate">of {formatRupees(h.total)}</p>
                <Progress className="mt-1.5" value={pct(h.paid, h.total)} tone={h.paid >= h.total ? "ok" : "brand"} />
              </div>
            ) : <div key={`x${i}`} className="bg-surface" />)}
            <div className="bg-surface px-4 md:px-5 py-3 min-w-0 col-span-3 lg:col-span-1">
              <p className="text-[12px] text-ink3 font-semibold">Year total · paid · balance now</p>
              <p className="text-[15px] font-semibold tnum mt-0.5">{formatRupees(L.yearTotal)} · <span className="text-ok">{formatRupees(L.paidTotal)}</span> · <span className={balance > ZERO ? "text-bad" : "text-ok"}>{formatRupees(balance)}</span></p>
              <p className="text-[12px] text-ink3">Balance includes late fees and dues raised so far</p>
            </div>
          </div>
        </Card>

        <div className="flex items-center gap-2 flex-wrap">
          <LinkTabs className="flex-1 min-w-0" label="Ledger views" tabs={TABS.map(([k, label]) => ({
            href: qs(`${BASE}/ledger/${studentId}`, { tab: k === "statement" ? null : k, ...per.keep }),
            label,
            on: tab === k,
            count: k === "fees" ? installments.length : k === "payments" ? receipts.length : k === "partial" ? partial.length : k === "adjust" ? adjustments.length : null,
          }))} />
          <PeriodFilter {...p.dates} />
          <MoreMenu items={menu} />
        </div>

        <div key={tab} className="animate-rise">
          {tab === "statement" && (
            <Card className="overflow-hidden">
              <CardHeader title={`Statement${yearName ? `, ${yearName}` : ""}`} description="Every fee, payment, cancelled receipt, concession and late fee, with the running balance"
                action={<ExportButton size="sm" href={qs(`${BASE}/ledger/${studentId}/export`, per.keep)} />} />
              {entries.length === 0 && forward === null ? <Empty icon={ReceiptIndianRupee} title="Nothing on the ledger yet" body={`No fees are raised for ${first} yet. Assign the class fee plan in the Fees view, or add old dues.`} /> : (
                <>
                  <div className="hidden lg:block overflow-x-auto scroll-thin">
                    <table className="w-full text-[14px] min-w-[760px]">
                      <caption className="sr-only">Statement with running balance</caption>
                      <thead><tr className="text-[12px] text-ink3 text-left border-y border-line">
                        <th scope="col" className="pl-5 pr-3 py-2.5 font-semibold">Date</th><th scope="col" className="px-3 py-2.5 font-semibold">Entry</th><th scope="col" className="px-3 py-2.5 font-semibold">Reference</th>
                        <th scope="col" className="px-3 py-2.5 font-semibold text-right">Charged</th><th scope="col" className="px-3 py-2.5 font-semibold text-right">Paid or reduced</th><th scope="col" className="pl-3 pr-5 py-2.5 font-semibold text-right">Balance</th>
                      </tr></thead>
                      <tbody>
                        {forward !== null && (
                          <tr className="border-b border-line/70 bg-sunken/40">
                            <td className="pl-5 pr-3 py-2.5 tnum whitespace-nowrap text-ink2">{dshort(per.from!)}</td>
                            <td className="px-3 py-2.5 font-semibold" colSpan={4}>Balance brought forward</td>
                            <td className="pl-3 pr-5 py-2.5 text-right tnum font-semibold">{formatRupees(forward)}</td>
                          </tr>
                        )}
                        {entries.map((e) => <StatementRow key={e.key} e={e} href={e.paymentId ? payHref(e.paymentId) : null} tz={p.tz} />)}
                      </tbody>
                      <tfoot><tr className="border-t-2 border-line font-semibold">
                        <td className="pl-5 py-3" colSpan={3}>Balance on {formatDate(endDay)}</td>
                        <td className="px-3 text-right tnum">{formatRupees(sumDebit)}</td><td className="px-3 text-right tnum">{formatRupees(sumCredit)}</td>
                        <td className={cx("pl-3 pr-5 text-right tnum", endBalance > ZERO && "text-bad")}>{formatRupees(endBalance)}</td>
                      </tr></tfoot>
                    </table>
                  </div>
                  <ul className="lg:hidden divide-y divide-line/70 border-t border-line">
                    {forward !== null && <li className="flex justify-between px-4 py-3 text-[14px] bg-sunken/40"><span className="font-semibold">Brought forward · {dshort(per.from!)}</span><span className="tnum font-semibold">{formatRupees(forward)}</span></li>}
                    {entries.map((e) => <StatementItem key={e.key} e={e} href={e.paymentId ? payHref(e.paymentId) : null} />)}
                    <li className="flex justify-between px-4 py-3 font-semibold text-[14.5px]"><span>Balance on {dshort(endDay)}</span><span className={cx("tnum", endBalance > ZERO && "text-bad")}>{formatRupees(endBalance)}</span></li>
                  </ul>
                </>
              )}
            </Card>
          )}

          {tab === "fees" && (
            <Card className="overflow-hidden">
              <CardHeader title={`Fees${yearName ? ` for ${yearName}` : ""}`} description="Each fee head with its installments, oldest first"
                action={canEdit ? <ButtonLink size="sm" variant="ghost" icon={Plus} scroll={false} href={here({ do: L.installments.some((r) => r.kind === "FEE") ? "charge" : "assign" })}>{L.installments.some((r) => r.kind === "FEE") ? "Add a charge" : "Assign fee"}</ButtonLink> : null} />
              <DataList rows={installments} rowKey={(r) => r.id} minWidth={640} caption="Fees and installments"
                rowClass={(r) => r.status === "Removed" && "opacity-60"}
                footer={`${installments.filter((r) => r.status === "Paid").length} of ${installments.filter((r) => r.status !== "Removed").length} installments paid · Year total ${formatRupees(L.yearTotal)}`}
                empty={<Empty icon={FileText} title="No fees yet" body={`${first} has no fee plan for this year.`} action={canEdit ? <ButtonLink href={here({ do: "assign" })} scroll={false} variant="primary" icon={Plus}>Assign fee plan</ButtonLink> : undefined} />}
                columns={[
                  { key: "head", label: "Fee head", render: (r) => <><p className="font-semibold leading-tight">{r.head}{r.broughtIn && <Pill tone="neutral" className="ml-2 !h-5 !text-[11px]">Brought in</Pill>}</p><p className="text-[12.5px] text-ink3">{r.label}</p></> },
                  { key: "due", label: "Due date", nowrap: true, render: (r) => <span className="tnum">{formatDate(r.dueDate)}</span> },
                  { key: "amount", label: "Amount", align: "right", render: (r) => formatRupees(r.amount) },
                  { key: "paid", label: "Paid", align: "right", render: (r) => (r.paid > ZERO ? formatRupees(r.paid) : "—") },
                  { key: "late", label: "Late fee", align: "right", render: (r) => (r.late > ZERO ? <span className="text-bad">{formatRupees(r.late)}</span> : "—") },
                  { key: "bal", label: "Balance", align: "right", render: (r) => <b className="font-semibold">{formatRupees(r.balance)}</b> },
                  { key: "status", label: "Status", render: (r) => <Pill tone={feeTone(r.status)}>{r.status}</Pill> },
                ]}
                phone={(r) => ({
                  title: `${r.head} · ${r.label}`,
                  sub: `Due ${formatDate(r.dueDate)}${r.paid > ZERO && r.status !== "Paid" ? ` · ${formatRupees(r.paid)} paid` : ""}${r.late > ZERO ? ` · late fee ${formatRupees(r.late)}` : ""}`,
                  icon: ReceiptIndianRupee, iconTone: feeTone(r.status),
                  right: <><p className="font-semibold tnum">{formatRupees(r.status === "Paid" ? r.amount : r.balance)}</p><Pill tone={feeTone(r.status)} className="!h-5 !text-[11px]">{r.status}</Pill></>,
                })} />
            </Card>
          )}

          {tab === "payments" && (
            <Card className="overflow-hidden">
              <CardHeader title="Payments" description="Cancelled payments stay here, struck through, with the reason" />
              <DataList rows={receipts} rowKey={(r) => r.id} rowHref={(r) => payHref(r.id)} minWidth={640} caption="Payments"
                footer={`${receipts.length} ${receipts.length === 1 ? "payment" : "payments"} · ${formatRupees(receipts.filter((r) => r.status === "POSTED").reduce((a, r) => a + r.amount, ZERO))} posted`}
                empty={<Empty icon={Wallet} title="No payments yet" body={`Nothing has been paid for ${first} yet.`} />}
                columns={[
                  { key: "date", label: "Date", nowrap: true, render: (r) => <span className="tnum text-ink2">{formatDate(r.date)}</span> },
                  { key: "rcpt", label: "Receipt", render: (r) => <span className="font-mono text-[12.5px]">{r.receiptNo ?? r.oldReceiptNo ?? "—"}</span> },
                  { key: "head", label: "For", render: (r) => <span className="text-[13px]">{r.heads}</span> },
                  { key: "mode", label: "Mode", nowrap: true, render: (r) => <span className="inline-flex items-center gap-1.5 text-[13px]"><ModeIcon mode={r.mode} />{modeWord(r.mode)}</span> },
                  { key: "amt", label: "Amount", align: "right", render: (r) => <span className={cx("font-semibold", r.status === "CANCELLED" && "line-through text-ink3")}>{formatRupees(r.amount)}</span> },
                  { key: "status", label: "Status", render: (r) => <><PayPill status={r.status} broughtIn={r.broughtIn} />{r.status === "CANCELLED" && r.cancelReason && <span className="block text-[12px] text-ink3 mt-0.5">{r.cancelReason}</span>}</> },
                ]}
                phone={(r) => ({
                  title: r.heads, sub: `${formatDate(r.date)} · ${r.receiptNo ?? r.oldReceiptNo ?? "No receipt yet"} · ${modeWord(r.mode)}`, icon: Wallet, iconTone: r.status === "CANCELLED" ? "bad" : r.status === "WAITING" ? "warn" : "ok",
                  right: <><p className={cx("font-semibold tnum", r.status === "CANCELLED" && "line-through text-ink3")}>{formatRupees(r.amount)}</p><PayPill status={r.status} broughtIn={r.broughtIn} short /></>,
                })} />
            </Card>
          )}

          {tab === "partial" && (
            <Card className="overflow-hidden">
              <CardHeader title="Partial payments" description="Payments that did not clear their row fully" />
              <DataList rows={partial} rowKey={(r) => r.id} rowHref={(r) => payHref(r.id)} minWidth={640} caption="Partial payments"
                empty={<Empty icon={CircleCheck} title="No partial payments" body={`Every payment by ${first} cleared its row.`} />}
                columns={[
                  { key: "ref", label: "Receipt", render: (r) => <span className="font-mono text-[12.5px]">{r.receiptNo ?? r.oldReceiptNo ?? "—"}</span> },
                  { key: "row", label: "Row", render: (r) => r.heads },
                  { key: "paid", label: "Paid", align: "right", render: (r) => formatRupees(r.amount) },
                  { key: "left", label: "Balance on the row", align: "right", render: (r) => r.leftOnRows > ZERO ? <span className="text-bad font-semibold">{formatRupees(r.leftOnRows)}</span> : <span className="text-ok font-semibold">{formatRupees(ZERO)}</span> },
                  { key: "d", label: "Recorded", nowrap: true, render: (r) => formatDate(r.date) },
                  { key: "set", label: "Settled", render: (r) => r.leftOnRows > ZERO ? <Pill tone="warn">Not yet</Pill> : <Pill tone="ok">Settled</Pill> },
                ]}
                phone={(r) => ({
                  title: r.heads, sub: `${r.receiptNo ?? "—"} · ${dshort(r.date)} · ${formatRupees(r.amount)} paid`, icon: Split, iconTone: r.leftOnRows > ZERO ? "warn" : "ok",
                  right: r.leftOnRows > ZERO ? <span className="text-bad font-semibold tnum">{formatRupees(r.leftOnRows)} left</span> : <Pill tone="ok" className="!h-5 !text-[11px]">Settled</Pill>,
                })} />
            </Card>
          )}

          {tab === "invoices" && (
            <Card>
              <CardHeader title="Fee invoices" description="Made for what is due, each with its own number. Sent with a Razorpay link."
                action={canEdit ? <ButtonLink size="sm" variant="ghost" icon={Plus} scroll={false} href={here({ do: "invoice" })}>New invoice</ButtonLink> : null} />
              {invoices.length === 0 && certificates.length === 0 ? (
                <Empty icon={FileText} title="No invoices yet" body={`Make a fee invoice for what ${first} owes now. It goes to the parent with a link to pay.`} />
              ) : (
                <ul className="px-2 pb-2">
                  {invoices.map((inv) => (
                    <li key={inv.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/70">
                      <span className="w-10 h-10 rounded-xl bg-sunken text-ink2 grid place-items-center shrink-0"><FileText size={18} aria-hidden="true" /></span>
                      <a href={`${BASE}/documents/${inv.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
                        <p className="font-semibold text-[14px] truncate"><span className="font-mono text-[12.5px]">{inv.number}</span> · {formatDate(inv.date)}</p>
                        <p className="text-[12.5px] text-ink3 truncate">{inv.rows}</p>
                      </a>
                      <span className="text-right shrink-0"><span className="block font-semibold tnum">{formatRupees(inv.total)}</span><Pill tone={inv.status === "Paid" ? "ok" : inv.status === "Open" ? "warn" : "info"} className="!h-5 !text-[11px]">{inv.status}</Pill></span>
                      {canEdit && inv.status !== "Paid" && <ResendInvoice studentId={studentId} invoiceId={inv.id} />}
                    </li>
                  ))}
                  {certificates.map((c) => (
                    <li key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/70">
                      <span className="w-10 h-10 rounded-xl bg-brand/10 text-brand grid place-items-center shrink-0"><Award size={18} aria-hidden="true" /></span>
                      <a href={`${BASE}/documents/${c.id}`} target="_blank" rel="noreferrer" className="min-w-0 flex-1">
                        <p className="font-semibold text-[14px] truncate"><span className="font-mono text-[12.5px]">{c.number}</span> · {formatDate(c.date)}</p>
                        <p className="text-[12.5px] text-ink3 truncate">Fee certificate · financial year {c.year}</p>
                      </a>
                      <span className="font-semibold tnum shrink-0">{formatRupees(c.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          )}

          {tab === "adjust" && (
            <Card>
              <CardHeader title="Adjustments" description="Concessions, late fees, reversals and old dues, each with its reason and who approved it"
                action={canEdit ? <ButtonLink size="sm" variant="ghost" icon={Scale} scroll={false} href={here({ do: "adjust" })}>Adjust an amount</ButtonLink> : null} />
              {adjustments.length === 0 ? <Empty icon={Scale} title="No adjustments" body={`${first} has no concessions, late fees or corrections.`} /> : (
                <ul className="px-5 pb-3">
                  {adjustments.map((e) => {
                    const [label, tone, Ic] = KIND[e.kind];
                    return (
                      <li key={e.key} className="flex items-start gap-3 py-3 border-t border-line/70 first:border-0">
                        <span className={cx("w-9 h-9 rounded-xl grid place-items-center shrink-0", TONE_SOFT[tone])}><Ic size={17} aria-hidden="true" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[14.5px] leading-snug">{e.title}</p>
                          <p className="text-[12.5px] text-ink3">{dshort(e.date)} · {label} · {e.sub}</p>
                        </div>
                        <span className={cx("font-semibold tnum shrink-0", e.credit > ZERO ? "text-ok" : "text-ink")}>{e.credit > ZERO ? `−${formatRupees(e.credit)}` : e.debit > ZERO ? `+${formatRupees(e.debit)}` : ""}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          )}
        </div>

        {L.comingUp.length > 0 && (
          <Card>
            <CardHeader title="Coming up" description="Not in the balance yet. Each one counts from the day it falls due." icon={CalendarDays} />
            <ul className="px-5 pb-4 flex flex-col">
              {L.comingUp.slice(0, 12).map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2 border-t border-line/70 first:border-0 text-[14px]">
                  <span className="flex-1 min-w-0"><b className="font-semibold">{r.head}</b> <span className="text-ink3">· {r.label}</span></span>
                  <span className="text-ink3 tnum">Due {dshort(r.dueDate)}</span>
                  <span className="font-semibold tnum w-24 text-right">{formatRupees(r.amount)}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Stack>

      {doing === "pick" && data.pick && (
        <UrlSheet title="Open a student’s ledger" sub="Search by name, admission number or parent phone" closeHref={close}>
          <div className="flex flex-col gap-3">
            <UrlSearch param="pq" id="led-q" placeholder="Name, admission no. or phone" label="Find a student" autoFocus />
            <p className="eyebrow text-ink3 px-1">{pq ? `${data.pick.length} found` : "Most overdue"}</p>
            {data.pick.length === 0 ? <Empty icon={SearchX} title={pq ? `No student called “${pq}”` : "Nobody is overdue"} body={pq ? "Try the admission number or the parent’s mobile number." : "Search to open any student’s ledger."} /> : (
              <ul className="-mx-2">
                {data.pick.map((s) => (
                  <li key={s.id}>
                    <Link href={`${BASE}/ledger/${s.id}`} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken text-left">
                      <Avatar name={s.name} size={40} src={s.photoFileId ? fileLink(s.photoFileId, p.current.ctx.schoolId) : null} />
                      <span className="min-w-0 flex-1"><span className="block font-semibold text-[14.5px] truncate">{s.name}</span><span className="block text-[12.5px] text-ink3 truncate">{s.classSection} · <span className="font-mono">{s.admissionNo}</span></span></span>
                      {s.due > ZERO ? <span className={cx("text-[13px] font-semibold tnum", s.overdue ? "text-bad" : "text-warn")}>{formatRupees(s.due)}</span> : <Pill tone="ok">No dues</Pill>}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </UrlSheet>
      )}

      {canEdit && doing === "opening" && data.extra?.kind === "heads" && (
        <OldDuesSheet studentId={studentId} closeHref={close} name={card.name} heads={data.extra.heads} start={p.year ? new Date(p.year.startDate.getTime() - 86400000).toISOString().slice(0, 10) : today.toISOString().slice(0, 10)} />
      )}
      {canEdit && doing === "charge" && data.extra?.kind === "heads" && (
        <ChargeSheet studentId={studentId} closeHref={close} heads={data.extra.heads} start={today.toISOString().slice(0, 10)} />
      )}
      {canEdit && doing === "assign" && data.extra?.kind === "plans" && (
        <AssignSheet studentId={studentId} closeHref={close} plans={data.extra.plans} own={data.extra.own} />
      )}
      {canEdit && doing === "certificate" && data.extra?.kind === "years" && (
        <CertificateSheet studentId={studentId} closeHref={close} years={data.extra.years} start={data.extra.start} />
      )}
      {canEdit && doing === "adjust" && (
        <AdjustSheet studentId={studentId} closeHref={close} start={one(sp.row)}
          rows={L.installments.filter((r) => r.status !== "Removed").map((r) => ({
            value: r.id, label: `${r.head} · ${r.label} (${formatRupees(r.amount)})`, left: formatRupees(r.balance), removable: r.paid === ZERO,
          }))} />
      )}
      {canEdit && doing === "invoice" && (
        <InvoiceSheet studentId={studentId} closeHref={close} father={father} canLink={data.gateway} total={formatRupees(balance)}
          lines={L.installments.filter((r) => r.balance > ZERO && r.status !== "Not due" && r.status !== "Removed").map((r) => ({ label: `${r.head} · ${r.label}`, amount: formatRupees(r.balance) }))} />
      )}

      {data.sheet && <PaymentSheet p={toSheet(data.sheet, today)} closeHref={close} cancelHref={here({ cancel: data.sheet.id })} canEdit={canEdit} ledgerHref={close} />}
      {data.cancel && data.cancel.status === "POSTED" && canEdit && (
        <CancelSheet p={toSheet(data.cancel, today)} closeHref={here({ pay: data.cancel.id })} doneHref={close}
          needsOk={p.settings.cancelPastApproval && data.cancel.date < today} approver="the principal" />
      )}
    </div>
  );
}

function StatementRow({ e, href, tz }: { e: LedgerEntry; href: string | null; tz: string }) {
  const [label, tone] = KIND[e.kind];
  const isCx = Boolean(e.cancelled);
  const off = isCx || e.waiting;
  return (
    <tr className={cx("border-b border-line/70 last:border-0 relative", href && "cursor-pointer hover:bg-sunken/60", isCx && "bg-bad/[.03]")}>
      <td className="pl-5 pr-3 py-2.5 tnum whitespace-nowrap text-ink2">{dshort(e.date)}</td>
      <td className="px-3 py-2.5">
        {href && <Link href={href} scroll={false} className="absolute inset-0" aria-label={`Open ${e.ref ?? "payment"}`} />}
        <p className="font-semibold leading-tight flex items-center gap-2 flex-wrap">
          <span className={cx(isCx && "line-through text-ink3")}>{e.title}</span>
          {isCx ? <Pill tone="bad" className="!h-5 !text-[11px]">Cancelled</Pill> : e.waiting ? <Pill tone="warn" className="!h-5 !text-[11px]">To verify</Pill> : e.broughtIn ? <Pill tone="neutral" className="!h-5 !text-[11px]">Brought in</Pill> : <Pill tone={tone} className="!h-5 !text-[11px]">{label}</Pill>}
        </p>
        <p className="text-[12.5px] text-ink3">{isCx ? `${e.cancelled!.reason} · cancelled ${formatDate(e.cancelled!.when, tz)} · stays on record` : e.sub}</p>
      </td>
      <td className="px-3 py-2.5 font-mono text-[12px] text-ink2 whitespace-nowrap">{e.ref || "—"}</td>
      <td className="px-3 py-2.5 text-right tnum">{e.debit > ZERO ? formatRupees(e.debit) : ""}</td>
      <td className={cx("px-3 py-2.5 text-right tnum", e.credit > ZERO && "text-ok", off && "line-through !text-ink3")}>{e.credit > ZERO ? formatRupees(e.credit) : ""}</td>
      <td className="pl-3 pr-5 py-2.5 text-right tnum font-semibold">{formatRupees(e.balance)}</td>
    </tr>
  );
}

function StatementItem({ e, href }: { e: LedgerEntry; href: string | null }) {
  const [label, tone, Ic] = KIND[e.kind];
  const isCx = Boolean(e.cancelled);
  const off = isCx || e.waiting;
  const body = (
    <>
      <span className={cx("w-10 h-10 rounded-xl grid place-items-center shrink-0", TONE_SOFT[isCx ? "bad" : tone])}><Ic size={18} aria-hidden="true" /></span>
      <div className="min-w-0 flex-1">
        <p className={cx("font-semibold text-[14.5px] leading-snug", isCx && "line-through text-ink3")}>{e.title}</p>
        <p className="text-[12.5px] text-ink3">{dshort(e.date)} · {isCx ? `Cancelled: ${e.cancelled!.reason}` : e.waiting ? "Waiting for verification" : e.ref || label}</p>
      </div>
      <div className="text-right shrink-0">
        <p className={cx("font-semibold tnum text-[14px]", e.credit > ZERO && "text-ok", off && "line-through !text-ink3")}>{e.debit > ZERO ? `+${formatRupees(e.debit)}` : e.credit > ZERO ? `−${formatRupees(e.credit)}` : formatRupees(ZERO)}</p>
        <p className="text-[12px] text-ink3 tnum">Bal. {formatRupees(e.balance)}</p>
      </div>
    </>
  );
  return <li>{href ? <Link href={href} scroll={false} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-sunken">{body}</Link> : <div className="flex items-center gap-3 px-4 py-3">{body}</div>}</li>;
}
