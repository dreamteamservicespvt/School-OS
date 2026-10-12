import type { Metadata } from "next";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { withSchool } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { hrPage, BASE } from "@/lib/staff/page";
import { exitTypeLabel } from "@/lib/staff/exit";
import { StaffHead } from "../_components/head";
import { Card, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EXIT_STATUS } from "./exit-status";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/empty-state";

export const metadata: Metadata = { title: "Staff Exit" };


export default async function StaffExitPage() {
  const { current, viewer, tz } = await hrPage();
  const data = await withSchool(current.ctx, async (tx) => {
    const exits = await tx.exitCase.findMany({ orderBy: [{ status: "asc" }, { lastWorkingDay: "desc" }], take: 200, include: { handover: { select: { doneAt: true } }, clearance: { select: { status: true } } } });
    const staff = await tx.staff.findMany({ where: { id: { in: exits.map((e) => e.staffId) } }, select: { id: true, fullName: true, designation: true } });
    return { exits, staff };
  });
  const open = data.exits.filter((e) => e.status === "WAITING_APPROVAL" || e.status === "IN_PROGRESS");
  const closed = data.exits.filter((e) => !open.includes(e));
  const list = (rows: typeof data.exits) => (
    <ul className="space-y-3">
      {rows.map((e) => {
        const s = data.staff.find((x) => x.id === e.staffId);
        const handed = e.handover.filter((h) => h.doneAt).length;
        const cleared = e.clearance.filter((c) => c.status !== "PENDING").length;
        return (
          <li key={e.id}>
            <Card>
              <CardBody className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-medium"><Link href={`${BASE}/exit/${e.id}`} className="hover:underline">{s?.fullName ?? "Staff"}</Link> <span className="font-normal text-ink-2">· {s?.designation}</span></p>
                  <p className="text-sm text-ink-2">{exitTypeLabel(e.type)} · last working day {formatDate(e.lastWorkingDay, tz)}</p>
                  {e.status === "IN_PROGRESS" && <p className="text-sm text-ink-2">Handover {handed} of {e.handover.length} · Clearance {cleared} of {e.clearance.length}</p>}
                </div>
                <Badge tone={EXIT_STATUS[e.status].tone}>{EXIT_STATUS[e.status].label}</Badge>
              </CardBody>
            </Card>
          </li>
        );
      })}
    </ul>
  );
  return (
    <>
      <StaffHead page="Staff Exit" href={`${BASE}/exit`} sub="Resignations, retirements and terminations, with the handover checklist and final settlement"
        actions={viewer.change === "all" ? <ButtonLink href={`${BASE}/exit/new`} variant="primary" icon={LogOut}>Record exit</ButtonLink> : undefined} />
      {data.exits.length === 0 ? (
        <EmptyState title="No staff exits">Record a resignation, retirement or termination here. The classes are handed over, checks cleared, and the login is switched off on the last working day.</EmptyState>
      ) : (
        <div className="space-y-6">
          <section aria-labelledby="open-exits">
            <h2 id="open-exits" className="mb-3 text-lg font-semibold">Open ({open.length})</h2>
            {open.length ? list(open) : <p className="text-ink-2">No exit in progress.</p>}
          </section>
          {closed.length > 0 && (
            <section aria-labelledby="closed-exits">
              <h2 id="closed-exits" className="mb-3 text-lg font-semibold">Closed ({closed.length})</h2>
              {list(closed)}
            </section>
          )}
        </div>
      )}
    </>
  );
}
