// Hostel Management's tab on the Student Profile (15 §4 Sends: "Hostel
// details on the profile"): the student's bed and since when, where they are
// now (in the hostel, out on a pass), their outing passes, roll call absences
// and incidents, the hostel fees (only for people with Fee Management), and
// their bed history. Registered through src/lib/students/profile-tab-modules.ts.
import "server-only";

import Link from "next/link";
import { BedDouble, DoorOpen, History, ListChecks, ReceiptIndianRupee } from "lucide-react";
import type { Current } from "../current";
import { withSchool } from "../db";
import { formatDate, formatRupees } from "../format";
import { registerProfileTab, type ProfileTabArgs } from "../students/profile-tabs";
import { hostelViewer, pageOpen } from "./access";
import { activeBedOf, bedHistory, hostelAsked, residentStatus } from "./allocation";
import { passWhen, shownStatus } from "./outings";
import { wardensByHostel } from "./settings";
import { BASE, MODULE, PASS_STATUS, RESIDENT_STATUS, SESSION, plural } from "./words";
import { Card, CardHeader } from "@/components/ui/card";
import { Pill } from "@/components/ui/badge";

const ZERO = BigInt(0);

async function load(current: Current, studentId: string) {
  const now = new Date();
  return withSchool(current.ctx, async (tx) => {
    const [bed, history, passes, absences, incidents, charges, asked] = await Promise.all([
      activeBedOf(tx, studentId),
      bedHistory(tx, studentId),
      tx.gatePass.findMany({ where: { kind: "HOSTEL_OUTING", studentId, archivedAt: null }, orderBy: { fromAt: "desc" }, take: 8 }),
      tx.rollCallMark.findMany({ where: { studentId, mark: "ABSENT" }, include: { rollCall: { select: { date: true, session: true } } }, orderBy: { createdAt: "desc" }, take: 8 }),
      tx.hostelIncident.findMany({ where: { studentIds: { has: studentId }, archivedAt: null }, orderBy: { at: "desc" }, take: 6 }),
      tx.hostelFeeCharge.findMany({ where: { studentId, state: { in: ["ADDED", "KEPT"] } }, select: { dueId: true } }),
      hostelAsked(tx, studentId),
    ]);
    const dues = charges.length ? await tx.studentFeeDue.findMany({ where: { id: { in: charges.map((c) => c.dueId) }, state: "OPEN" }, orderBy: { dueDate: "asc" } }) : [];
    const wardens = bed ? (await wardensByHostel(tx, [bed.hostel.id])).get(bed.hostel.id) ?? [] : [];
    const out = passes.find((p) => p.status === "OUT");
    return { bed, history, passes, absences, incidents, dues, wardens, out, now, asked };
  });
}

export async function HostelPanel({ current, studentId }: { current: Current; studentId: string }) {
  const d = await load(current, studentId);
  const v = hostelViewer(current);
  const tz = current.school.timeZone;
  const st = d.bed ? RESIDENT_STATUS[residentStatus(d.bed.allocation, d.out, d.now)] : null;
  const balance = d.dues.reduce((t, x) => t + x.balancePaise, ZERO);
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Hostel bed" icon={BedDouble} divided
          action={pageOpen(v, "allocation") ? <Link href={`${BASE}/allocation?q=${encodeURIComponent(studentId)}`} className="text-[13px] font-semibold text-brand hover:underline">Open in Allocation</Link> : undefined} />
        {d.bed ? (
          <div className="px-5 py-4 flex flex-col gap-2 text-[14px]">
            <p className="flex items-center gap-2 flex-wrap"><b className="font-semibold">{d.bed.hostel.name}</b> · {d.bed.words} · {d.bed.room.floor} floor{d.bed.room.roomType ? ` · ${d.bed.room.roomType}` : ""} {st && <Pill tone={st.tone}>{st.label}</Pill>}</p>
            <p className="text-ink3 text-[13px]">Since {formatDate(d.bed.allocation.startDate, "UTC")}{d.bed.allocation.checkedInAt ? `, checked in ${formatDate(d.bed.allocation.checkedInAt, tz)}` : ", not arrived yet"}</p>
            {d.wardens.length > 0 && <p className="text-ink3 text-[13px]">Warden: {d.wardens.map((w) => `${w.name}${w.title !== "Warden" ? ` (${w.title.toLowerCase()})` : ""}`).join(", ")}</p>}
            {d.out && <p className="text-[13px]">Out on pass {d.out.passNo} with {d.out.collectorName}, back by {d.out.toAt ? formatDate(d.out.toAt, tz) : ""} {d.out.toAt ? new Intl.DateTimeFormat("en-IN", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(d.out.toAt) : ""}.</p>}
          </div>
        ) : d.asked && !d.history.length ? (
          <div className="px-5 py-4 flex flex-col gap-1.5 text-[13.5px]">
            <p><Pill tone="warn">Waiting for a bed</Pill> Hostel needed on admission application {d.asked.applicationNo}, {formatDate(d.asked.createdAt, tz)}.</p>
            {pageOpen(v, "allocation") && <Link href={`${BASE}/allocation?allocate=1&student=${studentId}`} className="text-[13px] font-semibold text-brand hover:underline self-start">Give a bed in Allocation</Link>}
          </div>
        ) : <p className="px-5 py-4 text-[13.5px] text-ink3">Not living in the hostel now.</p>}
      </Card>
      <Card>
        <CardHeader title="Outing and leave passes" icon={DoorOpen} divided
          action={pageOpen(v, "outings") && d.bed ? <Link href={`${BASE}/outings?q=${encodeURIComponent(d.bed.allocation.studentId)}`} className="text-[13px] font-semibold text-brand hover:underline">All passes</Link> : undefined} />
        {d.passes.length ? (
          <ul className="divide-y divide-line/70">
            {d.passes.map((p) => {
              const s = PASS_STATUS[shownStatus(p, d.now)];
              return (
                <li key={p.id} className="flex items-center gap-3 px-5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] truncate">{passWhen(p, tz)}</p>
                    <p className="text-[12.5px] text-ink3 truncate">{p.passNo} · with {p.collectorName} · {p.reason}</p>
                  </div>
                  <Pill tone={s.tone}>{s.label}</Pill>
                </li>
              );
            })}
          </ul>
        ) : <p className="px-5 py-4 text-[13.5px] text-ink3">No passes yet.</p>}
      </Card>
      <Card>
        <CardHeader title="Roll call and incidents" icon={ListChecks} divided description={`${plural(d.absences.length, "absence")} at roll call recently · ${plural(d.incidents.length, "incident")}`} />
        {d.absences.length + d.incidents.length ? (
          <ul className="divide-y divide-line/70">
            {d.absences.map((a) => <li key={a.id} className="flex items-center gap-3 px-5 py-2.5 text-[14px]"><span className="flex-1">Absent at {SESSION[a.rollCall.session].toLowerCase()} roll call</span><span className="text-[12.5px] text-ink3 tnum">{formatDate(a.rollCall.date, "UTC")}</span></li>)}
            {d.incidents.map((i) => <li key={i.id} className="flex items-center gap-3 px-5 py-2.5 text-[14px]"><span className="flex-1 min-w-0 truncate">{i.incidentNo}: {i.description}</span><span className="text-[12.5px] text-ink3 tnum shrink-0">{formatDate(i.at, tz)}</span></li>)}
          </ul>
        ) : <p className="px-5 py-4 text-[13.5px] text-ink3">Nothing recorded.</p>}
      </Card>
      {v.seesFees && (
        <Card>
          <CardHeader title="Hostel fees" icon={ReceiptIndianRupee} divided description={balance > ZERO ? `${formatRupees(balance)} still to pay` : "Nothing to pay."} />
          {d.dues.length ? (
            <ul className="divide-y divide-line/70">
              {d.dues.map((x) => (
                <li key={x.id} className="flex items-center gap-3 px-5 py-2.5 text-[14px]">
                  <span className="flex-1 min-w-0 truncate">{x.label}</span>
                  <span className="text-[12.5px] text-ink3 tnum">due {formatDate(x.dueDate, "UTC")}</span>
                  <b className="font-semibold tnum">{formatRupees(x.amountPaise)}</b>
                  {x.balancePaise === ZERO ? <Pill tone="ok">Paid</Pill> : <Pill tone={x.dueDate.getTime() < d.now.getTime() ? "bad" : "warn"}>{formatRupees(x.balancePaise)} due</Pill>}
                </li>
              ))}
            </ul>
          ) : <p className="px-5 py-4 text-[13.5px] text-ink3">No hostel fees.</p>}
        </Card>
      )}
      <Card>
        <CardHeader title="Bed history" icon={History} divided />
        {d.history.length ? (
          <ul className="divide-y divide-line/70">
            {d.history.map((h) => (
              <li key={h.id} className="flex items-center gap-3 px-5 py-2.5 text-[14px]">
                <span className="flex-1 min-w-0 truncate">{h.hostelName} · {h.where}</span>
                <span className="text-[12.5px] text-ink3 tnum shrink-0">{formatDate(h.startDate, "UTC")} to {h.endDate ? formatDate(h.endDate, "UTC") : "now"}{h.endReason ? ` · ${h.status === "MOVED" ? "moved" : "left"}: ${h.endReason}` : ""}</span>
              </li>
            ))}
          </ul>
        ) : <p className="px-5 py-4 text-[13.5px] text-ink3">Never had a hostel bed.</p>}
      </Card>
    </div>
  );
}

registerProfileTab({
  key: "hostel",
  label: "Hostel",
  module: MODULE,
  order: 85,
  load: async ({ current, studentId }: ProfileTabArgs) => <HostelPanel current={current} studentId={studentId} />,
  summary: async ({ current, studentId }) => {
    const bed = await withSchool(current.ctx, (tx) => activeBedOf(tx, studentId));
    return bed ? [{ label: "Hostel", value: bed.hostel.name, sub: bed.words, tone: "neutral", href: `/student-management/students/${studentId}?tab=hostel` }] : [];
  },
  allowed: (current) => current.modulesOn.has(MODULE),
});
