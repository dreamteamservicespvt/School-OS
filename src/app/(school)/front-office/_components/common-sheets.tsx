// The sheets every Front Office page can open from its address (?do=visitor,
// ?pass=<id>, ?out=<id> and so on), so the four desk jobs work from any page
// and a link to a sheet can be shared or refreshed. Only sheets the person's
// role may use are ever shown; the server checks again on save.
import { LogOut, Printer } from "lucide-react";
import { withSchool } from "@/lib/db";
import { appOrigin } from "@/lib/origin";
import { qrSvg } from "@/lib/students/codes";
import { classList } from "@/lib/admission/settings";
import { can } from "@/lib/permissions";
import { staffToMeet } from "@/lib/front-office/staff";
import { staffWithLogins } from "@/lib/front-office/people";
import { peekRequestNo } from "@/lib/front-office/desk";
import { visitorScope } from "@/lib/front-office/access";
import { visitorStatus } from "@/lib/front-office/visitors";
import { clockAt, dayMonth, localOf, minuteNow, todayIso } from "@/lib/front-office/time";
import { hhmmOf, maskPhone, showPhone } from "@/lib/front-office/words";
import { fileLink } from "@/lib/files";
import { UrlSheet } from "@/components/ui/url-sheet";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Avatar } from "@/components/ui/avatar";
import { cx } from "@/components/ui/cx";
import { CheckOutSheet, VisitorSheet } from "./visitor-sheets";
import { CallSheet, EnquirySheet, WalkInSheet } from "./desk-sheets";
import { ListsSheet, SettingsSheet } from "./settings-sheets";
import { ActButton } from "./fields";
import { sendPassAction } from "../actions";
import { BASE, UUID, addQ, foPage, one, qs } from "../_lib/page";

type SP = Record<string, string | string[] | undefined>;

/** The page's own address without the sheet keys, so closing a sheet returns there. */
export function closeOf(href: string, sp: SP, keepKeys: string[]) {
  const keep: Record<string, string | null> = {};
  for (const k of keepKeys) keep[k] = one(sp[k]) || null;
  return qs(href, keep);
}

export async function CommonSheets({ sp, href, keepKeys }: { sp: SP; href: string; keepKeys: string[] }) {
  const p = await foPage();
  const close = closeOf(href, sp, keepKeys);
  const doing = one(sp.do);
  const passId = UUID.test(one(sp.pass)) ? one(sp.pass) : null;
  const outId = p.can.checkOut && UUID.test(one(sp.out)) ? one(sp.out) : null;
  const visitorOpen = doing === "visitor" && p.can.register;
  const enquiryOpen = doing === "enquiry" && p.can.desk && can(p.current.permissions, "admission-management", "create");
  const callOpen = doing === "call" && p.can.desk;
  const walkOpen = doing === "walkin" && p.can.desk;
  const settingsOpen = doing === "settings" && p.can.manage;
  const listsOpen = doing === "lists" && p.can.manage;
  if (!visitorOpen && !enquiryOpen && !callOpen && !walkOpen && !settingsOpen && !listsOpen && !passId && !outId) return null;
  const ctx = p.current.ctx;
  const data = await withSchool(ctx, async (tx) => {
    const appointmentId = UUID.test(one(sp.appointment)) ? one(sp.appointment) : null;
    const visitorPresetId = UUID.test(one(sp.visitor)) ? one(sp.visitor) : null;
    const [staff, classes, logins, nextNo, pass, out, appt, enqVisitor] = await Promise.all([
      visitorOpen ? staffToMeet(tx, ctx, p.today, p.minute) : null,
      enquiryOpen || callOpen ? classList(tx) : null,
      callOpen ? staffWithLogins(tx) : null,
      walkOpen ? peekRequestNo(tx, ctx, p.todayStr.slice(0, 4)) : null,
      passId ? tx.visitorEntry.findFirst({ where: { id: passId, archivedAt: null, ...visitorScope(p.v, p.today) } }) : null,
      outId ? tx.visitorEntry.findFirst({ where: { id: outId, archivedAt: null, timeOut: null, ...visitorScope(p.v, p.today) } }) : null,
      visitorOpen && appointmentId ? tx.appointment.findFirst({ where: { id: appointmentId, archivedAt: null, status: "BOOKED" } }) : null,
      enquiryOpen && visitorPresetId ? tx.visitorEntry.findFirst({ where: { id: visitorPresetId, archivedAt: null }, select: { id: true, name: true, phone: true } }) : null,
    ]);
    const met = pass?.meetStaffId ? await tx.staff.findFirst({ where: { id: pass.meetStaffId }, select: { fullName: true } }) : null;
    return { staff, classes, logins, nextNo, pass, out, appt, enqVisitor, met: met?.fullName ?? null };
  });

  const classOpts = (data.classes ?? []).map((c) => ({ value: c.id, label: c.name }));
  const now = new Date();
  return (
    <>
      {visitorOpen && data.staff && (
        <VisitorSheet closeHref={close} back={close} purposes={p.settings.visitorPurposes} staff={data.staff.map(({ loginId, ...s }) => (void loginId, s))}
          photoRequired={p.settings.photoRequired} idRequired={p.settings.idProofRequired}
          preset={data.appt ? { appointmentId: data.appt.id, name: data.appt.visitorName, phone: data.appt.visitorPhone, meetStaffId: data.appt.staffId, note: `Appointment: ${data.appt.purpose}`.slice(0, 200) } : null} />
      )}
      {enquiryOpen && (
        <EnquirySheet closeHref={close} classes={classOpts} source={one(sp.source) === "phone" ? "phone" : "walk-in"} admissions={p.current.permissions["admission-management"].see !== "none"}
          preset={data.enqVisitor ? { name: data.enqVisitor.name, phone: data.enqVisitor.phone, visitorId: data.enqVisitor.id } : null} />
      )}
      {callOpen && data.logins && (
        <CallSheet closeHref={close} purposes={p.settings.callPurposes} classes={classOpts} today={p.todayStr} admissions={p.current.permissions["admission-management"].see !== "none"}
          staff={data.logins.map((s) => ({ value: s.loginId, label: `${s.name} · ${s.role}` }))} defaultWho={data.logins.find((s) => s.loginId === p.current.user.id)?.loginId ?? data.logins[0]?.loginId ?? ""} />
      )}
      {walkOpen && data.nextNo && <WalkInSheet closeHref={close} departments={p.settings.requestDepartments} nextNo={data.nextNo} />}
      {settingsOpen && <SettingsSheet closeHref={close} s={p.settings} features={[...p.features]} dayEnd={p.passEndWords} />}
      {listsOpen && <ListsSheet closeHref={close} lists={p.settings} />}
      {data.pass && <PassSheet close={close} v={data.pass} met={data.met} canCheckOut={p.can.checkOut} canSend={p.can.register} masked={!p.can.visitorPhones} tz={p.tz} schoolName={p.current.school.name} now={now} />}
      {passId && !data.pass && (
        <UrlSheet title="Pass not found" closeHref={close}><p className="text-[14px] text-ink2 pb-4">This visitor entry was not found, or it is not one you can see.</p></UrlSheet>
      )}
      {data.out && (
        <CheckOutSheet closeHref={close} start={visitorStatus(data.out, now) === "Expired" ? hhmmOf(Math.min(23 * 60 + 59, minuteOfInstant(data.out.passExpiresAt, p.tz))) : hhmmOf(minuteNow(p.tz, now))}
          visitor={{ id: data.out.id, name: data.out.name, passNo: data.out.passNo, expired: visitorStatus(data.out, now) === "Expired", when: todayIso(p.tz, now) === data.out.visitDate.toISOString().slice(0, 10) ? "today" : dayMonth(data.out.visitDate) }} />
      )}
    </>
  );
}

function minuteOfInstant(d: Date, tz: string) {
  const t = localOf(d, tz).slice(11);
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
}

type PassVisitor = { id: string; passNo: string; name: string; phone: string; purpose: string; peopleCount: number; vehicleNo: string | null; timeIn: Date; timeOut: Date | null; passExpiresAt: Date; visitDate: Date; photoFileId: string | null; schoolId: string };

/** Visitor pass: on screen, printed or sent to the visitor's phone (mod-frontoffice.jsx PassSheet). */
async function PassSheet({ close, v, met, canCheckOut, canSend, masked, tz, schoolName, now }: { close: string; v: PassVisitor; met: string | null; canCheckOut: boolean; canSend: boolean; masked: boolean; tz: string; schoolName: string; now: Date }) {
  const status = visitorStatus(v, now);
  const expired = status === "Expired";
  const out = status === "Out";
  const qr = await qrSvg(`${await appOrigin()}${BASE}/visitors?check=${v.passNo}`, 140);
  const dayWords = todayIso(tz, now) === v.visitDate.toISOString().slice(0, 10) ? "today" : dayMonth(v.visitDate);
  const photo = v.photoFileId ? fileLink(v.photoFileId, v.schoolId) : null;
  const sub = out ? `Checked out at ${clockAt(v.timeOut!, tz)}. This pass no longer works.` : expired ? `Expired at ${clockAt(v.passExpiresAt, tz)} on ${dayWords}. A scan shows “Expired”.` : `Valid until ${clockAt(v.passExpiresAt, tz)} today. It expires by itself.`;
  return (
    <UrlSheet title={`Visitor pass ${v.passNo}`} sub={sub} closeHref={close}>
      <div className="flex flex-col items-center gap-4 pb-1">
        <div className={cx("w-full rounded-2xl border-2 overflow-hidden", expired || out ? "border-bad/40" : "border-line")}>
          <div className={cx("px-4 py-2.5 flex items-center justify-between", expired || out ? "bg-bad/10" : "bg-brand/10")}>
            <span className={cx("eyebrow", expired || out ? "text-bad" : "text-brand")}>Visitor · {schoolName}</span>
            <span className="font-mono text-[12.5px] font-semibold">{v.passNo}</span>
          </div>
          <div className="p-4 flex items-center gap-4">
            <Avatar name={v.name} size={64} src={photo} />
            <div className="min-w-0 flex-1">
              <p className="font-display font-semibold text-[19px] leading-tight">{v.name}</p>
              <p className="text-[13px] text-ink3">{v.purpose}{met ? ` · to meet ${met}` : ""}</p>
              <p className="text-[13px] text-ink3 tnum">In {clockAt(v.timeIn, tz)}{v.peopleCount > 1 ? ` · ${v.peopleCount} people` : ""}{v.vehicleNo ? ` · ${v.vehicleNo}` : ""}</p>
              <p className="text-[12.5px] text-ink3 tnum">{masked ? maskPhone(v.phone) : showPhone(v.phone)}</p>
            </div>
          </div>
          <div className="relative flex justify-center pb-4">
            <div className={cx("p-3 rounded-2xl bg-white shadow-card border border-line shrink-0", (expired || out) && "opacity-40")} dangerouslySetInnerHTML={{ __html: qr }} aria-label={`QR code for pass ${v.passNo}`} role="img" />
            {(expired || out) && <span className="absolute top-1/2 -translate-y-1/2 px-4 py-1.5 rounded-xl bg-bad text-white font-display font-semibold text-[20px] -rotate-6 shadow-pop">{out ? "Checked out" : "Expired"}</span>}
          </div>
        </div>
        {!out && canSend && (
          <div className="grid grid-cols-2 gap-2 w-full">
            <a href={`${BASE}/visitors/${v.id}/pass`} target="_blank" rel="noopener" className={buttonClass("secondary")}><Printer size={17} aria-hidden="true" />Print</a>
            {canSend && !expired ? <ActButton action={sendPassAction} fields={{ visitorId: v.id }} label="Send to phone" icon="message" variant="secondary" size="md" className="w-full" pendingText="Sending…" />
              : <span />}
          </div>
        )}
        {canCheckOut && !out && <ButtonLink href={addQ(close, { out: v.id })} scroll={false} variant={expired ? "primary" : "soft"} icon={LogOut} className="w-full">{expired ? "Close with the right time" : "Check out now"}</ButtonLink>}
      </div>
    </UrlSheet>
  );
}
