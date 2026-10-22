import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { attendancePage } from "@/lib/attendance/page";
import { BASE, studentLimit } from "@/lib/attendance/access";
import { ATTENDANCE_FEATURES, COUNTS, statusList, TONES } from "@/lib/attendance/settings";
import { BellRing, CalendarDays, Clock, CloudOff, ListChecks, Lock, MessageCircle, Palette, Scale, ScanFace, Table2 } from "lucide-react";
import { absenceMessageView } from "@/lib/attendance/notify-parents";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { lockState } from "@/lib/attendance/marks";
import { minutesText, time12 } from "@/lib/attendance/time";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { Chips } from "@/components/ui/chips";
import { AttHead } from "../_components/att-head";
import { ActionButton } from "../../staff-hr-management/_components/forms";
import { DisplayForm, LateRulesForm, LeaveRulesForm, LeaveTypeForm, NotificationsForm, PunchMethodsForm, StatusForm, StatusList, type SettingsValues } from "../_components/settings-forms";
import {
  archiveLeaveTypeAction, archiveStatusAction, saveDisplayAction, saveFeatureAction, saveLateRulesAction, saveLeaveRulesAction, saveLeaveTypeAction,
  saveNotificationsAction, savePunchMethodsAction, saveStatusAction,
} from "./actions";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Attendance Settings" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const TABS = [
  { key: "punch", label: "Punch methods" },
  { key: "display", label: "Display and register" },
  { key: "late", label: "Late rules and lock" },
  { key: "alerts", label: "Alerts" },
  { key: "leave", label: "Student leave" },
] as const;
/** Older links used "methods" for the first tab. */
const OLD: Record<string, string> = { methods: "punch" };
const ROLES = [
  { value: "principal", label: "Principal" }, { value: "school-admin", label: "School Admin" }, { value: "vice-principal", label: "Vice Principal" },
  { value: "class-teacher", label: "Class Teacher" }, { value: "hr", label: "HR" },
];

export default async function SettingsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { current, access, settings: s, features, today, now, tz } = await attendancePage();
  if (!access.admin) redirect("/no-access?m=attendance-management");
  const asked = typeof sp.tab === "string" ? (OLD[sp.tab] ?? sp.tab) : "";
  const tab = TABS.find((t) => t.key === asked)?.key ?? "punch";
  const v: SettingsValues = {
    studentMethods: s.studentMethods, staffMethods: s.staffMethods, periodWise: features.has("attendance-period-wise"), offline: features.has("attendance-offline"),
    punchWindowStart: s.punchWindowStart, punchWindowEnd: s.punchWindowEnd, repeatPunchMinutes: s.repeatPunchMinutes, maxClockSkewMinutes: s.maxClockSkewMinutes,
    defaultStatus: s.defaultStatus, periodDayRule: s.periodDayRule, registerOrder: s.registerOrder, showPhotos: s.showPhotos,
    studentStartTime: s.studentStartTime, studentLateAfterMin: s.studentLateAfterMin, staffStartTime: s.staffStartTime, staffLateAfterMin: s.staffLateAfterMin,
    staffHalfDayAfter: s.staffHalfDayAfter ?? "", lockTime: s.lockTime, lockOverrideRoles: s.lockOverrideRoles,
    absenceAlertOn: s.absenceAlertOn, absenceDelayMinutes: s.absenceDelayMinutes, absenceChannels: s.absenceChannels, absenceTemplate: s.absenceTemplate, lateAlertOn: s.lateAlertOn,
    thresholdOn: s.thresholdOn, thresholdPercent: s.thresholdPercent, thresholdNotify: s.thresholdNotify, chronicOn: s.chronicOn, chronicDays: s.chronicDays, chronicNotify: s.chronicNotify,
    classTeacherLeaveDays: s.classTeacherLeaveDays, quotaOverNeedsApproval: s.quotaOverNeedsApproval, quotasOn: features.has("attendance-leave-quotas"),
  };
  const data = await withSchool(current.ctx, async (tx) => {
    const [statuses, types, quotas, school, sample] = await Promise.all([
      statusList(tx, current.ctx, { includeArchived: true }),
      tx.leaveType.findMany({ where: { forWhom: "student", archivedAt: null }, orderBy: { name: "asc" } }),
      tx.studentLeaveQuota.findMany({ where: { archivedAt: null } }),
      tx.school.findUnique({ where: { id: current.ctx.schoolId }, select: { name: true } }),
      // A real student for the message preview: the first in the list (every campus's current year; their own campus's when limited to one).
      tx.enrolment.findFirst({ where: { archivedAt: null, ...(access.yearIds.length ? { academicYearId: { in: access.yearIds } } : {}), student: { archivedAt: null, ...studentLimit(access) } }, orderBy: { student: { fullName: "asc" } }, select: { sectionId: true, student: { select: { fullName: true } } } }),
    ]);
    const section = sample ? await tx.section.findFirst({ where: { id: sample.sectionId }, select: { name: true, schoolClass: { select: { name: true } } } }) : null;
    // The message parents really get: Communication's "Absent today" message (one setting, shown here read-only).
    const message = tab === "alerts" ? await absenceMessageView(tx, current.ctx, { student: sample?.student.fullName ?? "Your child", className: section ? `${section.schoolClass.name} ${section.name}` : "the class", date: today }) : null;
    return { statuses, types, quotas, school, message, sample: sample ? { name: sample.student.fullName, className: section ? `${section.schoolClass.name} ${section.name}` : null } : null };
  });
  const tones = TONES.map((t) => ({ value: t.value, label: t.label }));
  const counts = COUNTS.map((c) => ({ value: c.value, label: c.label }));
  const extra = ATTENDANCE_FEATURES.filter((f) => f.key === "attendance-shifts" || f.key === "attendance-overtime" || f.key === "attendance-absence-reasons");

  const lock = lockState(s, today, now, tz);
  const lockIn = Math.max(0, Math.round((lock.at.getTime() - now.getTime()) / 60000));
  const message = data.message;
  const roleName = (r: string) => ROLES.find((x) => x.value === r)?.label ?? r;
  const countsTone = (c: string) => (c === "present" ? "success" : c === "absent" ? "danger" : c === "half" ? "warning" : "neutral") as "success" | "danger" | "warning" | "neutral";
  const path = `${BASE}/settings`;

  return (
    <>
      <AttHead access={access} features={features} userId={current.user.id} href={path} sub="How attendance is taken, when it locks, and who is told" />
      <div className="flex max-w-5xl flex-col gap-5 lg:gap-6">
        <Chips label="Settings sections" value={tab} options={TABS.map((t) => ({ value: t.key, label: t.label, href: `${path}?tab=${t.key}` }))} />

        {tab === "punch" && (
          <>
            <Card>
              <CardHeader icon={ListChecks} title="Punch methods" description="How attendance is taken, for students and for staff. Details for devices, QR and the campus area are on Devices & QR." />
              <CardBody><PunchMethodsForm action={savePunchMethodsAction} v={v} /></CardBody>
            </Card>
            <Card className="overflow-hidden">
              <CardHeader icon={ScanFace} title="More options" description="Optional parts, switched on for this school only." />
              <ul className="divide-y divide-line/70 border-t border-line/70">
                {extra.map((f) => {
                  const isOn = features.has(f.key);
                  return (
                    <li key={f.key} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center">
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 text-[14px] font-semibold">{f.label} <Pill tone={isOn ? "success" : "neutral"}>{isOn ? "On" : "Off"}</Pill></p>
                        <p className="text-[12.5px] text-ink3">{f.about}</p>
                      </div>
                      <ActionButton action={saveFeatureAction} hidden={{ key: f.key, on: isOn ? "0" : "1" }}>{isOn ? "Switch off" : "Switch on"}</ActionButton>
                    </li>
                  );
                })}
              </ul>
            </Card>
            <Card>
              <CardHeader icon={CloudOff} title="Without internet" description={v.offline ? "Offline mode is on. Take Attendance saves on the phone and sends when the internet is back." : "Offline mode is off. Switch it on in Punch methods above."} />
            </Card>
          </>
        )}

        {tab === "display" && (
          <>
            <Card className="overflow-hidden">
              <CardHeader icon={Palette} title="Status list" description="Letter, colour and how each status counts in the %" action={<StatusForm action={saveStatusAction} tones={tones} counts={counts} />} />
              <CardBody>
                <StatusList save={saveStatusAction} archive={archiveStatusAction} tones={tones} counts={counts}
                  rows={data.statuses.map((x) => ({ id: x.id, key: x.key, name: x.name, letter: x.letter, tone: x.tone, counts: x.counts, forWhom: x.forWhom, system: x.system, archived: Boolean(x.archivedAt) }))} />
                <p className="mt-3 flex flex-wrap gap-2">
                  {data.statuses.filter((x) => !x.archivedAt).map((x) => <Pill key={x.id} tone={countsTone(x.counts)}>{x.letter} · {COUNTS.find((c) => c.value === x.counts)?.label ?? x.counts}</Pill>)}
                </p>
              </CardBody>
            </Card>
            <Card>
              <CardHeader icon={Table2} title="Take Attendance and the register" />
              <CardBody><DisplayForm action={saveDisplayAction} v={v} /></CardBody>
            </Card>
          </>
        )}

        {tab === "late" && (
          <>
            <Card>
              <CardHeader icon={Lock} title="Lock time" description="After this, marks change only through a correction" />
              <div className="flex flex-col gap-2 px-5 pb-5 sm:flex-row sm:items-center sm:gap-4">
                <span className="font-display text-[32px] font-semibold leading-none tnum">{lock.atText}</span>
                <p className="text-[13px] text-ink3">
                  {lock.locked ? "Today's attendance is locked." : `Today's attendance locks in ${minutesText(lockIn)}.`} <Words k="Teachers see “You can change it until" /> {lock.atText}&rdquo;.
                </p>
              </div>
              <div className="border-t border-line/70 px-5 py-3.5">
                <p className="text-[14px] font-semibold"><Words k="Who can change marks after the lock" /></p>
                <p className="mb-2.5 text-[12.5px] text-ink3"><Words k="Everyone else sends a correction request to Approvals. The original stays in the audit log." /></p>
                <div className="flex flex-wrap gap-2">
                  {s.lockOverrideRoles.length ? s.lockOverrideRoles.map((r) => <span key={r} className="inline-flex h-9 items-center rounded-full border border-line px-3 text-[13px] font-medium">{roleName(r)}</span>) : <span className="text-[13px] text-ink3"><Words k="Nobody. Every change after the lock is a correction request." /></span>}
                </div>
              </div>
            </Card>
            <Card>
              <CardHeader icon={Clock} title="Late rules" description={`One rule for devices, QR and marking by hand. Students are late after ${time12(s.studentStartTime)} plus ${s.studentLateAfterMin} minutes.`} />
              <CardBody><LateRulesForm action={saveLateRulesAction} v={v} roles={ROLES} /></CardBody>
            </Card>
          </>
        )}

        {tab === "alerts" && (
          <>
            <Card>
              <CardHeader icon={MessageCircle} title="Absence message to parents" description="One message per absent student per day. None for approved leave. The text and channels are Communication's “Absent today” message."
                action={<ButtonLink size="sm" variant="secondary" href="/communication/settings#automatic"><Words k="Change the message" /></ButtonLink>} />
              <div className="border-t border-line/70 px-5 py-4 space-y-3">
                {message && !message.on && <Alert tone="warning" title="No absence message goes to parents"><Words k="The “Absent today” message is switched off in Communication, Message Settings." /></Alert>}
                {message?.on && !message.ready && <Alert tone="warning" title="No absence message goes to parents"><Words k="No channel that can carry it is switched on. Connect WhatsApp or SMS in Settings, Messaging." /></Alert>}
                {s.absenceAlertOn ? null : <Alert tone="info" title="Absence messages are off here"><Words k="Switch on “Absence message to parents” below to send it after each register." /></Alert>}
                <p className="eyebrow text-ink3"><Words k="Message parents get" /></p>
                <div className="max-w-md rounded-2xl rounded-tl-md bg-ok/10 px-4 py-3 text-[14px] leading-relaxed">
                  {message?.text ?? "No template for this message yet. Add one in Communication, Message Templates."}
                  <p className="mt-1 text-right text-[11px] text-ink3">{message?.channels || "No channel"} · {s.absenceAlertOn && message?.on ? (s.absenceDelayMinutes ? `after ${minutesText(s.absenceDelayMinutes)}` : "at once") : "Off"}</p>
                </div>
              </div>
            </Card>
            <Card>
              <CardHeader icon={BellRing} title="Alerts" description="Messages to parents go through Communication and appear in Message History." />
              <CardBody><NotificationsForm action={saveNotificationsAction} v={v} /></CardBody>
            </Card>
          </>
        )}

        {tab === "leave" && (
          <>
            <Card className="overflow-hidden">
              <CardHeader icon={CalendarDays} title="Student leave types" description="Leave types offered when recording student leave" action={<LeaveTypeForm action={saveLeaveTypeAction} quotasOn={v.quotasOn} />} />
              {data.types.length === 0 ? (
                <p className="border-t border-line/70 px-5 py-4 text-[13px] text-ink3"><Words k="No leave types yet. Add the first one." /></p>
              ) : (
                <ul className="divide-y divide-line/70 border-t border-line/70">
                  {data.types.map((t) => {
                    const q = data.quotas.find((x) => x.leaveTypeId === t.id);
                    const row = { id: t.id, name: t.name, code: t.code, quotaDays: q ? Number(q.days) : null, quotaPeriod: q?.period ?? "term" };
                    return (
                      <li key={t.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                        <span className="min-w-0 flex-1 text-[14px] font-medium">{t.name}</span>
                        <span className="text-[14px] font-semibold tnum">{q ? `${Number(q.days)} days a ${q.period === "year" ? "year" : "term"}` : "No limit"}</span>
                        <div className="flex gap-1">
                          <LeaveTypeForm action={saveLeaveTypeAction} type={row} quotasOn={v.quotasOn} />
                          <ActionButton action={archiveLeaveTypeAction} hidden={{ typeId: t.id }} variant="ghost"><Words k="Archive" /></ActionButton>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader icon={Scale} title="Leave quotas and who decides" description={v.quotasOn ? "Quotas are on. Shown while recording leave, like “Medical: 4 of 6 days left this term”." : "Quotas are off. The days above are kept but not checked."} />
              <CardBody><LeaveRulesForm action={saveLeaveRulesAction} v={v} /></CardBody>
            </Card>
          </>
        )}
      </div>
    </>
  );
}
