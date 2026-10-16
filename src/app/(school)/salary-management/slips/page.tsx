import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, Calculator, Download, Eye, Hourglass, Info, Printer, ReceiptText, SearchX, Send, UserRound } from "lucide-react";
import { withSchool } from "@/lib/db";
import { channelSetups } from "@/lib/messaging/channels";
import { decryptField, maskLast4 } from "@/lib/crypto";
import { formatRupees } from "@/lib/format";
import { salarySettings } from "@/lib/salary/settings";
import { SLIP_STATUS_LABEL, SLIP_STATUS_TONE, dayNum, dayShort, firstOfMonth, monthName } from "@/lib/salary/words";
import { Card, CardHeader } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Pill } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Banner, Col, DataList, Empty, Split, Stack, Stats, Toolbar } from "@/components/money/kit";
import { UrlSearch, UrlSegmented, UrlSelect } from "@/components/money/url-filters";
import { UrlSheet } from "@/components/ui/url-sheet";
import { PeriodFilter } from "@/components/list/period-filter";
import { cx } from "@/components/ui/cx";
import { SalaryHead } from "../_components/salary-head";
import { ConfirmSheet } from "../_components/forms";
import { AllTick, BulkBar, RowTick } from "../_components/bulk";
import { BASE, MODULE, one, qs, salaryPage, salaryPeriod, type SearchParams } from "../_lib/page";
import { sendSlipsAction } from "./actions";
import { SlipView, type SlipPerson } from "./slip-view";

export const metadata = { title: "Salary Slips" };

const HREF = `${BASE}/slips`;
const UUID = /^[0-9a-f-]{36}$/i;
const ZERO = BigInt(0);
const DONE = ["APPROVED", "PAID", "LOCKED"] as const;
const maskPan = (pan: string) => (pan.length === 10 ? `XXXXX${pan.slice(5, 9)}X` : maskLast4(pan));

type Staffish = { fullName: string; staffCode: string; designation: string; panEnc: string | null; uan: string | null; bankAccountEnc: string | null; bankName: string | null; department: { name: string } | null };
const personOf = (s: Staffish): SlipPerson => ({
  fullName: s.fullName, staffCode: s.staffCode, designation: s.designation, department: s.department?.name ?? "",
  pan: s.panEnc ? maskPan(decryptField(s.panEnc)) : "", uan: s.uan ? maskLast4(s.uan) : "", bank: s.bankAccountEnc ? `${s.bankName ?? "Bank"} · ${maskLast4(decryptField(s.bankAccountEnc))}` : "",
});

/** Salary Slips (10 §2): My Salary Slips for everyone with a staff record; every slip for salary staff. */
export default async function SlipsPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await salaryPage();
  const sp = await searchParams;
  const mine = p.level === "own" || one(sp.mine) === "1";
  if (!mine && !p.may("slips")) redirect(`/no-access?m=${MODULE}`);
  return mine ? <MySlips sp={sp} /> : <AllSlips sp={sp} />;
}

async function MySlips({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const p = await salaryPage();
  const me = p.me;
  const per = salaryPeriod(sp, p.dates, "finyear");
  const href = p.level === "own" ? HREF : `${HREF}?mine=1`;
  const head = <SalaryHead pageName="My Salary Slips" href={href} sub="Only your own slips. Nobody else’s salary shows here." />;
  if (!me) return <div>{head}<Card><Empty icon={UserRound} title="No staff record is linked to your login" body="Salary slips are for staff. Ask the School Admin to link your login to your staff record." /></Card></div>;
  const data = await withSchool(p.current.ctx, async (tx) => {
    const settings = await salarySettings(tx, p.current.ctx);
    // Own reach: only this person's slips, filtered at the query.
    const slips = await tx.payslip.findMany({ where: { staffId: me.id, run: { status: { in: [...DONE] } }, ...(per.from && per.to ? { month: { gte: firstOfMonth(per.from), lte: per.to } } : {}) }, orderBy: { month: "desc" }, include: { run: { select: { paidOn: true, status: true, campusId: true } } } });
    const lines = await tx.payrollLine.findMany({ where: { id: { in: slips.map((s) => s.lineId) } } });
    const staff = await tx.staff.findUniqueOrThrow({ where: { id: me.id }, include: { department: { select: { name: true } } } });
    const thisRun = await tx.payrollRun.findFirst({ where: { campusId: staff.campusId, month: firstOfMonth(p.today) }, select: { status: true, month: true } });
    const campus = await tx.campus.findFirst({ where: { id: staff.campusId }, select: { name: true, address: true } });
    return { settings, slips, lines, staff, thisRun, campus };
  });
  const lineOf = new Map(data.lines.map((l) => [l.id, l]));
  const latest = data.slips[0];
  const ll = latest ? lineOf.get(latest.lineId) : null;
  const ytd = data.slips.reduce((a, s) => { const l = lineOf.get(s.lineId)!; return { pay: a.pay + l.grossPaise, pf: a.pf + l.pfPaise, pt: a.pt + l.ptPaise, tds: a.tds + l.tdsPaise }; }, { pay: ZERO, pf: ZERO, pt: ZERO, tds: ZERO });
  const fyEnd = per.to ? new Date(Date.UTC(per.to.getUTCFullYear(), per.to.getUTCMonth() + 1, 0)) : null;
  const monthsLeft = latest && fyEnd ? Math.max(0, (fyEnd.getUTCFullYear() - latest.month.getUTCFullYear()) * 12 + fyEnd.getUTCMonth() - latest.month.getUTCMonth()) : 0;
  const yearly = ytd.pay + (ll ? ll.grossPaise * BigInt(monthsLeft) : ZERO);
  const STD = BigInt(7500000);
  const taxable = yearly > STD ? yearly - STD : ZERO;
  const person = personOf(data.staff);
  const pdf = (id: string) => `${HREF}/pdf?ids=${id}`;
  const viewId = UUID.test(one(sp.slip)) ? one(sp.slip) : "";
  const view = viewId ? data.slips.find((s) => s.id === viewId) : null;
  const keep = { ...per.keep, mine: p.level === "own" ? null : "1" };
  const here = (extra: Record<string, string | null> = {}) => qs(HREF, { ...keep, ...extra });
  const cur = data.thisRun;
  const months = data.slips.length;
  return (
    <div>
      {head}
      <Stack>
        {cur && !DONE.includes(cur.status as (typeof DONE)[number]) && <Banner tone="info" title={`${monthName(cur.month)} slip:`}>ready after the Principal approves {monthName(cur.month).split(" ")[0]}’s salary. You get a message when it is.</Banner>}
        <Split side={340}>
          <Col className="[&>*]:min-w-0">
            {latest && ll ? (
              <Card className="p-5 flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-[12.5px] text-ink3 font-semibold">{latest.run.paidOn ? "Last paid" : "Latest"} · {monthName(latest.month)}</p>
                  <p className="font-display text-[32px] font-semibold tnum leading-tight mt-0.5">{formatRupees(ll.netPaise)}</p>
                  <p className="text-[13px] text-ink3 mt-0.5">{latest.run.paidOn ? `Paid ${dayShort(latest.run.paidOn)}${person.bank ? ` to ${person.bank}` : ""}` : "Approved, not paid yet"} · gross {formatRupees(ll.grossPaise)}, deductions {formatRupees(ll.deductionsPaise)}</p>
                </div>
                <div className="flex gap-2">
                  <ButtonLink href={here({ slip: latest.id })} scroll={false} variant="primary" icon={Eye}>View slip</ButtonLink>
                  <a href={pdf(latest.id)} download className={buttonClass("secondary")}><Download size={17} aria-hidden="true" />PDF</a>
                </div>
              </Card>
            ) : null}
            <Card>
              <CardHeader title="My salary slips" description="Newest first" action={<PeriodFilter {...p.dates} fallback="finyear" size="sm" />} />
              {data.slips.length ? (
                <ul className="divide-y divide-line/70 border-t border-line/70">
                  {data.slips.map((s) => {
                    const l = lineOf.get(s.lineId)!;
                    return (
                      <li key={s.id} className="flex items-center gap-3 px-5 py-3">
                        <span className="w-10 h-10 rounded-xl bg-sunken text-ink2 grid place-items-center shrink-0"><ReceiptText size={19} aria-hidden="true" /></span>
                        <Link href={here({ slip: s.id })} scroll={false} className="min-w-0 flex-1 text-left">
                          <p className="font-semibold text-[14.5px] truncate">{monthName(s.month)}</p>
                          <p className="text-[12.5px] text-ink3 truncate">{s.run.paidOn ? `Paid ${dayShort(s.run.paidOn)}` : "Approved, not paid yet"} · {dayNum(Number(l.paidDays))} days</p>
                        </Link>
                        <span className="font-semibold tnum text-[14.5px]">{formatRupees(l.netPaise)}</span>
                        <a href={pdf(s.id)} download aria-label={`Download ${monthName(s.month)} slip`} className="grid size-9 place-items-center rounded-xl text-ink2 hover:bg-sunken"><Download size={18} aria-hidden="true" /></a>
                      </li>
                    );
                  })}
                </ul>
              ) : <Empty icon={ReceiptText} title={`No slips in ${per.label.toLowerCase()}`} body="Slips are made when the month’s salary is approved. Pick another period to see earlier ones." />}
            </Card>
          </Col>
          <Col className="[&>*]:min-w-0">
            <Card>
              <CardHeader title={`Tax summary · ${per.label}`} description={months ? `${monthName(data.slips[months - 1].month).split(" ")[0]} to ${monthName(data.slips[0].month)}, paid so far` : "Nothing paid in this period"} icon={Calculator} />
              <ul className="px-5 pb-3 text-[14px] flex flex-col gap-1.5 tnum">
                <li className="flex justify-between"><span className="text-ink2">Gross paid</span><b className="font-semibold">{formatRupees(ytd.pay)}</b></li>
                <li className="flex justify-between"><span className="text-ink2">PF (yours)</span><span>{formatRupees(ytd.pf)}</span></li>
                <li className="flex justify-between"><span className="text-ink2">Professional Tax</span><span>{formatRupees(ytd.pt)}</span></li>
                <li className="flex justify-between"><span className="text-ink2">TDS deducted</span><span>{formatRupees(ytd.tds)}</span></li>
                {monthsLeft > 0 && <>
                  <li className="flex justify-between border-t border-line pt-2 mt-1"><span className="text-ink2">Likely gross for the year</span><b className="font-semibold">{formatRupees(yearly)}</b></li>
                  <li className="flex justify-between"><span className="text-ink2">After standard deduction (₹75,000)</span><span>{formatRupees(taxable)}</span></li>
                </>}
              </ul>
              <p className="px-5 pb-4 text-[12.5px] text-ink3">New tax regime. TDS is typed in each month by the Accountant, not worked out here. {taxable <= BigInt(120000000) ? "Income up to ₹12 L has no tax after rebate." : "Talk to the Accountant to change your monthly TDS."}</p>
              {data.slips.length > 0 && <div className="px-5 pb-5 flex gap-2 flex-wrap"><a href={`${HREF}/pdf?ids=${data.slips.map((s) => s.id).join(",")}`} download className={buttonClass("secondary", "sm")}><Download size={15} aria-hidden="true" />Download all {data.slips.length}</a></div>}
            </Card>
            <Card className="p-5 text-[13.5px] text-ink2 flex gap-3">
              <Info size={18} className="text-ink3 shrink-0 mt-0.5" aria-hidden="true" />
              <p>Form 16 for the year comes from the Accountant after the year ends. Something wrong on a slip? Tell the Accountant; corrections come as an adjustment next month.</p>
            </Card>
          </Col>
        </Split>
      </Stack>
      {view && (
        <UrlSheet wide closeHref={here({ slip: null })} title={`Salary slip · ${monthName(view.month)}`} sub="Only you can see this slip"
          footer={<div className="flex gap-2 justify-end flex-wrap">
            <a href={`${pdf(view.id)}&print=1`} target="_blank" rel="noopener" className={buttonClass("ghost")}><Printer size={17} aria-hidden="true" />Print</a>
            <a href={pdf(view.id)} download className={buttonClass("primary")}><Download size={17} aria-hidden="true" />Download PDF</a>
          </div>}>
          <SlipView school={p.school.name} place={[data.campus?.name, data.campus?.address].filter(Boolean).join(", ")} month={view.month} paidOn={view.run.paidOn} line={lineOf.get(view.lineId)!} person={person} showEmployer={data.settings.slipShowEmployer} />
        </UrlSheet>
      )}
    </div>
  );
}

const STATUS = [{ value: "all", label: "All" }, { value: "MADE", label: "Not sent" }, { value: "SENT", label: "Sent" }, { value: "DOWNLOADED", label: "Downloaded" }];

async function AllSlips({ sp }: { sp: Record<string, string | string[] | undefined> }) {
  const p = await salaryPage();
  const ctx = p.current.ctx;
  const q = one(sp.q).trim().toLowerCase().slice(0, 80);
  const st = STATUS.some((s) => s.value === one(sp.status)) ? one(sp.status) : "all";
  const data = await withSchool(ctx, async (tx) => {
    const settings = await salarySettings(tx, ctx);
    const runs = await tx.payrollRun.findMany({ orderBy: [{ month: "desc" }], take: 36, select: { id: true, month: true, status: true, campusId: true, paidOn: true, staffCount: true } });
    const asked = UUID.test(one(sp.run)) ? runs.find((r) => r.id === one(sp.run)) : null;
    const run = asked ?? runs.find((r) => DONE.includes(r.status as (typeof DONE)[number])) ?? runs[0] ?? null;
    const slips = run ? await tx.payslip.findMany({ where: { runId: run.id }, orderBy: { createdAt: "asc" } }) : [];
    const staff = await tx.staff.findMany({ where: { id: { in: slips.map((s) => s.staffId) } }, include: { department: { select: { name: true } } } });
    const campus = run ? await tx.campus.findFirst({ where: { id: run.campusId }, select: { name: true, address: true } }) : null;
    const viewId = UUID.test(one(sp.slip)) ? one(sp.slip) : "";
    const view = viewId ? slips.find((s) => s.id === viewId) ?? null : null;
    const viewLine = view ? await tx.payrollLine.findUnique({ where: { id: view.lineId } }) : null;
    const whatsappOn = (await channelSetups(tx, ctx)).whatsapp.isOn;
    return { settings, runs, run, slips, staff, campus, view, viewLine, whatsappOn };
  });
  const run = data.run;
  const done = data.runs.filter((r) => DONE.includes(r.status as (typeof DONE)[number]));
  const staffOf = new Map(data.staff.map((s) => [s.id, s]));
  const rows = data.slips.filter((s) => {
    const x = staffOf.get(s.staffId);
    return (!q || [x?.fullName, x?.staffCode].some((v) => v?.toLowerCase().includes(q))) && (st === "all" || s.status === st);
  }).sort((a, b) => (staffOf.get(a.staffId)?.staffCode ?? "").localeCompare(staffOf.get(b.staffId)?.staffCode ?? ""));
  const keep = { run: run?.id ?? null, q: q || null, status: st === "all" ? null : st };
  const here = (extra: Record<string, string | null> = {}) => qs(HREF, { ...keep, ...extra });
  const ready = run && DONE.includes(run.status as (typeof DONE)[number]);
  const count = (s: string) => data.slips.filter((x) => x.status === s).length;
  const notSent = count("MADE");
  const doing = p.change ? one(sp.do) : "";
  const bulkIds = one(sp.ids).split(",").filter((x) => UUID.test(x));
  // WhatsApp is offered only while it is switched on in Settings (QA money note).
  const send = data.whatsappOn ? "whatsapp" : "email";
  const how = one(sp.how) === "email" || !data.whatsappOn ? "email" : "whatsapp";
  const howWord = how === "email" ? "email" : "WhatsApp";

  return (
    <div>
      <SalaryHead pageName="Salary Slips" href={HREF} sub="Made only from the approved salary · each person can download only their own"
        actions={ready && notSent > 0 ? <ButtonLink href={here({ do: "send-unsent" })} scroll={false} variant="primary" icon={Send}>Send unsent slips</ButtonLink> : null}
        viewActions={p.me ? <ButtonLink href={`${HREF}?mine=1`} variant="ghost" icon={UserRound}>My slips</ButtonLink> : null} />
      <Stack>
        <Stats items={[
          { label: "Slips made", value: String(data.slips.length), sub: ready ? monthName(run!.month) : "after approval", icon: ReceiptText },
          { label: "Sent", value: String(count("SENT") + count("DOWNLOADED")), sub: "WhatsApp, email or app", icon: Send },
          { label: "Downloaded by staff", value: String(count("DOWNLOADED")), sub: "opened their own slip", icon: Download },
          { label: "Not sent", value: String(notSent), sub: notSent ? "send or print them" : "all sent", tone: notSent ? "warn" : undefined, icon: Printer },
        ]} />
        <Card className="overflow-hidden">
          <Toolbar>
            {done.length > 0 && <UrlSelect id="slip-month" param="run" label="Month" className="md:w-64" options={done.map((r) => ({ value: r.id, label: `${monthName(r.month)}${p.campuses.length > 1 ? ` · ${p.campuses.find((c) => c.id === r.campusId)?.name ?? ""}` : ""}` }))} />}
            <UrlSearch id="slip-search" placeholder="Staff name" label="Search staff" />
            <div className="overflow-x-auto no-scrollbar shrink-0"><UrlSegmented param="status" options={STATUS} fallback="all" label="Slip status" /></div>
          </Toolbar>
          {!run || !ready ? (
            <Empty icon={Hourglass} title={run ? `${monthName(run.month)} slips are not made yet` : "No salary months yet"} body="Slips are made the moment the Principal approves the month’s salary, never before."
              action={<ButtonLink href={`${BASE}/generate${run ? `?run=${run.id}` : ""}`} variant="secondary" icon={ArrowUpRight}>Open Generate Salary</ButtonLink>} />
          ) : (
            <>
              {p.change && <BulkBar group="slip" items={[
                ...(data.whatsappOn ? [{ label: "Send by WhatsApp", icon: "whatsapp" as const, set: { do: "send", how: "whatsapp" } }] : []),
                { label: "Send by email", icon: "email", set: { do: "send", how: "email" } },
                { label: "Print", icon: "print", file: `${HREF}/pdf?print=1` },
              ]} />}
              <DataList rows={rows} rowKey={(s) => s.id} rowHref={(s) => here({ slip: s.id })} minWidth={760} caption="Salary slips"
                footer={`Showing ${rows.length} of ${data.slips.length} slips · ${monthName(run.month)}`}
                empty={<Empty icon={SearchX} title="No slips match" body="Try another name or status." action={<Link href={qs(HREF, { run: run.id })} scroll={false} className={buttonClass("secondary")}>Show all</Link>} />}
                columns={[
                  ...(p.change ? [{ key: "t", label: "", className: "w-10", render: (s: (typeof rows)[number]) => <RowTick group="slip" id={s.id} label={`Tick ${staffOf.get(s.staffId)?.fullName}`} /> }] : []),
                  { key: "n", label: "Staff member", render: (s) => { const x = staffOf.get(s.staffId); return <div className="flex items-center gap-3"><Avatar name={x?.fullName ?? "?"} size={34} /><div><p className="font-semibold leading-tight">{x?.fullName}</p><p className="text-[12px] text-ink3 font-mono">{x?.staffCode}</p></div></div>; } },
                  { key: "d", label: "Designation", render: (s) => staffOf.get(s.staffId)?.designation },
                  { key: "net", label: "Net pay", align: "right", render: (s) => <b className="font-semibold">{formatRupees(s.netPaise)}</b> },
                  { key: "s", label: "Status", render: (s) => <Pill tone={SLIP_STATUS_TONE[s.status]}>{s.status === "MADE" ? "Not sent" : SLIP_STATUS_LABEL[s.status]}</Pill> },
                  { key: "v", label: "Sent by", render: (s) => <span className="text-ink2">{s.sentVia.length ? s.sentVia.map((c) => (c === "whatsapp" ? "WhatsApp" : c === "app" ? "App" : "Email")).join(", ") : "—"}</span> },
                ]}
                phone={(s) => { const x = staffOf.get(s.staffId); return { avatar: x?.fullName, title: x?.fullName ?? "", sub: `${x?.designation} · net ${formatRupees(s.netPaise)}`, pills: <Pill tone={SLIP_STATUS_TONE[s.status]} className="!h-[22px] !text-[11.5px]">{s.status === "MADE" ? "Not sent" : SLIP_STATUS_LABEL[s.status]}</Pill> }; }} />
              {p.change && rows.length > 0 && <div className={cx("hidden lg:flex items-center gap-2 px-5 py-2 border-t border-line text-[12.5px] text-ink3")}><AllTick group="slip" />Tick every slip shown</div>}
            </>
          )}
        </Card>
      </Stack>

      {data.view && data.viewLine && run && (() => {
        const x = staffOf.get(data.view.staffId)!;
        return (
          <UrlSheet wide closeHref={here({ slip: null })} title={`Salary slip · ${monthName(run.month)}`} sub={`${x.fullName} · ${x.staffCode}`}
            footer={<div className="flex gap-2 justify-end flex-wrap">
              <a href={`${HREF}/pdf?ids=${data.view.id}&print=1`} target="_blank" rel="noopener" className={buttonClass("ghost")}><Printer size={17} aria-hidden="true" />Print</a>
              {p.change && <ButtonLink href={here({ slip: null, do: "send", how: send, ids: data.view.id })} scroll={false} variant="secondary" icon={Send}>Send</ButtonLink>}
              <a href={`${HREF}/pdf?ids=${data.view.id}`} download className={buttonClass("primary")}><Download size={17} aria-hidden="true" />Download PDF</a>
            </div>}>
            <SlipView school={p.school.name} place={[data.campus?.name, data.campus?.address].filter(Boolean).join(", ")} month={run.month} paidOn={run.paidOn} line={data.viewLine} person={personOf(x)} showEmployer={data.settings.slipShowEmployer} />
          </UrlSheet>
        );
      })()}
      {doing === "send" && run && bulkIds.length > 0 && (
        <ConfirmSheet closeHref={here({ do: null, how: null, ids: null })} title={`Send ${bulkIds.length} salary slip${bulkIds.length === 1 ? "" : "s"} by ${howWord}?`} label={`Send to ${bulkIds.length} staff`} action={sendSlipsAction} hidden={{ ids: bulkIds.join(","), how }}>
          <p className="text-[14px] text-ink2">Each staff member gets only their own {monthName(run.month)} slip: the message says it is ready and the slip opens in My profile, behind their login. Messages cannot be unsent.</p>
        </ConfirmSheet>
      )}
      {doing === "send-unsent" && run && notSent > 0 && (
        <ConfirmSheet closeHref={here({ do: null })} title={`Send ${notSent} unsent salary slip${notSent === 1 ? "" : "s"}?`} label={`Send to ${notSent} staff`} action={sendSlipsAction} hidden={{ runId: run.id, how: send }}>
          <p className="text-[14px] text-ink2">{data.whatsappOn ? "By WhatsApp. Staff with no WhatsApp number on file are listed after sending; print their slips instead." : "By email, because WhatsApp is switched off in Settings. Staff with no email on file are listed after sending; print their slips instead."} Messages cannot be unsent.</p>
        </ConfirmSheet>
      )}
    </div>
  );
}
