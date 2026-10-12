import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/format";
import { appOrigin } from "@/lib/origin";
import { attendancePage } from "@/lib/attendance/page";
import { BASE } from "@/lib/attendance/access";
import { ALLOWED_USERS, DEVICE_TYPES, deviceHealth, deviceStatus, rejectedSummary } from "@/lib/attendance/devices";
import { POSTER_THEMES } from "@/lib/attendance/qr";
import { instantAt } from "@/lib/attendance/time";
import { addDays } from "@/lib/staff/dates";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { SubNav } from "../../staff-hr-management/_components/bits";
import { ActionButton } from "../../staff-hr-management/_components/forms";
import { DeviceForm, GeoFenceForm, QrCreateForm, QrSettingsForm } from "../_components/device-forms";
import { addDeviceAction, createQrAction, geoFenceAction, qrSettingsAction, qrStateAction } from "./actions";

export const metadata: Metadata = { title: "Devices & QR" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function DevicesPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { current, access, features, settings, tz, today, now } = await attendancePage();
  if (!access.admin) redirect("/no-access?m=attendance-management");
  const devicesOn = features.has("attendance-devices");
  const qrOn = features.has("attendance-qr");
  const mobileOn = features.has("attendance-mobile");
  const views = [
    ...(devicesOn ? [{ key: "devices", label: "Devices", href: `${BASE}/devices?view=devices` }] : []),
    ...(qrOn ? [{ key: "qr", label: "QR check-in", href: `${BASE}/devices?view=qr` }] : []),
    ...(qrOn || mobileOn ? [{ key: "area", label: "Campus area", href: `${BASE}/devices?view=area` }] : []),
    ...(devicesOn ? [{ key: "guide", label: "Setup guide", href: `${BASE}/devices?view=guide` }] : []),
  ];
  if (views.length === 0) {
    return (
      <>
        <PageHeader title="Devices & QR" href={`${BASE}/devices`} userId={current.user.id} />
        <EmptyState title="Devices, QR and mobile check-in are off">Switch them on in <Link className="font-medium text-brand-text underline" href={`${BASE}/settings`}>Attendance Settings</Link>, Punch methods.</EmptyState>
      </>
    );
  }
  const view = views.find((v) => v.key === sp.view)?.key ?? views[0].key;
  const campuses = await withSchool(current.ctx, (tx) => tx.campus.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }));
  const campusOptions = campuses.map((c) => ({ value: c.id, label: c.name }));

  return (
    <>
      <PageHeader title="Devices & QR" href={`${BASE}/devices`} userId={current.user.id} />
      <SubNav items={views} current={view} />
      {view === "devices" && <DevicesView />}
      {view === "qr" && <QrView />}
      {view === "area" && <AreaView />}
      {view === "guide" && <GuideView />}
    </>
  );

  async function DevicesView() {
    const showArchived = sp.archived === "1";
    const data = await withSchool(current.ctx, async (tx) => {
      const devices = await tx.attendanceDevice.findMany({ where: showArchived ? {} : { archivedAt: null }, orderBy: [{ archivedAt: "desc" }, { name: "asc" }] });
      const start = instantAt(today, "00:00", tz);
      const health = await deviceHealth(tx, current.ctx, start, instantAt(addDays(today, 1), "00:00", tz));
      return { devices, health };
    });
    const campusName = new Map(campuses.map((c) => [c.id, c.name]));
    const totalRejected = [...data.health.values()].reduce((s, h) => s + h.rejected, 0);
    const reasons: Record<string, number> = {};
    for (const h of data.health.values()) for (const [k, n] of Object.entries(h.reasons)) reasons[k] = (reasons[k] ?? 0) + n;
    return (
      <Card>
        <CardHeader title="Devices" description="Face, fingerprint, RFID card and iris machines. Each has its own key; punches are checked before they count."
          action={<DeviceForm action={addDeviceAction} campuses={campusOptions} types={[...DEVICE_TYPES]} allowed={[...ALLOWED_USERS]} defaultCampus={access.campusId ?? campuses[0]?.id} />} />
        <CardBody>
          {totalRejected > 0 && <Alert tone="warning" className="mb-4">{rejectedSummary(reasons)}. Open a device to map its users, then re-run the sync.</Alert>}
          {data.devices.length === 0 ? (
            <EmptyState title="No devices yet">Add a device to get its key, then put the key and the address from the Setup guide into the device.</EmptyState>
          ) : (
            <ul className="divide-y divide-line">
              {data.devices.map((d) => {
                const st = deviceStatus(d, now);
                const h = data.health.get(d.id);
                return (
                  <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <Link href={`${BASE}/devices/${d.id}`} className="font-medium text-brand-text hover:underline">{d.name}</Link>
                      <p className="text-sm text-ink-2">
                        {DEVICE_TYPES.find((t) => t.value === d.deviceType)?.label ?? d.deviceType} · {d.location ?? "No location"} · {campusName.get(d.campusId) ?? ""} · {ALLOWED_USERS.find((a) => a.value === d.allowedUsers)?.label}
                      </p>
                      <p className="text-sm text-ink-2">
                        Last punch: {d.lastPunchAt ? formatDateTime(d.lastPunchAt, tz) : "none yet"}{h ? ` · today ${h.received} received, ${h.rejected} rejected` : ""}
                      </p>
                    </div>
                    <Badge tone={d.archivedAt ? "neutral" : st.tone}>{d.archivedAt ? "Archived" : st.label}</Badge>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="mt-3 text-sm"><Link className="font-medium text-brand-text hover:underline" href={`${BASE}/devices?view=devices${showArchived ? "" : "&archived=1"}`}>{showArchived ? "Hide archived devices" : "Show archived devices"}</Link></p>
        </CardBody>
      </Card>
    );
  }

  async function QrView() {
    const sessions = await withSchool(current.ctx, (tx) => tx.qrSession.findMany({ where: { archivedAt: null }, orderBy: { createdAt: "desc" } }));
    const campusName = new Map(campuses.map((c) => [c.id, c.name]));
    const who: Record<string, string> = { staff: "Staff", students: "Students", both: "Staff and students" };
    return (
      <div className="space-y-5">
        <Card>
          <CardHeader title="QR check-in" description="People scan the poster at the entrance with their own phone. The scan checks the school, the QR, the campus area and blocks a second scan the same day." />
          <CardBody>
            <QrSettingsForm action={qrSettingsAction} themes={[...POSTER_THEMES]} values={{ qrStudentsOn: settings.qrStudentsOn, qrStaffOn: settings.qrStaffOn, qrRotation: settings.qrRotation, posterTheme: settings.posterTheme }} />
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="QR posters" action={<QrCreateForm action={createQrAction} campuses={campusOptions} rotation={settings.qrRotation} />} />
          <CardBody>
            {!settings.qrStaffOn && !settings.qrStudentsOn && <Alert tone="info" className="mb-4">QR check-in is off for both staff and students. Switch it on above for scans to count.</Alert>}
            {sessions.length === 0 ? (
              <EmptyState title="No QR yet">Create a QR, then print its poster for the entrance.</EmptyState>
            ) : (
              <ul className="divide-y divide-line">
                {sessions.map((s) => {
                  const expired = s.expiresAt && s.expiresAt < now;
                  return (
                    <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                      <div>
                        <Link href={`${BASE}/devices/qr/${s.id}`} className="font-medium text-brand-text hover:underline">{s.name}</Link>
                        <p className="text-sm text-ink-2">{who[s.forWhom] ?? s.forWhom} · {s.scope === "campus" ? campusName.get(s.campusId ?? "") ?? "One campus" : "Whole school"} · {s.rotation === "fixed" ? "Fixed code" : "Changes every day"}{s.expiresAt ? ` · expires ${formatDate(s.expiresAt, tz)}` : ""}</p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={!s.isActive ? "neutral" : expired ? "danger" : "success"}>{!s.isActive ? "Stopped" : expired ? "Expired" : "On"}</Badge>
                        <ActionButton action={qrStateAction} hidden={{ qrId: s.id, change: s.isActive ? "stop" : "start" }}>{s.isActive ? "Stop" : "Start"}</ActionButton>
                        <ActionButton action={qrStateAction} hidden={{ qrId: s.id, change: "archive" }} variant="ghost">Archive</ActionButton>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    );
  }

  async function AreaView() {
    const fences = await withSchool(current.ctx, (tx) => tx.geoFence.findMany());
    return (
      <div className="space-y-5">
        {campuses.map((c) => {
          const f = fences.find((x) => x.campusId === c.id);
          return (
            <Card key={c.id}>
              <CardHeader title={campuses.length > 1 ? `Campus area: ${c.name}` : "Campus area"} description="QR and mobile check-ins must come from inside this circle when it is on. Stand at the main gate and use your current location." />
              <CardBody>
                <GeoFenceForm action={geoFenceAction} campuses={campusOptions} campusId={c.id}
                  fence={f ? { latitude: Number(f.latitude), longitude: Number(f.longitude), radiusM: f.radiusM, studentsOn: f.studentsOn, staffOn: f.staffOn } : null} />
              </CardBody>
            </Card>
          );
        })}
        {mobileOn && <Alert tone="info">Staff check in from the Check-in page on their phone: <Link className="font-medium underline" href="/check-in">open Check-in</Link>.</Alert>}
      </div>
    );
  }

  async function GuideView() {
    const origin = await appOrigin();
    const endpoint = `${origin}/api/v1/attendance/punches?s=${current.school.id}`;
    return (
      <Card>
        <CardHeader title="Setup guide" description="How to connect a device so its punches reach School OS." />
        <CardBody className="space-y-5 text-[15px]">
          <section>
            <h3 className="font-semibold">1. Add the device and copy its key</h3>
            <p className="text-ink-2">Add the device under Devices. Its key is shown once; keep it only in the device or its connector.</p>
          </section>
          <section>
            <h3 className="font-semibold">2. Point the device (or its connector) at this address</h3>
            <code className="mt-1 block break-all rounded-lg bg-surface-2 px-3 py-2 font-mono text-sm">{endpoint}</code>
            <p className="mt-1 text-ink-2">Send the key in the header <code className="font-mono">Authorization: Bearer &lt;key&gt;</code>. A GET to the same address checks the connection.</p>
          </section>
          <section>
            <h3 className="font-semibold">3. Send punches in batches</h3>
            <pre className="mt-1 overflow-x-auto rounded-lg bg-surface-2 px-3 py-2 font-mono text-sm">{`POST ${endpoint}
{ "punches": [
  { "punchNo": "10023", "userNo": "SPS-ST-004", "time": "2026-10-09T08:41:00+05:30" }
] }`}</pre>
            <p className="mt-1 text-ink-2">Up to 500 punches at a time, at most 60 requests a minute. Each punch needs the device&apos;s own unique punch number, so sending one twice counts once. The answer says for each punch whether it was accepted, rejected (and why) or a duplicate.</p>
          </section>
          <section>
            <h3 className="font-semibold">ZKTeco and similar machines</h3>
            <ul className="list-disc space-y-1 pl-5 text-ink-2">
              <li>Set each person&apos;s user number on the machine to their staff ID or admission number; Auto-match then links them for you.</li>
              <li>Use the machine&apos;s push or ADMS setting, or a small connector on a school computer that reads the machine&apos;s log and posts it to the address above.</li>
              <li>Keep the machine&apos;s clock right. Punches outside {settings.punchWindowStart} to {settings.punchWindowEnd}, on holidays, or within {settings.repeatPunchMinutes} minutes of the last one are rejected and listed with the reason.</li>
            </ul>
          </section>
        </CardBody>
      </Card>
    );
  }
}
