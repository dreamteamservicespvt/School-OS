import Link from "next/link";
import {
  Banknote, CalendarPlus, CalendarRange, CalendarX2, Check, Eye, FileDown, FileSpreadsheet, FileWarning, Hourglass, Info, ListChecks, Lock, Plus, Receipt,
  ReceiptText, SearchX, Send, Undo2, Wallet,
} from "lucide-react";
import { withSchool } from "@/lib/db";
import { canDecide } from "@/lib/approvals";
import { formatDate, formatDateTime, formatRupees, formatRupeesShort } from "@/lib/format";
import { payrollStaff, runBreakdown, lineDays } from "@/lib/salary/payroll";
import { salarySettings } from "@/lib/salary/settings";
import { addMonths, adjustmentLabel, dayNum, dayShort, firstOfMonth, lastOfMonth, monthKey, monthName, monthShort } from "@/lib/salary/words";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Banner, DL, Empty, Split, Col, Stack, Stats, Toolbar } from "@/components/money/kit";
import { UrlSearch, UrlSegmented, UrlSelect } from "@/components/money/url-filters";
import { UrlSheet } from "@/components/ui/url-sheet";
import { ExportButton } from "@/components/ui/export-button";
import { PeriodFilter } from "@/components/list/period-filter";
import { cx } from "@/components/ui/cx";
import { ActButton, ReasonSheet } from "../../finance-management/_components/forms";
import { SalaryHead } from "../_components/salary-head";
import { FlagPill, MoneyLi, RunPill, RunSteps, WorkRow } from "../_components/bits";
import { ConfirmSheet } from "../_components/forms";
import { BASE, one, qs, salaryGuard, salaryPeriod, type SearchParams } from "../_lib/page";
import { calculateAction, decideRunAction, lockRunAction, removeAdjustmentAction, reversePaymentAction, sendRunAction, takeBackAction } from "./actions";
import { AdjustmentSheet, OpenMonthSheet, PayRunSheet, TdsSheet } from "./sheets";

export const metadata = { title: "Generate Salary" };

const HREF = `${BASE}/generate`;
const UUID = /^[0-9a-f-]{36}$/i;
const ZERO = BigInt(0);
const amt = formatRupees;
const SHOW = [{ value: "all", label: "Everyone" }, { value: "flag", label: "Flagged" }, { value: "lop", label: "Loss of pay" }, { value: "adj", label: "Adjusted" }];

/** Generate Salary (10 §2, mod-salary.jsx Generate): one run a month per campus, from Open to Locked. */
export default async function GeneratePage({ searchParams }: { searchParams: SearchParams }) {
  const p = await salaryGuard("generate");
  const sp = await searchParams;
  const ctx = p.current.ctx;
  const money = p.money;
  const campusId = p.campuses.find((c) => c.id === one(sp.campus))?.id ?? p.me?.campusId ?? p.campuses[0]?.id ?? "";
  const campus = p.campuses.find((c) => c.id === campusId);
  const per = salaryPeriod(sp, p.dates, "finyear");
  const q = one(sp.q).trim().toLowerCase().slice(0, 80);
  const show = SHOW.some((s) => s.value === one(sp.show)) ? one(sp.show) : "all";
  const pick = (k: string) => (UUID.test(one(sp[k])) ? one(sp[k]) : "");
  const doing = p.change ? one(sp.do) : "";
  const thisMonth = firstOfMonth(p.today);

  const data = await withSchool(ctx, async (tx) => {
    const settings = await salarySettings(tx, ctx);
    const inRange = per.from && per.to ? { month: { gte: firstOfMonth(per.from), lte: per.to } } : {};
    const runs = await tx.payrollRun.findMany({ where: { campusId, ...inRange }, orderBy: { month: "desc" } });
    const asked = pick("run");
    const run = (asked ? await tx.payrollRun.findFirst({ where: { id: asked, campusId } }) : null)
      ?? runs.find((r) => r.month.getTime() === thisMonth.getTime()) ?? runs[0]
      ?? (await tx.payrollRun.findFirst({ where: { campusId }, orderBy: { month: "desc" } }));
    const allRuns = await tx.payrollRun.findMany({ where: { campusId }, select: { month: true, status: true } });
    const staffNow = await payrollStaff(tx, campusId, run?.month ?? thisMonth);
    const withStructure = await tx.salaryStructure.findMany({ where: { staffId: { in: staffNow.map((s) => s.id) }, archivedAt: null }, distinct: ["staffId"], select: { staffId: true } });
    const missing = staffNow.filter((s) => !withStructure.some((w) => w.staffId === s.id));
    const lines = run ? await tx.payrollLine.findMany({ where: { runId: run.id } }) : [];
    const staff = await tx.staff.findMany({ where: { id: { in: lines.map((l) => l.staffId) } }, select: { id: true, fullName: true, staffCode: true, designation: true, joiningDate: true } });
    const adjustments = run ? await tx.payrollAdjustment.findMany({ where: { runId: run.id, archivedAt: null }, orderBy: { createdAt: "asc" } }) : [];
    const breakdown = run && money ? await runBreakdown(tx, run.id) : null;
    const structures = await tx.salaryStructure.findMany({ where: { id: { in: lines.map((l) => l.structureId).filter((x): x is string => Boolean(x)) } }, select: { id: true, version: true, effectiveFrom: true, tdsPaise: true } });
    let approval: { can: boolean; sentBy: string; approver: string } | null = null;
    if (run?.status === "WAITING" && run.approvalId) {
      const a = await tx.approval.findUnique({ where: { id: run.approvalId } });
      const names = await tx.userLogin.findMany({ where: { id: { in: [run.sentById, a?.currentApproverId].filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } });
      const role = a?.currentApproverRole ? await tx.role.findFirst({ where: { key: a.currentApproverRole }, select: { name: true } }) : null;
      approval = {
        can: Boolean(a && p.can.approve && money && (await canDecide(tx, ctx, a))),
        sentBy: names.find((n) => n.id === run.sentById)?.displayName ?? "the Accountant",
        approver: names.find((n) => n.id === a?.currentApproverId)?.displayName ?? role?.name ?? "the approver",
      };
    }
    const users = run ? await tx.userLogin.findMany({ where: { id: { in: [run.approvedById, run.paidById].filter((x): x is string => Boolean(x)) } }, select: { id: true, displayName: true } }) : [];
    const banks = doing === "pay" ? await tx.bankAccount.findMany({ where: { kind: "BANK", archivedAt: null }, orderBy: [{ isMain: "desc" }, { name: "asc" }], select: { id: true, name: true, isMain: true, accountLast4: true } }) : [];
    return { settings, runs, run, allRuns, staffNow, missing, lines, staff, adjustments, breakdown, structures, approval, users, banks };
  });

  const run = data.run;
  const keep = { ...per.keep, campus: one(sp.campus) || null, run: run?.id ?? null, q: q || null, show: show === "all" ? null : show };
  const here = (extra: Record<string, string | null> = {}) => qs(HREF, { ...keep, ...extra });
  const staffOf = new Map(data.staff.map((s) => [s.id, s]));
  const status = run?.status ?? "OPEN";
  const editable = p.change && run && (status === "OPEN" || status === "CALCULATED");
  const payDay = data.settings.payDay === "last-working" ? "the last working day" : `day ${data.settings.payDay}`;
  const campusWord = (n: string) => (/campus$/i.test(n) ? n : `${n} campus`);
  const sub = `${campusWord(campus?.name ?? "Main")} · one salary run a month · pay day is ${payDay}`;
  const userName = (id: string | null) => data.users.find((u) => u.id === id)?.displayName ?? "—";
  const included = data.lines.filter((l) => l.included);
  const noStructure = data.lines.filter((l) => l.flags.includes("No salary structure"));
  const incomplete = included.filter((l) => l.flags.includes("Attendance not complete"));
  const noTds = included.filter((l) => l.flags.includes("No TDS amount"));
  const lopLines = included.filter((l) => Number(l.lopDays) > 0);
  const lopTotal = lopLines.reduce((s, l) => s + Number(l.lopDays), 0);
  const name = (id: string) => staffOf.get(id)?.fullName ?? "Staff";
  const waiting = data.allRuns.filter((r) => r.status === "WAITING");
  const yearRuns = data.runs.length;

  const rows = data.lines
    .filter((l) => !q || [staffOf.get(l.staffId)?.fullName, staffOf.get(l.staffId)?.staffCode, staffOf.get(l.staffId)?.designation].some((x) => x?.toLowerCase().includes(q)))
    .filter((l) => show === "all" || (show === "flag" && l.flags.length > 0) || (show === "lop" && Number(l.lopDays) > 0) || (show === "adj" && l.flags.includes("Adjustment added")))
    .sort((a, b) => (staffOf.get(a.staffId)?.staffCode ?? "").localeCompare(staffOf.get(b.staffId)?.staffCode ?? ""));

  const monthOptions = [-2, -1, 0, 1].map((n) => addMonths(thisMonth, n)).map((m) => ({ value: monthKey(m), label: monthName(m) }));
  const openStart = monthKey(data.allRuns.some((r) => r.month.getTime() === thisMonth.getTime()) ? addMonths(thisMonth, 1) : thisMonth);
  const openId = pick("open");
  const openLine = openId ? data.lines.find((l) => l.staffId === openId) : null;
  const tdsId = p.change ? pick("tds") : "";
  const tdsLine = tdsId ? data.lines.find((l) => l.staffId === tdsId) : null;
  const est = (l: (typeof data.lines)[number]) => data.structures.find((s) => s.id === l.structureId);
  const statusWords = (r: { status: string; paidOn: Date | null }) => r.paidOn ? `paid ${dayShort(r.paidOn)}` : "";

  return (
    <div>
      <SalaryHead pageName="Generate Salary" href={HREF} sub={sub}
        actions={<ButtonLink href={here({ do: "open-month" })} scroll={false} variant="secondary" icon={CalendarPlus}>Open a month</ButtonLink>} />
      <Stack>
        <Stats items={[
          { label: "Salary structures", value: `${data.staffNow.length - data.missing.length} of ${data.staffNow.length}`, sub: data.missing.length ? `${data.missing.length} missing · ${data.missing.slice(0, 2).map((s) => s.fullName).join(", ")}` : "Everyone has one", tone: data.missing.length ? "warn" : undefined, icon: FileSpreadsheet, href: p.may("structures") ? `${BASE}/structures` : undefined },
          { label: "Runs this year", value: String(yearRuns), sub: data.runs.length ? `${monthName(data.runs[data.runs.length - 1].month).split(" ")[0]} to ${monthName(data.runs[0].month)}` : per.label, icon: CalendarRange },
          { label: "Waiting for approval", value: String(waiting.length), sub: waiting.length ? waiting.map((r) => monthName(r.month)).join(", ") : "Nothing waiting", tone: waiting.length ? "warn" : undefined, icon: Hourglass },
          money
            ? { label: `${run ? monthName(run.month).split(" ")[0] : "This month"} net pay`, value: run ? formatRupeesShort(run.netPaise) : "—", sub: run ? `${amt(run.netPaise)} · ${run.staffCount} staff` : "No month open yet", icon: Wallet }
            : { label: "Loss of pay", value: `${dayNum(lopTotal)} ${lopTotal === 1 ? "day" : "days"}`, sub: `${lopLines.length} staff · ${run ? monthName(run.month) : "this month"}`, tone: lopTotal ? "bad" : undefined, icon: CalendarX2 },
        ]} />

        {!run ? (
          <Card><Empty icon={CalendarPlus} title="No salary month yet" body="Open the month to work out everyone’s pay from their structure, attendance and leave." action={p.change ? <ButtonLink href={here({ do: "open-month" })} scroll={false} variant="primary" icon={CalendarPlus}>Open a month</ButtonLink> : undefined} /></Card>
        ) : (
          <Split side={340}>
            <Col className="[&>*]:min-w-0">
              <Card className="overflow-hidden">
                <div className="px-5 pt-4 pb-3 flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <h2 className="font-semibold text-[15px] leading-tight flex items-center gap-2 flex-wrap">{monthName(run.month)} <RunPill s={status} /></h2>
                    <p className="text-[13px] text-ink3 mt-0.5">{run.staffCount} staff · {run.paidOn ? `Paid ${dayShort(run.paidOn)}${run.approvedById ? ` · approved by ${userName(run.approvedById)}` : ""}` : `Pay day ${dayShort(lastOfMonth(run.month))}`}</p>
                  </div>
                  {run.month.getTime() !== thisMonth.getTime() && data.allRuns.some((r) => r.month.getTime() === thisMonth.getTime()) && (
                    <ButtonLink href={qs(HREF, { ...per.keep, campus: one(sp.campus) || null })} scroll={false} size="sm" variant="ghost">Back to {monthName(thisMonth).split(" ")[0]}</ButtonLink>
                  )}
                </div>
                <RunSteps status={status} />
                <div className="px-5 pb-4 flex flex-col gap-3">
                  {(status === "OPEN" || status === "CALCULATED") && run.calculatedAt && <Banner tone="info">Attendance and approved leave up to <b className="font-semibold">{formatDateTime(run.calculatedAt, p.tz)}</b> are in. They keep coming in by themselves until the month is sent for approval.</Banner>}
                  {status === "OPEN" && !run.calculatedAt && <Banner tone="info">Not worked out yet. Calculate to bring in attendance, leave and structures.</Banner>}
                  {status === "CALCULATED" && run.sentBackReason && <Banner tone="bad" title="Sent back:">{run.sentBackReason}</Banner>}
                  {status === "WAITING" && data.approval && <Banner tone="warn" title={`Sent by ${data.approval.sentBy}${run.sentAt ? ` · ${formatDateTime(run.sentAt, p.tz)}` : ""}.`}>{data.approval.can ? "Check the totals and approve, or send it back with a reason." : `Waiting for ${data.approval.approver}. Amounts cannot change now unless it is sent back.`}</Banner>}
                  {status === "APPROVED" && <Banner tone="ok" title="Approved.">{included.length} salary slips are made and each staff member was told. Amounts are frozen. Pay the staff, then mark it paid.</Banner>}
                  {status === "PAID" && <Banner tone="ok" title={`Paid ${run.paidOn ? dayShort(run.paidOn) : ""}.`}>One salary entry is in the Day Book on the date paid. Corrections go in next month as an adjustment.</Banner>}
                  {status === "LOCKED" && <Banner tone="info" icon={Lock} title="Locked for good.">This run never changes. A correction is an adjustment, with a reason, in a following month.</Banner>}
                  {!p.change && <Banner tone="info" icon={Eye}>View only. Check that leave and attendance reach the salary; the Accountant runs it.</Banner>}
                </div>
                {p.change && (
                  <div className="px-5 pb-5 flex gap-2 flex-wrap">
                    {editable && <>
                      {status === "CALCULATED" && <ButtonLink href={here({ do: "send" })} scroll={false} variant="primary" icon={Send}>Send for approval</ButtonLink>}
                      <ActButton action={calculateAction} fields={{ runId: run.id }} label={status === "OPEN" ? "Calculate" : "Recalculate"} variant={status === "OPEN" ? "primary" : "secondary"} />
                      <ButtonLink href={here({ do: "adjust" })} scroll={false} variant="ghost" icon={Plus}>Add adjustment</ButtonLink>
                    </>}
                    {status === "WAITING" && (data.approval?.can ? <>
                      <ButtonLink href={here({ do: "approve" })} scroll={false} variant="primary" icon={Check}>Approve salary</ButtonLink>
                      <ButtonLink href={here({ do: "back" })} scroll={false} variant="secondary">Send back</ButtonLink>
                    </> : <>
                      <ButtonLink href={run.approvalId ? `/approvals/${run.approvalId}` : "/approvals"} variant="secondary" icon={Hourglass}>Open in Approvals</ButtonLink>
                      {run.sentById === p.current.user.id && <ActButton action={takeBackAction} fields={{ runId: run.id }} label="Take back to change" variant="ghost" icon="undo" />}
                    </>)}
                    {status === "APPROVED" && <>
                      <ButtonLink href={here({ do: "pay" })} scroll={false} variant="primary" icon={Banknote}>Mark paid</ButtonLink>
                      <a href={`${HREF}/bank-file?run=${run.id}&format=xlsx`} download className={buttonClass("secondary")}><FileDown size={17} aria-hidden="true" />Bank transfer file</a>
                      <ButtonLink href={`${BASE}/slips?run=${run.id}`} variant="ghost" icon={ReceiptText}>See slips</ButtonLink>
                    </>}
                    {(status === "PAID" || status === "LOCKED") && <>
                      <a href={`${HREF}/statement?run=${run.id}&kind=PF`} download className={buttonClass("secondary")}><FileDown size={17} aria-hidden="true" />PF statement</a>
                      <a href={`${HREF}/statement?run=${run.id}&kind=ESI`} download className={buttonClass("secondary")}><FileDown size={17} aria-hidden="true" />ESI statement</a>
                      {status === "PAID" && <ButtonLink href={here({ do: "lock" })} scroll={false} variant="ghost" icon={Lock}>Lock now</ButtonLink>}
                      {status === "PAID" && p.can.edit && <ButtonLink href={here({ do: "reverse" })} scroll={false} variant="ghost" icon={Undo2}>Reverse payment</ButtonLink>}
                    </>}
                  </div>
                )}
              </Card>

              {(status === "OPEN" || status === "CALCULATED") && (noStructure.length + incomplete.length + noTds.length + lopLines.length > 0) && (
                <Card>
                  <CardHeader title="Check before sending" description="Flags from the rules in Salary Settings" icon={ListChecks} />
                  <ul className="divide-y divide-line/70 border-t border-line/70">
                    {noStructure.length > 0 && <Check1 icon={FileWarning} tone="warn" title={`${noStructure.length} staff ${noStructure.length === 1 ? "has" : "have"} no salary structure`} sub={`${noStructure.slice(0, 3).map((l) => `${name(l.staffId)}, ${staffOf.get(l.staffId)?.designation}`).join("; ")}. Left out until a structure exists.`}
                      action={p.change ? <ButtonLink href={`${BASE}/structures?do=add&staff=${noStructure[0].staffId}`} size="sm" variant="secondary">Add</ButtonLink> : null} />}
                    {incomplete.length > 0 && <Check1 icon={CalendarX2} tone="warn" title={`Attendance missing for ${incomplete.length} staff`} sub={incomplete.slice(0, 3).map((l) => `${name(l.staffId)} ${l.notMarkedDays} ${l.notMarkedDays === 1 ? "day" : "days"}`).join(", ") + ". Not marked and no leave asked."}
                      action={p.current.permissions["attendance-management"]?.see !== "none" ? <ButtonLink href="/attendance-management/staff" size="sm" variant="secondary">Open</ButtonLink> : null} />}
                    {noTds.length > 0 && <Check1 icon={Receipt} tone="warn" title={`${noTds.length} staff ${noTds.length === 1 ? "has" : "have"} no TDS amount`} sub={`${noTds.slice(0, 2).map((l) => name(l.staffId)).join(", ")} · yearly pay is above the ${formatRupeesShort(data.settings.tdsReminderAbovePaise)} limit set in Salary Settings`}
                      action={p.change ? <ButtonLink href={here({ tds: noTds[0].staffId })} scroll={false} size="sm" variant="secondary">Enter TDS</ButtonLink> : null} />}
                    {lopLines.length > 0 && <Check1 icon={Info} tone="info" title={`${lopLines.length} staff ${lopLines.length === 1 ? "has" : "have"} loss of pay · ${dayNum(lopTotal)} ${lopTotal === 1 ? "day" : "days"}`} sub={lopLines.slice(0, 4).map((l) => `${name(l.staffId)} ${dayNum(Number(l.lopDays))}`).join(", ")}
                      action={<ButtonLink href={here({ show: "lop" })} scroll={false} size="sm" variant="ghost">Show</ButtonLink>} />}
                  </ul>
                </Card>
              )}
            </Col>

            <Col className="[&>*]:min-w-0">
              {money && data.breakdown ? (
                <Card>
                  <CardHeader title={`Totals · ${monthShort(run.month)} ${run.month.getUTCFullYear()}`} description={`All ${run.staffCount} staff`} />
                  <ul className="px-5 pb-4 text-[14px] flex flex-col gap-1.5 tnum">
                    <MoneyLi k="Gross pay" v={amt(run.grossPaise)} strong />
                    <MoneyLi sub k="PF (employee 12%)" v={amt(data.breakdown.pf)} />
                    <MoneyLi sub k="ESI (employee 0.75%)" v={amt(data.breakdown.esi)} />
                    <MoneyLi sub k="Professional Tax" v={amt(data.breakdown.pt)} />
                    <MoneyLi sub k="TDS" v={amt(data.breakdown.tds)} />
                    <MoneyLi sub k="Loans and advances" v={amt(data.breakdown.recovery)} />
                    {data.breakdown.cut + data.breakdown.other > ZERO && <MoneyLi sub k="One-time and other deductions" v={amt(data.breakdown.cut + data.breakdown.other)} />}
                    <MoneyLi k="Deductions" v={amt(run.deductionsPaise)} strong />
                    <li className="flex justify-between border-t border-line pt-2 mt-1"><span className="font-semibold">Net pay</span><b className="font-display text-[20px] font-semibold">{amt(run.netPaise)}</b></li>
                  </ul>
                  <div className="mx-5 mb-5 rounded-xl bg-sunken/70 px-3.5 py-3 text-[13px] tnum">
                    <p className="font-semibold text-ink2">School’s cost on top</p>
                    <p className="text-ink3 mt-0.5">Employer PF {amt(run.employerPfPaise)} · employer ESI {amt(run.employerEsiPaise)}. Not taken from net pay.</p>
                  </div>
                  {data.adjustments.length > 0 && (
                    <div className="px-5 pb-5">
                      <p className="eyebrow text-ink3 mb-1.5">Adjustments</p>
                      <ul className="flex flex-col gap-1">
                        {data.adjustments.map((a) => (
                          <li key={a.id} className="text-[13px] flex justify-between items-center gap-2">
                            <span className="truncate" title={a.reason}>{name(a.staffId)} · {adjustmentLabel(a.type)}</span>
                            <span className="flex items-center gap-1 shrink-0"><span className="tnum">{a.type === "DEDUCTION" ? "−" : "+"}{amt(a.amountPaise)}</span>
                              {editable && <ActButton action={removeAdjustmentAction} fields={{ adjustmentId: a.id }} label="Remove" variant="ghost" size="sm" />}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </Card>
              ) : (
                <Card>
                  <CardHeader title={`Days · ${monthShort(run.month)} ${run.month.getUTCFullYear()}`} description={`All ${run.staffCount} staff · days only, no amounts`} />
                  <ul className="px-5 pb-5 text-[14px] flex flex-col gap-1.5 tnum">
                    <MoneyLi k="Paid days" v={dayNum(included.reduce((s, l) => s + Number(l.paidDays), 0))} strong />
                    <MoneyLi sub k="Leave days" v={dayNum(included.reduce((s, l) => s + lineDays(l).leave, 0))} />
                    <MoneyLi sub k="Leave without pay" v={dayNum(included.reduce((s, l) => s + Number(l.unpaidLeaveDays), 0))} />
                    <MoneyLi sub k="Absent without leave" v={dayNum(included.reduce((s, l) => s + Number(l.absentDays), 0))} />
                    <MoneyLi k="Loss of pay" v={dayNum(lopTotal)} strong />
                  </ul>
                </Card>
              )}
              <Card>
                <CardHeader title="Salary months" description={`${per.label} · tap one to open it`} />
                <div className="px-5 pb-3 -mt-1"><PeriodFilter {...p.dates} fallback="finyear" size="sm" /></div>
                {data.runs.length ? (
                  <ul className="px-2 pb-2">
                    {data.runs.map((x) => (
                      <li key={x.id}>
                        <Link href={qs(HREF, { ...per.keep, campus: one(sp.campus) || null, run: x.id })} scroll={false} aria-current={x.id === run.id ? "true" : undefined}
                          className={cx("w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition", x.id === run.id ? "bg-brand/8 ring-1 ring-brand/30" : "hover:bg-sunken/70")}>
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold text-[14px]">{monthName(x.month)}</span>
                            <span className="block text-[12.5px] text-ink3 tnum truncate">{[`${x.staffCount} staff`, money ? `net ${formatRupeesShort(x.netPaise)}` : null, statusWords(x) || null].filter(Boolean).join(" · ")}</span>
                          </span>
                          <RunPill s={x.status} />
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : <p className="px-5 pb-5 text-[13.5px] text-ink3">No salary months in {per.label.toLowerCase()}.</p>}
              </Card>
              {p.campuses.length > 1 && (
                <Card className="p-4"><UrlSelect id="gen-campus" param="campus" label="Campus" options={p.campuses.map((c) => ({ value: c.id, label: campusWord(c.name) }))} /></Card>
              )}
            </Col>
          </Split>
        )}

        {run && (
          <Card className="overflow-hidden">
            <Toolbar>
              <UrlSearch id="sal-search" placeholder="Staff name, ID or designation" label="Search staff" />
              <div className="overflow-x-auto no-scrollbar shrink-0"><UrlSegmented param="show" options={SHOW} fallback="all" label="Show" /></div>
              {p.can.export && <ExportButton href={qs(`${HREF}/export`, { run: run.id, q: q || null, show: show === "all" ? null : show })} />}
            </Toolbar>
            {rows.length === 0 ? (
              <Empty icon={SearchX} title="No staff match" body={show === "adj" ? "No adjustments yet. Open a row to add a bonus, arrears or a deduction." : "Try a different search or filter."}
                action={<Link href={qs(HREF, { ...per.keep, run: run.id, campus: one(sp.campus) || null })} scroll={false} className={buttonClass("secondary")}>Show everyone</Link>} />
            ) : (
              <>
                <div className="hidden lg:block overflow-x-auto scroll-thin">
                  <table className={cx("w-full text-[13.5px]", money ? "min-w-[1040px]" : "min-w-[640px]")}>
                    <caption className="sr-only">{monthName(run.month)} salary by staff member</caption>
                    <thead>
                      <tr className="text-[12px] text-ink3 font-semibold border-b border-line text-right">
                        <th scope="col" className="sticky left-0 z-10 bg-surface text-left pl-5 pr-3 py-3 font-semibold">Staff member</th>
                        <th scope="col" className="px-2 py-3 font-semibold">Paid days</th><th scope="col" className="px-2 py-3 font-semibold">Leave</th><th scope="col" className="px-2 py-3 font-semibold">Loss of pay</th>
                        {money && <>
                          <th scope="col" className="px-2 py-3 font-semibold">Gross</th><th scope="col" className="px-2 py-3 font-semibold">PF</th><th scope="col" className="px-2 py-3 font-semibold">ESI</th><th scope="col" className="px-2 py-3 font-semibold">PT</th>
                          <th scope="col" className="px-2 py-3 font-semibold">TDS</th><th scope="col" className="px-2 py-3 font-semibold">Loans</th><th scope="col" className="px-2 py-3 font-semibold">Net</th>
                        </>}
                        <th scope="col" className="pl-2 pr-5 py-3 font-semibold text-left">Flags</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((l) => {
                        const s = staffOf.get(l.staffId);
                        const d = lineDays(l);
                        const href = l.included ? here({ open: l.staffId }) : null;
                        return (
                          <tr key={l.id} className={cx("border-b border-line/70 last:border-0 text-right tnum group relative", href && "hover:bg-sunken/60")}>
                            <td className="sticky left-0 z-10 bg-surface group-hover:bg-sunken text-left pl-5 pr-3 py-2.5 whitespace-nowrap">
                              {href && <Link href={href} scroll={false} className="absolute inset-0 z-0" aria-label={`How ${s?.fullName}’s pay was worked out`} />}
                              <p className="font-semibold leading-tight font-sans">{s?.fullName}</p><p className="text-[12px] text-ink3 font-sans">{s?.designation}</p>
                            </td>
                            {l.included ? <>
                              <td className="px-2">{dayNum(d.paid)}</td>
                              <td className="px-2">{d.leave + d.unpaid ? dayNum(d.leave + d.unpaid) : "—"}</td>
                              <td className={cx("px-2", d.lop > 0 && "text-bad font-semibold")}>{d.lop ? dayNum(d.lop) : "—"}</td>
                              {money && <>
                                <td className="px-2">{amt(l.grossPaise)}</td>
                                <td className="px-2">{amt(l.pfPaise)}</td>
                                <td className="px-2">{l.esiPaise ? amt(l.esiPaise) : "—"}</td>
                                <td className="px-2">{l.ptPaise ? amt(l.ptPaise) : "—"}</td>
                                <td className={cx("px-2", l.flags.includes("No TDS amount") && "text-warn font-semibold")}>{l.tdsPaise ? amt(l.tdsPaise) : "0"}</td>
                                <td className="px-2">{l.recoveryPaise + l.cutPaise ? amt(l.recoveryPaise + l.cutPaise) : "—"}</td>
                                <td className="px-2 font-semibold">{amt(l.netPaise)}</td>
                              </>}
                            </> : <td colSpan={money ? 10 : 3} className="px-2 text-center text-ink3 font-sans">Not paid until a salary structure is added</td>}
                            <td className="pl-2 pr-5 text-left"><div className="flex gap-1 flex-wrap">{l.flags.map((f) => <FlagPill key={f} f={f} />)}</div></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <ul className="lg:hidden divide-y divide-line/70">
                  {rows.map((l) => {
                    const s = staffOf.get(l.staffId);
                    const d = lineDays(l);
                    const body = (
                      <>
                        <Avatar name={s?.fullName ?? "?"} size={42} />
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[15px] truncate">{s?.fullName}</p>
                          <p className="text-[13px] text-ink3 truncate">{l.included ? `${dayNum(d.paid)} days paid${money ? ` · gross ${amt(l.grossPaise)}` : d.leave ? ` · ${dayNum(d.leave)} leave` : ""}` : "No salary structure"}</p>
                          {(l.flags.length > 0 || d.lop > 0) && <div className="flex gap-1.5 mt-1.5 flex-wrap">{d.lop > 0 && <FlagPillLop n={d.lop} />}{l.flags.filter((f) => f !== "No salary structure").map((f) => <FlagPill key={f} f={f} phone />)}</div>}
                        </div>
                        {l.included && money && <span className="text-right shrink-0"><span className="block font-semibold tnum">{amt(l.netPaise)}</span><span className="text-[12px] text-ink3">net</span></span>}
                      </>
                    );
                    return <li key={l.id}>{l.included ? <Link href={here({ open: l.staffId })} scroll={false} className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-sunken">{body}</Link> : <div className="flex items-center gap-3 px-4 py-3">{body}</div>}</li>;
                  })}
                </ul>
                <div className="px-4 py-3 border-t border-line text-[13px] text-ink3 tnum">Showing {rows.length} of {data.lines.length} staff · totals above are for all {run.staffCount} paid</div>
              </>
            )}
          </Card>
        )}
      </Stack>

      {openLine && run && (() => {
        const s = staffOf.get(openLine.staffId);
        const d = lineDays(openLine);
        const st = est(openLine);
        const earnings = (openLine.earnings as { name: string; amountPaise: string; how: string }[]) ?? [];
        const other = (openLine.otherDeductions as { name: string; amountPaise: string }[]) ?? [];
        const adj = data.adjustments.filter((a) => a.staffId === openLine.staffId);
        const full = openLine.fullGrossPaise;
        const unearned = full + openLine.overtimePaise + openLine.addPaise - openLine.grossPaise;
        return (
          <UrlSheet wide closeHref={here({ open: null })} title={`How ${s?.fullName}’s pay was worked out`}
            sub={`${monthName(run.month)}${st ? ` · structure v${st.version} from ${formatDate(st.effectiveFrom)}` : ""} · ${dayNum(d.paid)} of ${openLine.daysInMonth} days paid`}
            footer={editable ? <div className="flex gap-2 justify-end"><ButtonLink href={here({ open: null, do: "adjust", staff: openLine.staffId })} scroll={false} variant="primary" icon={Plus}>Add adjustment</ButtonLink></div> : undefined}>
            {money ? (
              <>
                <div className="grid md:grid-cols-2 gap-5 text-[14px]">
                  <div>
                    <p className="eyebrow text-ink3 mb-1">Earnings</p>
                    <ul className="divide-y divide-line/70">
                      {earnings.map((e) => <WorkRow key={e.name} k={e.name} v={amt(BigInt(e.amountPaise))} sub={e.how === "Fixed" ? undefined : e.how} />)}
                      <WorkRow k="Full month" v={amt(full)} tone="font-semibold" />
                      {unearned > ZERO && <WorkRow k={d.lop ? `Loss of pay, ${dayNum(d.lop)} ${d.lop === 1 ? "day" : "days"}` : "Days not employed"} v={`− ${amt(unearned)}`}
                        sub={`${openLine.notes.join(" · ") || "From Staff Attendance and Staff Leave"} · ${amt(full)} × ${dayNum(openLine.daysInMonth - d.paid)} ÷ ${openLine.daysInMonth}`} tone="text-bad" />}
                      {openLine.overtimePaise > ZERO && <WorkRow k="Overtime" v={`+ ${amt(openLine.overtimePaise)}`} sub={`${Math.round(openLine.overtimeMinutes / 6) / 10} hours from Staff Attendance`} tone="text-ok" />}
                      {adj.map((a) => <WorkRow key={a.id} k={adjustmentLabel(a.type)} v={`${a.type === "DEDUCTION" ? "−" : "+"} ${amt(a.amountPaise)}`} sub={a.reason} tone={a.type === "DEDUCTION" ? "text-bad" : "text-ok"} />)}
                    </ul>
                  </div>
                  <div>
                    <p className="eyebrow text-ink3 mb-1">Deductions</p>
                    <ul className="divide-y divide-line/70">
                      <WorkRow k="PF, 12%" v={amt(openLine.pfPaise)} sub={openLine.pfPaise === ZERO ? "PF does not apply" : openLine.basicEarnedPaise > openLine.pfWagePaise ? `On ${amt(openLine.pfWagePaise)} (ceiling), not ${amt(openLine.basicEarnedPaise)}` : `On basic pay ${amt(openLine.pfWagePaise)}`} />
                      <WorkRow k="ESI, 0.75%" v={openLine.esiApplies ? amt(openLine.esiPaise) : "Not applicable"} sub={openLine.esiApplies ? `On ${amt(openLine.esiWagePaise)}; wages are within the ESI limit` : "Wages above the ESI limit, or ESI is off for this person"} />
                      <WorkRow k="Professional Tax" v={amt(openLine.ptPaise)} sub="From the state slab in Salary Settings" />
                      <WorkRow k="TDS (income tax)" v={amt(openLine.tdsPaise)} sub={openLine.tdsPaise ? "Typed in by the Accountant on the structure" : "No monthly amount entered"} />
                      {other.map((o) => <WorkRow key={o.name} k={o.name} v={amt(BigInt(o.amountPaise))} />)}
                      {openLine.recoveryPaise > ZERO && <WorkRow k="Advance or loan recovery" v={amt(openLine.recoveryPaise)} sub="From Advances & Loans" />}
                      <WorkRow k="Total deductions" v={amt(openLine.deductionsPaise)} tone="font-semibold" />
                    </ul>
                  </div>
                </div>
                <div className="mt-5 rounded-2xl bg-brand/8 px-4 py-3.5 flex items-center justify-between gap-3 flex-wrap">
                  <span className="text-[14px] font-semibold">Net pay</span>
                  <span className="font-display text-[24px] font-semibold tnum">{amt(openLine.netPaise)}</span>
                </div>
                <p className="text-[12.5px] text-ink3 mt-3">School’s cost on top, not taken from net pay: employer PF {amt(openLine.erPfPaise)}{openLine.esiApplies ? `, employer ESI ${amt(openLine.erEsiPaise)} (3.25%)` : ""}.</p>
              </>
            ) : (
              <DL rows={[
                ["Working days", String(openLine.workingDays)], ["Present", dayNum(d.present)], ["Paid leave", dayNum(d.leave)], ["Leave without pay", dayNum(d.unpaid)],
                ["Absent without leave", dayNum(d.absent)], ["Late marks", String(openLine.lateMarks)], ["Loss of pay", `${dayNum(d.lop)} ${d.lop === 1 ? "day" : "days"}`], ["Days paid", `${dayNum(d.paid)} of ${openLine.daysInMonth}`],
              ]} />
            )}
            {!money && openLine.notes.length > 0 && <p className="text-[13px] text-ink2 mt-4">{openLine.notes.join(" · ")}</p>}
          </UrlSheet>
        );
      })()}

      {doing === "open-month" && (
        <OpenMonthSheet closeHref={here({ do: null })} months={monthOptions} campuses={p.campuses.map((c) => ({ value: c.id, label: c.name }))} campusId={campusId} start={openStart} />
      )}
      {doing === "adjust" && run && editable && (
        <AdjustmentSheet closeHref={here({ do: null, staff: null })} runId={run.id} month={monthName(run.month)} staffId={pick("staff")}
          staff={included.map((l) => ({ value: l.staffId, label: `${name(l.staffId)} · ${staffOf.get(l.staffId)?.designation ?? ""}` }))} />
      )}
      {doing === "send" && run && status === "CALCULATED" && (
        <ConfirmSheet closeHref={here({ do: null })} title={`Send ${monthName(run.month)} salary for approval?`} label="Send for approval" action={sendRunAction} hidden={{ runId: run.id }}>
          <div className="flex flex-col gap-3 text-[14px] text-ink2">
            <p><b className="font-semibold text-ink">{run.staffCount} staff, net {amt(run.netPaise)}</b> (gross {amt(run.grossPaise)}).{noStructure.length ? ` ${noStructure.map((l) => name(l.staffId)).slice(0, 3).join(", ")} ${noStructure.length === 1 ? "is" : "are"} left out until they have a salary structure.` : ""}</p>
            <p>Attendance after today is not in yet. Leave approved after today is adjusted in next month’s salary.</p>
            {data.adjustments.length > 0 && <p>{data.adjustments.length} adjustment{data.adjustments.length > 1 ? "s" : ""} included, each with its reason.</p>}
            <p>Nobody approves a month they sent: it goes to the Principal, or to the School Admin when the Principal sent it.</p>
          </div>
        </ConfirmSheet>
      )}
      {doing === "approve" && run && status === "WAITING" && data.approval?.can && data.breakdown && (
        <ConfirmSheet closeHref={here({ do: null })} title={`Approve ${monthName(run.month)} salary?`} label={`Approve salary for ${run.staffCount} staff`} action={decideRunAction} hidden={{ runId: run.id, decision: "approve" }}>
          <div className="flex flex-col gap-3 text-[14px] text-ink2">
            <DL rows={[["Net pay", amt(run.netPaise)], ["Gross pay", amt(run.grossPaise)], ["Deductions", amt(run.deductionsPaise)], ["School’s PF and ESI share", amt(run.employerPfPaise + run.employerEsiPaise)]]} />
            <p>After approval, the amounts cannot change. A mistake is put right with an adjustment in {monthName(addMonths(run.month, 1))}. It reaches the Day Book only when it is marked paid.</p>
          </div>
        </ConfirmSheet>
      )}
      {doing === "back" && run && status === "WAITING" && data.approval?.can && (
        <ReasonSheet closeHref={here({ do: null })} title={`Send ${monthName(run.month)} back to ${data.approval.sentBy}?`} sub="They see your reason and can change it." label="Send back" danger={false}
          placeholder="Like: add Dasara bonus for drivers before approval" action={decideRunAction} hidden={{ runId: run.id, decision: "back" }} />
      )}
      {doing === "pay" && run && status === "APPROVED" && (
        <PayRunSheet closeHref={here({ do: null })} runId={run.id} title={`Mark ${monthName(run.month)} paid`} net={amt(run.netPaise)} today={p.today.toISOString().slice(0, 10)}
          banks={data.banks.map((b) => ({ value: b.id, label: `${b.name}${b.accountLast4 ? ` · XXXX${b.accountLast4}` : ""}` }))} mainBank={data.banks.find((b) => b.isMain)?.id ?? data.banks[0]?.id ?? ""}
          bankFileHref={`${HREF}/bank-file?run=${run.id}&format=xlsx`} />
      )}
      {doing === "lock" && run && status === "PAID" && (
        <ConfirmSheet closeHref={here({ do: null })} title={`Lock ${monthName(run.month)} for good?`} label={`Lock ${monthName(run.month)}`} action={lockRunAction} hidden={{ runId: run.id }}>
          <p className="text-[14px] text-ink2">Nothing in this run can change after locking. It also locks by itself when the next month is approved.</p>
        </ConfirmSheet>
      )}
      {doing === "reverse" && run && status === "PAID" && (
        <ReasonSheet closeHref={here({ do: null })} title={`Reverse the ${monthName(run.month)} payment?`} label="Reverse payment" placeholder="Like: the bank returned the batch" action={reversePaymentAction} hidden={{ runId: run.id }}
          sub={`${amt(run.netPaise)} paid on ${run.paidOn ? formatDate(run.paidOn) : "—"}. The Day Book entry stays and a reversing entry goes in today. The month goes back to Approved.`} />
      )}
      {tdsLine && run && (
        <TdsSheet closeHref={here({ tds: null })} runId={run.id} staffId={tdsLine.staffId} name={name(tdsLine.staffId)} current={String(Number((est(tdsLine)?.tdsPaise ?? ZERO) / BigInt(100)))}
          months={[0, 1, 2].map((n) => addMonths(run.month, n)).map((m) => ({ value: monthKey(m), label: monthName(m) }))} start={monthKey(run.month)} />
      )}
    </div>
  );
}

function Check1({ icon: Icon, tone, title, sub, action }: { icon: typeof Info; tone: "warn" | "info"; title: string; sub: string; action: React.ReactNode }) {
  return (
    <li className="flex items-center gap-3 px-5 py-3">
      <span className={cx("w-9 h-9 rounded-xl grid place-items-center shrink-0", tone === "warn" ? "bg-warn/12 text-warn" : "bg-info/10 text-info")}><Icon size={18} aria-hidden="true" /></span>
      <div className="min-w-0 flex-1"><p className="font-semibold text-[14px]">{title}</p><p className="text-[12.5px] text-ink3 truncate">{sub}</p></div>
      {action}
    </li>
  );
}

function FlagPillLop({ n }: { n: number }) {
  return <span className="inline-flex items-center h-[22px] px-2 rounded-full bg-bad/10 text-bad text-[11.5px] font-semibold">{dayNum(n)} LOP</span>;
}
