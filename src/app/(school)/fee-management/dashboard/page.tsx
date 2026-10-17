import Link from "next/link";
import { ChartColumn, CircleX, Handshake, IndianRupee, ReceiptIndianRupee, SearchX, UserX, Wallet } from "lucide-react";
import { withSchool } from "@/lib/db";
import { OPEN_LINK } from "@/lib/students/guardian-access";
import { formatDate, formatRupees, formatRupeesShort, formatTime } from "@/lib/format";
import { addDays, monthStart } from "@/lib/staff/dates";
import { feeTiles, forecast, modeBreakdown, monthlyTrend, recentPayments } from "@/lib/fees/dashboard";
import { failedOnline } from "@/lib/fees/online";
import { classOfStudents } from "@/lib/fees/dues";
import { paymentView } from "@/lib/fees/payment-view";
import { PROMISE_FEATURE, promiseSummary } from "@/lib/fees/promises";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Band, Banner, DataList, Empty, Legend, Progress, Stack, Suggestion, Toolbar } from "@/components/money/kit";
import { Bars } from "@/components/money/bars";
import { LinkTabs } from "@/components/ui/link-tabs";
import { UrlSearch, UrlSegmented, UrlSelect } from "@/components/money/url-filters";
import { ExportButton } from "@/components/ui/export-button";
import { cx } from "@/components/ui/cx";
import { FeeHead } from "../_components/fee-head";
import { ModeIcon, PayPill, modeWord, pct } from "../_components/bits";
import { CancelSheet, PaymentSheet } from "../_components/payment-sheet";
import { FailedLinkButton } from "./failed-link";
import { AdmissionFees } from "./admission-fees";
import { ClassFees, FEE_SORTS } from "./class-fees";
import { toSheet } from "../_lib/pay-sheet";
import { BASE, feeGuard, feePeriod, one, qs, type SearchParams } from "../_lib/page";
import { PeriodFilter } from "@/components/list/period-filter";
import { OldSoftwareBanner, OldSoftwareEmpty, allBeforeGoLive } from "@/components/money/go-live";

export const metadata = { title: "Fee Dashboard" };

const HREF = `${BASE}/dashboard`;
const STATUS = [
  { value: "all", label: "All statuses" }, { value: "POSTED", label: "Posted" }, { value: "WAITING", label: "Waiting for verification" },
  { value: "CANCELLED", label: "Cancelled" }, { value: "FAILED", label: "Failed" },
];
const MODES = [
  { value: "all", label: "All modes" }, { value: "CASH", label: "Cash" }, { value: "UPI", label: "UPI" }, { value: "CARD", label: "Card" },
  { value: "CHEQUE", label: "Cheque" }, { value: "BANK_TRANSFER", label: "Bank transfer" }, { value: "NET_BANKING", label: "Net banking" }, { value: "GATEWAY", label: "Online (Razorpay)" },
];
const MODE_ORDER = ["UPI", "CASH", "CHEQUE", "GATEWAY", "BANK_TRANSFER", "CARD", "NET_BANKING"];

/** Fee Dashboard (06 §2, mod-fees.jsx): money as it comes in today, what is pending and overdue. */
export default async function FeeDashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await feeGuard("dashboard");
  if (p.level === "admission") return <AdmissionFees searchParams={searchParams} />;
  const sp = await searchParams;
  const tab = one(sp.kind) === "partial" ? "partial" : "full";
  const status = STATUS.some((s) => s.value === one(sp.status)) ? one(sp.status) : "all";
  const mode = MODES.some((s) => s.value === one(sp.mode)) ? one(sp.mode) : "all";
  const per = feePeriod(sp, p.dates, "today");
  const when = per.range && per.range.from === per.range.to && per.from!.getTime() === p.today.getTime() ? "today" : "range";
  const period = one(sp.how) === "month" ? "month" : "today";
  const q = one(sp.q).trim().slice(0, 80);
  const page = Math.max(1, Number(one(sp.page)) || 1);
  const payId = one(sp.pay);
  const cancelId = one(sp.cancel);
  const today = p.today;
  const from = per.from ?? new Date("2000-01-01T00:00:00Z");
  const to = per.to ?? today;
  const take = 25;

  const data = await withSchool(p.current.ctx, async (tx) => {
    const base = { from, to, status: status === "all" ? null : status, mode: mode === "all" ? null : mode, q: q || null };
    const promisesOn = p.features.has(PROMISE_FEATURE);
    const [tiles, trend, modes, failed, waiting, list, counts, fc, promises] = await Promise.all([
      feeTiles(tx, p.viewer, today),
      p.year ? monthlyTrend(tx, p.year.startDate, p.year.endDate) : Promise.resolve([]),
      modeBreakdown(tx, period === "today" ? today : monthStart(today), today),
      failedOnline(tx, addDays(today, -7)),
      tx.payment.findMany({ where: { status: "WAITING" }, orderBy: { paidAt: "asc" }, select: { id: true, amountPaise: true } }),
      recentPayments(tx, p.viewer, { ...base, partial: tab === "partial" }, take, (page - 1) * take),
      Promise.all([recentPayments(tx, p.viewer, { ...base, partial: false }, 0), recentPayments(tx, p.viewer, { ...base, partial: true }, 0)]),
      p.features.has("fee-forecast") ? forecast(tx, today, { promises: promisesOn }) : Promise.resolve(null),
      promisesOn ? promiseSummary(tx, today, p.viewer.yearId) : Promise.resolve(null),
    ]);
    const upiToday = (await modeBreakdown(tx, today, today)).find((m) => m.mode === "UPI")?.count ?? 0;
    const stuckIds = [...new Set([...failed.failed.map((f) => f.studentId), ...failed.stuck.map((s) => s.studentId)])];
    const [stuckStudents, stuckClasses, guardians] = await Promise.all([
      tx.student.findMany({ where: { id: { in: stuckIds } }, select: { id: true, fullName: true } }),
      classOfStudents(tx, stuckIds, p.viewer.yearId),
      tx.studentGuardian.findMany({ where: { studentId: { in: stuckIds }, ...OPEN_LINK }, orderBy: [{ isPrimary: "desc" }], include: { guardian: { select: { name: true, phone: true } } } }),
    ]);
    const sheet = payId ? await paymentView(tx, p.current.ctx, p.viewer, payId, p.tz) : null;
    const cancel = cancelId ? await paymentView(tx, p.current.ctx, p.viewer, cancelId, p.tz) : null;
    return { tiles, trend, modes, failed, waiting, list, counts, fc, promises, upiToday, stuckStudents, stuckClasses, guardians, sheet, cancel };
  });

  const { tiles, trend, list } = data;
  // The headline is the same per-class total as the band and Fees by class (src/lib/fees/by-class.ts).
  const collectedSoFar = tiles.year.paid;
  const dueSoFar = tiles.year.due;
  const feeSort = FEE_SORTS.find((s) => s.value === one(sp.fsort))?.value ?? "overdue";
  const feeGroup = tiles.byClass.groups.some((g) => g.key === one(sp.fgroup)) ? one(sp.fgroup) : "all";
  const lakh = (v: bigint) => Number(v) / 1e7;
  const peak = Math.max(1, ...trend.map((m) => Math.max(lakh(m.collected), lakh(m.due))));
  const step = peak > 60 ? 20 : peak > 30 ? 10 : peak > 12 ? 5 : peak > 4 ? 2 : peak > 2 ? 1 : 0.5;
  const ticks = [0, step, step * 2, step * 3].filter((t) => t <= peak * 1.1 || t === 0);
  const methods = MODE_ORDER.map((m) => data.modes.find((x) => x.mode === m) ?? { mode: m, amount: BigInt(0), count: 0 });
  const mMax = methods.reduce((a, m) => (m.amount > a ? m.amount : a), BigInt(0));
  const mTotal = methods.reduce((a, m) => a + m.amount, BigInt(0));
  const waitingSum = data.waiting.reduce((a, w) => a + w.amountPaise, BigInt(0));
  const keep = { kind: tab === "partial" ? "partial" : null, status: status === "all" ? null : status, mode: mode === "all" ? null : mode, ...per.keep, how: period === "month" ? "month" : null, q: q || null };
  const here = qs(HREF, keep);
  const payHref = (id: string) => qs(HREF, { ...keep, page: page > 1 ? String(page) : null, pay: id });
  const fullCount = data.counts[0].total;
  const partCount = data.counts[1].total;
  const whenWord = per.words;
  const failedRows = [
    ...data.failed.failed.map((f) => ({ id: f.id, kind: "payment" as const, studentId: f.studentId, amount: f.amountPaise, at: f.createdAt, why: f.failureReason ?? "Declined by the bank" })),
    ...data.failed.stuck.map((s) => ({ id: s.id, kind: "link" as const, studentId: s.studentId, amount: s.amountPaise, at: s.lastAttemptAt ?? s.updatedAt, why: "Not confirmed by Razorpay within 30 minutes" })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, 8);
  const dayWord = (d: Date) => (formatDate(d, p.tz) === formatDate(today, "UTC") ? formatTime(d, p.tz) : `${formatDate(d, p.tz)}, ${formatTime(d, p.tz)}`);
  const longDate = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(today);

  return (
    <div>
      <FeeHead pageName="Fee Dashboard" href={HREF}
        sub={`${longDate} · live as money comes in · updated ${formatTime(new Date(), p.tz)}`}
        viewActions={<ExportButton href={qs(`${BASE}/dashboard/export`, keep)} />}
        actions={p.desk ? <ButtonLink href={BASE} variant="primary" icon={IndianRupee}>Collect fee</ButtonLink> : undefined} />
      <Stack>
        <Band items={[
          { label: "Collected today", big: formatRupees(tiles.today.amount), foot: `${tiles.today.count} ${tiles.today.count === 1 ? "payment" : "payments"} · ${data.upiToday} by UPI`, href: `${HREF}#recent` },
          { label: "Collected this year", big: formatRupeesShort(tiles.year.paid), foot: `of ${formatRupeesShort(tiles.year.due)} due so far · ${Math.round(tiles.year.percent)}%`, href: `${HREF}#by-class` },
          { label: "Pending", big: formatRupeesShort(tiles.pending), foot: tiles.nextDue ? `Not late yet · next due ${formatDate(tiles.nextDue)}` : "Nothing falls due in the next 30 days", href: p.may("reports") ? `${BASE}/reports?r=outstanding` : undefined },
          { label: "Overdue", big: formatRupeesShort(tiles.overdue), foot: `${tiles.overdueStudents} ${tiles.overdueStudents === 1 ? "student" : "students"} · ${tiles.over30} over 30 days`, href: p.may("defaulters") ? `${BASE}/defaulters` : undefined },
        ]} />

        {data.waiting.length > 0 && (
          <Banner tone="warn" title={`${data.waiting.length} ${data.waiting.length === 1 ? "payment waits" : "payments wait"} for verification (${formatRupees(waitingSum)}).`}
            action={<Link href={qs(HREF, { ...keep, pay: data.waiting[0].id })} scroll={false} className={buttonClass("secondary", "sm")}>{p.does("dashboard") ? "Verify" : "See"}</Link>}>
            Cheques and bank transfers post to the Day Book only after the accountant checks them.
          </Banner>
        )}

        <ClassFees data={tiles.byClass} sort={feeSort} group={feeGroup} today={today}
          href={(change) => `${qs(HREF, { ...keep, fsort: feeSort === "overdue" ? null : feeSort, fgroup: feeGroup === "all" ? null : feeGroup, ...change })}#by-class`}
          classHref={(id) => `${HREF}/class/${id}`} />

        <div className="grid lg:grid-cols-2 xl:grid-cols-3 gap-5 lg:gap-6 items-start">
          <Card>
            <CardHeader title="Monthly collection" description={`Collected against due, ${p.year?.name ?? "this year"} (₹ lakh)`} icon={ChartColumn} />
            <div className="px-5 pb-1 flex items-baseline gap-3 flex-wrap">
              <p className="font-display text-[28px] font-semibold tnum">{formatRupeesShort(collectedSoFar)}</p>
              <p className="text-[13px] text-ink3">of {formatRupeesShort(dueSoFar)} due so far · <span className="text-ok font-semibold">{pct(collectedSoFar, dueSoFar)}%</span></p>
            </div>
            <div className="px-3 pb-2">
              {trend.length ? <Bars data={trend.map((m) => ({ k: m.label, v: Math.round(lakh(m.collected) * 100) / 100, v2: Math.round(lakh(m.due) * 100) / 100, tip: `${m.label}: ${formatRupees(m.collected)} collected of ${formatRupees(m.due)} due` }))}
                max={ticks[ticks.length - 1] * 1.15 || 1} ticks={ticks} ariaLabel="Fee collected each month against fees due" />
                : <p className="px-2 py-10 text-center text-[13px] text-ink3">Set the academic year in Academic Management to see the months.</p>}
            </div>
            <div className="px-5 pb-4 flex items-center gap-4 flex-wrap"><Legend items={[["bg-brand", "Collected"], ["bg-ink3/25", "Due"]]} /><span className="ml-auto text-[12.5px] text-ink3">{new Intl.DateTimeFormat("en-IN", { month: "long", timeZone: "UTC" }).format(today)} is still open</span></div>
          </Card>
          <Card>
            <CardHeader title="How parents paid" description={period === "today" ? `Today · ${formatRupees(mTotal)}` : `${new Intl.DateTimeFormat("en-IN", { month: "long", timeZone: "UTC" }).format(today)} so far · ${formatRupeesShort(mTotal)}`} icon={Wallet} />
            <div className="px-5 pb-3"><UrlSegmented size="sm" className="w-full" param="how" fallback="today" label="Period" options={[{ value: "today", label: "Today" }, { value: "month", label: "This month" }]} /></div>
            <ul className="px-5 pb-5 flex flex-col gap-3">
              {methods.map((m) => (
                <li key={m.mode} className="text-[13.5px]">
                  <div className="flex items-center gap-2 mb-1">
                    <ModeIcon mode={m.mode} />
                    <span className="font-medium flex-1 min-w-0 truncate">{modeWord(m.mode)}</span>
                    <span className="text-ink3 tnum text-[12.5px]">{m.count}</span>
                    <span className="font-semibold tnum w-20 text-right">{period === "today" ? formatRupees(m.amount) : formatRupeesShort(m.amount)}</span>
                  </div>
                  <Progress value={mMax > BigInt(0) ? pct(m.amount, mMax) : 0} />
                </li>
              ))}
            </ul>
          </Card>
          <div className="grid lg:grid-cols-2 xl:grid-cols-1 gap-5 lg:gap-6 lg:col-span-2 xl:col-span-1 items-start">
            <Card>
              <CardHeader title="Failed online payments" description="No receipt was made for these" icon={CircleX} action={<Pill tone={failedRows.length ? "bad" : "ok"}>{failedRows.length}</Pill>} />
              {failedRows.length === 0 ? (
                <p className="px-5 pb-5 text-[13.5px] text-ink3">No failed or stuck online payments in the last 7 days.</p>
              ) : (
                <ul className="px-2 pb-2">
                  {failedRows.map((f) => {
                    const s = data.stuckStudents.find((x) => x.id === f.studentId);
                    const g = data.guardians.find((x) => x.studentId === f.studentId)?.guardian;
                    const body = (
                      <>
                        <p className="font-semibold text-[14px] truncate">{s?.fullName ?? "Student"} <span className="text-ink3 font-normal">· {data.stuckClasses.get(f.studentId)?.label ?? ""}</span></p>
                        <p className="text-[12.5px] text-ink3 truncate">{formatRupees(f.amount)} · {dayWord(f.at)} · {f.why}</p>
                        {g && <p className="text-[12.5px] text-ink3 tnum">{g.name} · {g.phone}</p>}
                      </>
                    );
                    return (
                      <li key={f.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/70">
                        {f.kind === "payment" ? <Link href={payHref(f.id)} scroll={false} className="min-w-0 flex-1 text-left">{body}</Link> : <div className="min-w-0 flex-1">{body}</div>}
                        {p.does("dashboard") && <FailedLinkButton kind={f.kind} id={f.id} />}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
            {data.promises && (
              <Card>
                <CardHeader title="Promises to pay" description={`Made on calls, with the promised date in ${data.promises.term.label}`} icon={Handshake}
                  action={p.may("defaulters") ? <ButtonLink href={`${BASE}/defaulters`} size="sm" variant="ghost">Defaulters</ButtonLink> : undefined} />
                <div className="px-5 pb-5">
                  <p className="font-display text-[24px] font-semibold tnum leading-tight">
                    <span className="text-ok">{data.promises.kept} kept</span> <span className="text-ink3 font-normal">·</span> <span className={data.promises.broken ? "text-bad" : "text-ink3"}>{data.promises.broken} broken</span>
                  </p>
                  <p className="text-[13px] text-ink3 mt-1">
                    {data.promises.kept + data.promises.broken > 0 ? `${Math.round((data.promises.kept * 100) / (data.promises.kept + data.promises.broken))}% kept · ` : ""}
                    {data.promises.open ? `${data.promises.open} open now for ${formatRupeesShort(data.promises.openPaise)}, reminders paused` : "None open now"}
                  </p>
                </div>
              </Card>
            )}
            {data.fc && (
              <Suggestion title="Collection forecast"
                source={data.fc.rate === null
                  ? `Installments due in the next 3 months. No dues fell due from ${formatDate(data.fc.basis.from)} to ${formatDate(data.fc.basis.to)}, so there is nothing yet to learn from`
                  : `Installments due in the next 3 months, and the ${Math.round(data.fc.rate * 100)}% of dues paid from ${formatDate(data.fc.basis.from)} to ${formatDate(data.fc.basis.to)}${data.fc.promises ? `, with ${data.fc.promises} open ${data.fc.promises === 1 ? "promise" : "promises"} to pay counted on the promised dates` : ""}`}
                actions={<ButtonLink href={`${BASE}/defaulters`} size="sm" variant="secondary" icon={UserX}>See who is overdue</ButtonLink>}>
                {data.fc.rate === null
                  ? <>Due: {data.fc.months.map((m, i) => (
                    <span key={m.label}>{i > 0 ? (i === data.fc!.months.length - 1 ? " and " : ", ") : ""}<b className="text-ink">{formatRupeesShort(m.due)}</b> in {m.label.split(" ")[0]}</span>
                  ))}. An estimate of what will come in starts once a month of dues has passed.</>
                  : <>Expect about {data.fc.months.map((m, i) => (
                    <span key={m.label}>{i > 0 ? (i === data.fc!.months.length - 1 ? " and " : ", ") : ""}<b className="text-ink">{formatRupeesShort(m.expected ?? m.due)}</b> in {m.label.split(" ")[0]}{i === 0 || m.promised > BigInt(0) ? ` (${[i === 0 ? `${formatRupeesShort(m.due)} due` : null, m.promised > BigInt(0) ? `${formatRupeesShort(m.promised)} promised` : null].filter(Boolean).join(", ")})` : ""}</span>
                  ))}.</>}
              </Suggestion>
            )}
          </div>
        </div>

        <div id="recent" className="scroll-mt-4">
          <Card className="overflow-hidden">
            <CardHeader title="Recent payments" description="Newest first. Online payments arrive by themselves from Razorpay." icon={ReceiptIndianRupee} />
            <LinkTabs className="px-3" label="Payment kind" tabs={[
              { href: qs(HREF, { ...keep, kind: null }), label: "Full payments", count: fullCount, on: tab === "full" },
              { href: qs(HREF, { ...keep, kind: "partial" }), label: "Partial payments", count: partCount, on: tab === "partial" },
            ]} />
            <Toolbar>
              <UrlSearch id="pay-q" placeholder="Student, class or receipt no." />
              <div className="grid grid-cols-2 gap-2.5 md:flex">
                <PeriodFilter {...p.dates} fallback="today" />
                <UrlSelect id="pay-status" param="status" label="Status" className="md:w-48" options={STATUS} />
                <UrlSelect id="pay-mode" param="mode" label="Mode" className="md:w-44 col-span-2 md:col-span-1" options={MODES} />
              </div>
            </Toolbar>
            <OldSoftwareBanner goLive={p.goLive} from={per.from} to={per.to} what="fee payments" className="mx-4 mb-3" />
            <DataList rows={list.rows} rowKey={(r) => r.id} rowHref={(r) => payHref(r.id)} minWidth={760} caption="Recent payments"
              footer={<><span className="tnum">Showing {list.rows.length ? (page - 1) * take + 1 : 0}–{(page - 1) * take + list.rows.length} of {list.total} {whenWord} · {formatRupees(list.sum)} posted</span>
                <span className="flex gap-2">
                  {page > 1 && <Link className={buttonClass("ghost", "sm")} href={qs(HREF, { ...keep, page: String(page - 1) })} scroll={false}>Newer</Link>}
                  {page * take < list.total && <Link className={buttonClass("ghost", "sm")} href={qs(HREF, { ...keep, page: String(page + 1) })} scroll={false}>Older</Link>}
                </span></>}
              empty={allBeforeGoLive(p.goLive, per.from, per.to) ? <OldSoftwareEmpty goLive={p.goLive} what="fee payments" /> : <Empty icon={SearchX} title={q || status !== "all" || mode !== "all" ? "No payments match" : `No ${tab === "partial" ? "partial " : ""}payments ${whenWord} yet`}
                body={q || status !== "all" || mode !== "all" ? "Try another status or mode." : "Payments show here the moment they are collected or arrive online."}
                action={q || status !== "all" || mode !== "all" ? <Link href={qs(HREF, { kind: keep.kind, ...per.keep })} className={buttonClass("secondary")}>Clear filters</Link> : undefined} />}
              rowClass={(r) => r.status === "CANCELLED" && "bg-bad/[.03]"}
              columns={[
                { key: "t", label: "Time", nowrap: true, render: (r) => <span className="tnum text-ink2">{when === "today" ? formatTime(r.paidAt, p.tz) : `${formatDate(r.paymentDate)} ${formatTime(r.paidAt, p.tz)}`}</span> },
                { key: "name", label: "Student", render: (r) => <><p className="font-semibold leading-tight">{r.student?.fullName ?? "Student"}</p><p className="text-[12.5px] text-ink3">{r.classLabel}</p></> },
                { key: "head", label: "Fee heads", render: (r) => <span className="text-[13px] text-ink2">{r.heads || "—"}</span> },
                { key: "amt", label: "Amount", align: "right", render: (r) => <span className={cx("font-semibold", r.status === "CANCELLED" && "line-through text-ink3")}>{formatRupees(r.amountPaise)}</span> },
                { key: "mode", label: "Mode", nowrap: true, render: (r) => <span className="inline-flex items-center gap-1.5 text-[13px]"><ModeIcon mode={r.mode} />{modeWord(r.mode)}</span> },
                { key: "rcpt", label: "Receipt or reference", render: (r) => <span className="font-mono text-[12px] text-ink2">{r.receiptNo ?? r.reference ?? r.gatewayPaymentId ?? "—"}</span> },
                { key: "status", label: "Status", render: (r) => <PayPill status={r.status} /> },
              ]}
              phone={(r) => ({
                title: r.student?.fullName ?? "Student",
                sub: `${r.classLabel} · ${formatTime(r.paidAt, p.tz)} · ${modeWord(r.mode)}`,
                avatar: r.student?.fullName ?? "S",
                right: <><p className={cx("font-semibold tnum text-[14.5px]", r.status === "CANCELLED" && "line-through text-ink3")}>{formatRupees(r.amountPaise)}</p><PayPill status={r.status} short /></>,
              })} />
          </Card>
        </div>
      </Stack>

      {data.sheet && <PaymentSheet p={toSheet(data.sheet, today)} closeHref={here} cancelHref={qs(HREF, { ...keep, cancel: data.sheet.id })} canEdit={p.does("dashboard")} ledgerHref={p.may("ledger") ? `${BASE}/ledger?student=${data.sheet.studentId}` : null} />}
      {data.cancel && data.cancel.status === "POSTED" && p.does("dashboard") && (
        <CancelSheet p={toSheet(data.cancel, today)} closeHref={qs(HREF, { ...keep, pay: data.cancel.id })} doneHref={here}
          needsOk={p.settings.cancelPastApproval && data.cancel.date < today} approver="the principal" />
      )}
    </div>
  );
}
