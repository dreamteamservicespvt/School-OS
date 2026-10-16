import type { Metadata } from "next";
import Link from "next/link";
import { Award, Check, CircleAlert, CircleCheck, Clock, Ellipsis, FileText, Hourglass, Layers, Network, Pencil, ReceiptIndianRupee, School, Send, Tag, UsersRound, Workflow } from "lucide-react";
import type { Prisma } from "@prisma/client";
import { requireConsole } from "@/lib/console/current";
import { withConsole } from "@/lib/db";
import { CREDIT_PACKS, FOUNDING_LIMIT, groupDiscountFor, invoiceSummary, istDay, monthsLeft, PLAN_LABEL, priceList, quoteYear, SUB_STATUS_LABEL } from "@/lib/console/billing";
import { CONSOLE_TZ } from "@/lib/console/list";
import { dateWhere, periodFromSearch } from "@/lib/periods";
import { formatDate, formatRupees } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { PageHead } from "@/components/ui/display";
import { Col, Empty, Progress, Row, SegLinks, Split, Stats } from "@/components/ui/blocks";
import { UrlSearch } from "@/components/ui/list-controls";
import { PeriodFilter } from "@/components/list/period-filter";
import { UrlSheet } from "@/components/ui/url-sheet";
import { cx } from "@/components/ui/cx";
import { SchoolLogo, SUB_TONE } from "@/components/console/bits";
import { InvoiceRow } from "@/components/console/invoice-row";
import { ActSheet } from "@/components/console/sheets";
import { ChangePlanSheet, FoundingPickSheet, NewInvoiceSheet, PricesSheet, type Prices } from "@/components/console/billing-sheets";
import { changePlanAction, changePricesAction, foundingAction, groupDiscountAllAction, sendNewInvoiceAction } from "./actions";
import { invoiceSheet } from "../_lib/invoice-sheets";

export const metadata: Metadata = { title: "Plans & Billing" };

type SP = Record<string, string | undefined>;
const SUB_KEYS = { paid: "PAID", due: "DUE", grace: "GRACE", overdue: "OVERDUE" } as const;
const rupees = (p: bigint) => Number(p) / 100;

export default async function BillingPage({ searchParams }: { searchParams: Promise<SP> }) {
  const c = await requireConsole();
  const sp = await searchParams;
  const now = new Date();
  const today = istDay(now);
  const subKey = (sp.sub ?? "") in SUB_KEYS ? (sp.sub as keyof typeof SUB_KEYS) : "";
  const invKey = ["unpaid", "paid", "cancelled"].includes(sp.inv ?? "") ? sp.inv! : "";
  const range = periodFromSearch(sp, { timeZone: CONSOLE_TZ });
  const sq = (sp.sq ?? "").trim().slice(0, 80);
  const iq = (sp.iq ?? "").trim().slice(0, 80);

  const data = await withConsole(async (tx) => {
    const cards = await tx.consoleSchool.findMany({ select: { id: true, name: true, city: true, code: true, status: true, activeStudents: true, groupId: true, groupName: true, adminName: true } });
    const byId = new Map(cards.map((x) => [x.id, x]));
    const subs = await tx.subscription.findMany({ orderBy: { renewOn: "asc" } });
    const invWhere: Prisma.PlatformInvoiceWhereInput = {
      ...(invKey === "unpaid" ? { status: { in: ["UNPAID", "WAITING"] } } : invKey === "paid" ? { status: "PAID" } : invKey === "cancelled" ? { status: "CANCELLED" } : {}),
      ...(range ? { issuedOn: dateWhere(range) } : {}),
      ...(iq ? { OR: [{ number: { contains: iq, mode: "insensitive" } }, { forSchoolId: { in: cards.filter((x) => x.name.toLowerCase().includes(iq.toLowerCase())).map((x) => x.id) } }] } : {}),
    };
    const [invoices, invTotal, waiting, unpaid, list, groups] = await Promise.all([
      tx.platformInvoice.findMany({ where: invWhere, orderBy: [{ issuedOn: "desc" }, { number: "desc" }], take: 200 }),
      tx.platformInvoice.count(),
      tx.platformInvoice.findMany({ where: { status: "WAITING" }, orderBy: { createdAt: "asc" } }),
      tx.platformInvoice.aggregate({ where: { status: "UNPAID" }, _sum: { totalPaise: true }, _count: true }),
      priceList(tx, today),
      tx.group.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } }),
    ]);
    return { cards, byId, subs, invoices, invTotal, waiting, unpaid, list, groups };
  });
  const { byId, subs, invoices, waiting, list } = data;
  const live = subs.filter((x) => byId.get(x.forSchoolId)?.status !== "CLOSED");
  const count = (st: string) => live.filter((x) => x.status === st).length;
  const used = subs.filter((x) => x.discountReason === "founding").length;
  const trials = data.cards.filter((x) => x.status === "TRIAL").length;
  const subRows = live.filter((x) => {
    const s = byId.get(x.forSchoolId);
    return s && (!subKey || x.status === SUB_KEYS[subKey]) && (!sq || `${s.name} ${s.city} ${s.code}`.toLowerCase().includes(sq.toLowerCase()));
  });
  const keep = (change: Record<string, string | null>) => {
    const n = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (v && k !== "act") n.set(k, v);
    for (const [k, v] of Object.entries(change)) { if (v) n.set(k, v); else n.delete(k); }
    return n.toString() ? `/console/billing?${n}` : "/console/billing";
  };
  const base = keep({});
  const to = (a: string) => keep({ act: a });
  const prices: Prices = { essential: rupees(list.essential?.pricePaise ?? 0n), complete: rupees(list.complete?.pricePaise ?? 0n), hostel: rupees(list.hostel?.pricePaise ?? 0n), min: list.essential?.minStudents ?? 100 };
  const groupRows = data.groups.map((g) => {
    const members = data.cards.filter((x) => x.groupId === g.id && x.status !== "CLOSED");
    const given = subs.find((x) => members.some((m) => m.id === x.forSchoolId) && x.discountReason === "group")?.discountPercent ?? 0;
    return { id: g.id, name: g.name, size: members.length, pct: groupDiscountFor(members.length), given };
  }).filter((g) => g.size > 0);
  const eligible = live.filter((x) => x.discountReason !== "founding" && byId.get(x.forSchoolId)?.status === "ACTIVE");

  // Sheets
  let sheet: React.ReactNode = await invoiceSheet(sp.act, base, c);
  const [kind, arg] = (sp.act ?? "").split(":");
  const subOf = (id: string | undefined) => (id ? subs.find((x) => x.forSchoolId === id) : undefined);
  if (!sheet && kind === "sub") {
    const x = subOf(arg);
    const s = x && byId.get(x.forSchoolId);
    if (x && s) {
      const items: [React.ReactNode, string, string, string][] = [
        [<School key="i" size={19} />, "Open school", "Admins, setup, usage and status history", `/console/schools/${s.id}`],
        ...(c.can("plan") ? [[<Layers key="i" size={19} />, "Change plan or add-ons", "Upgrade from today, or downgrade at renewal", to(`plan:${s.id}`)] as [React.ReactNode, string, string, string]] : []),
        ...(c.can("invoice") ? [[<Send key="i" size={19} />, "Send an invoice", "Renewal or message credits, with a Razorpay link", to(`invoice:${s.id}`)] as [React.ReactNode, string, string, string]] : []),
        ...(c.can("discount") && x.discountReason !== "founding" && used < FOUNDING_LIMIT ? [[<Award key="i" size={19} />, "Mark as founding school", `${used} of ${FOUNDING_LIMIT} places used`, to(`found:${s.id}`)] as [React.ReactNode, string, string, string]] : []),
      ];
      sheet = (
        <UrlSheet title={s.name} sub={`${PLAN_LABEL[x.planKey]}${x.hostel ? " + Hostel" : ""} · ${x.studentsPaidFor.toLocaleString("en-IN")} students paid for · ${SUB_STATUS_LABEL[x.status]}`} closeHref={base}>
          <div className="flex flex-col gap-2">
            {items.map(([ic, l, sub, href]) => (
              <Link key={l} href={href} scroll={false} className="flex items-center gap-3 text-left p-3 rounded-2xl border border-line hover:border-brand/40 hover:bg-brand/5 transition">
                <span className="w-10 h-10 rounded-xl bg-brand/10 text-brand grid place-items-center shrink-0" aria-hidden="true">{ic}</span>
                <span className="min-w-0"><span className="block font-semibold text-[14.5px]">{l}</span><span className="block text-[12.5px] text-ink3">{sub}</span></span>
              </Link>
            ))}
            {!c.can("plan") && <p className="text-[12.5px] text-ink3 px-1 pt-1">As {c.user.role === "SUPPORT" ? "Support" : "your role"}, you can see billing but not change it.</p>}
          </div>
        </UrlSheet>
      );
    }
  }
  if (!sheet && kind === "plan" && c.can("plan")) {
    const x = subOf(arg);
    const s = x && byId.get(x.forSchoolId);
    if (x && s && s.status !== "CLOSED") {
      sheet = <ChangePlanSheet closeHref={base} schoolId={s.id} schoolName={s.name} paidFor={x.studentsPaidFor} prices={prices} current={{ plan: x.planKey, hostel: x.hostel }}
        founding={x.discountReason === "founding" && x.priceLockedUntil ? { lockedUntil: formatDate(x.priceLockedUntil) } : null} monthsLeft={monthsLeft(today, x.renewOn)} renewOn={formatDate(x.renewOn)}
        perStudent={rupees(x.pricePerStudentPaise)} discountPercent={x.discountPercent} action={changePlanAction} />;
    }
  }
  if (!sheet && kind === "invoice" && c.can("invoice")) {
    const options = data.cards.filter((x) => x.status !== "CLOSED").sort((a, b) => a.name.localeCompare(b.name)).map((s) => {
      const x = subOf(s.id);
      let year: { label: string; amount: number } | null = null;
      if (x) {
        const pk = x.nextPlanKey ?? x.planKey;
        const n = Math.max(s.activeStudents, list[pk]?.minStudents ?? 100);
        const founding = x.discountReason === "founding";
        const q = quoteYear(list, { planKey: pk, students: n, hostel: x.nextHostel ?? x.hostel, discountPercent: x.discountPercent, discountReason: x.discountReason, founding, pricePerStudent: founding ? x.pricePerStudentPaise : undefined, fraction: x.payIn === "HALVES" ? { num: 6, den: 12 } : undefined });
        year = { label: `Renewal: ${PLAN_LABEL[pk]}, ${n.toLocaleString("en-IN")} students${x.discountPercent ? `, discount ${x.discountPercent}%` : ""}`, amount: rupees(q.taxable) };
      }
      return { value: s.id, label: `${s.name} · ${s.city ?? ""}`, admin: s.adminName ?? "the School Admin", year };
    });
    if (options.length) sheet = <NewInvoiceSheet closeHref={base} schools={options} schoolId={arg && byId.has(arg) ? arg : undefined} packs={CREDIT_PACKS.map((p) => ({ credits: p.credits, rupees: rupees(p.paise) }))} action={sendNewInvoiceAction} />;
  }
  if (!sheet && kind === "found" && c.can("discount") && used < FOUNDING_LIMIT) {
    const opts = eligible.filter((x) => !arg || x.forSchoolId === arg).map((x) => ({ value: x.forSchoolId, label: `${byId.get(x.forSchoolId)!.name} · ${PLAN_LABEL[x.planKey]}` }));
    sheet = <FoundingPickSheet closeHref={base} used={used} limit={FOUNDING_LIMIT} schools={opts} action={foundingAction} />;
  }
  if (!sheet && kind === "disc" && c.can("discount")) {
    const g = groupRows.find((x) => x.id === arg);
    if (g) sheet = (
      <ActSheet title="Group discount" sub={`${g.name} · Owner only`} closeHref={base} action={groupDiscountAllAction} submitLabel={`Give ${g.pct}% to the group`} hidden={{ groupId: g.id }}>
        <p>{g.name} has {g.size} schools, so its schools get <b className="text-ink">{g.pct}% off</b>. Founding schools keep their locked price.</p>
        <p>10% for 3 to 4 schools in a group, 15% for 5 or more. Applies from each school’s next invoice, never mid-year.</p>
      </ActSheet>
    );
  }
  if (!sheet && kind === "prices" && c.can("prices")) {
    const nextApril = new Date(Date.UTC(today.getUTCMonth() >= 3 ? today.getUTCFullYear() + 1 : today.getUTCFullYear(), 3, 1));
    sheet = <PricesSheet closeHref={base} now={{ essential: prices.essential, complete: prices.complete, hostel: prices.hostel }} minDate={nextApril.toISOString().slice(0, 10)} action={changePricesAction} />;
  }

  const ess = list.essential;
  const comp = list.complete;
  const pack = CREDIT_PACKS[0];

  return (
    <div>
      <PageHead title="Plans & Billing" sub="What each school pays, and whether it has paid. Prices exclude 18% GST."
        actions={c.can("invoice") ? <Link href={to("invoice")} scroll={false} className={buttonClass("primary")}><Send size={17} aria-hidden="true" />Send invoice</Link> : null} />
      <div className="flex flex-col gap-5 lg:gap-6">
        <Stats items={[
          { label: "Paid", value: count("PAID"), sub: "subscriptions", tone: "ok", icon: CircleCheck, href: keep({ sub: "paid" }) },
          { label: "Due", value: count("DUE"), sub: "invoice sent, not late", tone: "info", icon: Clock, href: keep({ sub: "due" }) },
          { label: "In grace", value: count("GRACE"), sub: "15 days, still working", tone: "warn", icon: Hourglass, href: keep({ sub: "grace" }) },
          { label: "Overdue", value: count("OVERDUE"), sub: "school suspended", tone: "bad", icon: CircleAlert, href: keep({ sub: "overdue" }) },
          { label: "Unpaid invoices", value: formatRupees(data.unpaid._sum.totalPaise ?? 0n), sub: `${data.unpaid._count} ${data.unpaid._count === 1 ? "invoice" : "invoices"}, with GST`, icon: ReceiptIndianRupee, href: keep({ inv: "unpaid" }) },
          { label: "Founding schools", value: `${used} of ${FOUNDING_LIMIT}`, sub: `${FOUNDING_LIMIT - used} places left`, tone: "brand", icon: Award },
        ]} />

        {waiting.map((i) => {
          const s = byId.get(i.forSchoolId);
          return (
            <div key={i.id} className="rounded-2xl bg-warn/12 px-4 py-3.5 flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex items-start gap-3 flex-1 min-w-0">
                <UsersRound size={19} className="text-warn shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-[14px] text-ink2"><b className="font-semibold text-ink">Top-up invoice {i.number} waits for the Owner’s OK.</b> {s?.name}: {invoiceSummary(i)}. {formatRupees(i.subtotalPaise - i.discountPaise)} + GST {formatRupees(i.gstPaise)} = <b className="font-semibold text-ink">{formatRupees(i.totalPaise)}</b>.</p>
              </div>
              {c.can("approve") ? (
                <div className="flex gap-2 shrink-0 pl-8 md:pl-0">
                  <Link href={to(`approve:${i.id}`)} scroll={false} className={buttonClass("primary", "sm")}><Check size={15} aria-hidden="true" />OK and send</Link>
                  <Link href={to(`cancelinv:${i.id}`)} scroll={false} className={buttonClass("ghost", "sm")}>Don’t send</Link>
                </div>
              ) : <Pill tone="warn" className="self-start md:self-center ml-8 md:ml-0">Waiting for the Owner</Pill>}
            </div>
          );
        })}

        <Split side={380}>
          <Col>
            <Card className="overflow-hidden">
              <CardHeader title="Subscriptions" description={`One row per paying school · ${trials} trial ${trials === 1 ? "school picks its" : "schools pick their"} plan when they pay`} icon={Layers} />
              <div className="px-3 py-3 border-t border-line flex flex-col md:flex-row gap-2.5 md:items-center">
                <UrlSearch id="sa-sub-search" param="sq" placeholder="School, city or school code" />
                <div className="overflow-x-auto no-scrollbar">
                  <SegLinks label="Subscription status" value={subKey} options={[{ value: "", label: "All", href: keep({ sub: null }) }, ...(["paid", "due", "grace", "overdue"] as const).map((k) => ({ value: k, label: SUB_STATUS_LABEL[SUB_KEYS[k]], href: keep({ sub: k }) }))]} />
                </div>
              </div>
              {subRows.length === 0 ? <Empty title="No subscriptions match" body={live.length ? "Try a different search or status." : "Schools appear here when they choose a plan."} action={live.length ? <Link href={keep({ sq: null, sub: null })} className={buttonClass("secondary")}>Clear filters</Link> : undefined} /> : (
                <>
                  <div className="hidden lg:block overflow-x-auto scroll-thin border-t border-line">
                    <table className="w-full text-left text-[14px]" style={{ minWidth: 660 }}>
                      <caption className="sr-only">Subscriptions</caption>
                      <thead>
                        <tr className="text-[12px] text-ink3 font-semibold border-b border-line">
                          <th scope="col" className="pl-5 px-3 py-3 font-semibold">School</th><th scope="col" className="px-3 py-3 font-semibold">Plan</th>
                          <th scope="col" className="px-3 py-3 font-semibold text-right whitespace-nowrap">Paid for / active</th>
                          <th scope="col" className="px-3 py-3 font-semibold">Renewal</th><th scope="col" className="px-3 py-3 font-semibold">Status</th><th className="pr-4 w-12"><span className="sr-only">Actions</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {subRows.map((x) => {
                          const s = byId.get(x.forSchoolId)!;
                          const over = s.activeStudents > x.studentsPaidFor * 1.1;
                          return (
                            <tr key={x.id} className="border-b border-line/70 last:border-0 hover:bg-sunken/60 transition">
                              <td className="pl-5 px-3 py-2.5"><Link href={`/console/schools/${s.id}`} className="flex items-center gap-3 text-left"><SchoolLogo name={s.name} size={34} /><span className="min-w-0"><span className="block font-semibold leading-tight hover:underline">{s.name}</span><span className="block text-[12px] text-ink3">{s.city}</span></span></Link></td>
                              <td className="px-3 py-2.5"><p className="leading-tight whitespace-nowrap">{PLAN_LABEL[x.planKey]}{x.hostel ? " + Hostel" : ""} · <span className="tnum">{formatRupees(x.pricePerStudentPaise)}</span></p><p className="text-[12px] text-ink3">{x.discountReason === "founding" ? "Founding school" : "Standard price"}{x.discountReason === "group" && x.discountPercent ? ` · group ${x.discountPercent}%` : ""}</p></td>
                              <td className="px-3 py-2.5 text-right tnum whitespace-nowrap"><span>{x.studentsPaidFor.toLocaleString("en-IN")}</span><span className="text-ink3"> / </span><span className={cx(over && "text-warn font-semibold")}>{s.activeStudents.toLocaleString("en-IN")}</span></td>
                              <td className="px-3 py-2.5 whitespace-nowrap"><p>{formatDate(x.renewOn)}</p><p className="text-[12px] text-ink3">{x.payIn === "HALVES" ? "In two halves" : "Yearly"}</p></td>
                              <td className="px-3 py-2.5"><Pill tone={SUB_TONE[x.status]}>{SUB_STATUS_LABEL[x.status]}</Pill></td>
                              <td className="pr-4 py-2.5"><Link href={to(`sub:${s.id}`)} scroll={false} aria-label={`Actions for ${s.name}`} className="w-[34px] h-[34px] grid place-items-center rounded-xl text-ink2 hover:bg-sunken"><Ellipsis size={18} aria-hidden="true" /></Link></td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <ul className="lg:hidden divide-y divide-line/70 border-t border-line">
                    {subRows.map((x) => {
                      const s = byId.get(x.forSchoolId)!;
                      return (
                        <li key={x.id} className="flex items-center gap-3 px-4 py-3">
                          <Link href={`/console/schools/${s.id}`} className="flex items-center gap-3 min-w-0 flex-1 text-left">
                            <SchoolLogo name={s.name} size={42} />
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-[15px] truncate">{s.name}</p>
                              <p className="text-[13px] text-ink3 truncate tnum">{PLAN_LABEL[x.planKey]}{x.hostel ? " + Hostel" : ""} · {x.studentsPaidFor.toLocaleString("en-IN")} paid / {s.activeStudents.toLocaleString("en-IN")} active</p>
                              <div className="flex gap-1.5 mt-1.5 flex-wrap"><Pill tone={SUB_TONE[x.status]} className="!h-[22px] !text-[11.5px]">{SUB_STATUS_LABEL[x.status]}</Pill><Pill tone="neutral" className="!h-[22px] !text-[11.5px]">Renews {formatDate(x.renewOn)}</Pill></div>
                            </div>
                          </Link>
                          <Link href={to(`sub:${s.id}`)} scroll={false} aria-label={`Actions for ${s.name}`} className="w-9 h-9 grid place-items-center rounded-xl text-ink2 hover:bg-sunken"><Ellipsis size={18} aria-hidden="true" /></Link>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}
              <div className="px-4 py-3 border-t border-line text-[13px] text-ink3 tnum">Showing {subRows.length} of {live.length} · students counted on the billing day, Active students only</div>
            </Card>

            <Card className="overflow-hidden">
              <CardHeader title="Invoices" description="Every GST invoice. Never deleted: a wrong one is cancelled with a reason." icon={FileText} />
              <div className="px-3 py-3 border-t border-line flex flex-col md:flex-row md:flex-wrap gap-2.5 md:items-center">
                <UrlSearch id="sa-inv-search" param="iq" placeholder="Invoice number or school" />
                <PeriodFilter timeZone={CONSOLE_TZ} allLabel="Any date" className="w-full md:w-auto" />
                <div className="overflow-x-auto no-scrollbar">
                  <SegLinks label="Invoice status" value={invKey} options={[{ value: "", label: "All", href: keep({ inv: null }) }, { value: "unpaid", label: "Unpaid", href: keep({ inv: "unpaid" }) }, { value: "paid", label: "Paid", href: keep({ inv: "paid" }) }, { value: "cancelled", label: "Cancelled", href: keep({ inv: "cancelled" }) }]} />
                </div>
              </div>
              {invoices.length === 0 ? <Empty icon={FileText} title="No invoices match" body={data.invTotal ? "Try a different search, date or filter." : "Invoices appear here when a school chooses its plan or buys credits."} /> : (
                <ul className="-mt-px">{invoices.map((i) => <InvoiceRow key={i.id} i={i} schoolName={byId.get(i.forSchoolId)?.name} base={base} today={today} can={{ invoice: c.can("invoice"), markPaid: c.can("markPaid"), approve: c.can("approve") }} />)}</ul>
              )}
              <div className="px-4 py-3 border-t border-line text-[13px] text-ink3 tnum">Showing {invoices.length} of {data.invTotal}{range ? ` · issued ${range.label.toLowerCase()}` : ""} · paid by Razorpay mark themselves paid</div>
            </Card>
          </Col>

          <Col>
            <Card>
              <CardHeader title="Price list" description="Prices exclude 18% GST" icon={Tag} action={c.can("prices") ? <Link href={to("prices")} scroll={false} className={buttonClass("ghost", "sm")}><Pencil size={15} aria-hidden="true" />Edit</Link> : null} />
              <div className="px-5 pb-5 flex flex-col gap-3">
                {([[ess, "Essential", "Everyday school work: students, attendance, fees, exams, staff and messages"], [comp, "Complete", "Everything in Essential, plus every other module"]] as const).map(([p, l, d]) => p && (
                  <div key={l} className="rounded-xl border border-line p-3.5">
                    <div className="flex items-baseline justify-between gap-2 flex-wrap"><p className="font-semibold text-[15px]">{l}</p><p className="font-display text-[22px] font-semibold tnum leading-tight">{formatRupees(p.pricePaise)}<span className="text-[12.5px] text-ink3 font-sans font-medium"> per student a year</span></p></div>
                    <p className="text-[12.5px] text-ink3 mt-1">{d}. Minimum {p.minStudents} students · {formatRupees(p.priceAbove1000Paise ?? p.pricePaise / 2n)} for each student above 1,000 · {(p.creditsPerStudent ?? 0).toLocaleString("en-IN")} message credits per student a year.</p>
                  </div>
                ))}
                <dl className="flex flex-col divide-y divide-line/70 text-[13.5px]">
                  {[["Hostel add-on", list.hostel ? `${formatRupees(list.hostel.pricePaise)} per school a year` : "—"], ["Group of 3 to 4 schools", "10% off"], ["Group of 5 or more", "15% off"], ["Extra message credits", `${pack.credits.toLocaleString("en-IN")} for ${formatRupees(pack.paise)}`], ["Trial", "30 days, Essential, 500 credits"]].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3 py-2"><dt className="text-ink2">{k}</dt><dd className="font-semibold tnum text-right">{v}</dd></div>
                  ))}
                </dl>
                {ess && <p className="text-[12.5px] text-ink3 leading-relaxed">Example: 1,236 students on Essential = 1,000 × {formatRupees(ess.pricePaise)} + 236 × {formatRupees(ess.priceAbove1000Paise ?? ess.pricePaise / 2n)} = {formatRupees(1000n * ess.pricePaise + 236n * (ess.priceAbove1000Paise ?? ess.pricePaise / 2n))} a year + GST. A price change affects only renewals after the change, never a school mid-year.</p>}
              </div>
            </Card>

            <Card>
              <CardHeader title="Founding schools" description={`First ${FOUNDING_LIMIT} paying schools only`} icon={Award} action={<Pill tone="brand">{used} of {FOUNDING_LIMIT}</Pill>} />
              <div className="px-5 pb-5 flex flex-col gap-3">
                <Progress value={(used / FOUNDING_LIMIT) * 100} />
                <p className="text-[13.5px] text-ink2 leading-relaxed">Essential price{ess ? ` (${formatRupees(ess.pricePaise)})` : ""} locked for 3 years, and every new module switched on free as it is built. {FOUNDING_LIMIT - used} places left; the mark is not offered after the {FOUNDING_LIMIT}th.</p>
                {c.can("discount") && used < FOUNDING_LIMIT && eligible.length > 0 && <Link href={to("found")} scroll={false} className={buttonClass("soft", "md", "self-start")}><Award size={17} aria-hidden="true" />Mark a founding school</Link>}
              </div>
            </Card>

            <Card>
              <CardHeader title="Groups" description="10% for 3 to 4 schools, 15% for 5 or more" icon={Network} />
              {groupRows.length === 0 ? <p className="px-5 pb-5 text-[13.5px] text-ink3">No groups yet. Set a school’s Group on its page.</p> : (
                <ul className="px-2 pb-2">
                  {groupRows.map((g) => (
                    <Row key={g.id} icon={Network} title={g.name} sub={`${g.size} ${g.size === 1 ? "school" : "schools"} · ${g.given ? `${g.given}% given` : g.pct ? `${g.pct}% can be given` : "no discount until a 3rd school joins"}`}
                      right={c.can("discount") && g.pct && g.given !== g.pct ? <Link href={to(`disc:${g.id}`)} scroll={false} className={buttonClass("ghost", "sm")}>Discount</Link> : null} />
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader title="What happens by itself" icon={Workflow} />
              <ul className="px-5 pb-5 flex flex-col gap-2.5 text-[13.5px] text-ink2 leading-snug">
                {["Students are counted on the billing day: Active students only. Alumni, leavers and enquiries are not counted.", "Renewal reminders go to the School Admin and Principal 30, 15, 7 and 1 day before.",
                  "A missed renewal gets 15 days of grace with everything working, then the school becomes Suspended.", "A trial unpaid after 30 days becomes Suspended; its data is kept 90 days.",
                  "At six months, more than 10% extra students makes a top-up invoice that waits for the Owner’s OK.", "Paying an overdue invoice reactivates a Suspended school at once."].map((t) => (
                  <li key={t} className="flex gap-2.5"><Check size={15} className="text-ok shrink-0 mt-0.5" strokeWidth={2.6} aria-hidden="true" /><span>{t}</span></li>
                ))}
              </ul>
            </Card>
          </Col>
        </Split>
      </div>
      {sheet}
    </div>
  );
}
