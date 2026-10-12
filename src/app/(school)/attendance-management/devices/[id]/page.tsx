import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Link2, ListChecks, ScanFace, Settings2 } from "lucide-react";
import { withSchool } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { attendancePage } from "@/lib/attendance/page";
import { BASE } from "@/lib/attendance/access";
import { ALLOWED_USERS, DEVICE_TYPES, deviceStatus, REJECT_WORDS } from "@/lib/attendance/devices";
import { UUID_RE } from "@/lib/staff/act";
import { PAGE_SIZE, listHref, readListParams, skipTake } from "@/lib/list";
import { momentWhere, periodFromSearch } from "@/lib/periods";
import { periodSetup } from "@/lib/period-setup";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { Banner } from "@/components/ui/banner";
import { ButtonLink } from "@/components/ui/button";
import { Stats } from "@/components/ui/stats";
import { Chips } from "@/components/ui/chips";
import { DL, Split, Col } from "@/components/ui/rows";
import { DataList, Pager } from "@/app/(school)/attendance-management/_components/data-list";
import { PeriodFilter } from "@/components/list/period-filter";
import { EmptyState } from "@/components/empty-state";
import { ActionButton } from "../../../staff-hr-management/_components/forms";
import { AttHead } from "../../_components/att-head";
import { DeviceForm, MapUserForm, RegenerateKey } from "../../_components/device-forms";
import { autoMatchAction, deviceStateAction, mapUserAction, regenerateKeyAction, reprocessAction, unmapUserAction, updateDeviceAction } from "../actions";

export const metadata: Metadata = { title: "Attendance device" };

const TONE = { success: "ok", warning: "warn", danger: "bad", neutral: "neutral" } as const;

export default async function DevicePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!UUID_RE.test(id)) notFound();
  const { current, access, features, tz, now } = await attendancePage();
  if (!access.admin) redirect("/no-access?m=attendance-management");
  const canEdit = access.change !== "none";
  const onlyRejected = sp.punches === "rejected";
  const list = readListParams(sp, ["punches"]);
  const dates = await periodSetup(current);
  const range = periodFromSearch(sp, { ...dates, fallback: "last7" });
  const path = `${BASE}/devices/${id}`;

  const data = await withSchool(current.ctx, async (tx) => {
    const device = await tx.attendanceDevice.findFirst({ where: { id } });
    if (!device) return null;
    const when = range ? { punchedAt: momentWhere(range, tz) } : {};
    const where = { deviceId: id, ...when, ...(onlyRejected ? { accepted: false } : {}) };
    const [maps, punches, total, counts, unknown, campuses] = await Promise.all([
      tx.deviceUserMap.findMany({ where: { deviceId: id, archivedAt: null }, orderBy: { deviceUserNo: "asc" } }),
      tx.devicePunch.findMany({ where, orderBy: { punchedAt: "desc" }, ...skipTake(list) }),
      tx.devicePunch.count({ where }),
      tx.devicePunch.groupBy({ by: ["accepted"], where: { deviceId: id, ...when }, _count: true }),
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
      device, maps, punches, total, campuses,
      accepted: counts.find((c) => c.accepted)?._count ?? 0, rejected: counts.find((c) => !c.accepted)?._count ?? 0,
      unmapped: unknown.filter((u) => !mappedNos.has(u.deviceUserNo)).sort((a, b) => b._count - a._count),
      names: new Map<string, string>([...staff.map((s) => [s.id, `${s.fullName} (${s.staffCode})`] as const), ...students.map((s) => [s.id, `${s.fullName} (${s.admissionNo})`] as const)]),
      people: [...allStaff.map((s) => ({ value: `staff:${s.id}`, label: `Staff: ${s.fullName} (${s.staffCode})` })), ...allStudents.map((s) => ({ value: `student:${s.id}`, label: `Student: ${s.fullName} (${s.admissionNo})` }))],
    };
  });
  if (!data) notFound();
  const d = data.device;
  const st = deviceStatus(d, now);
  const archived = Boolean(d.archivedAt);
  const typeLabel = DEVICE_TYPES.find((t) => t.value === d.deviceType)?.label ?? d.deviceType;
  const qs = (change: Record<string, string | null>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) if (typeof v === "string" && k !== "page") p.set(k, v);
    for (const [k, v] of Object.entries(change)) { if (v) p.set(k, v); else p.delete(k); }
    return p.size ? `${path}?${p}` : path;
  };
  type Punch = (typeof data.punches)[number];

  return (
    <>
      <AttHead access={access} features={features} userId={current.user.id} href={path} sub={`${d.name} · ${typeLabel} · ${d.location ?? "No location"} · ${d.serialNo}`}
        actions={<ButtonLink href={`${BASE}/devices`} variant="ghost" icon={ArrowLeft}>All devices</ButtonLink>} />
      <div className="flex flex-col gap-5 lg:gap-6">
        <Stats items={[
          { label: "Status", value: archived ? "Archived" : st.label, sub: d.lastSyncAt ? `Last sync ${formatDateTime(d.lastSyncAt, tz)}` : "Never connected", tone: archived || st.tone === "neutral" ? undefined : TONE[st.tone] as "ok" | "warn" | "bad", icon: ScanFace },
          { label: "Accepted", value: data.accepted.toLocaleString("en-IN"), sub: range?.label ?? "All dates", tone: "ok", icon: ListChecks, href: qs({ punches: null }) },
          { label: "Rejected", value: data.rejected, sub: range?.label ?? "All dates", tone: data.rejected ? "warn" : undefined, icon: ListChecks, href: qs({ punches: "rejected" }) },
          { label: "Users mapped", value: data.maps.length, sub: data.unmapped.length ? `${data.unmapped.length} unknown users sent punches` : "No unknown users", icon: Link2 },
        ]} />
        {!d.isActive && !archived && <Banner tone="info" title="This device is inactive.">Its punches are received but rejected until it is active again.</Banner>}
        <Split side={340}>
          <Col className="min-w-0">
            <Card className="overflow-hidden">
              <CardHeader icon={ListChecks} title="Punches" description="A punch counts only if the device is active, the person is mapped and allowed, the time is inside the attendance window, it is a school day, and it is not a repeat."
                action={!archived && canEdit ? <ActionButton action={reprocessAction} hidden={{ deviceId: d.id }} size="md" pendingText="Re-running…">Re-run sync</ActionButton> : undefined} />
              <div className="flex flex-wrap items-center gap-2 px-3 pb-3 border-b border-line">
                <Chips label="Punches shown" value={onlyRejected ? "rejected" : "all"} options={[
                  { value: "all", label: "All", count: data.accepted + data.rejected, href: qs({ punches: null }) },
                  { value: "rejected", label: "Rejected", count: data.rejected, href: qs({ punches: "rejected" }) },
                ]} />
                <div className="sm:ml-auto"><PeriodFilter {...dates} fallback="last7" /></div>
              </div>
              <DataList<Punch> rows={data.punches} rowKey={(p) => p.id} caption={`Punches from ${d.name}`} minWidth={640}
                columns={[
                  { key: "t", label: "Time", render: (p) => <span className="tnum whitespace-nowrap">{formatDateTime(p.punchedAt, tz)}</span> },
                  { key: "u", label: "Device user", render: (p) => <span className="font-mono">{p.deviceUserNo}</span> },
                  { key: "p", label: "Person", render: (p) => data.names.get(p.staffId ?? p.studentId ?? "") ?? <span className="text-ink3">—</span> },
                  { key: "r", label: "Result", render: (p) => (p.accepted ? <Pill tone="ok">Counted</Pill> : <Pill tone="bad">{REJECT_WORDS[p.rejectReason ?? ""] ?? "Rejected"}</Pill>) },
                  { key: "n", label: "Punch no.", render: (p) => <span className="font-mono text-ink3">{p.punchNo}</span> },
                ]}
                mobile={(p) => ({ title: data.names.get(p.staffId ?? p.studentId ?? "") ?? `User ${p.deviceUserNo}`, sub: formatDateTime(p.punchedAt, tz), right: p.accepted ? <Pill tone="ok">Counted</Pill> : <Pill tone="bad">{REJECT_WORDS[p.rejectReason ?? ""] ?? "Rejected"}</Pill> })}
                footer={<Pager page={list.page} pageSize={PAGE_SIZE} total={data.total} href={(n) => listHref(path, list, { page: n })} />}
                empty={<EmptyState bare Icon={ListChecks} title={onlyRejected ? "No rejected punches" : "No punches in these dates"}>{onlyRejected ? "Every punch received was counted." : "Punches appear here as soon as the device sends them."}</EmptyState>} />
            </Card>
            <Card>
              <CardHeader icon={Link2} title="User mapping" description="Match each device user number to a student or staff member. Auto-match uses staff IDs and admission numbers."
                action={!archived && canEdit ? <div className="flex flex-wrap gap-2"><ActionButton action={autoMatchAction} hidden={{ deviceId: d.id }} size="md" pendingText="Matching…">Auto-match</ActionButton><MapUserForm action={mapUserAction} deviceId={d.id} people={data.people} /></div> : undefined} />
              <div className="px-5 pb-5 flex flex-col gap-3">
                {data.unmapped.length > 0 && (
                  <div className="rounded-xl border border-warn/30 bg-warn/10 p-3 text-[14px]">
                    <p className="font-semibold text-warn">{data.unmapped.length} unknown device {data.unmapped.length === 1 ? "user" : "users"} sent punches</p>
                    <ul className="mt-2 flex flex-col gap-1">
                      {data.unmapped.slice(0, 20).map((u) => (
                        <li key={u.deviceUserNo} className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-ink2">User <span className="font-mono">{u.deviceUserNo}</span>: {u._count} {u._count === 1 ? "punch" : "punches"} rejected</span>
                          {!archived && canEdit && <MapUserForm action={mapUserAction} deviceId={d.id} people={data.people} defaultNo={u.deviceUserNo} />}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {data.maps.length === 0 ? <p className="text-[14px] text-ink3">No users mapped yet. Auto-match after the first punches arrive, or map numbers by hand.</p> : (
                  <ul className="divide-y divide-line/70">
                    {data.maps.map((m) => (
                      <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-[14px]">
                        <span><span className="font-mono">{m.deviceUserNo}</span> → {data.names.get(m.staffId ?? m.studentId ?? "") ?? "Unknown"} <span className="text-[12.5px] text-ink3">({m.matchedBy === "auto" ? "auto-matched" : "by hand"})</span></span>
                        {!archived && canEdit && <ActionButton action={unmapUserAction} hidden={{ mapId: m.id }} variant="ghost">Remove</ActionButton>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          </Col>
          <Col>
            <Card>
              <CardHeader icon={ScanFace} title="Device" action={<Pill tone={archived ? "neutral" : TONE[st.tone]}>{archived ? "Archived" : st.label}</Pill>} />
              <div className="pb-4">
                <DL cols={1} rows={[
                  ["Device ID", d.serialNo], ["Type", typeLabel], ["Location", d.location ?? "Not set"],
                  ["Campus", data.campuses.find((c) => c.id === d.campusId)?.name ?? ""],
                  ["Allowed users", ALLOWED_USERS.find((a) => a.value === d.allowedUsers)?.label ?? d.allowedUsers],
                  ["Last punch", d.lastPunchAt ? formatDateTime(d.lastPunchAt, tz) : "None yet"],
                  ["Key", `Ends in …${d.keyLast4}, made ${formatDateTime(d.keyCreatedAt, tz)}`],
                  ...(d.ipAddress ? [["IP address", d.ipAddress] as [string, string]] : []),
                  ...(d.connectionNote ? [["Connection notes", d.connectionNote] as [string, string]] : []),
                ]} />
              </div>
            </Card>
            {canEdit && (
              <Card>
                <CardHeader icon={Settings2} title="Change" />
                <div className="px-5 pb-5 flex flex-wrap gap-2">
                  {archived ? (
                    <ActionButton action={deviceStateAction} hidden={{ deviceId: d.id, change: "restore" }} size="md">Restore</ActionButton>
                  ) : (
                    <>
                      <DeviceForm action={updateDeviceAction} campuses={data.campuses.map((c) => ({ value: c.id, label: c.name }))} types={[...DEVICE_TYPES]} allowed={[...ALLOWED_USERS]}
                        device={{ id: d.id, name: d.name, serialNo: d.serialNo, location: d.location, campusId: d.campusId, deviceType: d.deviceType, allowedUsers: d.allowedUsers, ipAddress: d.ipAddress, connectionNote: d.connectionNote }} />
                      <RegenerateKey deviceId={d.id} name={d.name} action={regenerateKeyAction} />
                      <ActionButton action={deviceStateAction} hidden={{ deviceId: d.id, change: d.isActive ? "deactivate" : "activate" }} size="md">{d.isActive ? "Deactivate" : "Make active"}</ActionButton>
                      <ActionButton action={deviceStateAction} hidden={{ deviceId: d.id, change: "archive" }} size="md" variant="danger-outline">Archive</ActionButton>
                    </>
                  )}
                </div>
              </Card>
            )}
          </Col>
        </Split>
      </div>
    </>
  );
}
