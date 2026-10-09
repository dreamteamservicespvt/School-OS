import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { withSchool } from "@/lib/db";
import { hrPage, BASE } from "@/lib/staff/page";
import { isoDay } from "@/lib/staff/dates";
import { PageHeader } from "@/components/shell/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { NewExitForm } from "../exit-forms";
import { startExitAction } from "../actions";

export const metadata: Metadata = { title: "Record exit" };

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function NewExitPage({ searchParams }: Props) {
  const sp = await searchParams;
  const { current, viewer, today } = await hrPage("edit");
  if (viewer.change !== "all") redirect(`${BASE}/exit`);
  const staff = await withSchool(current.ctx, async (tx) => {
    const busy = await tx.exitCase.findMany({ where: { status: { in: ["WAITING_APPROVAL", "IN_PROGRESS"] } }, select: { staffId: true } });
    return tx.staff.findMany({
      where: { archivedAt: null, status: { in: ["ACTIVE", "ON_LEAVE", "SUSPENDED"] }, id: { notIn: busy.map((b) => b.staffId) } },
      orderBy: { fullName: "asc" }, select: { id: true, fullName: true, staffCode: true, designation: true },
    });
  });
  const fixed = typeof sp.staff === "string" && staff.some((s) => s.id === sp.staff) ? sp.staff : undefined;
  return (
    <>
      <PageHeader title="Record exit" href={`${BASE}/exit/new`} userId={current.user.id} />
      <Card className="max-w-2xl">
        <CardBody>
          <p className="mb-4 text-ink-2">A resignation starts the handover straight away. A retirement or termination goes to the Principal for approval first. On the last working day the login is switched off.</p>
          <NewExitForm action={startExitAction} today={isoDay(today)} fixedStaff={fixed} staff={staff.map((s) => ({ value: s.id, label: `${s.fullName} (${s.staffCode}, ${s.designation})` }))} />
        </CardBody>
      </Card>
    </>
  );
}
