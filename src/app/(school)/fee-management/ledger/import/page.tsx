import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ModuleImportPage } from "@/components/import/module-import-page";
import { FeeHead } from "../../_components/fee-head";
import { BASE, feeGuard, one, type SearchParams } from "../../_lib/page";

export const metadata: Metadata = { title: "Import old dues and receipts · Fee Management" };

const ABOUT = {
  "fee-old-dues": "One row per student and fee head: the amount still unpaid from before School OS. Each becomes an opening balance row on the Student Fee Ledger, marked Brought in. A second import for the same student and fee head is refused.",
  "fee-past-receipts": "One row per receipt already given in the old software this year: its number, date, amount and mode. Each is kept read-only as Brought in, reduces the dues it paid, and never reaches the Day Book or today's collection.",
};

/**
 * Workflow 15, steps 5 and 6: the Accountant brings in old dues and this
 * year's past receipts from Fee Management (Fee Management Full; no Settings needed).
 */
export default async function FeeImportPage({ searchParams }: { searchParams: SearchParams }) {
  const p = await feeGuard("ledger");
  if (!p.can.change) redirect(`${BASE}/ledger`);
  const sp = await searchParams;
  return (
    <>
      <FeeHead pageName="Import old dues and receipts" href={`${BASE}/ledger/import`}
        sub={<>Moving from old software or registers: set this year&apos;s fee structures first, then bring in old dues, then this year&apos;s receipts. <Link href={`${BASE}/ledger`} className="font-semibold text-brand hover:underline">Student Fee Ledger</Link></>} />
      <ModuleImportPage current={p.current} keys={["fee-old-dues", "fee-past-receipts"]} initial={one(sp.kind)} base={`${BASE}/ledger/import`} about={ABOUT}
        doneHref={`${BASE}/ledger`} doneLabel="Open Student Fee Ledger" />
    </>
  );
}
