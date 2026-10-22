import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { hrPage, BASE } from "@/lib/staff/page";
import { PLACES } from "@/lib/imports/places";
import { BackLink } from "@/components/ui/module-head";
import { PageHeader } from "@/components/shell/page-header";
import { ImportHome } from "@/components/import/import-home";

export const metadata: Metadata = { title: "Import staff" };

const ABOUT = {
  staff: "One row per staff member, with phone, designation and joining date. Each is added as if typed on Add staff; a login is made when the row says so. Designations and departments not in HR Settings can be matched or added while you check the file.",
  "staff-pay-details": "One row per staff member with the staff ID and any of bank name, bank account number, IFSC, PAN, UAN (PF) and ESI number. Empty cells keep what is on record. PAN and the bank account are kept encrypted and only their last 4 characters go into the history. HR, the Principal and the School Admin only. Undo puts the old values back.",
  "staff-leave-balances": "Starting part way through the year: one row per staff member and leave type, with the days left on the go-live date or the days already taken this year. Each becomes an adjustment marked Brought in on that person's balance, so leave left and loss of pay are right from the first day. Undo takes the days back.",
};

/** Workflow 15, step 3: HR brings in the staff list from Staff & HR, on the same engine as Switching to School OS. */
export default async function ImportStaffPage() {
  const { current, viewer } = await hrPage("create");
  if (viewer.change !== "all") redirect("/no-access?m=staff-hr-management");
  return (
    <>
      <BackLink href={BASE} label="Staff List" />
      <PageHeader title="Import staff" href={`${BASE}/import`} userId={current.user.id} />
      <ImportHome current={current} place={PLACES.staff} about={ABOUT} />
    </>
  );
}
