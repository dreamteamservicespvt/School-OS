import type { Metadata } from "next";
import Link from "next/link";
import { Activity, ArchiveRestore, Bug, CalendarClock, CalendarDays, Check, ChevronRight, CircleAlert, CircleCheck, CreditCard, DatabaseBackup, Flag, Hourglass, ListChecks, MailWarning, MailX, MessageCircle, MessageCircleWarning, MessageSquareText, Plus, ReceiptIndianRupee, ScrollText, StickyNote, UsersRound, Workflow, type LucideIcon } from "lucide-react";
import { requireConsole } from "@/lib/console/current";
import { withConsole } from "@/lib/db";
import { attentionItems, glance, nextStep, systemChecks, type Attention } from "@/lib/console/dashboard";
import { schoolAdmins } from "@/lib/console/measure";
import { invoiceSummary, istDay } from "@/lib/console/billing";
import { maskMobile, tenDigits, showMobile } from "@/lib/console/activity";
import { formatDate, formatRupees } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Band } from "@/components/ui/kit";
import { Banner, Col, Split, TONE_SOFT } from "@/components/ui/blocks";
import { cx } from "@/components/ui/cx";
import { ActivityLine } from "@/components/console/activity-line";
import { ActSheet, CallSheet } from "@/components/console/sheets";
import { noteAction, resendInviteAction, sendInvoiceAction, topupAction } from "./schools/actions";

export const metadata: Metadata = { title: "Dashboard" };

const ICON: Record<Attention["kind"], LucideIcon> = { never: MailWarning, expired: MailX, stuck: Hourglass, trial: CalendarClock, grace: ReceiptIndianRupee, over: UsersRound, alert: MessageCircleWarning };
const CHECK_ICON: Record<string, LucideIcon> = { errors: Bug, whatsapp: MessageCircle, sms: MessageSquareText, razorpay: CreditCard, jobs: Workflow, backup: DatabaseBackup, restore: ArchiveRestore };

function greeting(now: Date) {
  const h = Number(now.toLocaleString("en-GB", { hour: "2-digit", hour12: false, timeZone: "Asia/Kolkata" }));
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

type Search = Promise<{ fix?: string; denied?: string }>;

export default async function ConsoleDashboard({ searchParams }: { searchParams: Search }) {
  const c = await requireConsole();
  const sp = await searchParams;
  const now = new Date();
  const [items, checks, g, logs] = await Promise.all([
    attentionItems(now),
    systemChecks(now),
    glance(now),
    withConsole((tx) => tx.consoleActivityEntry.findMany({ orderBy: { at: "desc" }, take: 10 })),
  ]);
  const allowed = (a: Attention) => !a.needs || c.can(a.needs);
  const label = (a: Attention) => (allowed(a) ? a.action : "Open school");
  const href = (a: Attention) => {
    if (a.kind === "alert") return "#system-alerts";
    if (a.kind === "trial" || !allowed(a)) return `/console/schools/${a.schoolId}`;
    return `/console?fix=${encodeURIComponent(a.id)}`;
  };
  const fixing = sp.fix ? items.find((a) => a.id === sp.fix && a.kind !== "alert" && a.kind !== "trial" && allowed(a)) : undefined;
  const sheet = fixing ? await FixSheet({ a: fixing, canApprove: c.can("approve"), now }) : null;
  const dateLine = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" });
  const nextTrial = g.nextTrial?.trialEndsOn ? Math.round((g.nextTrial.trialEndsOn.getTime() - istDay(now).getTime()) / 86_400_000) : null;

  return (
    <div className="flex flex-col gap-5 lg:gap-6">
      {sp.denied && <Banner tone="warn" title="That page is not for your role">Ask the Owner if you need it.</Banner>}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-3">
        <div>
          <p className="text-[13px] font-semibold text-ink3">{dateLine} · DREAM TEAM SERVICES</p>
          <h1 className="font-display text-[26px] md:text-[32px] font-semibold tracking-tight leading-tight mt-0.5">{greeting(now)}, {c.user.name.split(" ")[0]}</h1>
          <p className="text-[15px] text-ink3 mt-1">
            {items.length ? `${items.length} ${items.length === 1 ? "thing needs" : "things need"} DREAM TEAM today, across ${g.total} schools.` : `Nothing needs DREAM TEAM right now, across ${g.total} schools.`}
          </p>
        </div>
        {c.can("add") && <ButtonLink href="/console/schools/new" variant="primary" size="lg" icon={Plus} className="w-full md:w-auto">Add School</ButtonLink>}
      </div>

      <Split side={380}>
        <Col>
          <Card>
            <CardHeader title="Needs attention" description="One line per school. Each button fixes it." icon={Flag} action={items.length ? <Pill tone="bad">{items.length} {items.length === 1 ? "item" : "items"}</Pill> : <Pill tone="ok">All clear</Pill>} />
            {items.length === 0 ? (
              <div className="px-5 pb-6 pt-1 text-center">
                <span className="mx-auto w-12 h-12 rounded-2xl bg-ok/10 text-ok grid place-items-center animate-pop"><Check size={24} strokeWidth={2.6} aria-hidden="true" /></span>
                <p className="font-semibold mt-2.5">All done</p>
                <p className="text-[13px] text-ink3">No school needs DREAM TEAM right now.</p>
              </div>
            ) : (
              <ul className="px-2 pb-2">
                {items.map((a) => {
                  const Ic = ICON[a.kind];
                  return (
                    <li key={a.id}>
                      <div className="flex items-center gap-3.5 px-3 py-3 rounded-xl hover:bg-sunken/70 transition">
                        <span className={cx("w-10 h-10 rounded-xl grid place-items-center shrink-0", TONE_SOFT[a.tone])}><Ic size={19} aria-hidden="true" /></span>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold text-[14.5px] leading-snug">{a.title}</p>
                          <p className="text-[13px] text-ink3 truncate">{a.detail}</p>
                        </div>
                        <ButtonLink href={href(a)} size="sm" variant="secondary" className="hidden sm:inline-flex" scroll={a.kind === "alert"}>{label(a)}</ButtonLink>
                        <Link href={href(a)} scroll={a.kind === "alert"} className="sm:hidden w-9 h-9 grid place-items-center rounded-lg text-ink3" aria-label={label(a)}><ChevronRight size={20} aria-hidden="true" /></Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <section aria-label="Schools at a glance" className="flex flex-col gap-3">
            <div className="flex items-end justify-between gap-3">
              <div>
                <h2 className="font-semibold text-[15px] leading-tight">Schools at a glance</h2>
                <p className="text-[13px] text-ink3 mt-0.5">Each number opens the Schools list with that filter</p>
              </div>
              <ButtonLink href="/console/schools?period=thismonth" size="sm" variant="soft" icon={CalendarDays}>{g.fresh} new this month</ButtonLink>
            </div>
            <Band label="Schools by status" items={[
              { label: "Trial", big: g.trial, foot: g.nextTrial && nextTrial !== null ? `${g.nextTrial.name.split(" ").slice(0, 2).join(" ")} ${nextTrial > 0 ? `ends in ${nextTrial} ${nextTrial === 1 ? "day" : "days"}` : "ends today"}` : "None ending", href: "/console/schools?status=trial" },
              { label: "Active", big: g.active, foot: `${g.students.toLocaleString("en-IN")} students`, href: "/console/schools?status=active" },
              { label: "Suspended", big: g.suspended, foot: "Staff cannot sign in", href: "/console/schools?status=suspended" },
              { label: "Closed", big: g.closed, foot: "Data kept 90 days", href: "/console/schools?status=closed" },
            ]} />
          </section>
        </Col>

        <Col>
          <div id="system-alerts" className="scroll-mt-4">
            <Card className="target:ring-2 target:ring-brand">
              <CardHeader title="System alerts" description={checks.problem ? "1 problem right now. The rest is fine." : checks.checks.every((x) => x.ok) ? "Everything is working" : "Some checks need a look"} icon={Activity}
                action={<Pill tone={checks.problem ? "bad" : checks.checks.every((x) => x.ok) ? "ok" : "warn"} dot>{checks.problem ? "1 problem" : checks.checks.every((x) => x.ok) ? "All well" : "Check"}</Pill>} />
              {checks.problem && (
                <div className="mx-5 mb-3 rounded-xl bg-bad/10 p-3.5">
                  <p className="font-semibold text-[14px] flex items-center gap-2 text-bad"><MessageCircleWarning size={17} className="shrink-0" aria-hidden="true" />{checks.problem.title.split(",")[0]}</p>
                  <p className="text-[13px] text-ink2 mt-1 leading-relaxed">{checks.problem.waiting.toLocaleString("en-IN")} messages wait in the queue and go out by themselves when it is back; senders see “Waiting to send”.</p>
                  <p className="text-[13px] text-ink2 mt-1.5"><b className="font-semibold text-ink">{checks.problem.schools.length} {checks.problem.schools.length === 1 ? "school" : "schools"} affected:</b> {checks.problem.schools.join(", ")}.</p>
                  <ButtonLink href="/console#system-alerts" size="sm" variant="secondary" className="mt-3">Check again</ButtonLink>
                </div>
              )}
              <ul className="px-2 pb-2">
                {checks.checks.map((k) => {
                  const Ic = CHECK_ICON[k.key] ?? Activity;
                  return (
                    <li key={k.key} className="flex items-center gap-3 px-3 py-2 rounded-xl">
                      <span className={cx("w-8 h-8 rounded-lg grid place-items-center shrink-0", k.ok ? "bg-sunken text-ink2" : "bg-bad/10 text-bad")}><Ic size={16} aria-hidden="true" /></span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13.5px] font-semibold leading-tight">{k.label}</p>
                        <p className="text-[12px] text-ink3 truncate">{k.text}</p>
                      </div>
                      {k.ok ? <CircleCheck size={17} className="text-ok shrink-0" aria-label="Working" /> : <CircleAlert size={17} className="text-bad shrink-0" aria-label="Needs a look" />}
                    </li>
                  );
                })}
              </ul>
              {checks.measuredAt && <p className="px-5 pb-4 -mt-1 text-[12px] text-ink3">Schools last counted {formatDate(checks.measuredAt)}. Counts refresh every hour.</p>}
            </Card>
          </div>

          <Card>
            <CardHeader title="Recent activity" description="The last 10 lines of the Activity Log" icon={ScrollText}
              action={<Link href="/console/activity" className="text-[13px] font-semibold text-brand hover:underline">Open</Link>} />
            {logs.length === 0
              ? <p className="px-5 pb-5 text-[13px] text-ink3">Nothing yet. Every console action shows here.</p>
              : <ul className="px-2 pb-2">{logs.map((l) => <ActivityLine key={l.id} l={l} />)}</ul>}
          </Card>
        </Col>
      </Split>
      {sheet}
    </div>
  );
}

/** The confirm sheet for one Needs attention line. */
async function FixSheet({ a, canApprove, now }: { a: Attention; canApprove: boolean; now: Date }) {
  const close = "/console";
  const schoolId = a.schoolId!;
  if (a.kind === "never" || a.kind === "expired") {
    const inv = await withConsole((tx) => tx.schoolInvite.findUnique({ where: { id: a.targetId! } }));
    if (!inv) return null;
    return (
      <ActSheet title="Send a new invite?" sub={a.schoolName} closeHref={close} action={resendInviteAction} submitLabel={`Send new invite to ${inv.name}`} hidden={{ schoolId, inviteId: inv.id }}>
        <p>A new link goes to <b className="text-ink">{inv.name}</b>, +91 {maskMobile(inv.phone)}, on {inv.channels.map((x) => (x === "whatsapp" ? "WhatsApp" : x === "sms" ? "SMS" : "email")).join(" and ")}.</p>
        <p>{a.kind === "never" ? "The old link stops working." : "The expired link stays closed."} The new one works for 3 days and needs the code sent to their mobile.</p>
      </ActSheet>
    );
  }
  if (a.kind === "stuck") {
    const [card, notes, admins] = await Promise.all([
      withConsole((tx) => tx.consoleSchool.findUnique({ where: { id: schoolId } })),
      withConsole((tx) => tx.schoolNote.findFirst({ where: { forSchoolId: schoolId }, orderBy: { createdAt: "desc" } })),
      schoolAdmins(schoolId),
    ]);
    if (!card) return null;
    const admin = admins.find((x) => x.status === "ACTIVE" && x.roleKey === "school-admin") ?? admins.find((x) => x.status === "ACTIVE") ?? admins[0];
    const d = tenDigits(admin?.phone);
    const step = nextStep(card.setupSteps);
    const days = card.setupChangedAt ? Math.round((now.getTime() - card.setupChangedAt.getTime()) / 86_400_000) : null;
    return (
      <CallSheet closeHref={close} schoolId={schoolId} schoolName={card.name} adminName={admin?.name ?? "the admin"} phone={d ? showMobile(d) : null} action={noteAction}
        lines={[
          <><ListChecks size={18} className="text-ink3 shrink-0 mt-0.5" aria-hidden="true" /><span>Setup <b className="font-semibold">{card.setupDone} of {card.setupTotal}</b>{step && <> · next step: {step}</>}</span></>,
          ...(days !== null ? [<><Hourglass size={18} className="text-warn shrink-0 mt-0.5" aria-hidden="true" /><span>No change for <b className="font-semibold">{days} days</b></span></>] : []),
          ...(notes ? [<><StickyNote size={18} className="text-ink3 shrink-0 mt-0.5" aria-hidden="true" /><span>Last team note: “{notes.text}” <span className="text-ink3">· {notes.byName}</span></span></>] : []),
        ]} />
    );
  }
  if (a.kind === "grace") {
    const inv = await withConsole((tx) => tx.platformInvoice.findUnique({ where: { id: a.targetId! } }));
    if (!inv) return null;
    return (
      <ActSheet title="Resend the invoice?" sub={`${a.schoolName} · ${inv.number}`} closeHref={close} action={sendInvoiceAction} submitLabel="Resend invoice" hidden={{ invoiceId: inv.id, reminder: "grace" }}>
        <p>Invoice <b className="text-ink">{inv.number}</b> for {formatRupees(inv.totalPaise)} ({invoiceSummary(inv)}) goes again to the School Admins and the Principal on WhatsApp and email, with its Razorpay payment link.</p>
        <p>It marks itself paid when the payment arrives. If it is still unpaid when the grace ends, the school becomes Suspended by itself.</p>
      </ActSheet>
    );
  }
  if (a.kind === "over") {
    const [card, sub] = await Promise.all([
      withConsole((tx) => tx.consoleSchool.findUnique({ where: { id: schoolId } })),
      withConsole((tx) => tx.subscription.findUnique({ where: { forSchoolId: schoolId } })),
    ]);
    if (!card || !sub) return null;
    const extra = card.activeStudents - sub.studentsPaidFor;
    const rate = sub.pricePerStudentPaise / 2n;
    const base = rate * BigInt(Math.max(0, extra));
    const disc = (base * BigInt(sub.discountPercent)) / 100n;
    const gst = ((base - disc) * 18n + 50n) / 100n;
    return (
      <ActSheet title="Make a top-up invoice?" sub={`${card.name} · ${extra.toLocaleString("en-IN")} students above the ${sub.studentsPaidFor.toLocaleString("en-IN")} paid for`} closeHref={close} action={topupAction} hidden={{ schoolId }}
        submitLabel={canApprove ? `Make and send ${formatRupees(base - disc + gst)} invoice` : "Make top-up invoice"}>
        <p>{extra.toLocaleString("en-IN")} students for the rest of the year at half the yearly rate ({formatRupees(rate)} each): <b className="text-ink">{formatRupees(base - disc)} + GST {formatRupees(gst)} = {formatRupees(base - disc + gst)}</b>{sub.discountPercent ? `, after the ${sub.discountPercent}% discount` : ""}.</p>
        <p>{canApprove ? "It goes to the School Admins and the Principal with a Razorpay payment link." : "It waits for the Owner to OK it before it is sent."} Due {formatDate(new Date(now.getTime() + 14 * 86_400_000))}.</p>
      </ActSheet>
    );
  }
  return null;
}
