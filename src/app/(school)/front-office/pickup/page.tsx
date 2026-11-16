import Link from "next/link";
import { Ban, CalendarOff, Check, ChevronRight, DoorOpen, Printer, ScanLine, Search, ShieldCheck, UserRound } from "lucide-react";
import { withSchool } from "@/lib/db";
import { momentWhere } from "@/lib/periods";
import { appOrigin } from "@/lib/origin";
import { qrSvg } from "@/lib/students/codes";
import { fileLink } from "@/lib/files";
import { abilities } from "@/lib/students/access";
import { checkPass } from "@/lib/front-office/visitors";
import { openPickupPass, pickupCodeCheckFor, pickupCodeLock, pickupLockWords, pickupStudent, pickupsOn, searchStudents } from "@/lib/front-office/pickup";
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
import { Words } from "@/lib/i18n/client";
import { getT, pageTitle } from "@/lib/i18n/server";
import type { T } from "@/lib/i18n/t";
import { classIn } from "@/lib/class-name";

export async function generateMetadata() {
  return { title: await pageTitle("Student Pickup") };
}

const HREF = `${BASE}/pickup`;

/** Student Pickup (16 §2, mod-frontoffice.jsx PickupPage): early pickup only by people on the approved list, with a gate pass the gate checks. */
export default async function PickupPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await foGuard("pickup");
  const t = await getT();
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
    const codeCheck = await pickupCodeCheckFor(tx, ctx, p.settings.pickupCodeCheck);
    const [results, info, list, pass, check, school, lock, openPass] = await Promise.all([
      q ? searchStudents(tx, ctx, q, 8, p.current) : Promise.resolve([]),
      studentId ? pickupStudent(tx, ctx, studentId, p.today) : Promise.resolve(null),
      (async () => { const m = momentWhere(range, p.tz); return pickupsOn(tx, m.gte, m.lt); })(),
      gpId ? tx.gatePass.findFirst({ where: { id: gpId, kind: "PICKUP", archivedAt: null } }) : Promise.resolve(null),
      "check" in sp ? checkPass(tx, one(sp.check), p.now) : Promise.resolve(null),
      tx.school.findUnique({ where: { id: ctx.schoolId }, select: { phone: true } }),
      // Too many wrong pickup codes lock code checks for a while (gap list G04).
      studentId && codeCheck.on && canRelease ? pickupCodeLock(tx, studentId, ctx.userId, p.now) : Promise.resolve(null),
      // Already released today and waiting at the gate: no second release (live test 16 Nov: the button looked ready).
      studentId && canRelease ? openPickupPass(tx, studentId, p.tz, p.now) : Promise.resolve(null),
    ]);
    const passMore = pass ? await Promise.all([
      tx.student.findFirst({ where: { id: pass.studentId }, select: { fullName: true, photoFileId: true } }),
      pass.guardianId ? tx.guardian.findFirst({ where: { id: pass.guardianId }, select: { photoFileId: true } }) : null,
      pass.issuedById ? tx.userLogin.findUnique({ where: { id: pass.issuedById }, select: { displayName: true } }) : null,
    ]) : null;
    return { results, info, list, pass, passMore, check, deskPhone: school?.phone ?? null, lock, codeCheck, openPass };
  });

  const info = data.info;
  const photoOf = (id: string | null) => (id ? fileLink(id, ctx.schoolId) : null);
  const people: PickupChoice[] = (info?.people ?? []).map((x) => ({
    guardianId: x.guardianId, name: x.name, relationship: x.relationship, photo: photoOf(x.photoFileId), restriction: x.restriction, allowed: x.allowed,
    phone: gate || !x.phone ? null : p.can.pickupPhones ? showPhone(x.phone) : maskPhone(x.phone),
  }));
  const here = (extra: Record<string, string | null>) => qs(HREF, { ...keep, ...extra });
  const closeHref = here({});
  const stopOpen = one(sp.stop) === "1" && info && (canRelease || p.can.gateWork);
  const checkBase = qs(HREF, keep);
  const hostelOn = p.current.modulesOn.has("hostel-management");

  return (
    <div>
      <FoHead pageName="Student Pickup" href={HREF}
        sub={`${p.closedToday ? `${closedWords(p.closedToday, t)} · ` : ""}${gate ? t("At the gate: check the pickup gate pass and the photos before a child leaves") : t("Early pickup gate pass, only for people on the student’s approved pickup list")}`}
        actions={p.can.gateWork ? <ButtonLink href={`${checkBase}${checkBase.includes("?") ? "&" : "?"}check=`} scroll={false} variant={gate ? "primary" : "secondary"} icon={ScanLine}><Words k="Check gate pass" /></ButtonLink> : null} />
      <Split side={380}>
        <Col>
          <Card className="p-4 md:p-5">
            <label htmlFor="pk-search" className="text-[13px] font-semibold text-ink2"><Words k="Find the student" /></label>
            <div className="flex gap-2 mt-1.5">
              <UrlSearch id="pk-search" big placeholder="Student name, class or number" label="Find the student" />
              <ScanIdButton base={HREF} />
            </div>
            {q && (
              <ul className="mt-2 divide-y divide-line/70 animate-fade">
                {q.length < 2 && <li className="py-3 text-[13.5px] text-ink3"><Words k="Type at least 2 letters." /></li>}
                {q.length >= 2 && data.results.length === 0 && <li className="py-3 text-[13.5px] text-ink3">{t("No student called “{name}”. Try the admission number.", { name: q })}</li>}
                {data.results.map((x) => (
                  <li key={x.id}>
                    <Link href={qs(HREF, { student: x.id, ...period.keep })} scroll={false} className="w-full flex items-center gap-3 py-2.5 text-left hover:bg-sunken/60 rounded-xl px-2">
                      <Avatar name={x.name} size={38} src={photoOf(x.photoFileId)} />
                      <span className="min-w-0 flex-1"><b className="font-semibold text-[14.5px] block truncate">{x.name}</b><span className="text-[12.5px] text-ink3">{x.classSection ? classIn(t, x.classSection) : t("No class this year")}{x.rollNo ? ` · ${t("Roll {n}", { n: x.rollNo })}` : ""}{x.parent ? ` · ${x.parent}` : ""} · <span className="font-mono">{x.admissionNo}</span></span></span>
                      <ChevronRight size={18} className="text-ink3" aria-hidden="true" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {!q && !info && <p className="text-[12.5px] text-ink3 mt-2"><Words k="Search by name, admission number, or a class and section like 7 B." /></p>}
          </Card>

          {info ? (
            <Card className="overflow-hidden">
              <div className="p-4 md:p-5 flex items-center gap-4 border-b border-line">
                <Avatar name={info.student.name} size={64} src={photoOf(info.student.photoFileId)} />
                <div className="min-w-0 flex-1">
                  <p className="font-display font-semibold text-[20px] leading-tight">{info.student.name}</p>
                  <p className="text-[13px] text-ink3">{info.student.classSection ? classIn(t, info.student.classSection) : t("No class this year")}{info.student.rollNo ? ` · ${t("Roll {n}", { n: info.student.rollNo })}` : ""} · <span className="font-mono text-[12px]">{info.student.admissionNo}</span></p>
                  <p className="text-[13px] text-ink3">{info.classTeacher ? `${t("Class teacher {name}", { name: info.classTeacher })} · ` : ""}{info.attendance ? <span className={cx("font-semibold", { success: "text-ok", danger: "text-bad", warning: "text-warn", info: "text-info" }[info.attendance.tone] ?? "text-ink2")}>{t.any(info.attendance.label)} <Words k="today" /></span> : info.closed ? <span className="font-semibold text-warn">{closedWords(info.closed, t)}</span> : <span><Words k="Attendance not marked yet" /></span>}</p>
                </div>
              </div>
              <div className="p-4 md:p-5 flex flex-col gap-4">
                {info.closed && !gate && (
                  <Banner tone="info" icon={CalendarOff} title={`${closedWords(info.closed, t)}.`}>
                    {t("Release {name} only if they are at school today, for example for an event or a special class.", { name: info.student.first })}{hostelOn ? ` ${t("Boarders going out use a Hostel Outing pass in Hostel Management.")}` : ""}
                  </Banner>
                )}
                {canRelease && data.codeCheck.why && !data.openPass && <Banner tone="info" title={t.any(data.codeCheck.why)} />}
                {canRelease && data.openPass ? (
                  <Banner tone="warn" title={t("{name} already has gate pass {pass} waiting at the gate.", { name: info.student.first, pass: data.openPass.passNo })} />
                ) : canRelease ? (
                  <ReleaseForm key={info.student.id} student={{ id: info.student.id, first: info.student.first }} people={people} codeCheck={data.codeCheck.on}
                    codeLock={data.lock ? pickupLockWords(data.lock, info.student.first, p.tz) : null}
                    releasedBy={p.current.user.displayName} nowHHMM={hhmmOf(p.minute)} stopHref={here({ stop: "1" })}
                    photoBase={abilities(p.current).manage ? "/student-management/guardians/" : null} />
                ) : (
                  <>
                    <div>
                      <p className="text-[13px] font-semibold text-ink2 mb-2"><Words k="Approved pickup list" /> <span className="font-normal text-ink3"><Words k={"· from Student Management, Parents & Guardians"} /></span></p>
                      {people.length ? <PickupList people={people} canChoose={false} /> : <p className="text-[13.5px] text-ink3">{t("Nobody is on {name}’s pickup list yet.", { name: info.student.first })}</p>}
                      {people.filter((x) => !x.allowed && x.restriction).map((x) => <p key={x.guardianId} className="mt-2 text-[13px] text-bad flex gap-1.5"><Ban size={15} className="shrink-0 mt-0.5" aria-hidden="true" />{t.any(x.restriction ?? "")}</p>)}
                      {p.can.gateWork && <Link href={here({ stop: "1" })} scroll={false} className="mt-3 inline-flex items-center gap-1.5 text-[13.5px] font-semibold text-bad hover:underline"><UserRound size={16} aria-hidden="true" /><Words k="Someone not on this list is here" /></Link>}
                    </div>
                    {gate ? <Banner tone="info" title="At the gate:"><Words k="a child leaves only with a pickup gate pass from the desk. Match both faces with these photos." /></Banner>
                      : <Banner tone="info"><Words k="Only the reception desk releases a student." /></Banner>}
                  </>
                )}
              </div>
            </Card>
          ) : studentId ? (
            <Card><Empty icon={Search} title="Student not found" body="This student is not in the school records, or has left." action={<ButtonLink href={HREF} variant="secondary"><Words k="Find another student" /></ButtonLink>} /></Card>
          ) : (
            <Card><Empty icon={DoorOpen} title="Find the student first" body="The approved pickup list shows here, with photos. Only people on it can collect the child." /></Card>
          )}
        </Col>
        <Col>
          <Card>
            <CardHeader title={isToday ? "Today’s early pickups" : "Early pickups"} description={data.list.length === 1 ? t("1 student") : t("{n} students", { n: data.list.length })} icon={DoorOpen} />
            <div className="px-5 pb-3"><PeriodFilter {...p.dates} fallback="today" size="sm" /></div>
            {data.list.length === 0 ? <p className="px-5 pb-5 text-[13.5px] text-ink3">{isToday ? t("No early pickups today.") : t("No early pickups on these dates.")}</p> : (
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
                            <p className="text-[12.5px] text-ink3 truncate">{isToday ? "" : `${shortDay(new Date(`${localDay(g.timeOut, p.tz)}T00:00:00Z`), t)}, `}{clockAt(g.timeOut, p.tz)} · {t("with {name} ({relation})", { name: g.collectorName ?? "", relation: t.any(g.collectorRelation ?? "Guardian").toLowerCase() })} · {t.any(g.reason)}</p>
                          </div>
                          <Pill tone={g.status === "LEFT" ? "ok" : "warn"}>{g.status === "LEFT" ? "Left" : "At gate"}</Pill>
                        </div>
                        <p className="text-[12px] text-ink3 mt-1 pl-[50px]"><span className="font-mono">{g.passNo}</span>{g.issuedBy ? ` · ${t("released by {name}", { name: g.issuedBy })}` : ""} · {g.status === "LEFT" ? `${t("left {time}", { time: g.leftAt ? clockAt(g.leftAt, p.tz) : "" })}${g.checkedBy ? `, ${t("checked by {name}", { name: g.checkedBy })}` : ""}` : t("Waiting at the gate")}</p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card className="p-5">
            <p className="font-semibold text-[14.5px] flex items-center gap-2"><ShieldCheck size={17} className="text-brand" aria-hidden="true" /><Words k="How pickup stays safe" /></p>
            <ul className="mt-2.5 flex flex-col gap-2 text-[13.5px] text-ink2">
              <li className="flex gap-2"><Check size={16} className="text-ok shrink-0 mt-0.5" aria-hidden="true" /><Words k="Only people on the approved list can be chosen." /></li>
              <li className="flex gap-2"><Check size={16} className="text-ok shrink-0 mt-0.5" aria-hidden="true" />{data.codeCheck.on ? t("Photo match (no photo on record: ID proof or a call to a guardian), and a code to the guardian’s phone.") : t("Photo match with the guardian’s photo on record; with no photo, ID proof or a call to a guardian.")}</li>
              <li className="flex gap-2"><Check size={16} className="text-ok shrink-0 mt-0.5" aria-hidden="true" /><Words k="The gate checks the pass before the child leaves." /></li>
              <li className="flex gap-2"><Ban size={16} className="text-bad shrink-0 mt-0.5" aria-hidden="true" /><Words k="The list is changed only in Student Management, never at the desk or gate." /></li>
            </ul>
          </Card>
        </Col>
      </Split>

      {stopOpen && info && (
        <StopSheet closeHref={closeHref} student={{ id: info.student.id, first: info.student.first }} classTeacher={info.classTeacher} deskPhone={gate ? data.deskPhone : null}
          calls={gate ? [] : info.people.filter((x) => x.allowed && x.phone).map((x) => ({ name: x.name, relationship: x.relationship, tel: x.phone! }))} />
      )}
      {data.pass && data.passMore && !gate && (
        <GatePassSheet t={t} close={closeHref} pass={data.pass} student={data.passMore[0]?.fullName ?? "Student"} studentPhoto={photoOf(data.passMore[0]?.photoFileId ?? null)}
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
async function GatePassSheet({ t, close, pass, student, studentPhoto, guardianPhoto, issuedBy, tz, canSend }: { t: T; close: string; pass: Pass; student: string; studentPhoto: string | null; guardianPhoto: string | null; issuedBy: string | null; tz: string; canSend: boolean }) {
  const qr = await qrSvg(`${await appOrigin()}${HREF}?check=${pass.passNo}`, 130);
  const left = pass.status === "LEFT";
  return (
    <UrlSheet title={t("Gate pass {pass}", { pass: pass.passNo })} sub={left ? (pass.leftAt ? t("Used at the gate at {time}.", { time: clockAt(pass.leftAt, tz) }) : t("Used at the gate earlier.")) : t("Show this pass at the gate.")} closeHref={close}>
      <div className="flex flex-col items-center gap-4 pb-1">
        <div className="w-full rounded-2xl border-2 border-line overflow-hidden">
          <div className="px-4 py-2.5 bg-brand/10 flex justify-between items-center"><span className="eyebrow text-brand"><Words k="Pickup gate pass" /></span><span className="font-mono text-[12.5px] font-semibold">{pass.passNo}</span></div>
          <div className="grid grid-cols-2 gap-3 p-4">
            {([[student, `${pass.sectionLabel ?? ""} · ${t("Student")}`.replace(/^ · /, ""), studentPhoto], [pass.collectorName ?? "", t.any(pass.collectorRelation ?? "Guardian"), guardianPhoto]] as const).map(([n, sub, ph]) => (
              <div key={`${n}${sub}`} className="flex items-center gap-2.5 min-w-0"><Avatar name={n} size={46} src={ph} /><div className="min-w-0"><p className="font-semibold text-[14px] break-words">{n}</p><p className="text-[12px] text-ink3 break-words">{sub}</p></div></div>
            ))}
          </div>
          <div className="px-4 pb-3 text-[13px] text-ink2 grid grid-cols-2 gap-x-3 gap-y-1">
            <span><span className="text-ink3"><Words k="Time" /> </span>{clockAt(pass.timeOut, tz)}</span><span><span className="text-ink3"><Words k="Reason" /> </span>{t.any(pass.reason)}</span>
            <span><span className="text-ink3"><Words k="Checked with" /> </span>{(pass.verification ?? "photo").split(", ").map((x) => t.any(x)).join(", ")}</span><span><span className="text-ink3"><Words k="By" /> </span>{issuedBy ?? "—"}</span>
          </div>
          <div className="flex justify-center pb-4"><div className="p-3 rounded-2xl bg-white border border-line" role="img" aria-label={t("QR code for gate pass {pass}", { pass: pass.passNo })} dangerouslySetInnerHTML={{ __html: qr }} /></div>
        </div>
        <div className="grid grid-cols-2 gap-2 w-full">
          <a href={`${HREF}/pass/${pass.id}`} target="_blank" rel="noopener" className={buttonClass("secondary")}><Printer size={17} aria-hidden="true" /><Words k="Print" /></a>
          {canSend && !left ? <ActButton action={sendGatePassAction} fields={{ gatePassId: pass.id }} label="Send to phone" icon="message" variant="secondary" size="md" className="w-full" pendingText="Sending…" /> : <span />}
        </div>
        <ButtonLink href={addQ(close, { gp: null })} scroll={false} variant="primary" className="w-full"><Words k="Done" /></ButtonLink>
      </div>
    </UrlSheet>
  );
}
