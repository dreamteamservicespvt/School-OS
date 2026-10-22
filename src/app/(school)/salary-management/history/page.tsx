import Link from "next/link";
import { ArrowUpRight, Building2, Calculator, CalendarX, Download, FileDown, FileSpreadsheet, HandCoins, Landmark, Receipt, ReceiptText, SearchX, TrendingUp, UserRound, type LucideIcon } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDate, formatRupees } from "@/lib/format";
import { runsIn, SALARY_REPORTS } from "@/lib/salary/reports";
import { dayNum, monthName, monthShort } from "@/lib/salary/words";
import { Card, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Col, DataList, Empty, HBars, Split, Stack, Suggestion } from "@/components/money/kit";
import { Bars } from "@/components/money/bars";
import { UrlSegmented, UrlSelect } from "@/components/money/url-filters";
import { ExportButton } from "@/components/ui/export-button";
import { PeriodFilter } from "@/components/list/period-filter";
import { SalaryHead } from "../_components/salary-head";
import { RunPill } from "../_components/bits";
import { BASE, one, qs, salaryGuard, salaryPeriod, type SearchParams } from "../_lib/page";
import { Words } from "@/lib/i18n/client";
import { pageTitle } from "@/lib/i18n/server";

export async function generateMetadata() {
  return { title: await pageTitle("Salary History") };
}

const HREF = `${BASE}/history`;
const UUID = /^[0-9a-f-]{36}$/i;
const ZERO = BigInt(0);
const DONE = ["APPROVED", "PAID", "LOCKED"];
const TABS = [{ value: "month", label: "By month" }, { value: "staff", label: "By staff member" }, { value: "reports", label: "Reports" }];
const ICON: Record<string, LucideIcon> = { summary: FileSpreadsheet, trends: TrendingUp, department: Building2, employee: UserRound, deductions: Receipt, "pt-tds": Calculator, days: CalendarX };
const lakh = (p: bigint) => Math.round(Number(p / BigInt(100)) / 1000) / 100;

/** Salary History (10 §5): paid salary by month and by person, and the reports. HR's View sees days, leave and loss of pay only. */
export default async function HistoryPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await salaryGuard("history");
  const sp = await searchParams;
  const ctx = p.current.ctx;
  const money = p.money;
  const tab = TABS.some((t) => t.value === one(sp.tab)) ? one(sp.tab) : "month";
  const per = salaryPeriod(sp, p.dates, "finyear");

  const data = await withSchool(ctx, async (tx) => {
    // One campus: their campus's months only.
    const runs = await runsIn(tx, per.from, per.to, { campusId: p.current.campusId });
    const lines = await tx.payrollLine.findMany({ where: { runId: { in: runs.map((r) => r.id) }, included: true }, select: { runId: true, staffId: true, grossPaise: true, netPaise: true, deductionsPaise: true, paidDays: true, leaveDays: true, unpaidLeaveDays: true, lopDays: true, daysInMonth: true, absentDays: true } });
    const staff = await tx.staff.findMany({ where: { id: { in: [...new Set(lines.map((l) => l.staffId))] } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, staffCode: true, designation: true, department: { select: { name: true } } } });
    const lastLop = tab === "reports" && money ? await tx.payrollLine.count({ where: { runId: { in: runs.slice(-1).map((r) => r.id) }, lopDays: { gt: 0 } } }) : 0;
    return { runs, lines, staff, lastLop };
  });
  const campusName = new Map(p.campuses.map((c) => [c.id, c.name]));
  const many = p.campuses.length > 1;
  const staffOf = new Map(data.staff.map((s) => [s.id, s]));
  const keep = { ...per.keep, tab: tab === "month" ? null : tab };
  const here = (extra: Record<string, string | null> = {}) => qs(HREF, { ...keep, ...extra });
  const lop = (runId: string) => data.lines.filter((l) => l.runId === runId).reduce((s, l) => s + Number(l.lopDays), 0);
  const leave = (runId: string) => data.lines.filter((l) => l.runId === runId).reduce((s, l) => s + Number(l.leaveDays), 0);
  const done = data.runs.filter((r) => DONE.includes(r.status));
  const sum = (k: "grossPaise" | "deductionsPaise" | "netPaise") => done.reduce((s, r) => s + r[k], ZERO);
  const last = [...data.runs].reverse().find((r) => r.status !== "OPEN");
  const months = [...data.runs].reverse();

  const head = (
    <div className="flex flex-col md:flex-row gap-2.5 md:items-center">
      <div className="overflow-x-auto no-scrollbar shrink-0"><UrlSegmented param="tab" options={TABS} fallback="month" label="Show" /></div>
      <PeriodFilter {...p.dates} fallback="finyear" />
    </div>
  );

  let body: React.ReactNode;
  if (tab === "month") {
    const byDept = new Map<string, { money: bigint; lop: number }>();
    for (const l of data.lines.filter((x) => x.runId === last?.id)) {
      const d = staffOf.get(l.staffId)?.department?.name ?? "No department";
      const v = byDept.get(d) ?? { money: ZERO, lop: 0 };
      v.money += l.grossPaise; v.lop += Number(l.lopDays); byDept.set(d, v);
    }
    const dept = [...byDept.entries()].filter(([, v]) => money || v.lop > 0).sort((a, b) => (money ? (b[1].money > a[1].money ? 1 : -1) : b[1].lop - a[1].lop));
    const pending = data.runs.filter((r) => !DONE.includes(r.status)).map((r) => monthName(r.month).split(" ")[0]);
    body = data.runs.length === 0 ? (
      <Card><Empty icon={ReceiptText} title={`No salary in ${per.label.toLowerCase()}`} body="Pick another period, or open a month in Generate Salary." action={<ButtonLink href={`${BASE}/generate`} variant="secondary" icon={ArrowUpRight}><Words k="Open Generate Salary" /></ButtonLink>} /></Card>
    ) : (
      <Split className="[&>*]:min-w-0">
        <Card className="overflow-hidden">
          <CardHeader title={money ? "Net pay by month" : "Loss of pay by month"} description={`${per.label} · ${money ? "₹ lakh" : "days"}${pending.length ? ` · ${pending.join(", ")} not paid yet` : ""}`}
            action={p.can.export ? <ExportButton href={qs(`${HREF}/report`, { ...per.keep, kind: money ? "summary" : "days" })} size="sm" /> : null} />
          <div className="px-5 pb-2">
            <Bars ariaLabel={money ? "Net salary by month" : "Loss of pay days by month"}
              data={data.runs.map((r) => ({ k: monthShort(r.month), v: money ? lakh(r.netPaise) : lop(r.id), tone: DONE.includes(r.status) ? "brand" as const : "info" as const, tip: money ? `${monthName(r.month)}: ${formatRupees(r.netPaise)}` : `${monthName(r.month)}: ${dayNum(lop(r.id))} days` }))} />
          </div>
          <DataList rows={months} rowKey={(r) => r.id} rowHref={(r) => qs(`${BASE}/generate`, { run: r.id })} minWidth={640} caption="Salary by month"
            columns={[
              { key: "m", label: "Month", render: (r) => <span className="font-semibold">{monthName(r.month)}{many ? <span className="text-ink3 font-normal"> · {campusName.get(r.campusId)}</span> : null}</span> },
              { key: "s", label: "Staff", align: "right", render: (r) => r.staffCount },
              ...(money ? [
                { key: "g", label: "Gross", align: "right" as const, render: (r: (typeof months)[number]) => formatRupees(r.grossPaise) },
                { key: "d", label: "Deductions", align: "right" as const, render: (r: (typeof months)[number]) => formatRupees(r.deductionsPaise) },
                { key: "n", label: "Net", align: "right" as const, render: (r: (typeof months)[number]) => <b className="font-semibold">{formatRupees(r.netPaise)}</b> },
              ] : [
                { key: "lv", label: "Leave days", align: "right" as const, render: (r: (typeof months)[number]) => dayNum(leave(r.id)) },
                { key: "lop", label: "Loss of pay days", align: "right" as const, render: (r: (typeof months)[number]) => <b className="font-semibold">{dayNum(lop(r.id))}</b> },
              ]),
              { key: "p", label: "Paid on", nowrap: true, render: (r) => (r.paidOn ? formatDate(r.paidOn) : <RunPill s={r.status} />) },
            ]}
            phone={(r) => ({ icon: ReceiptText, title: `${monthName(r.month)}${many ? ` · ${campusName.get(r.campusId)}` : ""}`, sub: money ? `${r.staffCount} staff · net ${formatRupees(r.netPaise)}` : `${r.staffCount} staff · ${dayNum(lop(r.id))} days loss of pay`, right: r.paidOn ? <span className="text-[12.5px] text-ink3">{formatDate(r.paidOn)}</span> : <RunPill s={r.status} small /> })} />
        </Card>
        <Col className="[&>*]:min-w-0">
          <Card>
            <CardHeader title={money ? "Year so far" : "Days so far"} description={done.length ? `${monthName(done[0].month).split(" ")[0]} to ${monthName(done[done.length - 1].month).split(" ")[0]}, approved` : "Nothing approved yet"} />
            <ul className="px-5 pb-5 text-[14px] flex flex-col gap-1.5 tnum">
              {money ? <>
                <li className="flex justify-between"><span className="text-ink2"><Words k="Gross" /></span><b className="font-semibold">{formatRupees(sum("grossPaise"))}</b></li>
                <li className="flex justify-between"><span className="text-ink2"><Words k="Deductions" /></span><span>{formatRupees(sum("deductionsPaise"))}</span></li>
                <li className="flex justify-between border-t border-line pt-2 mt-1 items-baseline"><span className="font-semibold"><Words k="Net paid" /></span><b className="font-display text-[20px] font-semibold">{formatRupees(sum("netPaise"))}</b></li>
              </> : <>
                <li className="flex justify-between"><span className="text-ink2"><Words k="Paid leave" /></span><b className="font-semibold">{dayNum(done.reduce((s, r) => s + leave(r.id), 0))} <Words k="days" /></b></li>
                <li className="flex justify-between border-t border-line pt-2 mt-1 items-baseline"><span className="font-semibold"><Words k="Loss of pay" /></span><b className="font-display text-[20px] font-semibold">{dayNum(done.reduce((s, r) => s + lop(r.id), 0))} <Words k="days" /></b></li>
              </>}
            </ul>
          </Card>
          {last && dept.length > 0 && (
            <Card>
              <CardHeader title="By department" description={money ? `${monthName(last.month).split(" ")[0]} gross, ₹ thousand` : `${monthName(last.month).split(" ")[0]} loss of pay, days`} />
              <div className="px-5 pb-5"><HBars labelWidth={96} valueWidth={64} rows={dept.map(([k, v]) => ({ key: k, label: k, value: money ? Number(v.money / BigInt(100000)) : v.lop, text: money ? `${Math.round(Number(v.money / BigInt(100)) / 1000)}k` : dayNum(v.lop) }))} /></div>
            </Card>
          )}
        </Col>
      </Split>
    );
  } else if (tab === "staff") {
    const who = UUID.test(one(sp.who)) && staffOf.has(one(sp.who)) ? one(sp.who) : data.staff[0]?.id ?? "";
    const s = staffOf.get(who);
    const rows = data.lines.filter((l) => l.staffId === who).map((l) => ({ l, r: data.runs.find((r) => r.id === l.runId)! })).reverse();
    body = (
      <Card className="overflow-hidden">
        <div className="p-3 border-b border-line flex flex-col md:flex-row gap-2.5">
          {data.staff.length > 0 && <UrlSelect id="hist-who" param="who" label="Staff member" className="md:w-80" options={data.staff.map((x) => ({ value: x.id, label: `${x.fullName} · ${x.designation}` }))} />}
          <span className="flex-1" />
          {p.can.export && s && <ExportButton href={qs(`${HREF}/report`, { ...per.keep, kind: money ? "employee" : "days", who })} label={money ? "Export" : "Export days"} />}
        </div>
        <DataList rows={rows} rowKey={(x) => x.l.runId} minWidth={640} caption={`${s?.fullName ?? ""} salary history`}
          empty={<Empty icon={SearchX} title={`No salary in ${per.label.toLowerCase()}`} body="Pick another period or staff member." />}
          columns={[
            { key: "m", label: "Month", render: (x) => <span className="font-semibold">{monthName(x.r.month)}</span> },
            { key: "pd", label: "Paid days", align: "right", render: (x) => `${dayNum(Number(x.l.paidDays))} of ${x.l.daysInMonth}` },
            ...(money ? [
              { key: "g", label: "Gross", align: "right" as const, render: (x: (typeof rows)[number]) => formatRupees(x.l.grossPaise) },
              { key: "d", label: "Deductions", align: "right" as const, render: (x: (typeof rows)[number]) => formatRupees(x.l.deductionsPaise) },
              { key: "n", label: "Net", align: "right" as const, render: (x: (typeof rows)[number]) => <b className="font-semibold">{formatRupees(x.l.netPaise)}</b> },
            ] : [
              { key: "lv", label: "Paid leave", align: "right" as const, render: (x: (typeof rows)[number]) => dayNum(Number(x.l.leaveDays)) },
              { key: "ab", label: "Absent", align: "right" as const, render: (x: (typeof rows)[number]) => dayNum(Number(x.l.absentDays)) },
              { key: "lop", label: "Loss of pay", align: "right" as const, render: (x: (typeof rows)[number]) => <b className="font-semibold">{dayNum(Number(x.l.lopDays))}</b> },
            ]),
            { key: "p", label: "Paid on", nowrap: true, render: (x) => (x.r.paidOn ? formatDate(x.r.paidOn) : <RunPill s={x.r.status} />) },
          ]}
          phone={(x) => ({ icon: ReceiptText, title: monthName(x.r.month), sub: x.r.paidOn ? `Paid ${formatDate(x.r.paidOn)}` : `${dayNum(Number(x.l.paidDays))} paid days`, right: money ? <b className="font-semibold tnum">{formatRupees(x.l.netPaise)}</b> : <span className="tnum text-[13px]">{dayNum(Number(x.l.lopDays))} <Words k="LOP" /></span> })} />
      </Card>
    );
  } else {
    const reports = SALARY_REPORTS.filter((r) => money || !r.money);
    const lastDone = [...done].reverse()[0];
    const extra = money && lastDone ? [
      { key: "pf", title: `PF statement · ${monthName(lastDone.month)}`, sub: "EPFO ECR file, matches the payroll totals", icon: FileDown, href: qs(`${BASE}/generate/statement`, { run: lastDone.id, kind: "PF" }) },
      { key: "esi", title: `ESI statement · ${monthName(lastDone.month)}`, sub: "ESIC monthly contribution file", icon: FileDown, href: qs(`${BASE}/generate/statement`, { run: lastDone.id, kind: "ESI" }) },
      { key: "adv", title: "Advances and loans outstanding", sub: "Balance and monthly recovery", icon: HandCoins, href: qs(`${BASE}/advances/export`, {}) },
      { key: "bank", title: `Bank transfer list · ${monthName(lastDone.month)}`, sub: "Account, IFSC and amount for each person", icon: Landmark, href: qs(`${BASE}/generate/bank-file`, { run: lastDone.id }) },
    ] : [];
    const prev = done.length > 1 ? done[done.length - 2] : null;
    const diff = lastDone && prev ? lastDone.netPaise - prev.netPaise : null;
    body = (
      <Split className="[&>*]:min-w-0">
        <Card>
          <CardHeader title="Salary reports" description={`Excel, CSV or PDF · ${per.label}`} />
          <ul className="px-2 pb-2">
            {reports.filter((r) => r.key !== "employee").map((r) => {
              const Ic = ICON[r.key];
              const href = (format: string) => qs(`${HREF}/report`, { ...per.keep, kind: r.key, format });
              return (
                <li key={r.key} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-sunken/70">
                  <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-brand/10 text-brand"><Ic size={19} aria-hidden="true" /></span>
                  <a href={href("xlsx")} download className="min-w-0 flex-1"><p className="font-semibold text-[14.5px] truncate">{r.title}</p><p className="text-[12.5px] text-ink3 truncate">{r.sub}</p></a>
                  <span className="hidden sm:flex gap-1 text-[12.5px]"><a href={href("csv")} download className="px-2 py-1 rounded-lg text-ink2 hover:bg-sunken"><Words k="CSV" /></a><a href={href("pdf")} download className="px-2 py-1 rounded-lg text-ink2 hover:bg-sunken"><Words k="PDF" /></a></span>
                  <Download size={17} className="text-ink3" aria-hidden="true" />
                </li>
              );
            })}
            {money && <li className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-sunken/70">
              <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-brand/10 text-brand"><UserRound size={19} aria-hidden="true" /></span>
              <Link href={here({ tab: "staff" })} className="min-w-0 flex-1"><p className="font-semibold text-[14.5px] truncate"><Words k="Employee salary history" /></p><p className="text-[12.5px] text-ink3 truncate"><Words k="Every month for one person · choose them in By staff member" /></p></Link>
              <ArrowUpRight size={17} className="text-ink3" aria-hidden="true" />
            </li>}
            {extra.map((r) => (
              <li key={r.key} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-sunken/70">
                <span className="w-10 h-10 rounded-xl grid place-items-center shrink-0 bg-brand/10 text-brand"><r.icon size={19} aria-hidden="true" /></span>
                <a href={r.href} download className="min-w-0 flex-1"><p className="font-semibold text-[14.5px] truncate">{r.title}</p><p className="text-[12.5px] text-ink3 truncate">{r.sub}</p></a>
                <Download size={17} className="text-ink3" aria-hidden="true" />
              </li>
            ))}
          </ul>
          <p className="px-5 pb-4 text-[12.5px] text-ink3"><Words k="With the school name, the period and your name on top. Every export is kept in the export log." /></p>
        </Card>
        {money && lastDone && prev && diff !== null ? (
          <Suggestion title={`${monthName(lastDone.month).split(" ")[0]} ${Math.abs(Number(diff)) * 20 > Number(prev.netPaise) ? "changed a lot" : "looks normal"}`} source={`salary runs in ${per.label.toLowerCase()} and their rows`}
            actions={<ButtonLink size="sm" variant="secondary" href={qs(`${BASE}/generate`, { run: lastDone.id })}><Words k="Open" /> {monthName(lastDone.month).split(" ")[0]}</ButtonLink>}>
            {monthName(lastDone.month).split(" ")[0]}<Words k="’s net pay is" /> {formatRupees(diff < ZERO ? -diff : diff)} {diff < ZERO ? "less" : "more"} <Words k="than" /> {monthName(prev.month).split(" ")[0]}’s
            {lastDone.staffCount !== prev.staffCount ? `, with ${lastDone.staffCount} staff instead of ${prev.staffCount}` : ", with the same staff"}.
            {data.lastLop ? ` ${data.lastLop} ${data.lastLop === 1 ? "person had" : "people had"} loss of pay in the latest month.` : ""}
          </Suggestion>
        ) : <div />}
      </Split>
    );
  }

  return (
    <div>
      <SalaryHead pageName="Salary History" href={HREF} sub={money ? "Salary paid by month and by staff member, and the salary reports" : "Days, leave and loss of pay that reached the salary, by month and by staff member"} />
      <Stack>
        {head}
        {body}
      </Stack>
    </div>
  );
}
