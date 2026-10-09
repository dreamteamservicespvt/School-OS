import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { attendancePage } from "@/lib/attendance/page";
import { BASE } from "@/lib/attendance/access";
import { ATTENDANCE_FEATURES, COUNTS, statusList, TONES } from "@/lib/attendance/settings";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SubNav } from "../../staff-hr-management/_components/bits";
import { ActionButton } from "../../staff-hr-management/_components/forms";
import { DisplayForm, LateRulesForm, LeaveRulesForm, LeaveTypeForm, NotificationsForm, PunchMethodsForm, StatusForm, StatusList, type SettingsValues } from "../_components/settings-forms";
import {
  archiveLeaveTypeAction, archiveStatusAction, saveDisplayAction, saveFeatureAction, saveLateRulesAction, saveLeaveRulesAction, saveLeaveTypeAction,
  saveNotificationsAction, savePunchMethodsAction, saveStatusAction,
} from "./actions";

export const metadata: Metadata = { title: "Attendance Settings" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const TABS = [
  { key: "methods", label: "Punch methods" },
  { key: "display", label: "Display and register" },
  { key: "late", label: "Late rules" },
  { key: "alerts", label: "Notifications" },
] as const;
const ROLES = [
  { value: "principal", label: "Principal" }, { value: "school-admin", label: "School Admin" }, { value: "vice-principal", label: "Vice Principal" },
  { value: "class-teacher", label: "Class Teacher" }, { value: "hr", label: "HR" },
];

export default async function SettingsPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { current, access, settings: s, features } = await attendancePage();
  if (!access.admin) redirect(BASE);
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "methods";
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
    const [statuses, types, quotas] = await Promise.all([
      statusList(tx, current.ctx, { includeArchived: true }),
      tx.leaveType.findMany({ where: { forWhom: "student", archivedAt: null }, orderBy: { name: "asc" } }),
      tx.studentLeaveQuota.findMany({ where: { archivedAt: null } }),
    ]);
    return { statuses, types, quotas };
  });
  const tones = TONES.map((t) => ({ value: t.value, label: t.label }));
  const counts = COUNTS.map((c) => ({ value: c.value, label: c.label }));
  const extra = ATTENDANCE_FEATURES.filter((f) => f.key === "attendance-shifts" || f.key === "attendance-overtime");

  return (
    <>
      <PageHeader title="Attendance Settings" href={`${BASE}/settings`} userId={current.user.id} />
      <SubNav current={tab} items={TABS.map((t) => ({ key: t.key, label: t.label, href: `${BASE}/settings?tab=${t.key}` }))} />

      {tab === "methods" && (
        <div className="space-y-5">
          <Card><CardHeader title="Punch methods" description="How attendance is taken, for students and for staff." /><CardBody><PunchMethodsForm action={savePunchMethodsAction} v={v} /></CardBody></Card>
          <Card>
            <CardHeader title="More options" description="Optional parts, switched on for this school only." />
            <CardBody>
              <ul className="divide-y divide-line">
                {extra.map((f) => {
                  const isOn = features.has(f.key);
                  return (
                    <li key={f.key} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div><p className="font-medium">{f.label} <Badge tone={isOn ? "success" : "neutral"}>{isOn ? "On" : "Off"}</Badge></p><p className="text-sm text-ink-2">{f.about}</p></div>
                      <ActionButton action={saveFeatureAction} hidden={{ key: f.key, on: isOn ? "0" : "1" }}>{isOn ? "Switch off" : "Switch on"}</ActionButton>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "display" && (
        <div className="space-y-5">
          <Card><CardHeader title="Display and register" /><CardBody><DisplayForm action={saveDisplayAction} v={v} /></CardBody></Card>
          <Card>
            <CardHeader title="Status list" description="Each status has a letter, a colour and how it counts in the %." action={<StatusForm action={saveStatusAction} tones={tones} counts={counts} />} />
            <CardBody>
              <StatusList save={saveStatusAction} archive={archiveStatusAction} tones={tones} counts={counts}
                rows={data.statuses.map((x) => ({ id: x.id, key: x.key, name: x.name, letter: x.letter, tone: x.tone, counts: x.counts, forWhom: x.forWhom, system: x.system, archived: Boolean(x.archivedAt) }))} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Student leave types and quotas" description="Leave types offered when recording student leave, and the days allowed when balances are on." action={<LeaveTypeForm action={saveLeaveTypeAction} quotasOn={v.quotasOn} />} />
            <CardBody className="space-y-5">
              <ul className="divide-y divide-line">
                {data.types.map((t) => {
                  const q = data.quotas.find((x) => x.leaveTypeId === t.id);
                  const row = { id: t.id, name: t.name, code: t.code, quotaDays: q ? Number(q.days) : null, quotaPeriod: q?.period ?? "term" };
                  return (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <div>
                        <p className="font-medium">{t.name}</p>
                        <p className="text-sm text-ink-2">{q ? `${Number(q.days)} days a ${q.period === "year" ? "year" : "term"}${v.quotasOn ? "" : " (balances are off)"}` : "No limit"}</p>
                      </div>
                      <div className="flex gap-1">
                        <LeaveTypeForm action={saveLeaveTypeAction} type={row} quotasOn={v.quotasOn} />
                        <ActionButton action={archiveLeaveTypeAction} hidden={{ typeId: t.id }} variant="ghost">Archive</ActionButton>
                      </div>
                    </li>
                  );
                })}
              </ul>
              <div className="border-t border-line pt-4"><LeaveRulesForm action={saveLeaveRulesAction} v={v} /></div>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === "late" && <Card><CardHeader title="Late rules and lock time" /><CardBody><LateRulesForm action={saveLateRulesAction} v={v} roles={ROLES} /></CardBody></Card>}
      {tab === "alerts" && <Card><CardHeader title="Notifications" description="Messages to parents go through Communication and appear in Message History." /><CardBody><NotificationsForm action={saveNotificationsAction} v={v} /></CardBody></Card>}
    </>
  );
}
