// Events & Calendar's tab on the Student Profile (03 §2, "Activities", order
// 90): the PTM meeting notes about the student and the events they were
// registered for, with attendance. PTM notes show to those who work on PTMs
// (the events team and teachers); the events list to everyone who may open
// the School Calendar. Registered through src/lib/students/profile-tab-modules.ts.
import "server-only";

import Link from "next/link";
import { withSchool } from "../db";
import { formatRupees } from "../format";
import { registerProfileTab, type ProfileTabArgs } from "../students/profile-tabs";
import { evPageAllowed, evViewer } from "./access";
import { feeStates } from "./events";
import { clock, isoOf, longDay } from "./words";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

async function load({ current, studentId }: ProfileTabArgs) {
  const v = evViewer(current);
  const notesOn = evPageAllowed(v, "ptm");
  const eventsOpen = evPageAllowed(v, "events");
  return withSchool(current.ctx, async (tx) => {
    const notes = notesOn ? await tx.ptmMeetingNote.findMany({ where: { studentId }, orderBy: { createdAt: "desc" }, take: 20 }) : [];
    const [ptms, slots, staff] = notes.length ? await Promise.all([
      tx.ptm.findMany({ where: { id: { in: notes.map((n) => n.ptmId) } }, select: { id: true, date: true } }),
      tx.ptmSlot.findMany({ where: { id: { in: notes.map((n) => n.slotId) } }, select: { id: true, startMin: true } }),
      tx.staff.findMany({ where: { id: { in: notes.map((n) => n.staffId) } }, select: { id: true, fullName: true } }),
    ]) : [[], [], []];
    const regs = await tx.eventRegistration.findMany({ where: { studentId, withdrawnAt: null }, orderBy: { createdAt: "desc" }, take: 30 });
    const events = regs.length ? await tx.event.findMany({ where: { id: { in: regs.map((r) => r.eventId) }, archivedAt: null }, select: { id: true, name: true, date: true, type: true, feePaise: true, cancelledAt: true } }) : [];
    const fees = await feeStates(tx, regs.map((r) => r.dueId).filter((x): x is string => Boolean(x)));
    const upcoming = notesOn ? await tx.ptmSlot.findMany({ where: { studentId, ptm: { archivedAt: null, date: { gte: new Date(new Date().toISOString().slice(0, 10)) } } }, include: { ptm: true } }) : [];
    return { notes, ptms, slots, staff, regs, events, fees, upcoming, notesOn, eventsOpen };
  });
}

async function ActivitiesTab(args: ProfileTabArgs) {
  const d = await load(args);
  const rows = d.regs.map((r) => ({ r, e: d.events.find((e) => e.id === r.eventId) })).filter((x) => x.e).sort((a, b) => b.e!.date.getTime() - a.e!.date.getTime());
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {d.notesOn && (
        <Card>
          <CardHeader title="PTM meeting notes" description={d.upcoming.length ? `Next PTM: ${longDay(isoOf(d.upcoming[0].ptm.date))}, ${clock(d.upcoming[0].startMin)}` : undefined}
            action={<Link className="text-sm font-medium text-brand-text hover:underline" href="/events-calendar/ptm">PTM</Link>} />
          <CardBody>
            {d.notes.length === 0 ? <p className="text-ink-2">No PTM notes yet.</p> : (
              <ul className="divide-y divide-line">
                {d.notes.map((n) => {
                  const p = d.ptms.find((x) => x.id === n.ptmId);
                  const s = d.slots.find((x) => x.id === n.slotId);
                  return (
                    <li key={n.id} className="py-3">
                      <p className="text-sm font-semibold">{p ? longDay(isoOf(p.date)) : "PTM"}{s ? `, ${clock(s.startMin)}` : ""} · {d.staff.find((x) => x.id === n.staffId)?.fullName ?? "Teacher"}</p>
                      {n.remarks && <p className="text-sm mt-1"><span className="text-ink-2">Teacher remarks: </span>{n.remarks}</p>}
                      {n.feedback && <p className="text-sm mt-0.5"><span className="text-ink-2">Parent feedback: </span>{n.feedback}</p>}
                      {n.followUp && <p className="text-sm mt-0.5"><span className="text-ink-2">Follow-up: </span>{n.followUp}</p>}
                    </li>
                  );
                })}
              </ul>
            )}
          </CardBody>
        </Card>
      )}
      <Card>
        <CardHeader title="Events" description="Events the student was registered for" />
        <CardBody>
          {rows.length === 0 ? <p className="text-ink-2">Not registered for any event yet.</p> : (
            <ul className="divide-y divide-line">
              {rows.map(({ r, e }) => {
                const fee = r.dueId ? d.fees.get(r.dueId) : null;
                return (
                  <li key={r.id} className="py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      {d.eventsOpen ? <Link href={`/events-calendar/events/${e!.id}`} className="text-sm font-semibold hover:underline">{e!.name}</Link> : <p className="text-sm font-semibold">{e!.name}</p>}
                      <p className="text-xs text-ink-2">{longDay(isoOf(e!.date))} · {e!.type}{e!.feePaise ? ` · Fee ${formatRupees(e!.feePaise)}${fee ? `, ${fee.toLowerCase()}` : ""}` : ""}</p>
                    </div>
                    {e!.cancelledAt ? <Badge tone="neutral">Cancelled</Badge> : r.attended === true ? <Badge tone="success">Attended</Badge> : r.attended === false ? <Badge tone="danger">Absent</Badge> : <Badge tone="neutral">Registered</Badge>}
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

registerProfileTab({
  key: "activities",
  label: "Activities",
  module: "events-calendar",
  order: 90,
  allowed: (current) => evViewer({ permissions: current.permissions, roles: current.roles ?? [], user: { id: "" } }).level !== null,
  load: async (args) => <ActivitiesTab {...args} />,
});
