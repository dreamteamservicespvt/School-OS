import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarClock, ClipboardList, DoorOpen, IdCard, ListChecks, LogOut, PhoneCall, PhoneIncoming, Settings2, StickyNote, Users } from "lucide-react";
import { withSchool } from "@/lib/db";
import { can } from "@/lib/permissions";
import { momentWhere } from "@/lib/periods";
import { loginsWithRole } from "@/lib/front-office/people";
import { requestStatus } from "@/lib/front-office/desk";
import { pickupsOn } from "@/lib/front-office/pickup";
import { clockAt, shortDay, whenWords } from "@/lib/front-office/time";
import { APPOINTMENT_STATUS, REQUEST_STATUS, clockOf, replyOf } from "@/lib/front-office/words";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { MoreMenu } from "@/components/ui/more-menu";
import { Band, Banner, Col, Empty, ListRow, Split, Stack } from "@/components/money/kit";
import { FoHead } from "./_components/head";
import { CommonSheets } from "./_components/common-sheets";
import { NoteAdd, NoteClear } from "./_components/desk-sheets";
import { BASE, addQ, foPage, foTabs, type SearchParams } from "./_lib/page";

export const metadata = { title: "Reception Desk" };

/** Reception Desk (16 §2, mod-frontoffice.jsx DeskPage): today's visitors, calls, appointments and walk-in requests on one screen. */
export default async function DeskPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await foPage();
  if (!p.may("desk")) redirect((await foTabs())[0]?.href ?? `/no-access?m=front-office`);
  const sp = await searchParams;
  const ctx = p.current.ctx;
  const now = p.now;
  const day = momentWhere({ period: "today", from: p.todayStr, to: p.todayStr, label: "Today" }, p.tz);
  const data = await withSchool(ctx, async (tx) => {
    const [inside, expired, todayCount, outToday, appts, calls, enquiries, followUps, requests, notes, pickups, desk] = await Promise.all([
      tx.visitorEntry.findMany({ where: { archivedAt: null, timeOut: null, passExpiresAt: { gt: now } }, orderBy: { timeIn: "desc" }, take: 30 }),
      tx.visitorEntry.findMany({ where: { archivedAt: null, timeOut: null, passExpiresAt: { lte: now } }, orderBy: { passExpiresAt: "desc" }, take: 20 }),
      tx.visitorEntry.count({ where: { archivedAt: null, visitDate: p.today } }),
      tx.visitorEntry.findMany({ where: { archivedAt: null, visitDate: p.today, timeOut: { not: null } }, select: { timeIn: true, timeOut: true } }),
      tx.appointment.findMany({ where: { archivedAt: null, date: p.today, status: { not: "CANCELLED" } }, orderBy: { startMin: "asc" } }),
      tx.callLogEntry.count({ where: { archivedAt: null, at: day } }),
      tx.enquiry.count({ where: { archivedAt: null, createdAt: day, source: { in: ["walk-in", "phone"] } } }),
      tx.callLogEntry.count({ where: { archivedAt: null, status: "FOLLOW_UP", followUpAt: day } }),
      tx.walkInRequest.findMany({ where: { archivedAt: null }, orderBy: { createdAt: "desc" }, take: 6 }),
      tx.frontOfficeNote.findMany({ where: { clearedAt: null }, orderBy: { createdAt: "asc" }, take: 20 }),
      pickupsOn(tx, day.gte, day.lt),
      loginsWithRole(tx, ctx, "receptionist"),
    ]);
    const staffIds = [...new Set([...inside.map((v) => v.meetStaffId), ...appts.map((a) => a.staffId)].filter((x): x is string => Boolean(x)))];
    const loginIds = [...new Set([...notes.map((n) => n.createdById), desk[0]].filter((x): x is string => Boolean(x)))];
    const [staff, logins, tasks] = await Promise.all([
      tx.staff.findMany({ where: { id: { in: staffIds } }, select: { id: true, fullName: true } }),
      tx.userLogin.findMany({ where: { id: { in: loginIds } }, select: { id: true, displayName: true } }),
      tx.task.findMany({ where: { id: { in: requests.map((r) => r.taskId).filter((x): x is string => Boolean(x)) } }, select: { id: true, status: true } }),
    ]);
    return { inside, expired, todayCount, outToday, appts, calls, enquiries, followUps, requests, notes, pickups, desk, staff, logins, tasks };
  });
  const staffName = (id: string | null) => data.staff.find((s) => s.id === id)?.fullName ?? "";
  const loginName = (id: string | null) => data.logins.find((u) => u.id === id)?.displayName ?? "";
  const waiting = data.inside.filter((v) => v.staffReply === "wait").length;
  const avg = data.outToday.length ? Math.round(data.outToday.reduce((s, v) => s + (v.timeOut!.getTime() - v.timeIn.getTime()), 0) / data.outToday.length / 60_000) : null;
  const live = data.appts.filter((a) => ["BOOKED", "ARRIVED"].includes(a.status));
  const next = live.find((a) => a.startMin + a.lengthMin > p.minute && a.status === "BOOKED") ?? live[0];
  const apptsSorted = [...live, ...data.appts.filter((a) => !["BOOKED", "ARRIVED"].includes(a.status))];
  const imAtDesk = p.v.roleKeys.includes("receptionist");
  const deskWho = imAtDesk ? "You are at the desk" : data.desk[0] ? `${loginName(data.desk[0])} at the desk` : null;
  const here = (extra: Record<string, string>) => addQ(BASE, extra);
  const firstExpired = data.expired[0];
  const isToday = (d: Date) => d.toISOString().slice(0, 10) === p.todayStr;
  const enquiriesOk = p.can.desk && can(p.current.permissions, "admission-management", "create");
  const BIG = [
    { t: "New visitor", s: "Name, phone, whom to meet", Ic: IdCard, href: here({ do: "visitor" }), on: p.can.register },
    { t: "Student pickup", s: "Early pickup gate pass", Ic: DoorOpen, href: `${BASE}/pickup`, on: p.can.release },
    { t: "New enquiry", s: "Goes to Admissions", Ic: PhoneIncoming, href: here({ do: "enquiry" }), on: enquiriesOk },
    { t: "Log a call", s: "Incoming or outgoing", Ic: PhoneCall, href: here({ do: "call" }), on: p.can.desk },
  ].filter((b) => b.on);

  return (
    <div>
      <FoHead pageName="Reception Desk" href={BASE}
        sub={`${shortDay(p.today)}${deskWho ? ` · ${deskWho}` : ""} · ${p.passLine}`}
        actions={p.can.desk ? <>
          <ButtonLink href={here({ do: "walkin" })} scroll={false} variant="secondary" icon={ClipboardList}>Walk-in request</ButtonLink>
          {p.can.manage && <MoreMenu label="Front Office settings" items={[
            { label: "Front Office settings", href: here({ do: "settings" }), icon: <Settings2 size={16} aria-hidden="true" /> },
            { label: "Purposes and departments", href: here({ do: "lists" }), icon: <ListChecks size={16} aria-hidden="true" /> },
          ]} />}
        </> : null} />
      <Stack>
        <Band items={[
          { label: "In the building now", big: String(data.inside.length), foot: waiting ? `${waiting} waiting to be called in` : data.inside.length ? "Nobody waiting" : "Nobody inside", href: `${BASE}/visitors?status=In` },
          { label: "Visitors today", big: String(data.todayCount), foot: avg != null ? `Average ${avg} minutes inside` : "No visit closed yet", href: `${BASE}/visitors` },
          { label: "Appointments today", big: String(data.appts.length), foot: next ? `Next: ${clockOf(next.startMin)}, ${next.visitorName}` : "None left today", href: p.may("appointments") ? `${BASE}/appointments` : undefined },
          { label: "Calls and enquiries", big: <>{data.calls}<span className="text-[0.55em] opacity-70 font-medium"> calls · {data.enquiries} enq.</span></>, foot: data.followUps ? `${data.followUps} follow-up${data.followUps === 1 ? "" : "s"} due today` : "No follow-ups due today", href: p.may("enquiries") ? `${BASE}/enquiries` : undefined },
        ]} />

        {BIG.length > 0 && (
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
            {BIG.map(({ t, s, Ic, href }) => (
              <Link key={t} href={href} scroll={false} className="group text-left rounded-2xl bg-surface border border-line/70 shadow-card p-4 md:p-5 flex flex-col gap-3 hover:border-brand/40 hover:bg-brand/[.03] transition min-h-[116px]">
                <span className="w-11 h-11 rounded-xl bg-brand/10 text-brand grid place-items-center group-hover:bg-brand group-hover:text-brandink transition"><Ic size={22} aria-hidden="true" /></span>
                <span><span className="block font-semibold text-[15.5px] leading-tight">{t}</span><span className="block text-[12.5px] text-ink3 mt-0.5">{s}</span></span>
              </Link>
            ))}
          </div>
        )}

        <Split>
          <Col>
            {firstExpired && (
              <Banner tone="bad" title={`${data.expired.length} visitor${data.expired.length === 1 ? "" : "s"} not checked out${data.expired.every((v) => isToday(v.visitDate)) ? " today" : ""}.`}
                action={p.can.checkOut ? <Link href={here({ out: firstExpired.id })} scroll={false} className={buttonClass("secondary", "sm")}><LogOut size={15} aria-hidden="true" />Close with the right time</Link> : undefined}>
                Pass {firstExpired.passNo} ({firstExpired.name}) expired at {clockAt(firstExpired.passExpiresAt, p.tz)}{isToday(firstExpired.visitDate) ? " today" : ` on ${shortDay(firstExpired.visitDate)}`}.
              </Banner>
            )}
            <Card>
              <CardHeader title="In the building now" description="Staff replies show here as they come in" icon={Users} action={<Pill tone="ok">{data.inside.length}</Pill>} />
              {data.inside.length === 0 ? (
                <Empty icon={DoorOpen} title="Nobody is inside" body="Visitors show here from the moment they are registered."
                  action={p.can.register ? <ButtonLink href={here({ do: "visitor" })} scroll={false} variant="secondary" icon={IdCard}>New visitor</ButtonLink> : undefined} />
              ) : (
                <ul className="px-2 pb-2">
                  {data.inside.map((v) => {
                    const r = replyOf(v.staffReply);
                    const met = staffName(v.meetStaffId);
                    return (
                      <li key={v.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-sunken/70">
                        <Avatar name={v.name} size={40} />
                        <Link href={here({ pass: v.id })} scroll={false} className="min-w-0 flex-1 text-left">
                          <p className="font-semibold text-[14.5px] leading-snug truncate">{v.name} <span className="text-ink3 font-normal">· {v.purpose}</span></p>
                          <p className="text-[12.5px] text-ink3 truncate">{r && met && <span className="sm:hidden font-semibold text-ink2">{met.split(" ")[0]}: {r.label} · </span>}In {clockAt(v.timeIn, p.tz)}{met ? ` · to meet ${met}` : ""}{v.note ? ` · ${v.note}` : ""}</p>
                        </Link>
                        {r && met && <Pill tone={r.tone} className="hidden sm:inline-flex">{met.split(" ")[0]}: {r.label}</Pill>}
                        {p.can.checkOut && <ButtonLink href={here({ out: v.id })} scroll={false} size="sm" variant="secondary" icon={LogOut} aria-label={`Check out ${v.name}`}><span className="hidden sm:inline">Check out</span></ButtonLink>}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="Walk-in requests" description="Each has a number the person can ask about" icon={ClipboardList}
                action={p.can.desk ? <ButtonLink href={here({ do: "walkin" })} scroll={false} size="sm" variant="soft" icon={ClipboardList}>New request</ButtonLink> : undefined} />
              {data.requests.length === 0 ? (
                <Empty icon={ClipboardList} title="No walk-in requests yet" body="A parent asking for a bonafide certificate or a fee statement gets a request number here."
                  action={p.can.desk ? <ButtonLink href={here({ do: "walkin" })} scroll={false} variant="secondary">Walk-in request</ButtonLink> : undefined} />
              ) : (
                <ul className="px-2 pb-2">
                  {data.requests.map((r) => {
                    const st = REQUEST_STATUS[requestStatus(r, data.tasks.find((t) => t.id === r.taskId))] ?? REQUEST_STATUS.SENT;
                    return (
                      <li key={r.id}>
                        <ListRow icon={ClipboardList} iconTone={st.tone} title={r.request} href={p.may("enquiries") ? `${BASE}/enquiries?view=requests&q=${r.requestNo}` : undefined}
                          sub={`${r.requestNo} · ${r.fromName}${r.about ? `, ${r.about.charAt(0).toLowerCase()}${r.about.slice(1)}` : ""} · ${whenWords(r.createdAt, p.tz, now)}`}
                          right={<div className="flex flex-col items-end gap-1"><Pill tone={st.tone}>{st.label}</Pill><span className="text-[11.5px] text-ink3">{r.department}</span></div>} />
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </Col>
          <Col>
            <Card>
              <CardHeader title="Front-office notes" description="Short notes for whoever is at the desk" icon={StickyNote} />
              <ul className="px-5 flex flex-col gap-2.5">
                {data.notes.map((n) => (
                  <li key={n.id} className="rounded-xl bg-warn/[.08] border border-warn/20 px-3.5 py-2.5 flex gap-2">
                    <div className="min-w-0 flex-1"><p className="text-[14px] leading-snug">{n.text}</p><p className="text-[11.5px] text-ink3 mt-1">{[loginName(n.createdById), whenWords(n.createdAt, p.tz, now)].filter(Boolean).join(", ")}</p></div>
                    {p.can.desk && <NoteClear id={n.id} />}
                  </li>
                ))}
                {data.notes.length === 0 && <li className="text-[13.5px] text-ink3 py-2">No notes. {p.can.desk ? "Add one for the next person at the desk." : ""}</li>}
              </ul>
              {p.can.desk ? <NoteAdd /> : <div className="h-4" />}
            </Card>
            {p.may("appointments") && (
              <Card>
                <CardHeader title="Appointments today" description="Next one first" icon={CalendarClock} action={<Link href={`${BASE}/appointments`} className="text-[13px] font-semibold text-brand hover:underline">Open</Link>} />
                {apptsSorted.length === 0 ? <p className="px-5 pb-5 text-[13.5px] text-ink3">No appointments today.</p> : (
                  <ul className="px-2 pb-2">
                    {apptsSorted.slice(0, 5).map((a) => {
                      const inMeeting = a.status === "ARRIVED" && a.startMin <= p.minute && p.minute < a.startMin + a.lengthMin;
                      const st = APPOINTMENT_STATUS[a.status];
                      return <li key={a.id}><ListRow avatar={a.visitorName} title={`${clockOf(a.startMin)} · ${a.visitorName}`} sub={`With ${staffName(a.staffId)} · ${a.purpose}`} right={<Pill tone={inMeeting ? "brand" : st.tone}>{inMeeting ? "In meeting" : st.label}</Pill>} /></li>;
                    })}
                  </ul>
                )}
              </Card>
            )}
            <Card>
              <CardHeader title="Early pickups today" icon={DoorOpen} action={<Link href={`${BASE}/pickup`} className="text-[13px] font-semibold text-brand hover:underline">Open</Link>} />
              {data.pickups.length === 0 ? <p className="px-5 pb-5 text-[13.5px] text-ink3">No early pickups today.</p> : (
                <ul className="px-2 pb-2">
                  {data.pickups.map((g) => (
                    <li key={g.id}><ListRow avatar={g.student} title={`${g.student}${g.sectionLabel ? `, ${g.sectionLabel}` : ""}`} sub={`${clockAt(g.timeOut, p.tz)} · with ${g.collectorName} (${(g.collectorRelation ?? "").toLowerCase()}) · ${g.reason}`}
                      right={<Pill tone={g.status === "LEFT" ? "ok" : "warn"}>{g.status === "LEFT" ? "Left" : "At gate"}</Pill>} /></li>
                  ))}
                </ul>
              )}
            </Card>
          </Col>
        </Split>
      </Stack>
      <CommonSheets sp={sp} href={BASE} keepKeys={[]} />
    </div>
  );
}
