// Report a problem: any staff member raises a maintenance request from their
// phone, with a photo (14 Rooms, Labs & Maintenance, "any staff member").
// Open to every staff member of a school with Inventory Management on,
// whatever their role's Inventory permission. They see the requests they
// raised and those given to them to repair; nothing else of the inventory.
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Wrench } from "lucide-react";
import { requireCurrent } from "@/lib/current";
import { withSchool } from "@/lib/db";
import { formatDate, formatDateTime, formatRupees } from "@/lib/format";
import { fileLink } from "@/lib/files";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";
import { UrlSheet } from "@/components/ui/url-sheet";
import { Stack, DL, Empty, Banner } from "@/components/money/kit";
import { roomOptions } from "@/lib/inventory/lookup";
import { invViewer, pageOpen } from "@/lib/inventory/access";
import { BASE, MAINT_STATUS, MODULE, PRIORITY } from "@/lib/inventory/words";
import { ReportProblemForm } from "../rooms/sheets";
import { one, qs, uuidOr, type SearchParams } from "../_lib/page";

export const metadata: Metadata = { title: "Report a problem" };
const SELF = `${BASE}/report-problem`;

export default async function ReportProblemPage({ searchParams }: { searchParams: SearchParams }) {
  const sp = await searchParams;
  const current = await requireCurrent();
  if (!current.modulesOn.has(MODULE)) redirect(`/no-access?m=${MODULE}`);
  const tz = current.school.timeZone;
  const seesRooms = pageOpen(invViewer(current), "rooms");
  const requestId = uuidOr(one(sp.request));

  const d = await withSchool(current.ctx, async (tx) => {
    const staff = await tx.staff.findFirst({ where: { userLoginId: current.user.id, archivedAt: null }, select: { id: true } });
    const [places, assets, mine, given] = await Promise.all([
      roomOptions(tx),
      tx.asset.findMany({ where: { archivedAt: null, status: { not: "DISPOSED" }, roomId: { not: null } }, orderBy: { tag: "asc" }, take: 3000, select: { id: true, tag: true, name: true, roomId: true } }),
      tx.maintenanceRequest.findMany({ where: { raisedById: current.user.id }, orderBy: { raisedAt: "desc" }, take: 20 }),
      staff ? tx.maintenanceRequest.findMany({ where: { technicianStaffId: staff.id, status: { in: ["OPEN", "IN_PROGRESS"] } }, orderBy: { raisedAt: "desc" }, take: 30 }) : Promise.resolve([]),
    ]);
    const all = [...mine, ...given];
    const one_ = requestId ? all.find((r) => r.id === requestId) ?? null : null;
    const assetName = new Map(assets.map((a) => [a.id, `${a.tag} ${a.name}`]));
    return { staff, places, assets: assets.map((a) => ({ value: a.id, label: `${a.tag} ${a.name}`, roomId: a.roomId })), mine, given, one: one_, assetName };
  });
  const roomName = new Map(d.places.map((r) => [r.value, r.label]));

  const Row = ({ r }: { r: (typeof d.mine)[number] }) => (
    <li>
      <Link href={qs(SELF, { request: r.id })} scroll={false} className="px-5 py-3 flex items-center gap-3 text-[14px] hover:bg-sunken/60">
        <span className="flex-1 min-w-0">
          <b className="font-semibold block truncate">{r.problem}</b>
          <span className="block text-[12.5px] text-ink3">{r.number} · {roomName.get(r.roomId) ?? ""} · {formatDateTime(r.raisedAt, tz)}</span>
        </span>
        <Pill tone={MAINT_STATUS[r.status].tone}>{MAINT_STATUS[r.status].label}</Pill>
      </Link>
    </li>
  );

  return (
    <div>
      <PageHeader title="Report a problem" href={SELF} userId={current.user.id} sub="Something broken or not working? Send it with a photo. The store keeper is told." />
      <Stack>
        {!d.staff ? (
          <Banner tone="info" title="Only staff members report problems here">Ask a staff member to report it.</Banner>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-5 items-start">
            <Card>
              <CardHeader title="What is wrong" icon={Wrench} divided />
              <div className="p-5">
                <ReportProblemForm places={d.places} assets={d.assets} />
              </div>
            </Card>
            <div className="flex flex-col gap-5">
              {d.given.length > 0 && (
                <Card>
                  <CardHeader title="Given to me to repair" description="Tell the store keeper when it is done." divided />
                  <ul className="divide-y divide-line">{d.given.map((r) => <Row key={r.id} r={r} />)}</ul>
                </Card>
              )}
              <Card>
                <CardHeader title="My requests" divided action={seesRooms ? <Link className="text-[13px] font-semibold text-brand hover:underline" href={`${BASE}/rooms`}>All requests</Link> : undefined} />
                {d.mine.length === 0 ? <Empty icon={Wrench} title="Nothing reported yet" body="What you report shows here with its progress." /> : <ul className="divide-y divide-line">{d.mine.map((r) => <Row key={r.id} r={r} />)}</ul>}
              </Card>
            </div>
          </div>
        )}
      </Stack>
      {d.one && (
        <UrlSheet title={`${d.one.number} · ${roomName.get(d.one.roomId) ?? ""}`} sub={`${MAINT_STATUS[d.one.status].label} · ${PRIORITY[d.one.priority].label} priority`} closeHref={SELF}>
          <div className="flex flex-col gap-4">
            <p className="text-[15px] whitespace-pre-line">{d.one.problem}</p>
            {d.one.photoFileId && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fileLink(d.one.photoFileId, current.ctx.schoolId)} alt="Photo of the problem" className="max-h-72 rounded-xl border border-line object-contain" />
            )}
            <DL cols={2} rows={[
              ["Raised", formatDateTime(d.one.raisedAt, tz)], ["Asset", d.one.assetId ? d.assetName.get(d.one.assetId) ?? "" : "None"],
              ["Technician", d.one.technicianName ?? (d.one.technicianStaffId ? (d.one.technicianStaffId === d.staff?.id ? "You" : "A staff member") : "Not assigned yet")],
              ["Done on", d.one.doneOn ? formatDate(d.one.doneOn, "UTC") : "Not yet"],
              ...(d.one.costPaise !== null && seesRooms ? [["Cost", formatRupees(d.one.costPaise)] as [string, React.ReactNode]] : []),
              ...(d.one.closingNote ? [["Note", d.one.closingNote] as [string, React.ReactNode]] : []),
            ]} />
          </div>
        </UrlSheet>
      )}
    </div>
  );
}
