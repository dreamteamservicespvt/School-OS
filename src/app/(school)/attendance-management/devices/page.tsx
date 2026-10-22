import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BookOpen, CircleCheck, CircleX, Fingerprint, MapPin, Nfc, QrCode, ScanFace, ScanEye, ShieldCheck, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { withSchool } from "@/lib/db";
import { inCampus } from "@/lib/campus";
import { formatDate, formatDateTime } from "@/lib/format";
import { appOrigin } from "@/lib/origin";
import { attendancePage } from "@/lib/attendance/page";
import { BASE, campusOrSchool, studentLimit } from "@/lib/attendance/access";
import { ALLOWED_USERS, DEVICE_TYPES, deviceHealth, deviceStatus, rejectedSummary } from "@/lib/attendance/devices";
import { POSTER_THEMES } from "@/lib/attendance/qr";
import { instantAt, time12 } from "@/lib/attendance/time";
import { addDays } from "@/lib/staff/dates";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { ButtonLink } from "@/components/ui/button";
import { Stats } from "@/components/ui/stats";
import { Chips } from "@/components/ui/chips";
import { DataList } from "@/app/(school)/attendance-management/_components/data-list";
import { CloseSheetButton, UrlSearch, UrlSheet } from "@/components/ui/url-controls";
import { EmptyState } from "@/components/empty-state";
import { ActionButton } from "../../staff-hr-management/_components/forms";
import { AttHead } from "../_components/att-head";
import { RowMenu } from "../_components/row-menu";
import { DeviceForm, GeoFenceForm, QrCreateForm, QrSettingsForm } from "../_components/device-forms";
import { addDeviceAction, createQrAction, geoFenceAction, qrSettingsAction, qrStateAction } from "./actions";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Devices & QR" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const PATH = `${BASE}/devices`;
const TYPE_ICON: Record<string, LucideIcon> = { face: ScanFace, fingerprint: Fingerprint, rfid: Nfc, iris: ScanEye };
const TONE = { success: "ok", warning: "warn", danger: "bad", neutral: "neutral" } as const;

export default async function DevicesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { current, access, features, settings, tz, today, now } = await attendancePage();
  if (!access.admin) redirect("/no-access?m=attendance-management");
  const devicesOn = features.has("attendance-devices");
  const qrOn = features.has("attendance-qr");
  const mobileOn = features.has("attendance-mobile");
  const canEdit = access.change !== "none" && access.pages.devices === "full";
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase().slice(0, 80) : "";
  const showArchived = sp.archived === "1";

  const data = await withSchool(current.ctx, async (tx) => {
    // A person limited to one campus sees that campus's devices, people, QR and campus area (and the whole school's QR).
    const limit = access.campusLimit;
    const onCampus = inCampus({ campusId: limit });
    const campuses = await tx.campus.findMany({ where: { archivedAt: null, ...(limit ? { id: limit } : {}) }, orderBy: { name: "asc" }, select: { id: true, name: true } });
    const devices = devicesOn ? await tx.attendanceDevice.findMany({ where: { ...(showArchived ? {} : { archivedAt: null }), ...onCampus }, orderBy: [{ archivedAt: "desc" }, { name: "asc" }] }) : [];
    const allHealth = devicesOn ? await deviceHealth(tx, current.ctx, instantAt(today, "00:00", tz), instantAt(addDays(today, 1), "00:00", tz)) : new Map();
    const campusDevices = limit ? new Set((await tx.attendanceDevice.findMany({ where: onCampus, select: { id: true } })).map((d) => d.id)) : null;
    const health = campusDevices ? new Map([...allHealth].filter(([id]) => campusDevices.has(id))) : allHealth;
    const onCampusDevice = limit ? { device: { campusId: limit } } : {};
    const [mappedStudents, mappedStaff, students, staff, sessions, fences] = await Promise.all([
      tx.deviceUserMap.findMany({ where: { archivedAt: null, studentId: { not: null }, ...onCampusDevice }, distinct: ["studentId"], select: { studentId: true } }),
      tx.deviceUserMap.findMany({ where: { archivedAt: null, staffId: { not: null }, ...onCampusDevice }, distinct: ["staffId"], select: { staffId: true } }),
      tx.student.count({ where: { archivedAt: null, status: { in: ["ACTIVE", "ADMITTED"] }, ...studentLimit(access) } }),
      tx.staff.count({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE"] }, ...onCampus } }),
      qrOn ? tx.qrSession.findMany({ where: { archivedAt: null, ...campusOrSchool(access) }, orderBy: { createdAt: "desc" } }) : Promise.resolve([]),
      qrOn || mobileOn ? tx.geoFence.findMany({ where: onCampus }) : Promise.resolve([]),
    ]);
    return { campuses, devices, health, mapped: { students: mappedStudents.length, staff: mappedStaff.length }, totals: { students, staff }, sessions, fences };
  });
  const campusName = new Map(data.campuses.map((c) => [c.id, c.name]));
  const campusOptions = data.campuses.map((c) => ({ value: c.id, label: c.name }));
  const typeLabel = (t: string) => DEVICE_TYPES.find((x) => x.value === t)?.label ?? t;
  const allowedLabel = (a: string) => ALLOWED_USERS.find((x) => x.value === a)?.label ?? a;

  const live = data.devices.filter((d) => !d.archivedAt);
  const active = live.filter((d) => deviceStatus(d, now).label === "Active").length;
  const offline = live.filter((d) => deviceStatus(d, now).label === "Offline");
  const received = [...data.health.values()].reduce((s, h) => s + h.received, 0);
  const rejected = [...data.health.values()].reduce((s, h) => s + h.rejected, 0);
  const reasons: Record<string, number> = {};
  for (const h of data.health.values()) for (const [k, n] of Object.entries(h.reasons as Record<string, number>)) reasons[k] = (reasons[k] ?? 0) + n;
  // Only people a device takes count as not mapped.
  const takesStudents = live.some((d) => d.allowedUsers !== "staff");
  const takesStaff = live.some((d) => d.allowedUsers !== "students");
  const notMapped = (takesStudents ? data.totals.students - data.mapped.students : 0) + (takesStaff ? data.totals.staff - data.mapped.staff : 0);
  const rows = data.devices.filter((d) => !q || `${d.name} ${d.location ?? ""} ${d.serialNo}`.toLowerCase().includes(q));
  const qs = (change: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string") p.set(k, v);
    for (const [k, v] of Object.entries(change)) { if (v) p.set(k, v); else p.delete(k); }
    return p.size ? `${PATH}?${p}` : PATH;
  };
  const who: Record<string, string> = { staff: "Staff", students: "Students", both: "Staff and students" };
  const off = !devicesOn && !qrOn && !mobileOn;

  return (
    <>
      <AttHead access={access} features={features} userId={current.user.id} href={PATH} sub="Biometric devices, QR check-in and the campus area for the app"
        actions={devicesOn && canEdit ? <DeviceForm action={addDeviceAction} campuses={campusOptions} types={[...DEVICE_TYPES]} allowed={[...ALLOWED_USERS]} defaultCampus={access.campusId ?? data.campuses[0]?.id} /> : undefined} />
      {off ? (
        <EmptyState title="Devices, QR and mobile check-in are off" Icon={ScanFace}><Words k="Switch them on in" /> <Link className="font-semibold text-brand hover:underline" href={`${BASE}/settings`}><Words k="Attendance Settings" /></Link><Words k=", Punch methods." /></EmptyState>
      ) : (
        <div className="flex flex-col gap-5 lg:gap-6">
          {devicesOn && (
            <>
              <Stats items={[
                { label: "Devices", value: `${active} of ${live.length}`, sub: "Active now", icon: ScanFace },
                { label: "Punches today", value: (received - rejected).toLocaleString("en-IN"), sub: "Accepted and counted", tone: "ok", icon: CircleCheck },
                { label: "Rejected today", value: rejected, sub: rejected ? rejectedSummary(reasons) : "Nothing rejected", tone: rejected ? "warn" : undefined, icon: CircleX, href: live.length ? `${PATH}/${(rows.find((d) => (data.health.get(d.id)?.rejected ?? 0) > 0) ?? live[0]).id}` : undefined },
                { label: "Users mapped", value: `${data.mapped.students.toLocaleString("en-IN")} + ${data.mapped.staff}`, sub: notMapped > 0 ? `${notMapped.toLocaleString("en-IN")} people not mapped yet` : "Everyone the devices take", icon: Users },
              ]} />
              {offline.map((d) => (
                <Banner key={d.id} tone="bad" title={`${d.name} is offline`} action={<ButtonLink size="sm" variant="secondary" href={`${PATH}/${d.id}`}><Words k="Check" /></ButtonLink>}>
                  <Words k="since" /> {d.lastSyncAt ? formatDateTime(d.lastSyncAt, tz) : "it was added"}<Words k=". Punches from it may be missing; mark by hand until it is back." />
                </Banner>
              ))}
              <Card className="overflow-hidden">
                <div className="flex flex-col lg:flex-row gap-2 p-3 border-b border-line">
                  <UrlSearch placeholder="Device, place or serial number" />
                  <div className="flex gap-2">
                    <ButtonLink href={qs({ guide: "1" })} variant="secondary" icon={BookOpen} scroll={false}><Words k="Setup guide" /></ButtonLink>
                  </div>
                </div>
                <div className="px-3 pt-3">
                  <Chips label="Devices shown" value={showArchived ? "all" : "live"} options={[
                    { value: "live", label: "In use", count: live.length, href: qs({ archived: null }) },
                    { value: "all", label: "With archived", href: qs({ archived: "1" }) },
                  ]} />
                </div>
                <DataList rows={rows} rowKey={(d) => d.id} href={(d) => `${PATH}/${d.id}`} minWidth={820} caption="Attendance devices"
                  actions={(d) => <RowMenu label={`Actions for ${d.name}`} items={[{ icon: "view", label: "Sync and health check", href: `${PATH}/${d.id}` }, ...(canEdit && !d.archivedAt ? [{ icon: "edit" as const, label: "Edit, key or archive", href: `${PATH}/${d.id}` }] : [])]} />}
                  columns={[
                    { key: "name", label: "Device", render: (d) => { const Ic = TYPE_ICON[d.deviceType] ?? ScanFace; return <div className="flex items-center gap-3"><span className="w-9 h-9 rounded-xl bg-sunken text-ink2 grid place-items-center shrink-0"><Ic size={18} aria-hidden="true" /></span><div><p className="font-semibold leading-tight">{d.name}</p><p className="text-[12px] text-ink3 font-mono">{d.serialNo}</p></div></div>; } },
                    { key: "type", label: "Type", render: (d) => typeLabel(d.deviceType) },
                    { key: "loc", label: "Location", render: (d) => <div><p className="leading-tight">{d.location ?? "Not set"}</p><p className="text-[12px] text-ink3">{campusName.get(d.campusId) ?? ""}</p></div> },
                    { key: "users", label: "Allowed users", render: (d) => allowedLabel(d.allowedUsers) },
                    { key: "st", label: "Status", render: (d) => { const st = deviceStatus(d, now); const h = data.health.get(d.id); return <div><Pill tone={d.archivedAt ? "neutral" : TONE[st.tone]}>{d.archivedAt ? "Archived" : st.label}</Pill><p className="text-[11.5px] text-ink3 mt-0.5 whitespace-nowrap"><Words k="Last punch" /> {d.lastPunchAt ? formatDateTime(d.lastPunchAt, tz) : "never"}{h ? ` · ${h.received} today` : ""}</p></div>; } },
                  ]}
                  mobile={(d) => { const st = deviceStatus(d, now); return { icon: TYPE_ICON[d.deviceType] ?? ScanFace, iconTone: d.archivedAt ? "neutral" : TONE[st.tone], title: d.name, sub: `${d.location ?? "No location"} · last punch ${d.lastPunchAt ? formatDateTime(d.lastPunchAt, tz) : "never"}`, right: <Pill tone={d.archivedAt ? "neutral" : TONE[st.tone]}>{d.archivedAt ? "Archived" : st.label}</Pill> }; }}
                  footer={<p className="px-4 py-3 border-t border-line text-[13px] text-ink3 tnum"><Words k="Showing" /> {rows.length} <Words k="of" /> {data.devices.length} <Words k="devices" /></p>}
                  empty={<EmptyState bare Icon={ScanFace} title={q ? "No devices match" : "No devices yet"}>{q ? "Try another name, place or serial number." : "Add a device to get its key, then put the key and the address from the Setup guide into the device."}</EmptyState>} />
              </Card>
            </>
          )}

          <div className="grid xl:grid-cols-2 gap-5 lg:gap-6 items-start">
            {qrOn && (
              <Card>
                <CardHeader icon={QrCode} title="QR check-in" description="People scan the poster with their own phone. The scan checks the school, the QR, the campus area and blocks a second scan the same day." />
                <div className="px-5 pb-5">
                  <QrSettingsForm action={qrSettingsAction} themes={[...POSTER_THEMES]} values={{ qrStudentsOn: settings.qrStudentsOn, qrStaffOn: settings.qrStaffOn, qrRotation: settings.qrRotation, posterTheme: settings.posterTheme }} />
                </div>
              </Card>
            )}
            {qrOn && (
              <Card>
                <CardHeader icon={QrCode} title="QR posters" description="School name, the QR code and short steps. No personal data." action={canEdit ? <QrCreateForm action={createQrAction} campuses={campusOptions} rotation={settings.qrRotation} /> : undefined} />
                {!settings.qrStaffOn && !settings.qrStudentsOn && <div className="px-5 pb-3"><Banner tone="info" title="QR check-in is off."><Words k="Switch it on for staff or students for scans to count." /></Banner></div>}
                {data.sessions.length === 0 ? <EmptyState bare Icon={QrCode} title="No QR yet"><Words k="Create a QR, then print its poster for the entrance." /></EmptyState> : (
                  <ul className="px-2 pb-2">
                    {data.sessions.map((s) => {
                      const expired = s.expiresAt && s.expiresAt < now;
                      return (
                        <li key={s.id} className="flex flex-wrap items-center gap-3 px-3 py-2.5 rounded-xl">
                          <span className="w-10 h-10 rounded-xl bg-sunken text-ink2 grid place-items-center shrink-0"><QrCode size={19} aria-hidden="true" /></span>
                          <div className="min-w-0 flex-1">
                            <Link href={`${PATH}/qr/${s.id}`} className="font-semibold text-[14.5px] hover:text-brand">{s.name}</Link>
                            <p className="text-[12.5px] text-ink3">{who[s.forWhom] ?? s.forWhom} · {s.scope === "campus" ? campusName.get(s.campusId ?? "") ?? "One campus" : "Whole school"} · {s.rotation === "fixed" ? "Fixed code" : "Changes every day"}{s.expiresAt ? ` · until ${formatDate(s.expiresAt, tz)}` : ""}</p>
                          </div>
                          <Pill tone={!s.isActive ? "neutral" : expired ? "bad" : "ok"}>{!s.isActive ? "Stopped" : expired ? "Expired" : "On"}</Pill>
                          {canEdit && (
                            <div className="flex gap-1">
                              <ActionButton action={qrStateAction} hidden={{ qrId: s.id, change: s.isActive ? "stop" : "start" }}>{s.isActive ? "Stop" : "Start"}</ActionButton>
                              <ActionButton action={qrStateAction} hidden={{ qrId: s.id, change: "archive" }} variant="ghost"><Words k="Archive" /></ActionButton>
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>
            )}
            {(qrOn || mobileOn) && data.campuses.map((c) => {
              const f = data.fences.find((x) => x.campusId === c.id);
              return (
                <Card key={c.id}>
                  <CardHeader icon={MapPin} title={data.campuses.length > 1 ? `Campus area: ${c.name}` : "Campus area"} description="QR and app check-ins work only inside this circle when it is on" />
                  <div className="px-5 pb-5">
                    <GeoFenceForm action={geoFenceAction} campuses={campusOptions} campusId={c.id}
                      fence={f ? { latitude: Number(f.latitude), longitude: Number(f.longitude), radiusM: f.radiusM, studentsOn: f.studentsOn, staffOn: f.staffOn } : null} />
                    {mobileOn && <p className="mt-3 text-[13px] text-ink3"><Words k="Staff check in from the" /> <Link className="font-semibold text-brand hover:underline" href="/check-in"><Words k="Check-in page" /></Link> <Words k="on their phone." /></p>}
                  </div>
                </Card>
              );
            })}
            <Card>
              <CardHeader icon={ShieldCheck} title="Punch checks" description="A punch counts only when all of these pass" />
              <ul className="px-5 pb-5 flex flex-col gap-2.5 text-[14px]">
                {["The device is active", "The person is mapped and allowed on that device", `The time is inside the attendance window (${time12(settings.punchWindowStart)} to ${time12(settings.punchWindowEnd)})`, `It is not a repeat within ${settings.repeatPunchMinutes} minutes`, "For QR: right school, today’s session and inside the campus area"].map((x) => (
                  <li key={x} className="flex gap-2.5"><CircleCheck size={18} className="text-ok shrink-0 mt-0.5" aria-hidden="true" />{x}</li>
                ))}
              </ul>
            </Card>
          </div>
        </div>
      )}
      {sp.guide === "1" && devicesOn && <GuideSheet />}
    </>
  );

  async function GuideSheet() {
    const origin = await appOrigin();
    const endpoint = `${origin}/api/v1/attendance/punches?s=${current.school.id}`;
    return (
      <UrlSheet param="guide" wide title="Setup guide" sub="How to connect a device so its punches reach School OS" footer={<CloseSheetButton param="guide" />}>
        <ol className="flex flex-col gap-4 text-[14px] text-ink2 list-decimal pl-5">
          <li><p className="font-semibold text-ink"><Words k="Add the device and copy its key." /></p><p><Words k="The key is shown once; keep it only in the device or its connector." /></p></li>
          <li>
            <p className="font-semibold text-ink"><Words k="Point the device, or its connector, at this address." /></p>
            <code className="mt-1 block break-all rounded-xl bg-sunken px-3 py-2 font-mono text-[13px] text-ink">{endpoint}</code>
            <p className="mt-1"><Words k="Send the key in the header" /> <code className="font-mono">Authorization: Bearer &lt;key&gt;</code><Words k=". A GET to the same address checks the connection." /></p>
          </li>
          <li>
            <p className="font-semibold text-ink"><Words k="Send punches in batches." /></p>
            <pre className="mt-1 overflow-x-auto rounded-xl bg-sunken px-3 py-2 font-mono text-[12.5px] text-ink">{`POST ${endpoint}
{ "punches": [
  { "punchNo": "10023", "userNo": "SPS-ST-004", "time": "2026-10-09T08:41:00+05:30" }
] }`}</pre>
            <p className="mt-1"><Words k="Up to 500 punches at a time, at most 60 requests a minute. Each punch needs the device's own unique punch number, so sending one twice counts once." /></p>
          </li>
          <li><p className="font-semibold text-ink"><Words k="ZKTeco, eSSL and similar machines." /></p><p><Words k="Set each person's user number on the machine to their staff ID or admission number; Auto-match then links them. Use the push or ADMS setting, or a small connector on a school computer. Keep the machine's clock right." /></p></li>
        </ol>
      </UrlSheet>
    );
  }
}
