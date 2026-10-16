import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Archive, ArchiveRestore, Award, Building2, ChartColumn, Check, CirclePause, CirclePlay, EyeOff, Flag, GraduationCap, History, Hourglass, KeyRound, Layers, LayoutGrid, ListChecks, Lock, LogIn,
  MessageCircle, Network, Pencil, Phone, ReceiptIndianRupee, Send, Smartphone, StickyNote, UserPlus, UserX, BadgePercent,
} from "lucide-react";
import { requireConsole } from "@/lib/console/current";
import { withConsole } from "@/lib/db";
import { schoolAdmins } from "@/lib/console/measure";
import { BOARDS, SCHOOL_TYPES, STATES, inviteState, listGroups, MOVES } from "@/lib/console/schools";
import { addDays, GRACE_DAYS, istDay, monthsLeft, PLAN_LABEL, priceList, SUB_STATUS_LABEL, CREDIT_PACKS, groupDiscountFor, quoteYear } from "@/lib/console/billing";
import { maskMobile, tenDigits, showMobile } from "@/lib/console/activity";
import { nextStep } from "@/lib/console/dashboard";
import { formatDate, formatRupees, formatTime } from "@/lib/format";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { buttonClass } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { Banner, Col, DL, Empty, Progress, Row, Split, Timeline, TONE_TEXT } from "@/components/ui/blocks";
import { MenuLink, MoreMenu } from "@/components/ui/kit-client";
import { CloseSheetButton, UrlSheet } from "@/components/ui/url-sheet";
import { cx } from "@/components/ui/cx";
import { BackLink, SchoolLogo, StatusPill, SUB_TONE } from "@/components/console/bits";
import { ActivityLine } from "@/components/console/activity-line";
import { ActSheet, CallSheet } from "@/components/console/sheets";
import { NoteForm } from "@/components/console/note-form";
import { InvoiceRow } from "@/components/console/invoice-row";
import { AddAdminSheet, ChangeMobileSheet, EditSchoolSheet, GroupSheet, ResetSheet } from "@/components/console/school-sheets";
import { ChangePlanSheet, FirstPlanSheet, NewInvoiceSheet, type Prices } from "@/components/console/billing-sheets";
import { addAdminAction, cancelInviteAction, changeMobileAction, disableAdminAction, editDetailsAction, groupAction, noteAction, resendInviteAction, resetAdminAction, statusAction } from "../actions";
import { activateAction, changePlanAction, choosePlanAction, foundingAction, groupDiscountAction, sendNewInvoiceAction } from "../../billing/actions";
import { invoiceSheet } from "../../_lib/invoice-sheets";

export const metadata: Metadata = { title: "School" };

const STATUS_MEANS = {
  TRIAL: "Everything works. The School Admin sees how many trial days are left on the Dashboard.",
  ACTIVE: "Everything works. Parents’ messages and payment links go out as usual.",
  SUSPENDED: "Staff see “Your School OS access is paused” when they sign in. The School Admin can sign in only to pay the invoice or download all the school’s data. Parents’ messages stop; payment links already sent still work.",
  CLOSED: "Nobody can sign in. The admin can still download all the school’s data until the keep period ends; then it is removed with the Owner’s approval.",
} as const;
const ADMIN_TONE = { Active: "ok", Invited: "info", Expired: "bad", Disabled: "neutral" } as const;
const ADMIN_LABEL = { Active: "Active", Invited: "Invited", Expired: "Invite expired", Disabled: "Disabled" } as const;
const STATUS_ICON = { ACTIVE: [CirclePlay, "ok"], TRIAL: [Flag, "info"], SUSPENDED: [CirclePause, "warn"], CLOSED: [Archive, "neutral"] } as const;
const ago = (d: Date, now: Date) => {
  const days = Math.floor((istDay(now).getTime() - istDay(d).getTime()) / 86_400_000);
  return days <= 0 ? `Today, ${formatTime(d)}` : days === 1 ? `Yesterday, ${formatTime(d)}` : `${formatDate(d)}, ${formatTime(d)}`;
};
const rupees = (p: bigint) => Number(p) / 100;

type SP = Promise<{ act?: string }>;

export default async function SchoolPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const c = await requireConsole();
  const { id } = await params;
  const { act } = await searchParams;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const now = new Date();
  const today = istDay(now);
  const data = await withConsole(async (tx) => {
    const card = await tx.consoleSchool.findUnique({ where: { id } });
    if (!card) return null;
    const [sub, invoices, history, notes, invites, log, list] = await Promise.all([
      tx.subscription.findUnique({ where: { forSchoolId: id } }),
      tx.platformInvoice.findMany({ where: { forSchoolId: id }, orderBy: [{ issuedOn: "desc" }, { number: "desc" }], take: 20 }),
      tx.schoolStatusChange.findMany({ where: { forSchoolId: id }, orderBy: { createdAt: "desc" }, take: 20 }),
      tx.schoolNote.findMany({ where: { forSchoolId: id, archivedAt: null }, orderBy: { createdAt: "desc" }, take: 20 }),
      tx.schoolInvite.findMany({ where: { forSchoolId: id }, orderBy: { sentAt: "desc" } }),
      tx.consoleActivityEntry.findMany({ where: { forSchoolId: id }, orderBy: { at: "desc" }, take: 8 }),
      priceList(tx, today),
    ]);
    const groupSize = card.groupId ? await tx.consoleSchool.count({ where: { groupId: card.groupId, status: { in: ["TRIAL", "ACTIVE", "SUSPENDED"] } } }) : 0;
    return { card, sub, invoices, history, notes, invites, log, list, groupSize };
  });
  if (!data) notFound();
  const { card: s, sub, invoices, history, notes, invites, log, list } = data;
  const admins = await schoolAdmins(id);

  // Each admin's state, with the invite the console sent them.
  const people = admins.map((a) => {
    const inv = invites.find((i) => i.userLoginId === a.userLoginId && !i.replacedAt && !i.cancelledAt) ?? null;
    const st = inv ? inviteState(inv, now) : null;
    const status: keyof typeof ADMIN_TONE = a.status === "DISABLED" ? "Disabled" : a.status === "ACTIVE" && a.hasPassword ? "Active" : st === "expired" ? "Expired" : a.status === "ACTIVE" ? "Active" : "Invited";
    const note = status === "Active"
      ? a.lastSignInAt ? `Last signed in ${ago(a.lastSignInAt, now)}` : "Has not signed in yet"
      : status === "Disabled" ? "Cannot sign in to this school"
      : inv ? `${inv.kind === "RESET" ? "Reset link" : "Invite"} sent ${ago(inv.sentAt, now)}${inv.sentByName ? ` by ${inv.sentByName}` : ""} · ${st === "expired" ? "link expired" : st === "opened" ? "opened, not finished" : `link works until ${formatDate(inv.expiresAt)}`}`
      : "No invite on record";
    return { ...a, status, note, invite: inv && (st === "sent" || st === "opened" || st === "expired") ? inv : null };
  });
  const actives = people.filter((p) => p.status === "Active");
  const primary = actives.find((p) => p.roleKey === "school-admin") ?? actives[0] ?? people.find((p) => p.status !== "Disabled") ?? null;
  const live = s.status !== "CLOSED";
  const open = s.status === "ACTIVE" || s.status === "TRIAL";
  const steps = (Array.isArray(s.setupSteps) ? s.setupSteps : []) as { key: string; label: string; done: boolean; optional?: boolean; skipped?: boolean }[];
  const stuckDays = s.setupChangedAt && s.adminSignedIn && s.setupDone < s.setupTotal ? Math.floor((now.getTime() - s.setupChangedAt.getTime()) / 86_400_000) : 0;
  const stuck = stuckDays >= 7;
  const trialLeft = s.trialEndsOn ? Math.round((s.trialEndsOn.getTime() - today.getTime()) / 86_400_000) : null;
  const firstUnpaid = invoices.filter((i) => i.status === "UNPAID" && i.sentAt).sort((a, b) => a.dueOn.getTime() - b.dueOn.getTime())[0] ?? null;
  const graceLeft = sub?.status === "GRACE" && firstUnpaid ? Math.max(0, Math.round((addDays(firstUnpaid.dueOn, GRACE_DAYS).getTime() - today.getTime()) / 86_400_000)) : null;
  const founding = sub?.discountReason === "founding";
  const optional = ["library-management", "inventory-management", "hostel-management"].filter((k) => s.modulesOn.includes(k));
  const optionalWords = optional.length ? `${optional.map((k) => ({ "library-management": "Library", "inventory-management": "Inventory", "hostel-management": "Hostel" })[k]).join(", ")} on` : "Only the core modules";
  const base = `/console/schools/${id}`;
  const to = (a: string) => `${base}?act=${a}`;
  const lastClosed = history.find((h) => h.toStatus === "CLOSED");
  const lastSuspended = history.find((h) => h.toStatus === "SUSPENDED");
  const prices: Prices = { essential: rupees(list.essential?.pricePaise ?? 0n), complete: rupees(list.complete?.pricePaise ?? 0n), hostel: rupees(list.hostel?.pricePaise ?? 0n), min: list.essential?.minStudents ?? 100 };

  // Buttons at the top, in the prototype's order, only those the role can use.
  const head: React.ReactNode[] = [];
  if (s.status === "TRIAL" && c.can("activate")) head.push(<Link key="act" href={to("activate")} scroll={false} className={buttonClass("primary", "md", "flex-1 lg:flex-none")}><CirclePlay size={17} aria-hidden="true" />Activate</Link>);
  if (s.status === "SUSPENDED" && c.can("activate")) head.push(<Link key="re" href={to("reactivate")} scroll={false} className={buttonClass("primary", "md", "flex-1 lg:flex-none")}><CirclePlay size={17} aria-hidden="true" />Reactivate</Link>);
  if (s.status === "CLOSED" && c.can("status")) head.push(<Link key="reo" href={to("reopen")} scroll={false} className={buttonClass("primary", "md", "flex-1 lg:flex-none")}><ArchiveRestore size={17} aria-hidden="true" />Reopen</Link>);
  if (s.status === "ACTIVE" && c.can("invoice")) head.push(<Link key="inv" href={to("invoice")} scroll={false} className={buttonClass(head.length ? "secondary" : "primary", "md", "flex-1 lg:flex-none")}><Send size={17} aria-hidden="true" />Send invoice</Link>);
  const menu: React.ReactNode[] = [
    <MenuLink key="note" href="#sa-note" icon={<StickyNote size={17} />}>Add a note</MenuLink>,
    ...(c.can("group") && live ? [<MenuLink key="group" href={to("group")} icon={<Network size={17} />}>Set the school’s Group</MenuLink>] : []),
    ...(c.can("plan") && sub && live ? [<MenuLink key="plan" href={to("plan")} icon={<Layers size={17} />}>Change plan</MenuLink>] : []),
    ...(c.can("plan") && !sub && open ? [<MenuLink key="choose" href={to("choose")} icon={<Layers size={17} />}>Choose plan</MenuLink>] : []),
    ...(c.can("invoice") && live && s.status !== "ACTIVE" ? [<MenuLink key="inv" href={to("invoice")} icon={<Send size={17} />}>Send an invoice</MenuLink>] : []),
    ...(c.can("discount") && sub && !founding ? [<MenuLink key="found" href={to("founding")} icon={<Award size={17} />}>Mark as founding school</MenuLink>] : []),
    ...(c.can("discount") && sub && !founding && s.groupId ? [<MenuLink key="gd" href={to("groupdisc")} icon={<BadgePercent size={17} />}>Apply group discount</MenuLink>] : []),
    ...(c.can("status") && open ? [<MenuLink key="sus" href={to("suspend")} tone="bad" icon={<CirclePause size={17} />}>Suspend school</MenuLink>] : []),
    ...(c.can("status") && (s.status === "ACTIVE" || s.status === "SUSPENDED") ? [<MenuLink key="close" href={to("close")} tone="bad" icon={<Archive size={17} />}>Close school</MenuLink>] : []),
  ];

  const banner = s.status === "TRIAL" && trialLeft !== null
    ? { tone: "info" as const, icon: undefined, title: `Trial: ${trialLeft > 0 ? `${trialLeft} ${trialLeft === 1 ? "day" : "days"} left` : "ends today"}, ends ${formatDate(s.trialEndsOn!)}.`, body: "Everything in Essential, 500 message credits. The school picks its plan when it pays; unpaid, it becomes Suspended by itself and its data is kept 90 days." }
    : s.status === "SUSPENDED" ? { tone: "warn" as const, icon: undefined, title: `Suspended since ${formatDate(s.statusSince)}${lastSuspended ? `: ${lastSuspended.reason.replace(/\.$/, "")}` : ""}.`, body: `Staff cannot sign in; the School Admin can only pay or download the data.${firstUnpaid ? ` Paying invoice ${firstUnpaid.number} reactivates the school at once.` : ""}${s.keepUntil ? ` Data kept until ${formatDate(s.keepUntil)}.` : ""}` }
    : s.status === "CLOSED" ? { tone: "info" as const, icon: Archive, title: `Closed on ${formatDate(lastClosed?.createdAt ?? s.statusSince)}.`, body: `Nobody can sign in. The admin can download all of the school’s data${s.keepUntil ? ` until ${formatDate(s.keepUntil)}` : ""}; then it is removed with the Owner’s approval.` }
    : graceLeft !== null ? { tone: "warn" as const, icon: undefined, title: `Renewal unpaid: ${graceLeft} ${graceLeft === 1 ? "day" : "days"} of grace left.`, body: `Everything still works, with a banner for the School Admin and Principal only. If unpaid on ${formatDate(addDays(firstUnpaid!.dueOn, GRACE_DAYS))}, the school becomes Suspended by itself.` }
    : null;

  const tiles = [
    { k: "Students", v: s.activeStudents ? s.activeStudents.toLocaleString("en-IN") : "—", sub: s.activeStudents ? "Active today" : s.approxStudents ? `About ${s.approxStudents.toLocaleString("en-IN")} expected` : "Not imported yet", icon: GraduationCap, tone: null },
    { k: "Staff logins", v: s.staffLogins.toLocaleString("en-IN"), sub: "Made by the school", icon: KeyRound, tone: null },
    { k: "Last sign-in", v: s.lastActivityAt ? formatDate(s.lastActivityAt) : "Nobody yet", sub: s.lastActivityAt ? formatTime(s.lastActivityAt) : "By anyone in the school", icon: LogIn, tone: null },
    { k: "Messages", v: s.messagesThisMonth.toLocaleString("en-IN"), sub: "Sent this month", icon: MessageCircle, tone: null },
    { k: "Modules on", v: `${s.modulesOn.length}`, sub: optionalWords, icon: LayoutGrid, tone: null },
    { k: "Setup", v: `${s.setupDone} of ${s.setupTotal}`, sub: s.setupDone >= s.setupTotal ? "Done" : stuck ? `No change for ${stuckDays} days` : "In progress", icon: ListChecks, tone: s.setupDone >= s.setupTotal ? "ok" as const : stuck ? "warn" as const : null },
  ];

  function renewal(x: NonNullable<typeof sub>) {
    const pk = x.nextPlanKey ?? x.planKey;
    const n = Math.max(s.activeStudents, list[pk]?.minStudents ?? 100);
    const q = quoteYear(list, { planKey: pk, students: n, hostel: x.nextHostel ?? x.hostel, discountPercent: x.discountPercent, discountReason: x.discountReason, founding, pricePerStudent: founding ? x.pricePerStudentPaise : undefined, fraction: x.payIn === "HALVES" ? { num: 6, den: 12 } : undefined });
    return { label: `Renewal: ${PLAN_LABEL[pk]}, ${n.toLocaleString("en-IN")} students${x.discountPercent ? `, discount ${x.discountPercent}%` : ""}`, amount: rupees(q.taxable) };
  }
  const sheet = await Sheets();
  async function Sheets() {
    if (!act) return null;
    const close = base;
    const inv = await invoiceSheet(act, close, c);
    if (inv) return inv;
    const [kind, arg] = act.split(":");
    const person = arg ? people.find((p) => p.userLoginId === arg || p.invite?.id === arg) : undefined;
    switch (kind) {
      case "admin":
        return c.can("invite") && live ? <AddAdminSheet closeHref={close} schoolId={id} schoolName={s.name} needsCheck={Boolean(s.firstAdminSignInAt)} action={addAdminAction} /> : null;
      case "resend":
        return c.can("invite") && person?.invite ? (
          <ActSheet title="Send a new invite?" sub={s.name} closeHref={close} action={resendInviteAction} submitLabel={`Send new invite to ${person.name}`} hidden={{ schoolId: id, inviteId: person.invite.id }}>
            <p>A new link goes to <b className="text-ink">{person.name}</b>, +91 {maskMobile(person.invite.phone)}, on {person.invite.channels.map((x) => (x === "whatsapp" ? "WhatsApp" : x === "sms" ? "SMS" : "email")).join(" and ")}.</p>
            <p>The old link stops working. The new one works for 3 days and needs the code sent to their mobile.</p>
          </ActSheet>
        ) : null;
      case "cancel":
        return c.can("invite") && person?.invite ? (
          <ActSheet title="Cancel this invite?" sub={s.name} closeHref={close} action={cancelInviteAction} submitLabel="Cancel invite" danger hidden={{ schoolId: id, inviteId: person.invite.id }} reason={{ placeholder: "Wrong number; the school sent the right one." }}>
            <p>The link to <b className="text-ink">{person.name}</b>, +91 {maskMobile(person.invite.phone)}, stops working, and the login is removed before anyone used it.</p>
          </ActSheet>
        ) : null;
      case "reset":
        return c.can("reset") && person && person.status === "Active" ? <ResetSheet closeHref={close} schoolId={id} schoolName={s.name} userLoginId={person.userLoginId} adminName={person.name} phoneMasked={maskMobile(person.phone)} hasEmail={Boolean(person.email)} action={resetAdminAction} /> : null;
      case "phone":
        return c.can("reset") && person && person.status === "Active" ? <ChangeMobileSheet closeHref={close} schoolId={id} schoolName={s.name} userLoginId={person.userLoginId} adminName={person.name} phoneMasked={maskMobile(person.phone)} action={changeMobileAction} /> : null;
      case "disable": {
        if (!c.can("disable") || !person || person.status === "Disabled") return null;
        if (person.status === "Active" && actives.length === 1) {
          const waiting = people.find((p) => p.status === "Invited");
          return (
            <UrlSheet title="This admin cannot be disabled" sub={s.name} closeHref={close}
              footer={<div className="flex gap-2 justify-end"><CloseSheetButton>Close</CloseSheetButton>{c.can("invite") && <Link href={to("admin")} scroll={false} className={buttonClass("primary")}><UserPlus size={17} aria-hidden="true" />Add another School Admin</Link>}</div>}>
              <div className="flex flex-col gap-4">
                <Banner tone="warn" title={`${s.name} needs at least one active admin.`}>Add another admin first.</Banner>
                <p className="text-[14px] text-ink2 leading-relaxed">{person.name} is the school’s only active School Admin. Without one, nobody could reach the school’s Settings. {waiting ? `${waiting.name}’s invite is still waiting; once they sign in, you can disable ${person.name}.` : `Once the new admin signs in, you can disable ${person.name}.`}</p>
              </div>
            </UrlSheet>
          );
        }
        return (
          <ActSheet title={`Disable ${person.name}?`} sub={s.name} closeHref={close} action={disableAdminAction} submitLabel={`Disable ${person.name}`} danger hidden={{ schoolId: id, userLoginId: person.userLoginId }} reason={{ placeholder: "The office head left the school. Request on letterhead dated 8 Oct." }}>
            <p>They cannot sign in any more. Their history stays. The school’s other admins get a message, and this goes in the Activity Log.</p>
          </ActSheet>
        );
      }
      case "call":
        if (!primary) return null;
        return (
          <CallSheet closeHref={close} schoolId={id} schoolName={s.name} adminName={primary.name} phone={tenDigits(primary.phone) ? showMobile(tenDigits(primary.phone)!) : null} action={noteAction}
            lines={[
              <><ListChecks size={18} className="text-ink3 shrink-0 mt-0.5" aria-hidden="true" /><span>Setup <b className="font-semibold">{s.setupDone} of {s.setupTotal}</b>{nextStep(s.setupSteps) && <> · next step: {nextStep(s.setupSteps)}</>}</span></>,
              ...(stuck ? [<><Hourglass size={18} className="text-warn shrink-0 mt-0.5" aria-hidden="true" /><span>No change for <b className="font-semibold">{stuckDays} days</b></span></>] : []),
              ...(notes[0] ? [<><StickyNote size={18} className="text-ink3 shrink-0 mt-0.5" aria-hidden="true" /><span>Last team note: “{notes[0].text}” <span className="text-ink3">· {notes[0].byName}</span></span></>] : []),
            ]} />
        );
      case "activate":
        if (!c.can("activate") || s.status !== "TRIAL") return null;
        if (sub) return <ActSheet title={`Activate ${s.name}?`} sub="Trial → Active" closeHref={close} action={activateAction} submitLabel="Activate school" hidden={{ schoolId: id, hasPlan: "1" }} reason={{ placeholder: "Paid the first invoice by bank transfer, UTR noted.", label: "Reason" }}><p>The trial ends today and the school becomes <b className="text-ink">Active</b> on {PLAN_LABEL[sub.planKey]}. Its first invoice is already made.</p></ActSheet>;
        if (!c.can("plan")) return null;
        return <FirstPlanSheet closeHref={close} schoolId={id} schoolName={s.name} prices={prices} students={Math.max(s.activeStudents, s.approxStudents ?? 0, prices.min)} groupPercent={s.groupId ? groupDiscountFor(data!.groupSize) : 0} activate hostelStart={s.modulesOn.includes("hostel-management")} action={activateAction} />;
      case "choose":
        return c.can("plan") && !sub && open ? <FirstPlanSheet closeHref={close} schoolId={id} schoolName={s.name} prices={prices} students={Math.max(s.activeStudents, s.approxStudents ?? 0, prices.min)} groupPercent={s.groupId ? groupDiscountFor(data!.groupSize) : 0} activate={false} hostelStart={s.modulesOn.includes("hostel-management")} action={choosePlanAction} /> : null;
      case "reactivate":
        return c.can("activate") && s.status === "SUSPENDED" ? (
          <ActSheet title={`Reactivate ${s.name}?`} sub="Suspended → Active" closeHref={close} action={statusAction} submitLabel="Reactivate school" hidden={{ schoolId: id, move: "reactivate" }} reason={{ placeholder: "The Owner agreed to wait for the payment until 20 Oct." }}>
            <p>Everyone can sign in again and everything comes back unchanged. Parents’ messages and payment links start again.</p>
            <p>Paying the overdue invoice does this by itself; use this only when the Owner agrees to wait for the payment.</p>
          </ActSheet>
        ) : null;
      case "reopen":
        return c.can("status") && s.status === "CLOSED" ? (
          <ActSheet title={`Reopen ${s.name}?`} sub={s.keepUntil ? `Within the keep period, until ${formatDate(s.keepUntil)}` : "Closed → Active"} closeHref={close} action={statusAction} submitLabel="Reopen school" hidden={{ schoolId: id, move: "reopen" }} reason={{ placeholder: "The trust decided to keep the school open. Letter dated 8 Oct." }}>
            <p>The school’s data is still kept, so everything comes back as it was on the day it closed.</p>
          </ActSheet>
        ) : null;
      case "suspend":
        return c.can("status") && open ? (
          <ActSheet title={`Suspend ${s.name}?`} sub={`${MOVES.suspend.from.includes(s.status) ? (s.status === "TRIAL" ? "Trial" : "Active") : ""} → Suspended`} closeHref={close} action={statusAction} submitLabel="Suspend school" danger hidden={{ schoolId: id, move: "suspend" }} reason={{ placeholder: "Asked by the school management in writing, 8 Oct." }}>
            <p>Staff see “Your School OS access is paused. Please contact your school office.” The School Admin can sign in only to pay or download all the school’s data.</p>
            <p>Parents’ messages and payment links stop; links already sent still work, so no parent’s payment is lost. The school’s admins get a message first.</p>
          </ActSheet>
        ) : null;
      case "close":
        return c.can("status") && (s.status === "ACTIVE" || s.status === "SUSPENDED") ? (
          <ActSheet title={`Close ${s.name}?`} sub={`${s.status === "ACTIVE" ? "Active" : "Suspended"} → Closed · Owner only`} closeHref={close} action={statusAction} submitLabel="Close school" danger typeName={s.name} hidden={{ schoolId: id, move: "close" }} reason={{ placeholder: "The trust is closing the school. Request on letterhead dated 8 Oct." }}>
            <p>Nobody can sign in. The admin can still download all of the school’s data for 90 days, until {formatDate(addDays(today, 90))}; then it is removed with the Owner’s approval.</p>
            <p>The school’s admins get a message first. Data is never deleted from this console.</p>
          </ActSheet>
        ) : null;
      case "group": {
        if (!c.can("group") || !live) return null;
        const groups = await listGroups();
        return <GroupSheet closeHref={close} schoolId={id} current={s.groupId} groups={groups.map((g) => ({ value: g.id, label: `${g.name} (${g.schools} ${g.schools === 1 ? "school" : "schools"})` }))} action={groupAction} />;
      }
      case "edit":
        return c.can("edit") && live && !s.firstAdminSignInAt ? (
          <EditSchoolSheet closeHref={close} schoolId={id} action={editDetailsAction}
            s={{ name: s.name, address: s.address, city: s.city, state: s.state, board: s.board, schoolType: s.schoolType, phone: s.phone, email: s.email, approxStudents: s.approxStudents }}
            states={STATES.map((x) => ({ value: x, label: x }))} boards={BOARDS.map((x) => ({ value: x, label: x }))} types={SCHOOL_TYPES.map((t) => ({ value: t.value, label: t.value }))} />
        ) : null;
      case "plan":
        if (!c.can("plan") || !sub || !live) return null;
        return <ChangePlanSheet closeHref={close} schoolId={id} schoolName={s.name} paidFor={sub.studentsPaidFor} prices={prices} current={{ plan: sub.planKey, hostel: sub.hostel }}
          founding={founding && sub.priceLockedUntil ? { lockedUntil: formatDate(sub.priceLockedUntil) } : null} monthsLeft={monthsLeft(today, sub.renewOn)} renewOn={formatDate(sub.renewOn)}
          perStudent={rupees(sub.pricePerStudentPaise)} discountPercent={sub.discountPercent} action={changePlanAction} />;
      case "invoice":
        if (!c.can("invoice") || !live) return null;
        return <NewInvoiceSheet closeHref={close} schoolId={id} packs={CREDIT_PACKS.map((p) => ({ credits: p.credits, rupees: rupees(p.paise) }))} action={sendNewInvoiceAction}
          schools={[{ value: id, label: s.name, admin: primary?.name ?? "the School Admin", year: sub ? renewal(sub) : null }]} />;
      case "founding":
        return c.can("discount") && sub && !founding ? (
          <ActSheet title={`Mark ${s.name} as a founding school?`} sub="Owner only · the first 20 paying schools" closeHref={close} action={foundingAction} submitLabel="Mark as founding school" hidden={{ schoolId: id }}>
            <p>The Essential price is locked for 3 years from the school’s start date, and every new module is switched on free as it is built.</p>
          </ActSheet>
        ) : null;
      case "groupdisc":
        return c.can("discount") && sub && !founding && s.groupId ? (
          <ActSheet title="Apply the group discount?" sub={`${s.name} · ${s.groupName}`} closeHref={close} action={groupDiscountAction} submitLabel="Apply group discount" hidden={{ schoolId: id }}>
            <p>{s.groupName} has {data!.groupSize} schools: {groupDiscountFor(data!.groupSize) ? `${groupDiscountFor(data!.groupSize)}% off` : "no discount yet (3 or more schools needed)"}. It applies from the next invoice.</p>
          </ActSheet>
        ) : null;
      default:
        return null;
    }
  }

  return (
    <div>
      <BackLink label="Schools" extra={s.city ?? undefined} />
      <Card>
        <div className="h-16 md:h-20 rounded-t-2xl bg-gradient-to-r from-brand to-brand/60 relative"><div className="absolute inset-0 rounded-t-2xl dotgrid opacity-50" aria-hidden="true" /></div>
        <div className="relative px-4 md:px-6 pb-5 flex flex-col lg:flex-row lg:items-end gap-4">
          <div className="flex flex-col md:flex-row md:items-end gap-3 md:gap-4 min-w-0 flex-1">
            <div className="self-start rounded-[20px] p-1 bg-surface shrink-0 -mt-10 md:-mt-12"><SchoolLogo name={s.name} size={84} /></div>
            <div className="min-w-0 md:pt-3">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-display text-[24px] md:text-[28px] font-semibold tracking-tight leading-tight">{s.name}</h1>
                <StatusPill status={s.status} />
                {founding && <Pill tone="brand"><Award size={13} aria-hidden="true" />Founding school</Pill>}
              </div>
              <p className="text-[13.5px] text-ink3 mt-0.5"><span className="font-mono text-[12.5px] text-ink2 select-all">{s.code}</span> · {s.city}{s.board ? ` · ${s.board}` : ""}{s.schoolType ? ` · ${s.schoolType}` : ""}{s.groupName ? ` · ${s.groupName}` : ""}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2 relative">
            {head}
            <MoreMenu label="More actions for this school">{menu}</MoreMenu>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 border-t border-line">
          {tiles.map((m, i) => (
            <div key={m.k} className={cx("px-4 md:px-5 py-3.5 border-line min-w-0", "border-b xl:border-b-0", i % 2 === 0 && "border-r", "md:border-r", i === 5 && "xl:border-r-0")}>
              <p className="text-[12px] text-ink3 font-semibold flex items-center gap-1.5"><m.icon size={14} aria-hidden="true" />{m.k}</p>
              <p className={cx("font-semibold text-[17px] tnum mt-0.5 truncate", m.tone && TONE_TEXT[m.tone])}>{m.v}</p>
              <p className="text-[12px] text-ink3 truncate">{m.sub}</p>
            </div>
          ))}
        </div>
      </Card>

      {banner && <Banner tone={banner.tone} icon={banner.icon} title={banner.title} className="mt-5">{banner.body}</Banner>}

      <Split side={380} className="mt-5">
        <Col>
          <Card>
            <CardHeader title="School Admin logins" description={`${actives.length} active · DREAM TEAM never sees or sets a password`} icon={KeyRound}
              action={c.can("invite") && live ? <Link href={to("admin")} scroll={false} className={buttonClass("soft", "sm")}><UserPlus size={15} aria-hidden="true" />Add<span className="hidden sm:inline">&nbsp;another School Admin</span></Link> : null} />
            <ul>
              {people.map((a) => {
                const last = a.status === "Active" && actives.length === 1;
                return (
                  <li key={a.userLoginId} className="flex flex-col gap-2.5 px-5 py-3.5 border-t border-line/70">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <Avatar name={a.name} size={40} />
                      <div className="min-w-0">
                        <p className="font-semibold text-[14.5px] leading-tight flex items-center gap-2 flex-wrap">{a.name}<Pill tone={ADMIN_TONE[a.status]} className="!h-5 !text-[11px]">{ADMIN_LABEL[a.status]}</Pill></p>
                        <p className="text-[12.5px] text-ink3 tnum mt-0.5 break-words">{a.roleKey === "principal" ? "Principal / Owner" : "School Admin"} · +91 {maskMobile(a.phone)}{a.email ? ` · ${a.email}` : ""}</p>
                        <p className="text-[12.5px] text-ink3">{a.note}</p>
                        {last && live && c.can("disable") && <p className="text-[12px] text-ink3 flex items-center gap-1 mt-0.5"><Lock size={12} className="shrink-0" aria-hidden="true" />The last active admin cannot be disabled</p>}
                      </div>
                    </div>
                    {live && (
                      <div className="flex gap-2 flex-wrap pl-[52px]">
                        {a.invite && a.status !== "Active" && c.can("invite") && <>
                          <Link href={to(`resend:${a.userLoginId}`)} scroll={false} className={buttonClass("secondary", "sm")}><Send size={15} aria-hidden="true" />{a.status === "Expired" ? "Send new invite" : "Resend invite"}</Link>
                          <Link href={to(`cancel:${a.userLoginId}`)} scroll={false} className={buttonClass("ghost", "sm")}>Cancel invite</Link>
                        </>}
                        {a.status === "Active" && c.can("reset") && <Link href={to(`reset:${a.userLoginId}`)} scroll={false} className={buttonClass("secondary", "sm")}><KeyRound size={15} aria-hidden="true" />Reset login</Link>}
                        {a.status === "Active" && c.can("disable") && <Link href={to(`disable:${a.userLoginId}`)} scroll={false} className={buttonClass("ghost", "sm")}>{last ? <Lock size={15} aria-hidden="true" /> : <UserX size={15} aria-hidden="true" />}Disable</Link>}
                        {a.status === "Active" && c.can("reset") && <Link href={to(`phone:${a.userLoginId}`)} scroll={false} className={buttonClass("ghost", "sm")}><Smartphone size={15} aria-hidden="true" />Change number</Link>}
                      </div>
                    )}
                  </li>
                );
              })}
              {people.length === 0 && <li className="border-t border-line/70"><Empty icon={UserX} title="No School Admin" body="Add a School Admin so the school can sign in and set itself up." action={c.can("invite") && live ? <Link href={to("admin")} scroll={false} className={buttonClass("primary")}><UserPlus size={17} aria-hidden="true" />Add a School Admin</Link> : undefined} /></li>}
            </ul>
            <p className="px-5 py-3 border-t border-line/70 text-[12.5px] text-ink3">Other logins (Principal, Accountant, Teachers and the rest) belong to the school’s own Settings, Users & Permissions. The console cannot see or change them.</p>
          </Card>

          <Card>
            <CardHeader title="Setup progress" description="The same checklist the school sees on its Dashboard" icon={ListChecks} action={<Pill tone={s.setupDone >= s.setupTotal ? "ok" : stuck ? "warn" : "info"}>{s.setupDone} of {s.setupTotal}</Pill>} />
            <div className="px-5 pb-3"><Progress value={(s.setupDone * 100) / Math.max(1, s.setupTotal)} tone={s.setupDone >= s.setupTotal ? "ok" : stuck ? "warn" : "brand"} /></div>
            {stuck && (
              <div className="mx-5 mb-3 rounded-xl bg-warn/12 px-3.5 py-3 flex flex-col sm:flex-row sm:items-center gap-2.5 text-[13.5px]">
                <p className="flex-1 text-ink2"><b className="font-semibold text-ink">No change for {stuckDays} days.</b>{nextStep(s.setupSteps) ? ` Stuck at ${nextStep(s.setupSteps)}.` : ""}</p>
                {primary && <Link href={to("call")} scroll={false} className={buttonClass("secondary", "sm")}><Phone size={15} aria-hidden="true" />Call the admin</Link>}
              </div>
            )}
            {!s.adminSignedIn && <p className="mx-5 mb-3 rounded-xl bg-sunken px-3.5 py-3 text-[13.5px] text-ink2">Setup starts when {primary?.name ?? "the School Admin"} signs in for the first time.</p>}
            {steps.length > 0 && (
              <ol>
                {steps.map((st, i) => {
                  const ok = st.done || st.skipped;
                  return (
                    <li key={st.key} className="flex items-center gap-3 px-5 py-2.5 border-t border-line/70">
                      <span className={cx("w-7 h-7 rounded-full grid place-items-center shrink-0 text-[12px] font-bold tnum", ok ? "bg-ok/15 text-ok" : "bg-sunken text-ink3")}>{ok ? <Check size={15} strokeWidth={3} aria-label="Done" /> : i + 1}</span>
                      <p className={cx("flex-1 min-w-0 text-[14px]", ok ? "text-ink2" : "font-semibold")}>{st.label}{st.optional && <span className="text-ink3 font-normal"> (optional)</span>}</p>
                      <span className={cx("text-[12.5px] font-semibold shrink-0", ok ? "text-ok" : "text-ink3")}>{st.skipped ? "Skipped" : ok ? "Done" : "Not yet"}</span>
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>

          <Card>
            <CardHeader title="Plan and billing" description="What DREAM TEAM charges this school. Prices exclude 18% GST." icon={ReceiptIndianRupee}
              action={c.can("plan") && sub && live ? <Link href={to("plan")} scroll={false} className={buttonClass("soft", "sm")}><Layers size={15} aria-hidden="true" />Change plan</Link> : c.can("plan") && !sub && open ? <Link href={to("choose")} scroll={false} className={buttonClass("soft", "sm")}><Layers size={15} aria-hidden="true" />Choose plan</Link> : null} />
            {sub ? (
              <DL rows={[
                ["Plan", founding ? "Essential, every module free as it is built" : `${PLAN_LABEL[sub.planKey]}${sub.nextPlanKey ? ` (${PLAN_LABEL[sub.nextPlanKey]} from ${formatDate(sub.renewOn)})` : ""}`],
                ["Add-ons", sub.hostel && list.hostel ? `Hostel (${formatRupees(list.hostel.pricePaise)} a year)` : "None"],
                ["Students paid for", <span key="n" className="tnum">{sub.studentsPaidFor.toLocaleString("en-IN")} paid · <span className={cx(s.activeStudents > sub.studentsPaidFor && "text-warn font-semibold")}>{s.activeStudents.toLocaleString("en-IN")} active today</span></span>],
                ["Price per student", `${formatRupees(sub.pricePerStudentPaise)} a year${sub.studentsPaidFor > 1000 ? `, ${formatRupees(sub.pricePerStudentPaise / 2n)} above 1,000` : ""}${sub.studentsPaidFor <= 100 ? " (minimum 100 students)" : ""}`],
                ["Discount", founding ? `Founding school ${sub.foundingNumber ?? ""} · price locked until ${sub.priceLockedUntil ? formatDate(sub.priceLockedUntil) : "—"}` : sub.discountPercent ? `Group ${sub.discountPercent}%${s.groupName ? ` (${s.groupName})` : ""}` : "None"],
                ["Renewal date", `${formatDate(sub.renewOn)} · ${sub.payIn === "HALVES" ? "paid in two halves" : "paid yearly"}`],
                ["Status", <Pill key="st" tone={SUB_TONE[sub.status]}>{SUB_STATUS_LABEL[sub.status]}{graceLeft !== null ? `, ${graceLeft} days left` : ""}</Pill>],
                ["Message credits left", `${s.creditsWhatsapp.toLocaleString("en-IN")} WhatsApp · ${s.creditsSms.toLocaleString("en-IN")} SMS`],
              ]} />
            ) : s.status === "TRIAL" ? (
              <DL rows={[["Plan", "Trial: everything in Essential"], ["Trial ends", s.trialEndsOn ? `${formatDate(s.trialEndsOn)}${trialLeft !== null && trialLeft >= 0 ? ` · ${trialLeft} days left` : ""}` : "—"], ["Message credits left", `${s.creditsWhatsapp.toLocaleString("en-IN")} of 500`], ["After the trial", "The school picks Essential or Complete when it pays"]]} />
            ) : (
              <p className="px-5 pb-4 text-[14px] text-ink2">{s.status === "CLOSED" ? `The subscription ended when the school closed. Its invoices are kept below.` : "No plan chosen yet."}</p>
            )}
            {invoices.length > 0 && (
              <>
                <p className="eyebrow text-ink3 px-5 pt-1 pb-2">Invoices</p>
                <ul>{invoices.map((i) => <InvoiceRow key={i.id} i={i} base={base} today={today} can={{ invoice: c.can("invoice"), markPaid: c.can("markPaid"), approve: c.can("approve") }} />)}</ul>
              </>
            )}
            {c.can("invoice") && live && (
              <div className="px-5 py-3.5 border-t border-line/70 flex gap-2 flex-wrap">
                <Link href={to("invoice")} scroll={false} className={buttonClass("secondary", "sm")}><Send size={15} aria-hidden="true" />Send an invoice</Link>
                {c.can("group") && <Link href={to("group")} scroll={false} className={buttonClass("ghost", "sm")}><Network size={15} aria-hidden="true" />Set Group</Link>}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader title="Status history" description="Every change, with date, who and why" icon={History} />
            <div className="px-5 pb-1">
              {history.length === 0 ? <p className="pb-4 text-[13.5px] text-ink3">No changes yet.</p> : (
                <Timeline items={history.map((h) => {
                  const [Ic, tone] = STATUS_ICON[h.toStatus];
                  return { icon: Ic, tone, when: `${formatDate(h.createdAt)}, ${formatTime(h.createdAt)}`, what: <>{h.fromStatus ? <>{STATUS_LABEL_OF(h.fromStatus)} → </> : "Added as "}<b>{STATUS_LABEL_OF(h.toStatus)}</b> by {h.byName}: “{h.reason}”</> };
                })} />
              )}
            </div>
          </Card>
        </Col>

        <Col>
          <Card>
            <CardHeader title="School details" icon={Building2}
              action={!s.firstAdminSignInAt && c.can("edit") && live ? <Link href={to("edit")} scroll={false} className={buttonClass("ghost", "sm")}><Pencil size={15} aria-hidden="true" />Edit</Link> : null} />
            <DL rows={[["Name", s.name], ["Address", s.address || s.city || "—"], ["City", s.city ?? "—"], ["State", s.state ?? "—"], ["Board", s.board ?? "—"], ["School type", s.schoolType ?? "—"],
              ["Phone", <span key="ph" className="tnum">{s.phone ?? "—"}</span>], ["Email", s.email || "—"], ["Campuses", String(s.campuses)], ["Group", s.groupName || "None"]]} />
            <p className="mx-5 mb-5 -mt-1 rounded-xl bg-sunken p-3 text-[12.5px] text-ink2 flex gap-2">
              {s.firstAdminSignInAt
                ? <><Lock size={14} className="shrink-0 mt-0.5 text-ink3" aria-hidden="true" /><span>Read-only. {primary?.name ?? "The School Admin"} signed in on {formatDate(s.firstAdminSignInAt)}, so the school now edits these in Settings, School Profile.</span></>
                : <><Pencil size={14} className="shrink-0 mt-0.5 text-ink3" aria-hidden="true" /><span>Editable here until the School Admin first signs in. After that, the school edits its own details.</span></>}
            </p>
          </Card>

          <Card>
            <CardHeader title="Usage" description="Counts only. No names, no money amounts." icon={ChartColumn} />
            <ul className="px-2 pb-2">
              <Row icon={GraduationCap} title="Students" sub="Active today" right={<b className="font-semibold tnum text-[15px]">{s.activeStudents ? s.activeStudents.toLocaleString("en-IN") : "—"}</b>} />
              <Row icon={KeyRound} title="Staff logins" sub="Made by the school itself" right={<b className="font-semibold tnum text-[15px]">{s.staffLogins.toLocaleString("en-IN")}</b>} />
              <Row icon={LogIn} title="Last sign-in by anyone" sub={s.lastActivityAt ? ago(s.lastActivityAt, now) : "Nobody yet"} />
              <Row icon={MessageCircle} title="Messages sent this month" sub="WhatsApp, SMS and app" right={<b className="font-semibold tnum text-[15px]">{s.messagesThisMonth.toLocaleString("en-IN")}</b>} />
              <Row icon={LayoutGrid} title="Modules switched on" sub={optionalWords} right={<b className="font-semibold tnum text-[15px]">{s.modulesOn.length}</b>} />
            </ul>
            <p className="px-5 pb-4 text-[12px] text-ink3 flex gap-1.5"><EyeOff size={13} className="shrink-0 mt-0.5" aria-hidden="true" />The console never shows a student’s name, a fee amount or a salary.{s.measuredAt ? ` Counted ${ago(s.measuredAt, now)}.` : ""}</p>
          </Card>

          <Card>
            <CardHeader title="Team notes" description="Visible only inside DREAM TEAM" icon={StickyNote} />
            <div className="px-5 pb-4 flex flex-col gap-3">
              {notes.length === 0 && <p className="text-[13.5px] text-ink3">No notes yet. Write what the next person should know, like the best time to call.</p>}
              {notes.map((x) => (
                <div key={x.id} className="flex gap-3">
                  <Avatar name={x.byName} size={30} />
                  <div className="min-w-0 flex-1 text-[14px]"><p className="leading-snug break-words">{x.text}</p><p className="text-[12px] text-ink3 mt-0.5">{x.byName} · {ago(x.createdAt, now)}</p></div>
                </div>
              ))}
              <NoteForm schoolId={id} action={noteAction} />
            </div>
          </Card>

          <Card>
            <CardHeader title="School status" icon={Flag} action={<StatusPill status={s.status} />} />
            <div className="px-5 pb-5 flex flex-col gap-3">
              <p className="text-[13.5px] text-ink2 leading-relaxed">{STATUS_MEANS[s.status]}</p>
              <div className="flex gap-2 flex-wrap">
                {s.status === "TRIAL" && c.can("activate") && <Link href={to("activate")} scroll={false} className={buttonClass("soft", "sm")}><CirclePlay size={15} aria-hidden="true" />Activate</Link>}
                {s.status === "SUSPENDED" && c.can("activate") && <Link href={to("reactivate")} scroll={false} className={buttonClass("soft", "sm")}><CirclePlay size={15} aria-hidden="true" />Reactivate</Link>}
                {s.status === "CLOSED" && c.can("status") && <Link href={to("reopen")} scroll={false} className={buttonClass("soft", "sm")}><ArchiveRestore size={15} aria-hidden="true" />Reopen</Link>}
                {open && c.can("status") && <Link href={to("suspend")} scroll={false} className={buttonClass("secondary", "sm")}><CirclePause size={15} aria-hidden="true" />Suspend</Link>}
                {(s.status === "ACTIVE" || s.status === "SUSPENDED") && c.can("status") && <Link href={to("close")} scroll={false} className={buttonClass("danger-soft", "sm")}><Archive size={15} aria-hidden="true" />Close school</Link>}
              </div>
              {!c.can("status") && <p className="text-[12.5px] text-ink3 flex gap-1.5"><Lock size={13} className="shrink-0 mt-0.5" aria-hidden="true" />Only the Owner can suspend, close or reopen a school.{c.can("activate") && s.status === "TRIAL" ? " You can activate a trial." : ""}</p>}
            </div>
          </Card>

          {log.length > 0 && (
            <Card>
              <CardHeader title="Activity for this school" description="The latest lines of the Activity Log" icon={History}
                action={<Link href={`/console/activity?school=${id}`} className="text-[13px] font-semibold text-brand hover:underline">Open</Link>} />
              <ul className="px-2 pb-2">{log.map((l) => <ActivityLine key={l.id} l={l} />)}</ul>
            </Card>
          )}
        </Col>
      </Split>
      {sheet}
    </div>
  );
}

function STATUS_LABEL_OF(s: "TRIAL" | "ACTIVE" | "SUSPENDED" | "CLOSED") {
  return { TRIAL: "Trial", ACTIVE: "Active", SUSPENDED: "Suspended", CLOSED: "Closed" }[s];
}
