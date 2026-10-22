import Link from "next/link";
import { Ban, CalendarOff, Check, ChevronRight, DoorOpen, Printer, ScanLine, Search, ShieldCheck, UserRound } from "lucide-react";
import { withSchool } from "@/lib/db";
import { momentWhere } from "@/lib/periods";
import { appOrigin } from "@/lib/origin";
import { qrSvg } from "@/lib/students/codes";
import { fileLink } from "@/lib/files";
import { abilities } from "@/lib/students/access";
import { checkPass } from "@/lib/front-office/visitors";
import { pickupStudent, pickupsOn, searchStudents } from "@/lib/front-office/pickup";
import { clockAt, shortDay } from "@/lib/front-office/time";
import { closedWords, hhmmOf, maskPhone, showPhone } from "@/lib/front-office/words";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { cx } from "@/components/ui/cx";
import { UrlSheet } from "@/components/ui/url-sheet";
import { PeriodFilter } from "@/components/list/period-filter";
import { UrlSearch } from "@/components/money/url-filters";
import { Banner, Col, Empty, Split } from "@/components/money/kit";
import { FoHead } from "../_components/head";
import { CheckSheet } from "../_components/pass-check";
import { ActButton } from "../_components/fields";
import { PickupList, ReleaseForm, ScanIdButton, StopSheet, type PickupChoice } from "../_components/pickup-forms";
import { sendGatePassAction } from "../actions";
import { BASE, UUID, addQ, foGuard, foPeriod, one, qs, type SearchParams } from "../_lib/page";

export const metadata = { title: "Student Pickup" };

const HREF = `${BASE}/pickup`;

/** Student Pickup (16 §2, mod-frontoffice.jsx PickupPage): early pickup only by people on the approved list, with a gate pass the gate checks. */
export default async function PickupPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await foGuard("pickup");
  const sp = await searchParams;
  const ctx = p.current.ctx;
  const gate = p.v.level === "gate";
  const canRelease = p.can.release;
  const q = one(sp.q).trim();
  const studentId = UUID.test(one(sp.student)) ? one(sp.student) : null;
  const gpId = UUID.test(one(sp.gp)) ? one(sp.gp) : null;
  const period = foPeriod(sp, p.dates, "today");
  const range = period.range!;
  const isToday = range.from === p.todayStr && range.to === p.todayStr;
  const keep = { ...period.keep, student: studentId };

  const data = await withSchool(ctx, async (tx) => {
    const [results, info, list, pass, check, school] = await Promise.all([
      q ? searchStudents(tx, ctx, q, 8, p.current) : Promise.resolve([]),
      studentId ? pickupStudent(tx, ctx, studentId, p.today) : Promise.resolve(null),
      (async () => { const m = momentWhere(range, p.tz); return pickupsOn(tx, m.gte, m.lt); })(),
      gpId ? tx.gatePass.findFirst({ where: { id: gpId, kind: "PICKUP", archivedAt: null } }) : Promise.resolve(null),
      "check" in sp ? checkPass(tx, one(sp.check), p.now) : Promise.resolve(null),
      tx.school.findUnique({ where: { id: ctx.schoolId }, select: { phone: true } }),
    ]);
    const passMore = pass ? await Promise.all([
      tx.student.findFirst({ where: { id: pass.studentId }, select: { fullName: true, photoFileId: true } }),
      pass.guardianId ? tx.guardian.findFirst({ where: { id: pass.guardianId }, select: { photoFileId: true } }) : null,
      pass.issuedById ? tx.userLogin.findUnique({ where: { id: pass.issuedById }, select: { displayName: true } }) : null,
    ]) : null;
    return { results, info, list, pass, passMore, check, deskPhone: school?.phone ?? null };
  });

  const info = data.info;
  const photoOf = (id: string | null) => (id ? fileLink(id, ctx.schoolId) : null);
  const people: PickupChoice[] = (info?.people ?? []).map((x) => ({
    guardianId: x.guardianId, name: x.name, relationship: x.relationship, photo: photoOf(x.photoFileId), restriction: x.restriction, allowed: x.allowed,
    phone: gate ? null : p.can.pickupPhones ? showPhone(x.phone) : maskPhone(x.phone),
  }));
  const here = (extra: Record<string, string | null>) => qs(HREF, { ...keep, ...extra });
  const closeHref = here({});
  const stopOpen = one(sp.stop) === "1" && info && (canRelease || p.can.gateWork);
  const checkBase = qs(HREF, keep);
  const hostelOn = p.current.modulesOn.has("hostel-management");

  return (
    <div>
      <FoHead pageName="Student Pickup" href={HREF}
        sub={`${p.closedToday ? `${closedWords(p.closedToday)} · ` : ""}${gate ? "At the gate: check the pickup gate pass and the photos before a child leaves" : "Early pickup gate pass, only for people on the student’s approved pickup list"}`}
        actions={p.can.gateWork ? <ButtonLink href={`${checkBase}${checkBase.includes("?") ? "&" : "?"}check=`} scroll={false} variant={gate ? "primary" : "secondary"} icon={ScanLine}>Check gate pass</ButtonLink> : null} />
      <Split side={380}>
        <Col>
          <Card className="p-4 md:p-5">
            <label htmlFor="pk-search" className="text-[13px] font-semibold text-ink2">Find the student</label>
            <div className="flex gap-2 mt-1.5">
              <UrlSearch id="pk-search" big placeholder="Student name, class or number" label="Find the student" />
              <ScanIdButton base={HREF} />
            </div>
            {q && (
              <ul className="mt-2 divide-y divide-line/70 animate-fade">
                {q.length < 2 && <li className="py-3 text-[13.5px] text-ink3">Type at least 2 letters.</li>}
                {q.length >= 2 && data.results.length === 0 && <li className="py-3 text-[13.5px] text-ink3">No student called “{q}”. Try the admission number.</li>}
                {data.results.map((x) => (
                  <li key={x.id}>
                    <Link href={qs(HREF, { student: x.id, ...period.keep })} scroll={false} className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-sunken/60 rounded-xl px-2">
                      <Avatar name={x.name} size={38} src={photoOf(x.photoFileId)} />
                      <span className="min-w-0 flex-1"><b className="font-semibold text-[14.5px] block truncate">{x.name}</b><span className="text-[12.5px] text-ink3">{x.classSection ? `Class ${x.classSection}` : "No class this year"}{x.rollNo ? ` · Roll ${x.rollNo}` : ""} · <span className="font-mono">{x.admissionNo}</span></span></span>
                      <ChevronRight size={18} className="text-ink3" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {!q && !info && <p className="text-[12.5px] text-ink3 mt-2">Search by name, admission number, or a class and section like 7 B.</p>}
          </Card>

          {info ? (
            <Card className="overflow-hidden">
              <div className="p-4 md:p-5 flex items-center gap-4 border-b border-line">
                <Avatar name={info.student.name} size={64} src={photoOf(info.student.photoFileId)} />
                <div className="min-w-0 flex-1">
                  <p className="font-display font-semibold text-[20px] leading-tight">{info.student.name}</p>
                  <p className="text-[13px] text-ink3">{info.student.classSection ? `Class ${info.student.classSection}` : "No class this year"}{info.student.rollNo ? ` · Roll ${info.student.rollNo}` : ""} · <span className="font-mono text-[12px]">{info.student.admissionNo}</span></p>
                  <p className="text-[13px] text-ink3">{info.classTeacher ? `Class teacher ${info.classTeacher} · ` : ""}{info.attendance ? <span className={cx("font-semibold", { success: "text-ok", danger: "text-bad", warning: "text-warn", info: "text-info" }[info.attendance.tone] ?? "text-ink2")}>{info.attendance.label} today</span> : info.closed ? <span className="font-semibold text-warn">{closedWords(info.closed)}</span> : <span>Attendance not marked yet</span>}</p>
                </div>
              </div>
              <div className="p-4 md:p-5 flex flex-col gap-4">
                {info.closed && !gate && (
                  <Banner tone="info" icon={CalendarOff} title={`${closedWords(info.closed)}.`}>
                    Release {info.student.first} only if they are at school today, for example for an event or a special class.{hostelOn ? " Boarders going out use a Hostel Outing pass in Hostel Management." : ""}
                  </Banner>
                )}
                {canRelease ? (
                  <ReleaseForm key={info.student.id} student={{ id: info.student.id, first: info.student.first }} people={people} codeCheck={p.settings.pickupCodeCheck}
                    releasedBy={p.current.user.displayName} nowHHMM={hhmmOf(p.minute)} stopHref={here({ stop: "1" })}
                    photoBase={abilities(p.current).manage ? "/student-management/guardians/" : null} />
                ) : (
                  <>
                    <div>
                      <p className="text-[13px] font-semibold text-ink2 mb-2">Approved pickup list <span className="font-normal text-ink3">· from Student Management, Parents & Guardians</span></p>
                      {people.length ? <PickupList people={people} canChoose={false} /> : <p className="text-[13.5px] text-ink3">Nobody is on {info.student.first}’s pickup list yet.</p>}
                      {people.filter((x) => !x.allowed && x.restriction).map((x) => <p key={x.guardianId} className="mt-2 text-[13px] text-bad flex gap-1.5"><Ban size={15} className="shrink-0 mt-0.5" aria-hidden="true" />{x.restriction}</p>)}
                      {p.can.gateWork && <Link href={here({ stop: "1" })} scroll={false} className="mt-3 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-bad hover:underline"><UserRound size={16} aria-hidden="true" />Someone not on this list is here</Link>}
                    </div>
                    {gate ? <Banner tone="info" title="At the gate:">a child leaves only with a pickup gate pass from the desk. Match both faces with these photos.</Banner>
                      : <Banner tone="info">Only the reception desk releases a student. The list is changed in Student Management.</Banner>}
                  </>
                )}
              </div>
            </Card>
          ) : studentId ? (
            <Card><Empty icon={Search} title="Student not found" body="This student is not in the school records, or has left." action={<ButtonLink href={HREF} variant="secondary">Find another student</ButtonLink>} /></Card>
          ) : (
            <Card><Empty icon={DoorOpen} title="Find the student first" body="The approved pickup list shows here, with photos. Only people on it can collect the child." /></Card>
          )}
        </Col>
        <Col>
          <Card>
            <CardHeader title={isToday ? "Today’s early pickups" : "Early pickups"} description={`${data.list.length} student${data.list.length === 1 ? "" : "s"} · gate pass kind Pickup`} icon={DoorOpen} />
            <div className="px-5 pb-3"><PeriodFilter {...p.dates} fallback="today" size="sm" /></div>
            {data.list.length === 0 ? <p className="px-5 pb-5 text-[13.5px] text-ink3">{isToday ? "No early pickups today." : "No early pickups on these dates."}</p> : (
              <ul className="px-2 pb-2">
                {data.list.map((g) => {
                  const href = gate ? `${checkBase}${checkBase.includes("?") ? "&" : "?"}check=${g.passNo}` : here({ gp: g.id });
                  return (
                    <li key={g.id}>
                      <Link href={href} scroll={false} className="block px-3 py-2.5 rounded-xl hover:bg-sunken/60">
                        <div className="flex items-center gap-3">
                          <Avatar name={g.student} size={38} src={photoOf(g.studentPhotoFileId)} />
                          <div className="min-w-0 flex-1">
                            <p className="font-semibold text-[14.5px] truncate">{g.student}{g.sectionLabel ? <span className="text-ink3 font-normal"> · {g.sectionLabel}</span> : null}</p>
                            <p className="text-[12.5px] text-ink3 truncate">{isToday ? "" : `${shortDay(new Date(`${localDay(g.timeOut, p.tz)}T00:00:00Z`))}, `}{clockAt(g.timeOut, p.tz)} · with {g.collectorName} ({(g.collectorRelation ?? "guardian").toLowerCase()}) · {g.reason}</p>
                          </div>
                          <Pill tone={g.status === "LEFT" ? "ok" : "warn"}>{g.status === "LEFT" ? "Left" : "At gate"}</Pill>
                        </div>
                        <p className="text-[12px] text-ink3 mt-1 pl-[50px]"><span className="font-mono">{g.passNo}</span>{g.issuedBy ? ` · released by ${g.issuedBy}` : ""} · {g.status === "LEFT" ? `left ${g.leftAt ? clockAt(g.leftAt, p.tz) : ""}${g.checkedBy ? `, checked by ${g.checkedBy}` : ""}` : "Waiting at the gate"}</p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card className="p-5">
            <p className="font-semibold text-[14.5px] flex items-center gap-2"><ShieldCheck size={17} className="text-brand" aria-hidden="true" />How pickup stays safe</p>
            <ul className="mt-2.5 flex flex-col gap-2 text-[13.5px] text-ink2">
              <li className="flex gap-2"><Check size={16} className="text-ok shrink-0 mt-0.5" aria-hidden="true" />Only people on the approved list can be chosen.</li>
              <li className="flex gap-2"><Check size={16} className="text-ok shrink-0 mt-0.5" aria-hidden="true" />{p.settings.pickupCodeCheck ? "Photo match (no photo on record: ID proof or a call to a guardian), and a code to the guardian’s phone." : "Photo match with the guardian’s photo on record; with no photo, ID proof or a call to a guardian."}</li>
              <li className="flex gap-2"><Check size={16} className="text-ok shrink-0 mt-0.5" aria-hidden="true" />The gate checks the pass before the child leaves.</li>
              <li className="flex gap-2"><Ban size={16} className="text-bad shrink-0 mt-0.5" aria-hidden="true" />The list is changed only in Student Management, never at the desk or gate.</li>
            </ul>
          </Card>
        </Col>
      </Split>

      {stopOpen && info && (
        <StopSheet closeHref={closeHref} student={{ id: info.student.id, first: info.student.first }} classTeacher={info.classTeacher} deskPhone={gate ? data.deskPhone : null}
          calls={gate ? [] : info.people.filter((x) => x.allowed && x.phone).map((x) => ({ name: x.name, relationship: x.relationship, tel: x.phone }))} />
      )}
      {data.pass && data.passMore && !gate && (
        <GatePassSheet close={closeHref} pass={data.pass} student={data.passMore[0]?.fullName ?? "Student"} studentPhoto={photoOf(data.passMore[0]?.photoFileId ?? null)}
          guardianPhoto={photoOf(data.passMore[1]?.photoFileId ?? null)} issuedBy={data.passMore[2]?.displayName ?? null} tz={p.tz} canSend={canRelease} />
      )}
      {"check" in sp && p.can.gateWork && <CheckSheet title="Check gate pass" close={closeHref} code={one(sp.check)} res={data.check} tz={p.tz} gateWork={p.can.gateWork} today={p.today} schoolId={ctx.schoolId} />}
    </div>
  );
}

function localDay(d: Date, tz: string) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

type Pass = { id: string; passNo: string; sectionLabel: string | null; collectorName: string | null; collectorRelation: string | null; timeOut: Date; reason: string; verification: string | null; status: string; leftAt: Date | null };

/** The Pickup gate pass (mod-frontoffice.jsx GatePassSheet): print it or send it to the guardian's phone. */
async function GatePassSheet({ close, pass, student, studentPhoto, guardianPhoto, issuedBy, tz, canSend }: { close: string; pass: Pass; student: string; studentPhoto: string | null; guardianPhoto: string | null; issuedBy: string | null; tz: string; canSend: boolean }) {
  const qr = await qrSvg(`${await appOrigin()}${HREF}?check=${pass.passNo}`, 130);
  const left = pass.status === "LEFT";
  return (
    <UrlSheet title={`Gate pass ${pass.passNo}`} sub={left ? `Used at the gate at ${pass.leftAt ? clockAt(pass.leftAt, tz) : "an earlier time"}.` : "Kind: Pickup. Gate Security scans it before the child leaves."} closeHref={close}>
      <div className="flex flex-col items-center gap-4 pb-1">
        <div className="w-full rounded-2xl border-2 border-line overflow-hidden">
          <div className="px-4 py-2.5 bg-brand/10 flex justify-between items-center"><span className="eyebrow text-brand">Pickup gate pass</span><span className="font-mono text-[12.5px] font-semibold">{pass.passNo}</span></div>
          <div className="grid grid-cols-2 gap-3 p-4">
            {([[student, `${pass.sectionLabel ?? ""} · student`.replace(/^ · /, ""), studentPhoto], [pass.collectorName ?? "", `${pass.collectorRelation ?? "Guardian"} · collecting`, guardianPhoto]] as const).map(([n, sub, ph]) => (
              <div key={`${n}${sub}`} className="flex items-center gap-2.5 min-w-0"><Avatar name={n} size={46} src={ph} /><div className="min-w-0"><p className="font-semibold text-[14px] truncate">{n}</p><p className="text-[12px] text-ink3 truncate">{sub}</p></div></div>
            ))}
          </div>
          <div className="px-4 pb-3 text-[13px] text-ink2 grid grid-cols-2 gap-x-3 gap-y-1">
            <span><span className="text-ink3">Time </span>{clockAt(pass.timeOut, tz)}</span><span><span className="text-ink3">Reason </span>{pass.reason}</span>
            <span><span className="text-ink3">Verified </span>{pass.verification ?? "photo"}</span><span><span className="text-ink3">By </span>{issuedBy ?? "—"}</span>
          </div>
          <div className="flex justify-center pb-4"><div className="p-3 rounded-2xl bg-white border border-line" role="img" aria-label={`QR code for gate pass ${pass.passNo}`} dangerouslySetInnerHTML={{ __html: qr }} /></div>
        </div>
        <div className="grid grid-cols-2 gap-2 w-full">
          <a href={`${HREF}/pass/${pass.id}`} target="_blank" rel="noopener" className={buttonClass("secondary")}><Printer size={17} aria-hidden="true" />Print</a>
          {canSend && !left ? <ActButton action={sendGatePassAction} fields={{ gatePassId: pass.id }} label="Send to phone" icon="message" variant="secondary" size="md" className="w-full" pendingText="Sending…" /> : <span />}
        </div>
        <ButtonLink href={addQ(close, { gp: null })} scroll={false} variant="primary" className="w-full">Done</ButtonLink>
      </div>
    </UrlSheet>
  );
}
