import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { attendancePage } from "@/lib/attendance/page";
import { BASE } from "@/lib/attendance/access";
import { ALLOWED_USERS, DEVICE_TYPES, deviceStatus, REJECT_WORDS } from "@/lib/attendance/devices";
import { UUID_RE } from "@/lib/staff/act";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody, CardHeader, Detail } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { EmptyState } from "@/components/empty-state";
import { ActionButton } from "../../../staff-hr-management/_components/forms";
import { DeviceForm, MapUserForm, RegenerateKey } from "../../_components/device-forms";
import { autoMatchAction, deviceStateAction, mapUserAction, regenerateKeyAction, reprocessAction, unmapUserAction, updateDeviceAction } from "../actions";

export const metadata: Metadata = { title: "Attendance device" };

export default async function DevicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID_RE.test(id)) notFound();
  const { current, access, tz, now } = await attendancePage();
  if (!access.admin) redirect(BASE);
  const onlyRejected = sp.punches === "rejected";

  const data = await withSchool(current.ctx, async (tx) => {
    const device = await tx.attendanceDevice.findFirst({ where: { id } });
    if (!device) return null;
    const [maps, punches, unknown, campuses] = await Promise.all([
      tx.deviceUserMap.findMany({ where: { deviceId: id, archivedAt: null }, orderBy: { deviceUserNo: "asc" } }),
      tx.devicePunch.findMany({ where: { deviceId: id, ...(onlyRejected ? { accepted: false } : {}) }, orderBy: { punchedAt: "desc" }, take: 100 }),
      tx.devicePunch.groupBy({ by: ["deviceUserNo"], where: { deviceId: id, rejectReason: "unknown-user" }, _count: true }),
      tx.campus.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    ]);
    const staffIds = [...maps.map((m) => m.staffId), ...punches.map((p) => p.staffId)].filter((x): x is string => Boolean(x));
    const studentIds = [...maps.map((m) => m.studentId), ...punches.map((p) => p.studentId)].filter((x): x is string => Boolean(x));
    const [staff, students, allStaff, allStudents] = await Promise.all([
      tx.staff.findMany({ where: { id: { in: staffIds } }, select: { id: true, fullName: true, staffCode: true } }),
      tx.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, fullName: true, admissionNo: true } }),
      device.allowedUsers !== "students" ? tx.staff.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, staffCode: true } }) : [],
      device.allowedUsers !== "staff" ? tx.student.findMany({ where: { archivedAt: null, status: { in: ["ACTIVE", "ADMITTED"] } }, orderBy: { fullName: "asc" }, select: { id: true, fullName: true, admissionNo: true }, take: 3000 }) : [],
    ]);
    const mappedNos = new Set(maps.map((m) => m.deviceUserNo));
    return {
      device, maps, punches, campuses,
      unmapped: unknown.filter((u) => !mappedNos.has(u.deviceUserNo)).sort((a, b) => b._count - a._count),
      names: new Map<string, string>([...staff.map((s) => [s.id, `${s.fullName} (${s.staffCode})`] as const), ...students.map((s) => [s.id, `${s.fullName} (${s.admissionNo})`] as const)]),
      people: [...allStaff.map((s) => ({ value: `staff:${s.id}`, label: `Staff: ${s.fullName} (${s.staffCode})` })), ...allStudents.map((s) => ({ value: `student:${s.id}`, label: `Student: ${s.fullName} (${s.admissionNo})` }))],
    };
  });
  if (!data) notFound();
  const d = data.device;
  const st = deviceStatus(d, now);
  const archived = Boolean(d.archivedAt);
  const rejectedCount = data.punches.filter((p) => !p.accepted).length;

  return (
    <>
      <PageHeader title={d.name} href={`${BASE}/devices/${d.id}`} userId={current.user.id}>
        <Link href={`${BASE}/devices?view=devices`} className="font-medium text-brand-text hover:underline">All devices</Link>
      </PageHeader>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="User mapping" description="Match each device user number to a student or staff member. Auto-match uses staff IDs and admission numbers (the ID card numbers)."
              action={!archived ? <div className="flex flex-wrap gap-2"><ActionButton action={autoMatchAction} hidden={{ deviceId: d.id }} size="md" pendingText="Matching…">Auto-match</ActionButton><MapUserForm action={mapUserAction} deviceId={d.id} people={data.people} /></div> : undefined} />
            <CardBody>
              {data.unmapped.length > 0 && (
                <div className="mb-4 rounded-xl border border-warn/30 bg-warn-bg p-3 text-sm text-warn-text">
                  <p className="font-semibold">{data.unmapped.length} unknown device {data.unmapped.length === 1 ? "user" : "users"} sent punches</p>
                  <ul className="mt-2 space-y-1">
                    {data.unmapped.slice(0, 20).map((u) => (
                      <li key={u.deviceUserNo} className="flex flex-wrap items-center justify-between gap-2">
                        <span>User {u.deviceUserNo}: {u._count} {u._count === 1 ? "punch" : "punches"} rejected</span>
                        {!archived && <MapUserForm action={mapUserAction} deviceId={d.id} people={data.people} defaultNo={u.deviceUserNo} />}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {data.maps.length === 0 ? (
                <EmptyState title="No users mapped yet">Auto-match after the first punches arrive, or map numbers by hand.</EmptyState>
              ) : (
                <ul className="divide-y divide-line">
                  {data.maps.map((m) => (
                    <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                      <span><span className="font-mono">{m.deviceUserNo}</span> → {data.names.get(m.staffId ?? m.studentId ?? "") ?? "Unknown"} <span className="text-sm text-ink-2">({m.matchedBy === "auto" ? "auto-matched" : "by hand"})</span></span>
                      {!archived && <ActionButton action={unmapUserAction} hidden={{ mapId: m.id }} variant="ghost">Remove</ActionButton>}
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader title="Punches" description="The latest 100. A punch counts only if the device is active, the person is mapped and allowed, the time is inside the attendance window, it is a school day, and it is not a repeat."
              action={!archived ? <ActionButton action={reprocessAction} hidden={{ deviceId: d.id }} size="md" pendingText="Re-running…">Re-run sync</ActionButton> : undefined} />
            <CardBody>
              <p className="mb-3 text-sm">
                <Link className="font-medium text-brand-text hover:underline" href={`${BASE}/devices/${d.id}${onlyRejected ? "" : "?punches=rejected"}`}>{onlyRejected ? "Show all punches" : "Show only rejected punches"}</Link>
                {!onlyRejected && rejectedCount > 0 ? <span className="text-ink-2"> · {rejectedCount} rejected below</span> : null}
              </p>
              {data.punches.length === 0 ? (
                <EmptyState title={onlyRejected ? "No rejected punches" : "No punches yet"}>{onlyRejected ? "Every punch received was counted." : "Punches appear here as soon as the device sends them."}</EmptyState>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <caption className="sr-only">Punches from {d.name}</caption>
                    <thead className="border-b border-line text-ink-2"><tr><th scope="col" className="py-2 pr-3 font-medium">Time</th><th scope="col" className="py-2 pr-3 font-medium">Device user</th><th scope="col" className="py-2 pr-3 font-medium">Person</th><th scope="col" className="py-2 pr-3 font-medium">Result</th><th scope="col" className="py-2 font-medium">Punch no.</th></tr></thead>
                    <tbody className="divide-y divide-line">
                      {data.punches.map((p) => (
                        <tr key={p.id}>
                          <td className="py-2 pr-3 whitespace-nowrap">{formatDateTime(p.punchedAt, tz)}</td>
                          <td className="py-2 pr-3 font-mono">{p.deviceUserNo}</td>
                          <td className="py-2 pr-3">{data.names.get(p.staffId ?? p.studentId ?? "") ?? "—"}</td>
                          <td className="py-2 pr-3">{p.accepted ? <Badge tone="success">Counted</Badge> : <Badge tone="danger">{REJECT_WORDS[p.rejectReason ?? ""] ?? "Rejected"}</Badge>}</td>
                          <td className="py-2 font-mono text-ink-2">{p.punchNo}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader title="Device" action={<Badge tone={archived ? "neutral" : st.tone}>{archived ? "Archived" : st.label}</Badge>} />
            <CardBody className="space-y-3">
              <Detail label="Device ID">{d.serialNo}</Detail>
              <Detail label="Type">{DEVICE_TYPES.find((t) => t.value === d.deviceType)?.label ?? d.deviceType}</Detail>
              <Detail label="Location">{d.location ?? "Not set"}</Detail>
              <Detail label="Campus">{data.campuses.find((c) => c.id === d.campusId)?.name ?? ""}</Detail>
              <Detail label="Allowed users">{ALLOWED_USERS.find((a) => a.value === d.allowedUsers)?.label}</Detail>
              <Detail label="Last sync">{d.lastSyncAt ? formatDateTime(d.lastSyncAt, tz) : "Never connected"}</Detail>
              <Detail label="Last punch">{d.lastPunchAt ? formatDateTime(d.lastPunchAt, tz) : "None yet"}</Detail>
              <Detail label="Key">Ends in …{d.keyLast4}, made {formatDateTime(d.keyCreatedAt, tz)}</Detail>
              {d.ipAddress && <Detail label="IP address">{d.ipAddress}</Detail>}
              {d.connectionNote && <Detail label="Connection notes">{d.connectionNote}</Detail>}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Change" />
            <CardBody className="flex flex-wrap gap-2">
              {archived ? (
                <ActionButton action={deviceStateAction} hidden={{ deviceId: d.id, change: "restore" }} size="md">Restore</ActionButton>
              ) : (
                <>
                  <DeviceForm action={updateDeviceAction} campuses={data.campuses.map((c) => ({ value: c.id, label: c.name }))} types={[...DEVICE_TYPES]} allowed={[...ALLOWED_USERS]}
                    device={{ id: d.id, name: d.name, serialNo: d.serialNo, location: d.location, campusId: d.campusId, deviceType: d.deviceType, allowedUsers: d.allowedUsers, ipAddress: d.ipAddress, connectionNote: d.connectionNote }} />
                  <RegenerateKey deviceId={d.id} name={d.name} action={regenerateKeyAction} />
                  <ActionButton action={deviceStateAction} hidden={{ deviceId: d.id, change: d.isActive ? "deactivate" : "activate" }} size="md">{d.isActive ? "Deactivate" : "Activate"}</ActionButton>
                  <ActionButton action={deviceStateAction} hidden={{ deviceId: d.id, change: "archive" }} size="md" variant="danger-outline">Archive</ActionButton>
                </>
              )}
            </CardBody>
          </Card>
          {!d.isActive && !archived && <Alert tone="info">This device is inactive. Its punches are received but rejected until it is active again.</Alert>}
        </div>
      </div>
    </>
  );
}
