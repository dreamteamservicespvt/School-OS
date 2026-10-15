import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Armchair, BellRing, CheckCheck, ClipboardList, HandHeart, Hourglass, IndianRupee, ListChecks, Pencil, Plus, Send, ShieldCheck, UserPlus, Users, X } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDateTime, formatRupees } from "@/lib/format";
import { audienceRule, eligible, eventMoney, eventStatus, feeStates } from "@/lib/events/events";
import { placeOrder, placesOf } from "@/lib/events/places";
import { consentCounts } from "@/lib/events/consent";
import { Ring } from "@/components/ui/display";
import { EVENT_STATUS, REMINDERS, AUDIENCE_KINDS, eventIcon, hhmm, isoOf, longDay, reminderWords, timeSpan } from "@/lib/events/words";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { MoreMenu } from "@/components/ui/more-menu";
import { LinkTabs } from "@/components/ui/link-tabs";
import { DL } from "@/components/ui/blocks";
import { Banner, Col, DataList, Empty, HBars, ListRow, Split, Stack, Stats, Timeline } from "@/components/money/kit";
import { EvIcon } from "../../_components/icons";
import { ActButton } from "../../_components/bits";
import { AttendanceForm, CancelEventSheet, EventSheet, OfficeConsentSheet, RegisterSheet, RemindSheet, SeatsSheet, VolunteerSheet } from "../../_components/event-sheets";
import { remindConsentAction, removeVolunteerAction, withdrawAction } from "../../actions";
import { BASE, UUID, evGuard, one, qs, type SearchParams } from "../../_lib/page";

export const metadata = { title: "Event" };

const ZERO = BigInt(0);

/** One event (mod-events.jsx EventDetail): details, registrations, attendance, payments, volunteers and reminders. */
export default async function EventPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SearchParams }) {
  const p = await evGuard("events");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const sp = await searchParams;
  const ctx = p.current.ctx;
  const acc = p.accountant;
  const full = p.can.events;
  const HREF = `${BASE}/events/${id}`;

  const d = await withSchool(ctx, async (tx) => {
    const e = await tx.event.findFirst({ where: { id, archivedAt: null } });
    if (!e) return null;
    const regs = await tx.eventRegistration.findMany({ where: { eventId: id, withdrawnAt: null }, orderBy: { createdAt: "asc" } });
    const students = await tx.student.findMany({ where: { id: { in: regs.map((r) => r.studentId) } }, select: { id: true, fullName: true } });
    const places = await placesOf(tx, regs.map((r) => r.studentId), e.academicYearId);
    const fees = await feeStates(tx, regs.map((r) => r.dueId).filter((x): x is string => Boolean(x)));
    const money = e.feePaise ? (await eventMoney(tx, [e])).get(e.id) ?? null : null;
    const [volunteers, reminders, creator] = await Promise.all([
      tx.eventVolunteer.findMany({ where: { eventId: id, archivedAt: null }, orderBy: { createdAt: "asc" } }),
      tx.eventReminder.findMany({ where: { eventId: id }, orderBy: { sentAt: "desc" } }),
      e.createdById ? tx.userLogin.findFirst({ where: { id: e.createdById }, select: { displayName: true } }) : null,
    ]);
    // Parent consent (trips and outings): every student of the audience, with their answer.
    const consent = e.consentOn && !acc ? await consentCounts(tx, e) : null;
    const consentStudents = consent ? await tx.student.findMany({ where: { id: { in: [...consent.waitingIds, ...consent.answers.map((a) => a.studentId)] } }, select: { id: true, fullName: true } }) : [];
    const consentPlaces = consent ? await placesOf(tx, consentStudents.map((x) => x.id), e.academicYearId) : new Map();
    return { e, regs, students, places, fees, money, volunteers, reminders, creator, consent, consentStudents, consentPlaces };
  });
  if (!d) notFound();
  const e = d.e;
  // The Accountant's page is Event Payments: only events with a fee.
  if (acc && !e.feePaise) redirect(`/no-access?m=events-calendar`);
  const status = eventStatus(e, p.today);
  const done = status === "DONE";
  const cancelled = status === "CANCELLED";
  const fee = e.feePaise && e.feePaise > ZERO ? e.feePaise : null;
  const showMoney = p.can.money && fee;
  const tabs = acc
    ? [{ key: "pay", label: "Payments" }, { key: "reg", label: "Fee by student" }]
    : [{ key: "reg", label: "Registrations" }, ...(d.consent ? [{ key: "con", label: "Consent" }] : []), { key: "att", label: "Attendance" }, ...(showMoney ? [{ key: "pay", label: "Payments" }] : []), { key: "vol", label: "Volunteers" }, { key: "rem", label: "Reminders" }];
  const tab = tabs.some((t) => t.key === one(sp.tab)) ? one(sp.tab) : tabs[0].key;
  const here = (over: Record<string, string | null> = {}) => qs(HREF, { tab: tab === tabs[0].key ? null : tab, ...over });
  const doing = full && !cancelled ? one(sp.do) : "";
  const closeHref = here({ do: null });
  const name = (sid: string) => d.students.find((s) => s.id === sid)?.fullName ?? "Student";
  const placeOf = (sid: string) => d.places.get(sid)?.label ?? "";
  const regRows = [...d.regs].sort((a, b) => placeOrder(d.places.get(a.studentId), d.places.get(b.studentId)));
  const n = regRows.length;
  const attended = regRows.filter((r) => r.attended === true).length;
  const marked = regRows.some((r) => r.attended != null);
  const onOrAfter = isoOf(e.date) <= p.today;
  const when = `${longDay(isoOf(e.date))} · ${timeSpan(e.startMin, e.endMin)}`;
  const feeOf = (dueId: string | null) => (dueId ? d.fees.get(dueId) ?? "Due" : null);
  const c = d.consent;
  const consentOpen = Boolean(c && !cancelled && !done && (!e.consentBy || isoOf(e.consentBy) >= p.today));
  const consentRows = c ? d.consentStudents.map((st) => {
    const a = c.answers.find((x) => x.studentId === st.id);
    return { id: st.id, name: st.fullName, place: d.consentPlaces.get(st.id)?.label ?? "", answer: a?.answer ?? null, how: a?.how ?? null, at: a?.answeredAt ?? null, pl: d.consentPlaces.get(st.id) };
  }).sort((a, b) => (a.answer === b.answer ? 0 : a.answer === null ? -1 : b.answer === null ? 1 : a.answer === "DECLINED" ? -1 : 1) || placeOrder(a.pl, b.pl)) : [];
  const CONSENT_WORDS = { GIVEN: { label: "Given", tone: "ok" as const }, DECLINED: { label: "Declined", tone: "bad" as const } };

  // Data only the open sheet needs.
  const extra = await withSchool(ctx, async (tx) => {
    if (doing === "register") {
      let ids: string[] = [];
      if (e.audienceKind === "alumni") ids = (await tx.student.findMany({ where: { archivedAt: null, status: { in: ["ALUMNI", "GRADUATED"] } }, select: { id: true }, take: 2000 })).map((s) => s.id);
      else ids = (await tx.enrolment.findMany({ where: { academicYearId: e.academicYearId, archivedAt: null, status: "STUDYING", ...(e.audienceKind === "classes" ? { classId: { in: e.classIds } } : {}) }, select: { studentId: true }, take: 4000 })).map((x) => x.studentId);
      const ok = await eligible(tx, e, ids);
      const st = await tx.student.findMany({ where: { id: { in: [...ok] } }, select: { id: true, fullName: true } });
      const pl = await placesOf(tx, st.map((s) => s.id), e.academicYearId);
      const active = new Set(d.regs.map((r) => r.studentId));
      return { pick: st.sort((a, b) => placeOrder(pl.get(a.id), pl.get(b.id))).map((s) => ({ id: s.id, name: s.fullName, place: pl.get(s.id)?.label ?? "Alumni", registered: active.has(s.id) })) };
    }
    if (doing === "volunteer") {
      const staff = await tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] } }, select: { id: true, fullName: true }, orderBy: { fullName: "asc" }, take: 1000 });
      return { staff };
    }
    if (doing === "consent" && d.consent) return { consentPick: consentRows.map((r) => ({ id: r.id, name: r.name, place: r.place.replace(/^Class /, "") })) };
    if (doing === "edit") return { classes: await tx.schoolClass.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { sortOrder: "asc" } }) };
    if (doing === "remind") {
      const rule = await audienceRule(tx, e);
      return { remindTo: rule.guardiansOf ? `the parents of ${rule.guardiansOf.length} registered students` : e.audienceKind === "staff" ? "all staff" : `the parents of ${e.audienceLabel.toLowerCase() === "whole school" ? "the whole school" : e.audienceLabel}` };
    }
    return {};
  });

  const school = p.current.school.name;
  const reminderPreview = `Dear Parent, a reminder: ${e.name} on ${longDay(isoOf(e.date)).replace(/ \d{4}$/, "")}, ${timeSpan(e.startMin, e.endMin)}${e.venue ? `, ${e.venue}` : ""}.${fee ? ` Fee ${formatRupees(fee)}, see your Parent Link.` : ""} - ${school}`;
  const timeline = [
    ...d.reminders.map((r) => ({ icon: r.kind === "cancelled" ? X : Send, tone: (r.kind === "cancelled" ? "bad" : "ok") as "bad" | "ok", what: `${r.note} · ${r.people} ${r.people === 1 ? "person" : "people"}`, when: formatDateTime(r.sentAt, p.tz) })),
    { icon: Plus, tone: "brand" as const, what: `Event created${d.creator ? ` by ${d.creator.displayName}` : ""}`, when: formatDateTime(e.createdAt, p.tz) },
  ];

  const menu = full && !cancelled ? [
    { label: "Edit event", href: here({ do: "edit" }), icon: <Pencil size={16} aria-hidden="true" /> },
    ...(e.registrationOn && !done ? [{ label: "Register students", href: here({ do: "register" }), icon: <UserPlus size={16} aria-hidden="true" /> }] : []),
    { label: "Add volunteers", href: here({ do: "volunteer", tab: "vol" }), icon: <HandHeart size={16} aria-hidden="true" /> },
    ...(e.registrationOn && n ? [{ label: "Assign seats", href: here({ do: "seats" }), icon: <Armchair size={16} aria-hidden="true" /> }] : []),
    ...(!done ? [{ label: "Cancel the event", href: here({ do: "cancel" }), icon: <X size={16} aria-hidden="true" />, tone: "bad" as const }] : []),
  ] : [];

  return (
    <div>
      <Link href={`${BASE}/events`} className="inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-ink2 hover:text-ink mb-3 -ml-1 h-8 px-1 rounded-lg">
        <ArrowLeft size={17} aria-hidden="true" />{acc ? "Event Payments" : "Events"} <span className="text-ink3 font-normal">/ {e.number}</span>
      </Link>
      <Card className="p-4 md:p-5 flex flex-col lg:flex-row lg:items-center gap-4 mb-5">
        <span className="w-14 h-14 rounded-2xl bg-brand/10 text-brand grid place-items-center shrink-0"><EvIcon name={eventIcon(e.type, e.name)} size={26} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap"><h1 className="font-display text-[24px] md:text-[28px] font-semibold tracking-tight leading-tight">{e.name}</h1><Pill tone={EVENT_STATUS[status].tone} dot>{EVENT_STATUS[status].label}</Pill></div>
          <p className="text-[14px] text-ink3 mt-0.5">{[e.type, longDay(isoOf(e.date)), timeSpan(e.startMin, e.endMin), e.venue].filter(Boolean).join(" · ")}</p>
        </div>
        {full && !cancelled && (
          <div className="flex gap-2 flex-wrap">
            {e.registrationOn && onOrAfter && n > 0 && <ButtonLink href={here({ tab: "att" })} scroll={false} variant="secondary" icon={ListChecks}>Mark attendance</ButtonLink>}
            {e.registrationOn && !done && <ButtonLink href={here({ do: "register" })} scroll={false} variant="secondary" icon={UserPlus} className="hidden md:inline-flex">Register students</ButtonLink>}
            {!done && <ButtonLink href={here({ do: "remind" })} scroll={false} variant="primary" icon={BellRing}>Send reminder</ButtonLink>}
            <MoreMenu items={menu} />
          </div>
        )}
      </Card>
      {cancelled && <Banner tone="bad" title="Cancelled." className="mb-5">{e.cancelReason}{fee ? " Paid fees go back through Fee Management (refunds are decided in Approvals)." : ""}</Banner>}
      <Stack>
        {e.registrationOn && (
          <Stats items={[
            { label: "Registered", value: e.seats ? `${n} of ${e.seats}` : String(n), icon: Users, sub: e.seats ? `${Math.max(0, e.seats - n)} seats left` : "No seat limit" },
            ...(acc ? [] : [{ label: "Attended", value: marked ? String(attended) : "—", icon: CheckCheck, sub: marked ? `of ${n} registered` : "Marked on the day" }]),
            showMoney && d.money
              ? { label: "Fees", value: formatRupees(d.money.collected), icon: IndianRupee, tone: cancelled ? undefined : ("ok" as const), sub: cancelled ? "Refunds through Fee Management" : `${n} × ${formatRupees(fee!)} · fee row added` }
              : { label: "Volunteers", value: String(d.volunteers.length), icon: HandHeart, sub: "Staff, students and parents" },
            acc && d.money
              ? { label: "Fees due", value: cancelled ? "—" : formatRupees(d.money.due), icon: Hourglass, tone: cancelled || d.money.due === ZERO ? undefined : ("warn" as const), sub: cancelled ? `${formatRupees(d.money.refunded)} refunded` : `${d.money.dueStudents} students` }
              : { label: "Reminders sent", value: String(d.reminders.filter((r) => r.kind === "reminder").length), icon: BellRing, sub: d.reminders[0] ? `Last: ${formatDateTime(d.reminders[0].sentAt, p.tz)}` : reminderWords(e.reminder) },
          ]} />
        )}
        <Split side={340}>
          <Card className="overflow-hidden min-w-0">
            <LinkTabs className="px-3" label="Event" tabs={tabs.map((t) => ({ href: here({ tab: t.key === tabs[0].key ? null : t.key }), label: t.label, on: t.key === tab }))} />
            {tab === "reg" && (
              e.registrationOn ? (
                <DataList rows={regRows} rowKey={(r) => r.id} minWidth={560} caption="Registrations"
                  footer={`${n} registered · ${e.audienceLabel}`}
                  empty={<Empty icon={ClipboardList} title="Nobody is registered yet" body={full && !done && !cancelled ? "Register the students who join." : "Registrations show here."} action={full && !done && !cancelled ? <ButtonLink variant="secondary" icon={UserPlus} href={here({ do: "register" })}>Register students</ButtonLink> : undefined} />}
                  columns={[
                    { key: "s", label: "Student", render: (r) => <div className="flex items-center gap-2.5"><Avatar name={name(r.studentId)} size={30} /><span className="font-semibold">{name(r.studentId)}</span></div> },
                    { key: "cls", label: "Class", render: (r) => placeOf(r.studentId) || "—" },
                    ...(regRows.some((r) => r.seat) ? [{ key: "seat", label: "Seat", render: (r: (typeof regRows)[number]) => <span className="tnum">{r.seat ?? "—"}</span> }] : []),
                    ...(fee ? [{ key: "p", label: "Fee", render: (r: (typeof regRows)[number]) => { const f = feeOf(r.dueId); return f ? <Pill tone={f === "Paid" ? "ok" : f === "Removed" ? "neutral" : "warn"}>{f}</Pill> : <span className="text-ink3">—</span>; } }] : []),
                    ...(full && !done && !cancelled ? [{ key: "x", label: "", render: (r: (typeof regRows)[number]) => <ActButton action={withdrawAction} fields={{ eventId: e.id, studentId: r.studentId }} label="Withdraw" variant="ghost" /> }] : []),
                  ]}
                  phone={(r) => ({ title: name(r.studentId), sub: [placeOf(r.studentId), r.seat && `Seat ${r.seat}`].filter(Boolean).join(" · "), avatar: name(r.studentId), pills: fee && feeOf(r.dueId) ? <Pill tone={feeOf(r.dueId) === "Paid" ? "ok" : "warn"} className="!h-[22px] !text-[11.5px]">{feeOf(r.dueId)}</Pill> : undefined })} />
              ) : <Empty icon={ClipboardList} title="No registration for this event" body="Everyone in the audience takes part. Switch registration on to limit seats." />
            )}
            {tab === "con" && c && (
              <>
                {full && consentOpen && (
                  <div className="flex items-center gap-2 flex-wrap px-4 py-3 border-b border-line">
                    <p className="text-[13px] text-ink3 flex-1 min-w-[200px]">{e.consentBy ? `Reply by ${longDay(isoOf(e.consentBy))}. ` : ""}A yes on Parent Link is confirmed with a one-time code and registers the child.</p>
                    <ButtonLink size="sm" variant="secondary" href={here({ do: "consent" })} scroll={false}>Record consent</ButtonLink>
                  </div>
                )}
                <DataList rows={consentRows} rowKey={(r) => r.id} minWidth={560} caption="Parent consent"
                  footer={`${c.total} students · ${c.given} given · ${c.waiting} waiting · ${c.declined} declined`}
                  empty={<Empty icon={ShieldCheck} title="No students in the audience" body="Consent is asked of the parents of the audience." />}
                  columns={[
                    { key: "s", label: "Student", render: (r) => <div className="flex items-center gap-2.5"><Avatar name={r.name} size={30} /><span className="font-semibold">{r.name}</span></div> },
                    { key: "cls", label: "Class", render: (r) => r.place || "—" },
                    { key: "a", label: "Consent on Parent Link", render: (r) => (r.answer ? <Pill tone={CONSENT_WORDS[r.answer as "GIVEN" | "DECLINED"].tone} dot>{CONSENT_WORDS[r.answer as "GIVEN" | "DECLINED"].label}</Pill> : <Pill tone="warn" dot>Waiting</Pill>) },
                    { key: "h", label: "How", render: (r) => <span className="text-[13px] text-ink3">{r.how === "office" ? "Recorded by the office" : r.how ? "Parent Link" : "—"}{r.at ? ` · ${formatDateTime(r.at, p.tz)}` : ""}</span> },
                  ]}
                  phone={(r) => ({ title: r.name, sub: r.place, avatar: r.name, pills: r.answer ? <Pill tone={CONSENT_WORDS[r.answer as "GIVEN" | "DECLINED"].tone} className="!h-[22px] !text-[11.5px]">{CONSENT_WORDS[r.answer as "GIVEN" | "DECLINED"].label}</Pill> : <Pill tone="warn" className="!h-[22px] !text-[11.5px]">Waiting</Pill> })} />
              </>
            )}
            {tab === "att" && (
              !e.registrationOn ? <Empty icon={ListChecks} title="No attendance for this event" body="Attendance is kept for events with registration." />
                : !n ? <Empty icon={ListChecks} title="Nobody is registered" body="Attendance is marked for registered students." />
                  : !onOrAfter ? <Empty icon={ListChecks} title={`Marked on the day, ${longDay(isoOf(e.date))}`} body="Come back on the day to tick who came." />
                    : <AttendanceForm eventId={e.id} canMark={full && !cancelled} marked={marked} rows={regRows.map((r) => ({ id: r.studentId, name: name(r.studentId), place: placeOf(r.studentId), attended: r.attended }))} />
            )}
            {tab === "pay" && showMoney && d.money && (
              <div className="p-5 flex flex-col gap-4">
                <Banner tone="info" title="Collected through Fee Management.">A fee row “{e.name}” of {formatRupees(fee!)} was added for each student who registered. Parents pay on Parent Link or at the counter.</Banner>
                <HBars labelWidth={48} valueWidth={150} rows={[
                  { key: "paid", label: "Paid", value: d.money.paidStudents, text: `${d.money.paidStudents} · ${formatRupees(d.money.collected)}`, tone: "ok" },
                  { key: "due", label: "Due", value: d.money.dueStudents, text: `${d.money.dueStudents} · ${formatRupees(d.money.due)}`, tone: "warn" },
                  ...(d.money.refunded > ZERO ? [{ key: "ref", label: "Refund", value: 1, text: formatRupees(d.money.refunded) }] : []),
                ]} />
                <p className="text-[13px] text-ink3">If the event is cancelled or a student withdraws, unpaid fees are removed and paid fees are refunded through Fee Management.</p>
              </div>
            )}
            {tab === "vol" && (
              d.volunteers.length ? (
                <ul className="px-2 py-2">
                  {d.volunteers.map((v) => (
                    <li key={v.id} className="flex items-center gap-2">
                      <div className="flex-1 min-w-0"><ListRow avatar={v.name} title={`${v.name}${v.kind === "parent" ? " (parent)" : v.kind === "student" ? " (student)" : ""}`} sub={v.duty} /></div>
                      {full && !cancelled && <ActButton action={removeVolunteerAction} fields={{ volunteerId: v.id }} label="Remove" variant="ghost" />}
                    </li>
                  ))}
                </ul>
              ) : <Empty icon={HandHeart} title="No volunteers yet" body="List staff, students or parents helping, with their duties." action={full && !cancelled ? <ButtonLink variant="secondary" icon={Plus} href={here({ do: "volunteer" })}>Add a volunteer</ButtonLink> : undefined} />
            )}
            {tab === "rem" && <div className="p-5"><Timeline items={timeline} /></div>}
          </Card>
          <Col>
            {c && (
              <Card>
                <CardHeader title="Parent consent" description={e.consentBy ? `Reply by ${longDay(isoOf(e.consentBy))}` : "On Parent Link"} icon={ShieldCheck} />
                <div className="px-5 pb-5 flex flex-col gap-3">
                  <div className="flex items-center gap-4">
                    <Ring value={c.total ? (c.given / c.total) * 100 : 0} size={64} stroke={7} tone="ok"><span className="text-[13px] font-bold tnum">{c.total ? Math.round((c.given / c.total) * 100) : 0}%</span></Ring>
                    <p className="text-[13.5px] text-ink2"><b className="font-semibold tnum">{c.given}</b> given · <b className="font-semibold tnum">{c.waiting}</b> waiting · <b className="font-semibold tnum">{c.declined}</b> declined</p>
                  </div>
                  {full && consentOpen && c.waiting > 0 && <ActButton action={remindConsentAction} fields={{ eventId: e.id }} label={`Remind ${c.waiting} waiting`} icon="Bell" className="w-full" />}
                  {full && consentOpen && c.waiting > 0 && <p className="text-[12.5px] text-ink3">Only the parents who have not answered get the reminder.</p>}
                </div>
              </Card>
            )}
            <Card>
              <CardHeader title="Details" />
              <div>
                <DL cols={1} rows={[
                  ["Date and time", when],
                  ["Venue", e.venue ?? "—"],
                  ["Audience", e.audienceLabel],
                  ["Registration", e.registrationOn ? (e.seats ? `On · ${e.seats} seats` : "On · no seat limit") : "Off"],
                  ...(e.consentOn ? [["Parent consent", `On Parent Link${e.consentBy ? `, reply by ${longDay(isoOf(e.consentBy))}` : ""}`] as [string, string]] : []),
                  ["Fee", fee ? `${formatRupees(fee)} per student, added to fees` : "None"],
                  ["Reminder", e.reminder === "none" ? "No reminder" : `${reminderWords(e.reminder)}, by message`],
                  ...(e.description ? [["Description", e.description] as [string, string]] : []),
                ]} />
              </div>
            </Card>
          </Col>
        </Split>
      </Stack>

      {doing === "edit" && "classes" in extra && extra.classes && (
        <EventSheet closeHref={closeHref} types={p.settings.eventTypes} venues={p.settings.venues} classes={extra.classes.map((c) => ({ value: c.id, label: c.name }))}
          reminders={REMINDERS.map((r) => ({ value: r.value, label: r.label }))} audiences={AUDIENCE_KINDS.map((a) => ({ value: a.value, label: a.label }))}
          start={{ id: e.id, name: e.name, type: e.type, date: isoOf(e.date), startTime: hhmm(e.startMin), endTime: e.endMin != null ? hhmm(e.endMin) : "", venue: e.venue ?? "", audienceKind: e.audienceKind, classIds: e.classIds, registrationOn: e.registrationOn, seats: e.seats ? String(e.seats) : "", fee: fee ? String(Number(fee) / 100) : "", reminder: e.reminder, description: e.description ?? "", consentOn: e.consentOn, consentBy: e.consentBy ? isoOf(e.consentBy) : "", feeLocked: Boolean(fee && d.regs.some((r) => r.dueId)) }} />
      )}
      {doing === "cancel" && !done && <CancelEventSheet closeHref={closeHref} eventId={e.id} name={e.name} fee={fee && n ? `Unpaid fees are removed; paid fees are refunded through Fee Management.` : null} />}
      {doing === "remind" && "remindTo" in extra && <RemindSheet closeHref={closeHref} eventId={e.id} people={extra.remindTo ?? "the audience"} preview={reminderPreview} />}
      {doing === "register" && "pick" in extra && extra.pick && <RegisterSheet closeHref={closeHref} eventId={e.id} students={extra.pick} seatsLeft={e.seats != null ? Math.max(0, e.seats - n) : null} fee={fee ? formatRupees(fee) : null} />}
      {doing === "volunteer" && "staff" in extra && extra.staff && <VolunteerSheet closeHref={closeHref} eventId={e.id} staff={extra.staff.map((s) => ({ value: s.id, label: s.fullName }))} students={regRows.map((r) => ({ value: r.studentId, label: `${name(r.studentId)}, ${placeOf(r.studentId)}` }))} />}
      {doing === "consent" && "consentPick" in extra && extra.consentPick && <OfficeConsentSheet closeHref={closeHref} eventId={e.id} students={extra.consentPick} fee={fee ? formatRupees(fee) : null} />}
      {doing === "seats" && <SeatsSheet closeHref={closeHref} eventId={e.id} count={n} />}
    </div>
  );
}
