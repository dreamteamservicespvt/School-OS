import { HandCoins, History, Landmark, Repeat, SearchX, Wallet } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatRupees } from "@/lib/format";
import { balanceOf } from "@/lib/salary/advances";
import { salarySettings } from "@/lib/salary/settings";
import { ADVANCE_STATUS_LABEL, ADVANCE_STATUS_TONE, addMonths, firstOfMonth, monthKey, monthName, payModeLabel } from "@/lib/salary/words";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Banner, DL, DataList, Empty, Progress, Stack, Stats, Timeline, Toolbar } from "@/components/money/kit";
import { UrlSearch, UrlSegmented } from "@/components/money/url-filters";
import { UrlSheet } from "@/components/ui/url-sheet";
import { ExportButton } from "@/components/ui/export-button";
import { PeriodFilter } from "@/components/list/period-filter";
import { ReasonSheet } from "../../finance-management/_components/forms";
import { SalaryHead } from "../_components/salary-head";
import { BASE, one, qs, salaryGuard, salaryPeriod, type SearchParams } from "../_lib/page";
import { pauseAdvanceAction } from "./actions";
import { AdvanceMenu, CloseCashSheet, GiveSheet, InstallmentSheet, PaySheet } from "./sheets";

export const metadata = { title: "Advances & Loans" };

const HREF = `${BASE}/advances`;
const UUID = /^[0-9a-f-]{36}$/i;
const ZERO = BigInt(0);
const SHOW = [{ value: "active", label: "Active" }, { value: "closed", label: "Closed" }, { value: "all", label: "All" }];
const OPEN = ["WAITING", "APPROVED", "ACTIVE"];
type Hist = { at?: string; by?: string; what: string; reason?: string | null };

/** Advances & Loans (10 §4): given with approval, paid through the Day Book, recovered from salary until zero. */
export default async function AdvancesPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await salaryGuard("advances");
  const sp = await searchParams;
  const ctx = p.current.ctx;
  const per = salaryPeriod(sp, p.dates, null);
  const show = SHOW.some((s) => s.value === one(sp.show)) ? one(sp.show) : "active";
  const q = one(sp.q).trim().toLowerCase().slice(0, 80);
  const doing = p.change ? one(sp.do) : "";
  const openId = UUID.test(one(sp.open)) ? one(sp.open) : "";
  const monthNow = firstOfMonth(p.today);

  const data = await withSchool(ctx, async (tx) => {
    const settings = await salarySettings(tx, ctx);
    const all = await tx.salaryAdvance.findMany({ orderBy: [{ createdAt: "desc" }] });
    const staff = await tx.staff.findMany({ where: { id: { in: all.map((a) => a.staffId) } }, select: { id: true, fullName: true, staffCode: true, designation: true } });
    const thisMonth = await tx.salaryRecovery.aggregate({ where: { kind: "PAYROLL", date: { gte: monthNow } }, _sum: { amountPaise: true } });
    const recoveries = openId ? await tx.salaryRecovery.findMany({ where: { advanceId: openId }, orderBy: { date: "asc" } }) : [];
    const people = doing === "give" ? await tx.staff.findMany({ where: { archivedAt: null, status: { notIn: ["RESIGNED", "RETIRED", "TERMINATED"] } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, designation: true } }) : [];
    const banks = doing === "pay" ? await tx.bankAccount.findMany({ where: { kind: "BANK", archivedAt: null }, orderBy: [{ isMain: "desc" }, { name: "asc" }], select: { id: true, name: true, isMain: true, accountLast4: true } }) : [];
    const ids = [...new Set(all.flatMap((a) => (a.history as Hist[]).map((h) => h.by)).filter((x): x is string => !!x))];
    const users = openId ? await tx.userLogin.findMany({ where: { id: { in: ids } }, select: { id: true, displayName: true } }) : [];
    return { settings, all, staff, recovered: thisMonth._sum.amountPaise ?? ZERO, recoveries, people, banks, users };
  });
  const staffOf = new Map(data.staff.map((s) => [s.id, s]));
  const given = (a: (typeof data.all)[number]) => a.paidOn ?? a.createdAt;
  const inPeriod = (a: (typeof data.all)[number]) => !per.from || !per.to || (given(a) >= per.from && given(a) <= new Date(per.to.getTime() + 86_399_999));
  const rows = data.all
    .filter(inPeriod)
    .filter((a) => show === "all" || (show === "active" ? OPEN.includes(a.status) : !OPEN.includes(a.status)))
    .filter((a) => { const s = staffOf.get(a.staffId); return !q || [s?.fullName, s?.staffCode, a.number, a.reason].some((v) => v?.toLowerCase().includes(q)); });
  const active = data.all.filter((a) => a.status === "ACTIVE");
  const unpaid = data.all.filter((a) => a.status === "APPROVED");
  const waiting = data.all.filter((a) => a.status === "WAITING");
  const outstanding = active.reduce((s, a) => s + balanceOf(a), ZERO);
  const paidOut = data.all.filter((a) => a.paidOn && inPeriod(a)).reduce((s, a) => s + a.amountPaise, ZERO);
  const keep = { ...per.keep, show: show === "active" ? null : show, q: q || null };
  const here = (extra: Record<string, string | null> = {}) => qs(HREF, { ...keep, ...extra });
  const name = (a: { staffId: string }) => staffOf.get(a.staffId)?.fullName ?? "Staff";
  const kind = (a: { type: string }) => (a.type === "LOAN" ? "Loan" : "Advance");
  const statusWord = (a: (typeof data.all)[number]) => (a.status === "ACTIVE" && a.paused ? "Paused" : ADVANCE_STATUS_LABEL[a.status]);
  const target = (openId || UUID.test(one(sp.id))) ? data.all.find((a) => a.id === (openId || one(sp.id))) ?? null : null;
  const months = [1, 2, 3].map((n) => addMonths(monthNow, n)).map((m) => ({ value: monthKey(m), label: monthName(m) }));
  const pct = (a: (typeof data.all)[number]) => (a.amountPaise > ZERO ? Number((a.recoveredPaise * BigInt(1000)) / a.amountPaise) / 10 : 0);
  const menu = (a: (typeof data.all)[number], withHistory = true) => ({
    paused: a.paused, pause: here({ do: "pause", id: a.id }), restart: here({ do: "restart", id: a.id }),
    installment: here({ do: "installment", id: a.id }), close: here({ do: "close", id: a.id }), history: withHistory ? here({ open: a.id }) : undefined,
  });
  const action = (a: (typeof data.all)[number]) => {
    if (!p.change) return null;
    if (a.status === "APPROVED") return <div className="relative z-10 flex justify-end"><ButtonLink href={here({ do: "pay", id: a.id })} scroll={false} size="sm" variant="soft">Mark paid</ButtonLink></div>;
    if (a.status === "ACTIVE") return <div className="relative z-10 flex justify-end"><AdvanceMenu {...menu(a)} label={`More for ${name(a)}`} /></div>;
    return null;
  };

  return (
    <div>
      <SalaryHead pageName="Advances & Loans" href={HREF} sub="Salary advances and loans, recovered from monthly pay until the balance is zero"
        actions={p.can.create && data.settings.advancesOn ? <ButtonLink href={here({ do: "give" })} scroll={false} variant="primary" icon={HandCoins}>Give advance or loan</ButtonLink> : null} />
      <Stack>
        <Stats items={[
          { label: "Active", value: String(active.length), sub: unpaid.length ? `${unpaid.length} approved, not paid yet` : waiting.length ? `${waiting.length} waiting for approval` : "being recovered", icon: HandCoins },
          { label: "Outstanding", value: formatRupees(outstanding), sub: "still to recover", icon: Wallet },
          { label: `Recovered in ${monthName(monthNow).split(" ")[0]}`, value: formatRupees(data.recovered), sub: "in this month’s salary", tone: data.recovered > ZERO ? "ok" : undefined, icon: Repeat },
          { label: "Paid out", value: formatRupees(paidOut), sub: per.from ? per.label : "in the Day Book when paid", icon: Landmark },
        ]} />
        {!data.settings.advancesOn && <Banner tone="info" title="Advances and loans are switched off.">Switch them on in Salary Settings to give new ones. Open ones are still recovered.</Banner>}
        <Card className="overflow-hidden">
          <Toolbar>
            <div className="overflow-x-auto no-scrollbar shrink-0"><UrlSegmented param="show" options={SHOW} fallback="active" label="Show" /></div>
            <UrlSearch id="adv-search" placeholder="Staff name or number" label="Search advances" />
            <PeriodFilter {...p.dates} allLabel="Any date given" />
            <span className="flex-1" />
            {p.can.export && <ExportButton href={qs(`${HREF}/export`, keep)} />}
          </Toolbar>
          <DataList rows={rows} rowKey={(a) => a.id} rowHref={(a) => here({ open: a.id })} minWidth={980} caption="Advances and loans"
            footer={`Showing ${rows.length} of ${data.all.length}${per.from ? ` · given ${per.label.toLowerCase()}` : ""}`}
            empty={<Empty icon={show === "active" && !q && !per.from ? HandCoins : SearchX} title={show === "active" && !q && !per.from ? "No open advances or loans" : "Nothing matches"} body={show === "active" && !q && !per.from ? "Give one with the button above. It needs the Principal’s approval." : "Try another search, status or date."} />}
            columns={[
              { key: "n", label: "Staff member", render: (a) => <div className="flex items-center gap-3"><Avatar name={name(a)} size={34} /><div className="min-w-0"><p className="font-semibold leading-tight">{name(a)}</p><p className="text-[12px] text-ink3 truncate max-w-[220px]">{a.reason}</p></div></div> },
              { key: "t", label: "Type", render: (a) => <Pill tone={a.type === "LOAN" ? "info" : "brand"}>{kind(a)}</Pill> },
              { key: "a", label: "Amount", align: "right", render: (a) => formatRupees(a.amountPaise) },
              { key: "g", label: "Given", nowrap: true, render: (a) => <span className="text-ink2">{a.paidOn ? formatDate(a.paidOn) : a.status === "WAITING" ? "Waiting for approval" : a.status === "APPROVED" ? "Not paid yet" : "—"}</span> },
              { key: "i", label: "Each month", align: "right", render: (a) => formatRupees(a.installmentPaise) },
              { key: "b", label: "Balance", render: (a) => <div className="w-32"><div className="flex justify-between text-[12.5px] tnum mb-1"><span>{formatRupees(balanceOf(a))}</span><span className="text-ink3">{Math.round(pct(a))}%</span></div><Progress value={pct(a)} tone={a.status === "CLOSED" ? "ok" : "brand"} /></div> },
              { key: "s", label: "Status", render: (a) => <Pill tone={a.paused && a.status === "ACTIVE" ? "warn" : ADVANCE_STATUS_TONE[a.status]}>{statusWord(a)}</Pill> },
              { key: "x", label: "", render: action },
            ]}
            phone={(a) => ({ avatar: name(a), title: `${name(a)} · ${kind(a)}`, sub: `${formatRupees(balanceOf(a))} left of ${formatRupees(a.amountPaise)} · ${formatRupees(a.installmentPaise)} a month`, pills: <Pill tone={a.paused && a.status === "ACTIVE" ? "warn" : ADVANCE_STATUS_TONE[a.status]} className="!h-[22px] !text-[11.5px]">{statusWord(a)}</Pill>, right: p.change && a.status === "APPROVED" ? <span className="text-[12.5px] font-semibold text-brand">Mark paid</span> : null })} />
        </Card>
      </Stack>

      {openId && target && (() => {
        const s = staffOf.get(target.staffId);
        const by = new Map(data.users.map((u) => [u.id, u.displayName]));
        const hist = target.history as Hist[];
        return (
          <UrlSheet closeHref={here({ open: null })} title={`${kind(target)} ${target.number}`} sub={`${s?.fullName ?? ""} · ${s?.designation ?? ""}`}
            footer={p.change && target.status === "APPROVED" ? <div className="flex justify-end"><ButtonLink href={here({ open: null, do: "pay", id: target.id })} scroll={false} variant="primary">Mark paid</ButtonLink></div> : p.change && target.status === "ACTIVE" ? <div className="flex justify-end"><AdvanceMenu {...menu(target, false)} size="md" /></div> : null}>
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between gap-3"><Pill tone={ADVANCE_STATUS_TONE[target.status]}>{statusWord(target)}</Pill><span className="font-display text-[22px] font-semibold tnum">{formatRupees(balanceOf(target))} <span className="text-[13px] text-ink3 font-sans font-normal">left</span></span></div>
              <Progress value={pct(target)} tone={target.status === "CLOSED" ? "ok" : "brand"} />
              <Card><DL className="pt-5" rows={[
                ["Amount", formatRupees(target.amountPaise)], ["Each month", formatRupees(target.installmentPaise)],
                ["Recovery from", monthName(target.startMonth)], ["Recovered", formatRupees(target.recoveredPaise)],
                ["Paid", target.paidOn ? `${formatDate(target.paidOn)} · ${payModeLabel(target.payMode)}${target.payReference ? ` · ${target.payReference}` : ""}` : "Not paid yet"],
                ["Reason", target.reason],
              ]} /></Card>
              {data.recoveries.length > 0 && <Card><CardHeader title="Recovered" description={`${data.recoveries.length} time${data.recoveries.length === 1 ? "" : "s"}`} />
                <ul className="divide-y divide-line/70 border-t border-line/70">{data.recoveries.map((r) => <li key={r.id} className="flex justify-between px-5 py-2.5 text-[14px]"><span className="text-ink2">{r.kind === "CASH" ? `Repaid in cash · ${formatDate(r.date)}` : `${monthName(firstOfMonth(r.date))} salary`}</span><span className="tnum font-semibold">{formatRupees(r.amountPaise)}</span></li>)}</ul></Card>}
              {hist.length > 0 && <div><p className="eyebrow text-ink3 mb-2">History</p><Timeline items={[...hist].reverse().map((h, i) => ({ icon: i === hist.length - 1 ? HandCoins : History, what: `${h.what}${h.reason ? ` · ${h.reason}` : ""}`, when: [h.at ? formatDate(new Date(h.at)) : null, h.by ? by.get(h.by) : null].filter(Boolean).join(" · ") }))} /></div>}
            </div>
          </UrlSheet>
        );
      })()}

      {doing === "give" && data.settings.advancesOn && (
        <GiveSheet closeHref={here({ do: null })} months={months} approver="the Principal"
          staff={data.people.map((s) => ({ value: s.id, label: `${s.fullName} · ${s.designation}` }))} />
      )}
      {doing === "pay" && target && target.status === "APPROVED" && (
        <PaySheet closeHref={here({ do: null, id: null })} advanceId={target.id} title={`Pay ${name(target)}’s ${kind(target).toLowerCase()}`} amount={formatRupees(target.amountPaise)} today={p.today.toISOString().slice(0, 10)}
          banks={data.banks.map((b) => ({ value: b.id, label: `${b.name}${b.accountLast4 ? ` · XXXX${b.accountLast4}` : ""}` }))} mainBank={data.banks.find((b) => b.isMain)?.id ?? data.banks[0]?.id ?? ""} />
      )}
      {(doing === "pause" || doing === "restart") && target && target.status === "ACTIVE" && (
        <ReasonSheet closeHref={here({ do: null, id: null })} danger={false} action={pauseAdvanceAction} hidden={{ advanceId: target.id, paused: doing === "pause" ? "1" : "0" }}
          title={doing === "pause" ? `Pause recovery for ${name(target)}?` : `Restart recovery for ${name(target)}?`}
          sub={doing === "pause" ? "Nothing is deducted until you restart it." : `${formatRupees(target.installmentPaise)} a month again from the next salary.`}
          label={doing === "pause" ? "Pause recovery" : "Restart recovery"} placeholder={doing === "pause" ? "Like: on unpaid leave in November" : "Like: back from leave"} />
      )}
      {doing === "installment" && target && OPEN.includes(target.status) && target.status !== "WAITING" && (
        <InstallmentSheet closeHref={here({ do: null, id: null })} advanceId={target.id} name={name(target)} current={formatRupees(target.installmentPaise)} balance={formatRupees(balanceOf(target))} />
      )}
      {doing === "close" && target && target.status === "ACTIVE" && (
        <CloseCashSheet closeHref={here({ do: null, id: null })} advanceId={target.id} today={p.today.toISOString().slice(0, 10)}
          title={`Close ${name(target)}’s ${kind(target).toLowerCase()}?`} label={`Record ${formatRupees(balanceOf(target))} received and close`}>
          <p className="text-[14px] text-ink2">{name(target)} repays the balance of {formatRupees(balanceOf(target))} in cash. A receipt goes in the Day Book and no more is deducted from salary.</p>
        </CloseCashSheet>
      )}
    </div>
  );
}
