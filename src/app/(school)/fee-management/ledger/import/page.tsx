import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PLACES } from "@/lib/imports/places";
import { ImportHome } from "@/components/import/import-home";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { withSchool } from "@/lib/db";
import { beforeGoLiveView } from "@/lib/fees/before-go-live";
import { BeforeGoLivePanel } from "./before-go-live";
import { FeeHead } from "../../_components/fee-head";
import { BASE, feeGuard, one, type SearchParams } from "../../_lib/page";
import { Words } from "@/lib/i18n/client";

export const metadata: Metadata = { title: "Import old dues and receipts · Fee Management" };

const ABOUT = {
  "fee-old-dues": "One row per student and fee head: the amount still unpaid from before School OS. Each becomes an opening balance row on the Student Fee Ledger, marked Brought in. A second import for the same student and fee head is refused.",
  "fee-past-receipts": "One row per receipt already given in the old software this year: its number, date, amount and mode. Each is kept read-only as Brought in, reduces the dues it paid, and never reaches the Day Book or today's collection.",
};

/**
 * Workflow 15, steps 5 and 6: the Accountant brings in old dues and this
 * year's past receipts from Fee Management (Fee Management Full; no Settings
 * needed), on the same engine as Switching to School OS.
 */
export default async function FeeImportPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await feeGuard("ledger");
  if (!p.can.change) redirect(`${BASE}/ledger`);
  const sp = await searchParams;
  // A school that moved in part way through the year: the plan's months before go-live (workflow 15; G14).
  const before = await withSchool(p.current.ctx, (tx) => beforeGoLiveView(tx, p.current.ctx));
  return (
    <>
      <FeeHead pageName="Import old dues and receipts" href={`${BASE}/ledger/import`}
        sub={<><Words k="Moving from old software or registers: set this year's fee structures first, then bring in old dues, then this year's receipts." /> <Link href={`${BASE}/ledger`} className="font-semibold text-brand hover:underline"><Words k="Student Fee Ledger" /></Link></>} />
      <ImportHome current={p.current} place={PLACES.fees} initial={one(sp.kind)} about={ABOUT} />
      {before && (
        <Card className="mt-5">
          <CardHeader title="Fees due before go-live" description="Months the old software kept. They are never billed twice." />
          <CardBody><BeforeGoLivePanel view={before} canSettle={p.can.change && p.can.counter("edit-student-fees")} /></CardBody>
        </Card>
      )}
    </>
  );
}
